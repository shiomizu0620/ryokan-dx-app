import { useState } from 'react'
import { Chat } from './Chat'
import { Report } from './Report'
import type { AnalyzeResponse, Message } from './types'

const INITIAL_GREETING: Message = {
  role: 'assistant',
  content:
    'こんにちは。旅館DX診断の「番頭さん」です。\n\nお宿の業務にある「無駄」を一緒に見つけて、雰囲気を守りながら改善できそうなところを探していきましょう。\n\nまず、お宿のお名前を教えていただけますか?',
}

type View =
  | { kind: 'chat' }
  | { kind: 'analyzing' }
  | { kind: 'report'; data: AnalyzeResponse }
  | { kind: 'error'; message: string }

function App() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_GREETING])
  const [view, setView] = useState<View>({ kind: 'chat' })

  async function analyze() {
    setView({ kind: 'analyzing' })
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`server ${res.status}: ${detail}`)
      }
      const data = (await res.json()) as AnalyzeResponse
      setView({ kind: 'report', data })
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function backToChat() {
    setView({ kind: 'chat' })
  }

  function reset() {
    setMessages([INITIAL_GREETING])
    setView({ kind: 'chat' })
  }

  if (view.kind === 'analyzing') {
    return <AnalyzingView />
  }

  if (view.kind === 'error') {
    return <ErrorView message={view.message} onBack={backToChat} />
  }

  if (view.kind === 'report') {
    return <Report data={view.data} onBack={backToChat} onReset={reset} />
  }

  return <Chat messages={messages} setMessages={setMessages} onAnalyze={analyze} />
}

function AnalyzingView() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin" />
        <p className="text-slate-900 font-medium">番頭さんが集計中です…</p>
        <p className="text-sm text-slate-500">
          会話の内容を整理して、損失と改善策をまとめています（10〜20秒ほど）
        </p>
      </div>
    </div>
  )
}

function ErrorView({
  message,
  onBack,
}: {
  message: string
  onBack: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4 bg-white rounded-2xl border border-slate-200 p-6">
        <p className="text-2xl">😵</p>
        <p className="text-slate-900 font-medium">集計に失敗しました</p>
        <p className="text-xs text-slate-500 break-all">{message}</p>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-full bg-slate-900 px-5 py-2.5 text-white font-medium hover:bg-slate-700 transition-colors"
        >
          会話に戻る
        </button>
      </div>
    </div>
  )
}

export default App
