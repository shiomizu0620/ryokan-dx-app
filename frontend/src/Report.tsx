import { useState } from 'react'
import type {
  AnalyzeResponse,
  ImprovementRec,
  LossBreakdownItem,
  Zone,
} from './types'

type Props = {
  data: AnalyzeResponse
  onBack: () => void
  onReset: () => void
}

const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP')

function yenMan(n: number): string {
  const man = Math.round(n / 10000)
  if (man >= 100) return `約${(man / 100).toFixed(1)}億円`.replace('.0億円', '億円')
  return `約${man}万円`
}

const difficultyLabel = { low: '低', medium: '中', high: '高' } as const
const difficultyColor = {
  low: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  high: 'bg-red-50 text-red-700 border border-red-200',
} as const

const OPERATION_LABELS: Record<string, string> = {
  paper_kitchen: '紙伝達（厨房→客室）',
  whiteboard_order: 'ホワイトボード注文管理',
  verbal_staff: '口頭でのスタッフ間連絡',
  paper_shift: '紙のシフト管理',
  new_staff_onboarding: '新人教育（属人化）',
  reservation_phone: '電話予約の手動台帳記録',
  checkin_manual: '手書きチェックイン台帳',
  checkout_manual: '手動精算・現金管理',
  cleaning_verbal: '清掃指示の口頭・紙連絡',
  amenity_request: 'アメニティ・備品の口頭対応',
  maintenance_log: '設備メンテのアナログ記録',
  review_response: '口コミ返信の手作業',
  multilingual_response: '外国人ゲストへの個別対応',
  invoice_manual: '請求書・領収書の手書き',
  occupancy_excel: '稼働予測・売上管理のExcel作業',
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 ${className}`}>
      {children}
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  )
}

export function Report({ data, onBack, onReset }: Props) {
  const { profile, losses, zones, improvements } = data
  const facilityName = profile.name?.trim() || 'お宿'

  const ngZones = zones.filter((z) => z.dx === 'NG')
  const cautionZones = zones.filter((z) => z.dx === '要相談')
  const okZones = zones.filter((z) => z.dx === 'OK')

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-zinc-950 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">番</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 leading-tight">診断レポート</p>
              <p className="text-[10px] text-zinc-400 leading-tight">{facilityName} 様</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
          >
            会話に戻る
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <ProfileSection data={data} />
        <LossSection losses={losses} />
        <ZonesSection ngZones={ngZones} cautionZones={cautionZones} okZones={okZones} />
        <ImprovementsSection improvements={improvements} />

        <div className="pt-2 pb-8 flex justify-center">
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl bg-zinc-950 px-8 py-3 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
          >
            もう一度診断する
          </button>
        </div>
      </main>
    </div>
  )
}

function ProfileSection({ data }: { data: AnalyzeResponse }) {
  const p = data.profile
  const items: Array<[string, string | undefined]> = [
    ['客室数', p.rooms != null ? `${p.rooms} 室` : undefined],
    ['スタッフ', p.staff_count != null ? `${p.staff_count} 名` : undefined],
    [
      '客層',
      [p.main_customer, p.foreign_ratio != null ? `（外国人 ${Math.round(p.foreign_ratio * 100)}%）` : undefined]
        .filter(Boolean)
        .join(''),
    ],
    ['宿泊パターン', p.stay_pattern],
  ]
  const visible = items.filter(([, v]) => v && v.length > 0)
  if (visible.length === 0) return null

  return (
    <Card>
      <SectionLabel>施設プロフィール</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        {visible.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-zinc-400">{k}</dt>
            <dd className="text-sm font-semibold text-zinc-900 mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function LossSection({ losses }: { losses: AnalyzeResponse['losses'] }) {
  if (losses.monthly_yen_total === 0) {
    return (
      <Card>
        <SectionLabel>損失試算</SectionLabel>
        <p className="text-zinc-500 text-sm">
          会話からは具体的な損失を試算できませんでした。業務内容をもう少し教えていただくと金額で見える化できます。
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <SectionLabel>このまま続けると — 年間推定損失</SectionLabel>
      <p className="text-5xl font-bold text-zinc-950 tracking-tight leading-none">
        {yenMan(losses.yearly_yen_total)}
      </p>
      <p className="text-sm text-zinc-400 mt-1.5">{yen(losses.yearly_yen_total)}</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest">月間損失</p>
          <p className="text-xl font-bold text-zinc-900 mt-0.5">{yenMan(losses.monthly_yen_total)}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest">月間ロスタイム</p>
          <p className="text-xl font-bold text-zinc-900 mt-0.5">{losses.monthly_hours_total.toFixed(1)} h</p>
        </div>
      </div>

      {losses.breakdown.length > 0 && (
        <div className="border-t border-zinc-100 mt-4 pt-4">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">内訳</p>
          <ul className="space-y-3">
            {losses.breakdown.map((b) => (
              <BreakdownRow key={b.operation_id} item={b} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function BreakdownRow({ item }: { item: LossBreakdownItem }) {
  return (
    <li className="flex justify-between gap-4 text-sm">
      <div className="flex-1 min-w-0">
        <p className="text-zinc-800 font-medium truncate">{item.label}</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          月 {item.monthly_occurrences.toLocaleString('ja-JP')} 回 · {item.monthly_hours.toFixed(1)} h
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-zinc-900 font-semibold">{yen(item.monthly_yen_total)}<span className="text-xs font-normal text-zinc-400"> /月</span></p>
        {item.monthly_yen_error > 0 && (
          <p className="text-xs text-zinc-400">うちミス {yen(item.monthly_yen_error)}</p>
        )}
      </div>
    </li>
  )
}

const zoneTone = {
  ng: { wrap: 'border-red-100 bg-red-50', title: 'text-red-800', sub: 'text-red-500', dot: 'bg-red-400', label: '🚫 雰囲気を守る場所', desc: '体験価値が高く、デジタル化しない' },
  caution: { wrap: 'border-amber-100 bg-amber-50', title: 'text-amber-800', sub: 'text-amber-500', dot: 'bg-amber-400', label: '⚠️ 要相談', desc: '慎重に検討したい場所' },
  ok: { wrap: 'border-emerald-100 bg-emerald-50', title: 'text-emerald-800', sub: 'text-emerald-500', dot: 'bg-emerald-400', label: '✅ 改善推奨', desc: 'お客様の目に触れない裏側。効率化できます' },
} as const

function ZonesSection({ ngZones, cautionZones, okZones }: { ngZones: Zone[]; cautionZones: Zone[]; okZones: Zone[] }) {
  if (ngZones.length + cautionZones.length + okZones.length === 0) return null
  return (
    <Card>
      <SectionLabel>DX マップ</SectionLabel>
      <div className="space-y-3">
        {ngZones.length > 0 && <ZoneGroup tone="ng" zones={ngZones} />}
        {cautionZones.length > 0 && <ZoneGroup tone="caution" zones={cautionZones} />}
        {okZones.length > 0 && <ZoneGroup tone="ok" zones={okZones} />}
      </div>
    </Card>
  )
}

function ZoneGroup({ tone, zones }: { tone: keyof typeof zoneTone; zones: Zone[] }) {
  const t = zoneTone[tone]
  return (
    <div className={`rounded-xl border ${t.wrap} p-3.5`}>
      <p className={`text-sm font-semibold ${t.title}`}>{t.label}</p>
      <p className={`text-xs ${t.sub} mb-2.5`}>{t.desc}</p>
      <ul className="space-y-2">
        {zones.map((z, i) => (
          <li key={`${z.area}-${i}`} className="flex items-start gap-2 text-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${t.dot} mt-1.5 shrink-0`} />
            <div>
              <p className="font-medium text-zinc-900">{z.area}</p>
              {z.reason && <p className="text-zinc-500 text-xs mt-0.5">{z.reason}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImprovementsSection({ improvements }: { improvements: ImprovementRec[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (improvements.length === 0) {
    return (
      <Card>
        <SectionLabel>改善提案</SectionLabel>
        <p className="text-zinc-500 text-sm">
          現時点ではご提案できる改善策がありません。業務内容をもう少し教えていただけると、優先順位をつけてご提案できます。
        </p>
      </Card>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3 px-1">
        改善提案 — 優先度順
      </p>
      <ol className="space-y-3">
        {improvements.map((imp, i) => (
          <ImprovementCard
            key={imp.id}
            imp={imp}
            rank={i + 1}
            expanded={expandedId === imp.id}
            onToggle={() => setExpandedId(expandedId === imp.id ? null : imp.id)}
          />
        ))}
      </ol>
    </section>
  )
}

function ImprovementCard({
  imp,
  rank,
  expanded,
  onToggle,
}: {
  imp: ImprovementRec
  rank: number
  expanded: boolean
  onToggle: () => void
}) {
  const isTop = rank === 1
  const affectsLabels = imp.affects.map((id) => OPERATION_LABELS[id] ?? id).filter(Boolean)

  return (
    <li className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${isTop ? 'border-zinc-950 ring-1 ring-zinc-950' : 'border-zinc-100'}`}>
      <button type="button" onClick={onToggle} className="w-full text-left px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 inline-flex items-center justify-center rounded-lg w-8 h-8 text-sm font-bold mt-0.5 ${isTop ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            {rank}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <h3 className="text-sm font-semibold text-zinc-900">{imp.title}</h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${difficultyColor[imp.difficulty]}`}>
                    難易度 {difficultyLabel[imp.difficulty]}
                  </span>
                  {imp.blocked_by_ambience && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                      🚫 雰囲気ゾーン関連
                    </span>
                  )}
                  {imp.charm_impact === 'risk' && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
                      魅力に要注意
                    </span>
                  )}
                  {imp.charm_impact === 'caution' && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      魅力に要確認
                    </span>
                  )}
                  {imp.charm_impact === 'safe' && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      魅力と相性◎
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{imp.method}</p>
              </div>
              <span className={`text-zinc-300 text-xs mt-1 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
            </div>

            <div className="flex gap-2 mt-3">
              {[
                { label: '月削減額', value: yen(imp.expected_reduction_yen) },
                { label: '月削減時間', value: `${imp.expected_reduction_hours.toFixed(1)} h` },
                { label: '目安期間', value: `${imp.duration_days} 日` },
              ].map(({ label, value }) => (
                <div key={label} className="flex-1 rounded-lg bg-zinc-50 px-2 py-2 text-center">
                  <p className="text-[9px] text-zinc-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-xs font-bold text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-4 sm:px-5 space-y-4">
          {imp.personalized_advice && (
            <div className="rounded-xl bg-white border border-zinc-200 px-3 py-2.5 text-xs text-zinc-700 leading-relaxed">
              <span className="font-semibold text-zinc-900">このお宿への提案: </span>{imp.personalized_advice}
            </div>
          )}
          {imp.charm_impact_reason && (
            <div className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed border ${
              imp.charm_impact === 'risk'
                ? 'bg-red-50 border-red-200 text-red-700'
                : imp.charm_impact === 'caution'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <span className="font-semibold">魅力への影響: </span>{imp.charm_impact_reason}
            </div>
          )}
          {affectsLabels.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">対象オペレーション</p>
              <div className="flex flex-wrap gap-1.5">
                {affectsLabels.map((label) => (
                  <span key={label} className="rounded-full bg-white border border-zinc-200 px-3 py-1 text-xs text-zinc-700">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">実施方法</p>
            <p className="text-sm text-zinc-700 leading-relaxed">{imp.method}</p>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">導入期間</p>
              <p className="font-semibold text-zinc-900 mt-0.5">{imp.duration_days} 日</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">年間削減効果</p>
              <p className="font-semibold text-zinc-900 mt-0.5">{yen(imp.expected_reduction_yen * 12)}</p>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
