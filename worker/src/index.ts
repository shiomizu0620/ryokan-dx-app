import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  ANTHROPIC_API_KEY: string
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

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { messages?: ChatMessage[] }

app.post('/api/chat', async (c) => {
  const body = await c.req.json<ChatRequest>().catch(() => ({}) as ChatRequest)
  const messages = body.messages ?? []

  // TODO(Phase A): forward to Claude API using c.env.ANTHROPIC_API_KEY
  // and stream the response back.
  return c.json({
    ok: true,
    stub: true,
    received_messages: messages.length,
    reply: 'chat endpoint stub — Claude API not wired yet',
  })
})

export default app
