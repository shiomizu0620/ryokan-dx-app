import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenAI } from '@google/genai'

type Bindings = {
  GEMINI_API_KEY: string
  DB: D1Database
}

const MODEL = 'gemini-2.5-flash'

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
  const key = c.env.GEMINI_API_KEY
  let db_ok = false
  try {
    await c.env.DB.prepare('SELECT 1').first()
    db_ok = true
  } catch {
    db_ok = false
  }
  return c.json({
    ok: true,
    has_gemini_key: typeof key === 'string' && key.length > 0,
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

  const ai = new GoogleGenAI({ apiKey: c.env.GEMINI_API_KEY })
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  let stream
  try {
    stream = await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT },
    })
  } catch (e) {
    console.error('Gemini generateContentStream failed:', e)
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
          const text = chunk.text
          if (text) controller.enqueue(encoder.encode(text))
        }
      } catch (e) {
        console.error('Gemini stream error:', e)
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

export default app
