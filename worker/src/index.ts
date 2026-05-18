import { Hono } from 'hono'
import { cors } from 'hono/cors'
import OpenAI from 'openai'
import { OPERATION_IDS } from './presets'
import {
  computeLosses,
  recommendImprovements,
  type ExtractedAnalysis,
} from './analyze'
import {
  searchPlaces,
  getPlaceReviews,
  extractCharm,
  applyCharmImpact,
  type Charm,
} from './charm'

type Bindings = {
  OPENAI_API_KEY: string
  PLACES_API_KEY: string
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
- 十分な情報が揃ったと判断したら（Step4まで終わっていれば可）、Step5の要約メッセージを送る。その要約メッセージの末尾に、改行なしで [[COMPLETE]] とだけ追記する。ユーザーの確認を待たずに付ける。[[COMPLETE]] はメッセージ本文の最後に一度だけ付ける。これが診断開始のシグナルとなる。
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
    origin: (origin) => {
      if (
        origin === 'http://localhost:5173' ||
        origin === 'https://ryokan-dx-app.pages.dev' ||
        origin.endsWith('.ryokan-dx-app.pages.dev')
      ) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/', (c) => c.text('ryokan-dx worker'))

app.get('/api/health', async (c) => {
  const key = c.env.OPENAI_API_KEY
  const places = c.env.PLACES_API_KEY
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
    has_places_key: typeof places === 'string' && places.length > 0,
    db_ok,
  })
})

type CharmSearchRequest = { facility_name?: string; location?: string }

