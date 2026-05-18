import { useState } from 'react'
import type { Charm, PlaceCandidate } from './types'

type SetupStep =
  | { kind: 'input' }
  | { kind: 'searching' }
  | { kind: 'candidates'; list: PlaceCandidate[] }
  | { kind: 'extracting' }
  | { kind: 'confirm'; charm: Charm }
  | { kind: 'manual-input' }
  | { kind: 'manual-extracting' }

export function FacilitySetup({ onDone }: { onDone: (charm: Charm | null) => void }) {
  const [step, setStep] = useState<SetupStep>({ kind: 'input' })
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [manualReviews, setManualReviews] = useState('')
  const [error, setError] = useState<string | null>(null)

  const API_BASE = import.meta.env.VITE_API_BASE ?? ''

  async function handleSearch() {
    if (!name.trim()) return
    setError(null)
    setStep({ kind: 'searching' })
    try {
      const res = await fetch(`${API_BASE}/api/charm/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_name: name.trim(), location: location.trim() || undefined }),
      })
      const data = await res.json() as { candidates?: PlaceCandidate[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `server ${res.status}`)
      const candidates = data.candidates ?? []
      if (candidates.length === 0) {
        setError('お宿が見つかりませんでした。都道府県を追加するか、手動入力をお試しください。')
        setStep({ kind: 'input' })
      } else if (candidates.length === 1) {
        await extractCharm(candidates[0].place_id)
      } else {
        setStep({ kind: 'candidates', list: candidates })
      }
    } catch (e) {
      setError('検索に失敗しました。手動入力をお試しください。')
      setStep({ kind: 'input' })
    }
  }

  async function extractCharm(placeId: string) {
    setError(null)
    setStep({ kind: 'extracting' })
    try {
      const res = await fetch(`${API_BASE}/api/charm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_name: name.trim(), place_id: placeId }),
      })
      const charm = await res.json() as Charm & { error?: string }
      if (!res.ok || charm.error) throw new Error(charm.error ?? `server ${res.status}`)
      setStep({ kind: 'confirm', charm })
    } catch (e) {
      setError('魅力の分析に失敗しました。')
      setStep({ kind: 'input' })
    }
  }

  async function handleManualExtract() {
    if (!manualReviews.trim()) return
    setError(null)
    setStep({ kind: 'manual-extracting' })
    try {
      const res = await fetch(`${API_BASE}/api/charm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_name: name.trim() || '（お宿名未入力）',
          manual_reviews: manualReviews.trim(),
        }),
      })
      const charm = await res.json() as Charm & { error?: string }
      if (!res.ok || charm.error) throw new Error(charm.error ?? `server ${res.status}`)
      setStep({ kind: 'confirm', charm })
    } catch (e) {
      setError('分析に失敗しました。もう一度お試しください。')
      setStep({ kind: 'manual-input' })
    }
  }

  if (step.kind === 'confirm') {
    return <CharmConfirmCard charm={step.charm} onConfirm={() => onDone(step.charm)} onRetry={() => setStep({ kind: 'input' })} />
  }

  if (step.kind === 'candidates') {
    return (
      <CandidateList
        candidates={step.list}
        onSelect={(placeId) => extractCharm(placeId)}
        onBack={() => setStep({ kind: 'input' })}
      />
    )
  }

  if (step.kind === 'searching' || step.kind === 'extracting' || step.kind === 'manual-extracting') {
    const msg =
      step.kind === 'searching' ? 'お宿を検索中...' :
      step.kind === 'extracting' ? '口コミから魅力を分析中...' :
      '貼り付けた口コミを分析中...'
    return <LoadingView message={msg} />
  }

  if (step.kind === 'manual-input') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-5 bg-white rounded-2xl border border-zinc-100 shadow-md p-7">
          <BrandHeader />
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-1">お宿の名前</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：星のや京都"
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-1">口コミを貼り付ける</p>
            <p className="text-xs text-zinc-400 mb-2">じゃらん・楽天トラベル・Google マップなどの口コミを空行区切りで貼ってください（3件以上推奨）</p>
            <textarea
              value={manualReviews}
              onChange={(e) => setManualReviews(e.target.value)}
              rows={6}
              placeholder={"口コミ1...\n\n口コミ2...\n\n口コミ3..."}
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleManualExtract}
              disabled={!manualReviews.trim()}
              className="w-full rounded-xl bg-zinc-950 px-5 py-3 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              この内容で魅力を分析する
            </button>
            <button
              type="button"
              onClick={() => { setError(null); setStep({ kind: 'input' }) }}
              className="w-full rounded-xl border border-zinc-200 px-5 py-2.5 text-zinc-500 text-sm hover:bg-zinc-50 transition-colors"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Default: input view
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-5 bg-white rounded-2xl border border-zinc-100 shadow-md p-7">
        <BrandHeader />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-900">まずお宿の名前を教えてください</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            口コミからお宿の魅力を読み取り、診断に活かします
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-1">お宿の名前 <span className="text-red-400">*</span></p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="例：星のや京都"
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              autoFocus
            />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-1">都道府県 <span className="text-zinc-300 font-normal">（任意）</span></p>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="例：京都府"
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSearch}
            disabled={!name.trim()}
            className="w-full rounded-xl bg-zinc-950 px-5 py-3 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            口コミを検索して分析する
          </button>
          <button
            type="button"
            onClick={() => onDone(null)}
            className="w-full rounded-xl border border-zinc-200 px-5 py-2.5 text-zinc-400 text-sm hover:bg-zinc-50 transition-colors"
          >
            スキップして診断を始める
          </button>
          <button
            type="button"
            onClick={() => { setError(null); setStep({ kind: 'manual-input' }) }}
            className="w-full text-xs text-zinc-400 hover:text-zinc-600 transition-colors py-1"
          >
            口コミを手動で貼り付ける →
          </button>
        </div>
      </div>
    </div>
  )
}

function CandidateList({
  candidates,
  onSelect,
  onBack,
}: {
  candidates: PlaceCandidate[]
  onSelect: (placeId: string) => void
  onBack: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-4 bg-white rounded-2xl border border-zinc-100 shadow-md p-7">
        <BrandHeader />
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">候補が見つかりました</p>
          <p className="text-sm text-zinc-600 mt-1">該当するお宿を選んでください</p>
        </div>
        <div className="space-y-2">
          {candidates.map((c) => (
            <button
              key={c.place_id}
              type="button"
              onClick={() => onSelect(c.place_id)}
              className="w-full text-left rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
            >
              <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{c.address}</p>
              {c.rating && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  ★ {c.rating} ({c.user_rating_count?.toLocaleString()}件)
                </p>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-xl border border-zinc-200 px-5 py-2.5 text-zinc-500 text-sm hover:bg-zinc-50 transition-colors"
        >
          戻る
        </button>
      </div>
    </div>
  )
}

function CharmConfirmCard({
  charm,
  onConfirm,
  onRetry,
}: {
  charm: Charm
  onConfirm: () => void
  onRetry: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-5 bg-white rounded-2xl border border-zinc-100 shadow-md p-7">
        <BrandHeader />
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">魅力を分析しました</p>
          <h2 className="text-lg font-bold text-zinc-900 mt-1">「{charm.facility_name}」</h2>
          <p className="text-sm text-zinc-500 leading-relaxed mt-2">{charm.charm_summary}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">このお宿の魅力</p>
          <div className="flex flex-wrap gap-1.5">
            {charm.charm_tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">守るべき要素</p>
          <div className="flex flex-wrap gap-1.5">
            {charm.protect_keywords.map((kw) => (
              <span
                key={kw}
                className="inline-block rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
        {charm.source === 'places' && (
          <p className="text-xs text-zinc-300">Google マップの口コミ {charm.raw_reviews_count} 件をもとに分析</p>
        )}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl bg-zinc-950 px-5 py-3 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            この内容で診断を始める
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl border border-zinc-200 px-5 py-2.5 text-zinc-500 text-sm hover:bg-zinc-50 transition-colors"
          >
            やり直す
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadingView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full border-4 border-zinc-200 border-t-zinc-950 animate-spin" />
        <p className="text-sm text-zinc-500">{message}</p>
      </div>
    </div>
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
