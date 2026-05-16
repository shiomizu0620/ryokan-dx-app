import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

const INITIAL_GREETING: Message = {
  role: 'assistant',
  content:
    'こんにちは。旅館DX診断の「番頭さん」です。\n\nお宿の業務にある「無駄」を一緒に見つけて、雰囲気を守りながら改善できそうなところを探していきましょう。\n\nまず、お宿のお名前を教えていただけますか?',
}

function App() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send() {
    const trimmed = input.trim()
    if (!trimmed || streaming) return
    setError(null)

    const userMsg: Message = { role: 'user', content: trimmed }
    const sentMessages = [...messages, userMsg]
    setMessages([...sentMessages, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sentMessages }),
      })
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new Error(`server ${res.status}: ${detail}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMessages([
          ...sentMessages,
          { role: 'assistant', content: assistantText },
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMessages(sentMessages)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-900">旅館DX診断</h1>
          <p className="text-xs text-slate-500">
            話しかけるだけで、旅館の無駄がわかる。
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap leading-relaxed text-sm sm:text-base ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}
              >
                {m.content ||
                  (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              エラー: {error}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="メッセージを入力 (Shift+Enter で改行)"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-2 text-sm sm:text-base focus:outline-none focus:border-slate-500 disabled:bg-slate-100"
            />
            <button
              type="button"
              onClick={send}
              disabled={streaming || !input.trim()}
              className="rounded-full bg-slate-900 px-5 py-2 text-white font-medium text-sm sm:text-base hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              送信
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
