import { useEffect, useState } from 'react'
import { Chat } from './Chat'
import { Report } from './Report'
import { FacilitySetup } from './FacilitySetup'
import type { AnalyzeResponse, Charm, Message } from './types'

function makeInitialGreeting(charm: Charm | null): Message {
  if (charm) {
    return {
      role: 'assistant',
      content: `こんにちは。旅館DX診断の「番頭さん」です。\n\n「${charm.facility_name}」さんの魅力（${charm.charm_tags.slice(0, 2).join('・')}など）を踏まえて診断を進めます。\n\nお宿のスタッフ数や客室数、日々の業務の流れを教えていただけますか？`,
    }
  }
  return {
    role: 'assistant',
    content:
      'こんにちは。旅館DX診断の「番頭さん」です。\n\nお宿の業務にある「無駄」を一緒に見つけて、雰囲気を守りながら改善できそうなところを探していきましょう。\n\nまず、お宿のお名前を教えていただけますか?',
  }
}

function returnVisitGreeting(facilityName: string | null): Message {
  return {
    role: 'assistant',
    content: `おかえりなさいませ${facilityName ? `。「${facilityName}」さんの前回の診断データがあります` : ''}。\n\n前回から変わった点や、新たに確認したいことがあれば教えてください。内容が変わっていなければ、そのまま「診断結果を見る」を押していただくこともできます。`,
  }
}

type View =
  | { kind: 'setup' }
  | { kind: 'welcome-back' }
  | { kind: 'chat' }
  | { kind: 'analyzing' }
  | { kind: 'report'; data: AnalyzeResponse }
  | { kind: 'error'; message: string }

const FACILITY_ID_KEY = 'ryokan_dx_facility_id'
const FACILITY_NAME_KEY = 'ryokan_dx_facility_name'

const CHARM_KEY = 'ryokan_dx_charm'

function App() {
  const [facilityId, setFacilityId] = useState<string | null>(
    () => localStorage.getItem(FACILITY_ID_KEY),
  )
  const [facilityName, setFacilityName] = useState<string | null>(
    () => localStorage.getItem(FACILITY_NAME_KEY),
  )
  const [charm, setCharm] = useState<Charm | null>(() => {
    const stored = localStorage.getItem(CHARM_KEY)
    return stored ? (JSON.parse(stored) as Charm) : null
  })
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(FACILITY_ID_KEY) ? { kind: 'welcome-back' } : { kind: 'setup' },
  )
  const [messages, setMessages] = useState<Message[]>([makeInitialGreeting(null)])

  async function analyze() {
    setView({ kind: 'analyzing' })
    try {
      const API_BASE = import.meta.env.VITE_API_BASE ?? ''
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, charm }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`server ${res.status}: ${detail}`)
      }
      const data = (await res.json()) as AnalyzeResponse
      if (data.facility_id) {
        setFacilityId(data.facility_id)
        localStorage.setItem(FACILITY_ID_KEY, data.facility_id)
      }
      if (data.profile?.name) {
        setFacilityName(data.profile.name)
        localStorage.setItem(FACILITY_NAME_KEY, data.profile.name)
      }
      setView({ kind: 'report', data })
      window.scrollTo(0, 0)
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function startReturnVisit() {
    setMessages([returnVisitGreeting(facilityName)])
    setView({ kind: 'chat' })
  }

  function handleSetupDone(newCharm: Charm | null) {
    setCharm(newCharm)
    if (newCharm) localStorage.setItem(CHARM_KEY, JSON.stringify(newCharm))
    setMessages([makeInitialGreeting(newCharm)])
    setView({ kind: 'chat' })
  }

  function startFresh() {
    localStorage.removeItem(FACILITY_ID_KEY)
    localStorage.removeItem(FACILITY_NAME_KEY)
    localStorage.removeItem(CHARM_KEY)
    setFacilityId(null)
    setFacilityName(null)
    setCharm(null)
    setMessages([makeInitialGreeting(null)])
    setView({ kind: 'setup' })
  }

  function backToChat() {
    setView({ kind: 'chat' })
  }

  function reset() {
    localStorage.removeItem(FACILITY_ID_KEY)
    localStorage.removeItem(FACILITY_NAME_KEY)
    localStorage.removeItem(CHARM_KEY)
    setFacilityId(null)
    setFacilityName(null)
    setCharm(null)
    setMessages([makeInitialGreeting(null)])
    setView({ kind: 'setup' })
  }

  if (view.kind === 'setup') {
    return <FacilitySetup onDone={handleSetupDone} />
  }

  if (view.kind === 'welcome-back') {
    return (
      <WelcomeBackView
        facilityName={facilityName}
        onReturn={startReturnVisit}
        onFresh={startFresh}
      />
    )
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

  return (
    <Chat
      messages={messages}
      setMessages={setMessages}
      onAnalyze={analyze}
      facilityId={facilityId}
      charm={charm}
    />
  )
}

