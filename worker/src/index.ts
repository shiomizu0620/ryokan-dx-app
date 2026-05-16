import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  GEMINI_API_KEY: string
  DB: D1Database
}

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
  const body = await c.req.json<ChatRequest>().catch(() => ({}) as ChatRequest)
  const messages = body.messages ?? []

  // TODO(Phase A): call Gemini (gemini-2.5-flash) via @google/generative-ai
  // using c.env.GEMINI_API_KEY and stream the response back.
  return c.json({
    ok: true,
    stub: true,
    received_messages: messages.length,
    reply: 'chat endpoint stub — Gemini API not wired yet',
  })
})

export default app