app.post('/api/charm/search', async (c) => {
  let body: CharmSearchRequest
  try {
    body = await c.req.json<CharmSearchRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const name = body.facility_name?.trim()
  if (!name) {
    return c.json({ error: 'facility_name required' }, 400)
  }
  if (!c.env.PLACES_API_KEY) {
    return c.json({ error: 'PLACES_API_KEY not configured' }, 500)
  }
  const query = body.location ? `${name} ${body.location}` : name
  try {
    const candidates = await searchPlaces(query, c.env.PLACES_API_KEY)
    return c.json({ candidates })
  } catch (e) {
    console.error('Places search failed:', e)
    return c.json({ error: 'places search failed', detail: String(e) }, 500)
  }
})

type CharmRequest = {
  facility_name?: string
  location?: string
  place_id?: string
  manual_reviews?: string
}

app.post('/api/charm', async (c) => {
  let body: CharmRequest
  try {
    body = await c.req.json<CharmRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const facilityName = body.facility_name?.trim()
  if (!facilityName) {
    return c.json({ error: 'facility_name required' }, 400)
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let reviews: string[] = []
  let source: 'places' | 'manual' = 'manual'
  let resolvedName = facilityName

  if (body.manual_reviews && body.manual_reviews.trim().length > 0) {
    // Split user-pasted reviews on blank lines or 2+ newlines.
    reviews = body.manual_reviews
      .split(/\n\s*\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
    source = 'manual'
  } else if (body.place_id) {
    if (!c.env.PLACES_API_KEY) {
      return c.json({ error: 'PLACES_API_KEY not configured' }, 500)
    }
    try {
      const result = await getPlaceReviews(body.place_id, c.env.PLACES_API_KEY)
      reviews = result.reviews
      resolvedName = result.name || facilityName
      source = 'places'
    } catch (e) {
      console.error('Place details failed:', e)
      return c.json(
        { error: 'place details failed', detail: String(e) },
        500,
      )
    }
  } else {
    return c.json(
      { error: 'either place_id or manual_reviews is required' },
      400,
    )
  }

  let charm: Charm
  try {
    charm = await extractCharm({
      facility_name: resolvedName,
      location: body.location,
      reviews,
      openai: client,
      model: MODEL,
      source,
      place_id: body.place_id,
    })
  } catch (e) {
    console.error('Charm extraction failed:', e)
    return c.json(
      { error: 'charm extraction failed', detail: String(e) },
      500,
    )
  }

  return c.json(charm)
})

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { messages?: ChatMessage[]; facility_id?: string; charm?: Charm }

function buildCharmPromptBlock(charm: Charm): string {
  return `\n\n【このお宿の魅力（口コミから抽出済み）】
施設名: ${charm.facility_name}
魅力タグ: ${charm.charm_tags.join('、')}
概要: ${charm.charm_summary}
守るべき要素: ${charm.protect_keywords.join('、')}

ヒアリングでは、業務の無駄を聞き出しながら「その改善がこの旅館の魅力を損なわないか」もさりげなく確認してください。特に「${charm.protect_keywords[0] ?? ''}」などに関わる場所や作業は慎重に扱ってください。`
}

type FacilityRow = { profile_json: string; zones_json: string }

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

  let systemPrompt = SYSTEM_PROMPT
  if (body.charm) {
    systemPrompt += buildCharmPromptBlock(body.charm)
  }

  // Inject previous facility data into system prompt for return visits
  if (body.facility_id) {
    try {
      const prev = await c.env.DB.prepare(
        'SELECT profile_json, zones_json FROM facilities WHERE facility_id = ? LIMIT 1',
      )
        .bind(body.facility_id)
        .first<FacilityRow>()

      if (prev) {
        systemPrompt +=
          `\n\n【前回の診断データ（参考）】\nこの施設は以前に診断済みです。以下の情報を把握した上で、変化点や追加情報を中心に確認してください。新規に聞く必要のない項目はスキップしてください。\n\n施設プロフィール: ${prev.profile_json}\n雰囲気優先ゾーン: ${prev.zones_json}`
      }
    } catch (e) {
      console.error('D1 fetch for chat context failed (non-fatal):', e)
    }
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let stream
  try {
    stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
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

  const analysisPrompt = body.charm
    ? ANALYSIS_SYSTEM_PROMPT +
      `\n\n【このお宿の魅力情報（charm_impact 判定の参考にすること）】\n魅力タグ: ${body.charm.charm_tags.join('、')}\n守るべき要素: ${body.charm.protect_keywords.join('、')}`
    : ANALYSIS_SYSTEM_PROMPT

  let raw: string
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: analysisPrompt },
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

  if (body.charm && improvements.length > 0) {
    try {
      await applyCharmImpact(improvements, body.charm, client, MODEL)
    } catch (e) {
      console.error('charm_impact evaluation failed (non-fatal):', e)
    }
  }

  // Persist to D1 (non-fatal: analysis result is returned even if DB write fails)
  let facility_id: string | null = null
  try {
    const facilityName = extracted.profile?.name ?? null
    if (facilityName) {
      const existing = await c.env.DB.prepare(
        'SELECT facility_id FROM facilities WHERE name = ? LIMIT 1',
      )
        .bind(facilityName)
        .first<{ facility_id: string }>()

      if (existing) {
        facility_id = existing.facility_id
        await c.env.DB.prepare(
          `UPDATE facilities SET profile_json=?, zones_json=?, losses_json=?, improvements_json=?, charm_json=?, updated_at=datetime('now') WHERE facility_id=?`,
        )
          .bind(
            JSON.stringify(extracted.profile),
            JSON.stringify(zones),
            JSON.stringify(losses),
            JSON.stringify(improvements),
            JSON.stringify(body.charm ?? {}),
            facility_id,
          )
          .run()
      } else {
        facility_id = crypto.randomUUID()
        await c.env.DB.prepare(
          `INSERT INTO facilities (facility_id, name, profile_json, zones_json, losses_json, improvements_json, charm_json) VALUES (?,?,?,?,?,?,?)`,
        )
          .bind(
            facility_id,
            facilityName,
            JSON.stringify(extracted.profile),
            JSON.stringify(zones),
            JSON.stringify(losses),
            JSON.stringify(improvements),
            JSON.stringify(body.charm ?? {}),
          )
          .run()
      }
    } else {
      facility_id = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO facilities (facility_id, name, profile_json, zones_json, losses_json, improvements_json, charm_json) VALUES (?,?,?,?,?,?,?)`,
      )
        .bind(
          facility_id,
          '未設定',
          JSON.stringify(extracted.profile),
          JSON.stringify(zones),
          JSON.stringify(losses),
          JSON.stringify(improvements),
          JSON.stringify(body.charm ?? {}),
        )
        .run()
    }

    const session_id = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO sessions (session_id, facility_id, messages_json, ended_at) VALUES (?,?,?,datetime('now'))`,
    )
      .bind(session_id, facility_id, JSON.stringify(messages))
      .run()
  } catch (e) {
    console.error('D1 save failed (non-fatal):', e)
  }

  return c.json({
    facility_id,
    profile: extracted.profile ?? {},
    operations_in_use: ops,
    zones,
    losses,
    improvements,
  })
})

export default app