function BrandHeader() {
  return (
    <div className="flex items-center gap-2.5 justify-center">
      <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center">
        <span className="text-white text-sm font-bold">番</span>
      </div>
      <div className="text-left">
        <p className="text-base font-semibold text-zinc-900 leading-tight">番頭さん</p>
        <p className="text-[10px] text-zinc-400 leading-tight tracking-widest uppercase">Ryokan DX</p>
      </div>
    </div>
  )
}

function WelcomeBackView({
  facilityName,
  onReturn,
  onFresh,
}: {
  facilityName: string | null
  onReturn: () => void
  onFresh: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 bg-white rounded-2xl border border-zinc-100 shadow-md p-7">
        <BrandHeader />
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">
            前回の診断データがあります
          </p>
          <h2 className="text-xl font-bold text-zinc-900">
            {facilityName ? `「${facilityName}」` : 'お宿'}へおかえりなさい
          </h2>
          <p className="text-sm text-zinc-500 leading-relaxed pt-1">
            前回の情報を引き継いで再診断するか、まっさらな状態で始めるかを選んでください。
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={onReturn}
            className="w-full rounded-xl bg-zinc-950 px-5 py-3 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            前回から再診断する
          </button>
          <button
            type="button"
            onClick={onFresh}
            className="w-full rounded-xl border border-zinc-200 px-5 py-3 text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors"
          >
            新しく始める
          </button>
        </div>
      </div>
    </div>
  )
}

const ANALYZING_STEPS = [
  '会話の内容を整理中…',
  '業務の無駄を計算中…',
  '雰囲気優先ゾーンを確認中…',
  '改善策を優先度順に並べています…',
]

function AnalyzingView() {
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStepIdx((i) => (i + 1) % ANALYZING_STEPS.length)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="w-12 h-12 mx-auto rounded-full border-4 border-zinc-200 border-t-zinc-950 animate-spin" />
        <div className="space-y-1">
          <p className="text-zinc-900 font-semibold">番頭さんが集計中です</p>
          <p className="text-sm text-zinc-400">{ANALYZING_STEPS[stepIdx]}</p>
        </div>
        <p className="text-xs text-zinc-300">10〜20秒ほどかかります</p>
      </div>
    </div>
  )
}

function friendlyError(raw: string): string {
  if (/server 5\d\d/.test(raw)) return 'サーバーでエラーが発生しました。しばらくしてからもう一度お試しください。'
  if (/Failed to fetch|NetworkError|net::ERR/.test(raw)) return 'ネットワークエラーです。インターネット接続を確認してください。'
  if (/server 4\d\d/.test(raw)) return '送信内容に問題があります。ページを再読み込みしてお試しください。'
  return '予期しないエラーが発生しました。ページを再読み込みしてお試しください。'
}

function ErrorView({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-4 bg-white rounded-2xl border border-zinc-100 shadow-md p-7 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center">
          <span className="text-xl">✕</span>
        </div>
        <div>
          <p className="font-semibold text-zinc-900">集計に失敗しました</p>
          <p className="text-sm text-zinc-500 mt-1">{friendlyError(message)}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl bg-zinc-950 px-5 py-2.5 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          会話に戻る
        </button>
      </div>
    </div>
  )
}

export default App
