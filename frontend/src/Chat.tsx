import { useEffect, useRef, useState } from 'react'
import type { Charm, Message } from './types'

const COMPLETION_KEYWORDS = [
  'もう十分',
  'これでお願い',
  '診断してください',
  '診断をお願い',
  'まとめてください',
  '十分です',
  '以上です',
]

type Props = {
  messages: Message[]
  setMessages: (next: Message[]) => void
  onAnalyze: () => void
  facilityId: string | null
  charm: Charm | null
}

const COMPLETE_MARKER = '[[COMPLETE]]'

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-6 h-6 rounded-md text-[9px]' : 'w-8 h-8 rounded-lg text-xs'
  return (
    <div className={`${sz} bg-zinc-950 flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold">番</span>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

export function Chat({ messages, setMessages, onAnalyze, facilityId, charm }: Props) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatComplete, setChatComplete] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const userTurns = messages.filter((m) => m.role === 'user').length
  const canAnalyze = userTurns >= 1 && !streaming

  const lastUserMsg = messages.filter((m) => m.role === 'user').at(-1)
  const completionKeywordSent =
    lastUserMsg != null &&
    COMPLETION_KEYWORDS.some((kw) => lastUserMsg.content.includes(kw))
  const lastMsgIsAssistant = messages.at(-1)?.role === 'assistant'
  const showCompletionBanner =
    canAnalyze &&
    (chatComplete || completionKeywordSent || userTurns >= 5) &&
    lastMsgIsAssistant

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
      const API_BASE = import.meta.env.VITE_API_BASE ?? ''
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: sentMessages,
          ...(facilityId ? { facility_id: facilityId } : {}),
          ...(charm ? { charm } : {}),
        }),
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
        const hasMarker = assistantText.includes(COMPLETE_MARKER)
        const displayText = assistantText.replace(COMPLETE_MARKER, '').trimEnd()
        setMessages([...sentMessages, { role: 'assistant', content: displayText }])
        if (hasMarker) setChatComplete(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMessages(sentMessages)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-100 shadow-sm shrink-0">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold text-zinc-900 leading-tight">番頭さん</p>
              <p className="text-[10px] text-zinc-400 leading-tight tracking-widest uppercase">Ryokan DX</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!canAnalyze}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              showCompletionBanner
                ? 'bg-zinc-950 text-white hover:bg-zinc-800'
                : 'border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
            }`}
          >
            診断結果を見る
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && <BrandMark size="sm" />}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-zinc-950 text-white rounded-br-sm'
                    : 'bg-white border border-zinc-100 shadow-sm text-zinc-800 rounded-bl-sm'
                }`}
              >
                {m.content === '' && streaming && i === messages.length - 1
                  ? <TypingDots />
                  : m.content}
              </div>
            </div>
          ))}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              送信に失敗しました。もう一度お試しください。
            </div>
          )}
        </div>
      </div>

      {showCompletionBanner && (
        <div className="shrink-0 bg-zinc-950 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">ヒアリングが完了しました</p>
            <button
              type="button"
              onClick={onAnalyze}
              className="shrink-0 rounded-full bg-white text-zinc-950 px-5 py-2 text-sm font-semibold hover:bg-zinc-100 transition-colors"
            >
              診断結果を見る →
            </button>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-zinc-100 shrink-0">
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
              placeholder={chatComplete ? 'ヒアリング完了です' : 'メッセージを入力… (Shift+Enter で改行)'}
              rows={1}
              disabled={streaming || chatComplete}
              className="flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:bg-white disabled:opacity-60 transition-colors"
            />
            <button
              type="button"
              onClick={send}
              disabled={streaming || chatComplete || !input.trim()}
              className="rounded-xl bg-zinc-950 px-5 py-2.5 text-white text-sm font-semibold hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              送信
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
