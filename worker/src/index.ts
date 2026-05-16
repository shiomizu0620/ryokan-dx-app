import { Hono } from 'hono'
import { cors } from 'hono/cors'
import OpenAI from 'openai'
import { OPERATION_IDS } from './presets'
import {
  computeLosses,
  recommendImprovements,
  type ExtractedAnalysis,
} from './analyze'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
}

const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `あなたは旅館のDX診断を行うコンサルタント「番頭さん」です。
旅館・宿泊施設の現場担当者や経営者との会話を通じて、業務上の無駄を見つけ、
"雰囲気を守りたい場所" と "改善すべき場所" を区別して整理することが役目です。

【会話の流れ】
Step1: 挨拶と趣旨説明（旅館の無駄を一緒に見つけましょう、と伝える）
Step2: 施設情報を聞く（名前、客室数、スタッフ人数、主な客層、宿泊パターン）
Step3: オペレーションを聞く（料理伝達、スタッフ間連絡、予約・シフト管理、接客の流れ）
Step4: こだわりの確認（変えたくない場所、雰囲気を守りたい場所。お風呂・廊下・玄関などを具体的に）
Step5: 要約してユーザーに確認

【ルール】
- 一度の発言で質問は1〜2個まで。質問攻めにしない。
- 丁寧で柔らかい敬語。専門用語・カタカナ語は避ける。
- 5〜10ターンで完結を目指す。
- 「変えたくない」「雰囲気が大事」「お客様が喜ぶ」「伝統的に」などの発言が出たら、
  雰囲気優先ゾーンとして頭の中に記憶する（返答には書かない）。
- ユーザーが「もう十分」「これでお願い」と言ったら、ステップ5（要約）に進む。
- レポート生成は次のフェーズで実装されるため、現時点では会話のみを担当する。`

const ANALYSIS_SYSTEM_PROMPT = `あなたは旅館DX診断の解析担当です。
これまでの会話履歴を読み、施設プロフィール・現在使われている業務オペレーション・雰囲気優先ゾーンを構造化JSONで出力してください。

【operations_in_use のID一覧】（該当するもののみ含める。プリセットに存在しない業務は含めない）
- paper_kitchen: 紙伝達（厨房→客室）
- whiteboard_order: ホワイトボード注文管理
- verbal_staff: 口頭でのスタッフ間連絡
- paper_shift: 紙のシフト管理
- new_staff_onboarding: 新人教育（属人化）

monthly_occurrences は会話内容と施設規模（客室数、スタッフ数、稼働率）から推定。
例: 客室20室・稼働率80%・1泊2食の旅館で paper_kitchen の場合、1日3食×16室×30日 ≒ 1440回/月。
paper_shift は週1回作成と仮定し monthly_occurrences = 4 程度。
new_staff_onboarding は年に何人入るかから月割り（例: 年6人なら 0.5）。

【zones.dx の値】
- "NG": 雰囲気・体験の価値が高くデジタル化すべきでない
- "要相談": 慎重に検討
- "OK": デジタル化を推奨

zones.affected_operation_ids: そのゾーンが上記オペレーションIDのどれと関連するかを配列で。関係なければ空配列。

profile の各フィールドは、会話に出てこない場合は null を入れてください（必ず全フィールドを返す）。`

const app = new Hono<{ Bindings: Bindings }>()

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/', (c) => c.text('ryokan-dx worker'))

app.get('/api/health', async (c) => {
  const key = c.env.OPENAI_API_KEY
  let db_ok = false
  try {
    await c.env.DB.prepare('SELECT 1').first()
    db_ok = true
  } catch {
    db_ok = false
  }
  return c.json({
    ok: true,
    has_openai_key: typeof key === 'string' && key.length > 0,
    db_ok,
  })
})

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { messages?: ChatMessage[] }

app.post('/api/chat', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const messages = body.messages ?? []
  if (messages.length === 0) {
    return c.json({ error: 'messages required' }, 400)
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let stream
  try {
    stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    })
  } catch (e) {
    console.error('OpenAI chat completion failed:', e)
    return c.json(
      { error: 'failed to start chat', detail: String(e) },
      500,
    )
  }

  const encoder = new TextEncoder()
  const bodyStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) controller.enqueue(encoder.encode(delta))
        }
      } catch (e) {
        console.error('OpenAI stream error:', e)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(bodyStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// OpenAI structured outputs requires strict mode:
// - additionalProperties: false on every object
// - every property must appear in `required`
// - optional fields use `type: ['T', 'null']`
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profile', 'operations_in_use', 'zones'],
  properties: {
    profile: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'rooms',
        'staff_count',
        'foreign_ratio',
        'main_customer',
        'stay_pattern',
      ],
      properties: {
        name: { type: ['string', 'null'] },
        rooms: { type: ['integer', 'null'] },
        staff_count: { type: ['integer', 'null'] },
        foreign_ratio: { type: ['number', 'null'] },
        main_customer: { type: ['string', 'null'] },
        stay_pattern: { type: ['string', 'null'] },
      },
    },
    operations_in_use: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'monthly_occurrences', 'reason'],
        properties: {
          id: { type: 'string', enum: [...OPERATION_IDS] },
          monthly_occurrences: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
    zones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'area',
          'dx',
          'reason',
          'sensitivity',
          'affected_operation_ids',
        ],
        properties: {
          area: { type: 'string' },
          dx: { type: 'string', enum: ['NG', '要相談', 'OK'] },
          reason: { type: 'string' },
          sensitivity: { type: 'string', enum: ['high', 'medium', 'low'] },
          affected_operation_ids: {
            type: 'array',
            items: { type: 'string', enum: [...OPERATION_IDS] },
          },
        },
      },
    },
  },
} as const

app.post('/api/analyze', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const messages = body.messages ?? []
  if (messages.length === 0) {
    return c.json({ error: 'messages required' }, 400)
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let raw: string
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ryokan_analysis',
          schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })
    raw = response.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.error('OpenAI analysis failed:', e)
    return c.json({ error: 'analysis failed', detail: String(e) }, 500)
  }

  let extracted: ExtractedAnalysis
  try {
    extracted = JSON.parse(raw) as ExtractedAnalysis
  } catch (e) {
    console.error('Failed to parse OpenAI JSON:', raw, e)
    return c.json({ error: 'invalid analysis output', raw }, 500)
  }

  const ops = extracted.operations_in_use ?? []
  const zones = extracted.zones ?? []
  const losses = computeLosses(ops, zones)
  const improvements = recommendImprovements(losses, zones)

  return c.json({
    profile: extracted.profile ?? {},
    operations_in_use: ops,
    zones,
    losses,
    improvements,
  })
})

export default app
