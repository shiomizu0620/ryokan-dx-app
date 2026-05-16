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

// e.g. 1870500 → "約187万円"
function yenMan(n: number): string {
  const man = Math.round(n / 10000)
  if (man >= 100) {
    return `約${(man / 10).toFixed(1)}万円`.replace('.0万円', '万円')
  }
  return `約${man}万円`
}

const difficultyLabel = { low: '低', medium: '中', high: '高' } as const
const difficultyClass = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
} as const

export function Report({ data, onBack, onReset }: Props) {
  const { profile, losses, zones, improvements } = data

  const ngZones = zones.filter((z) => z.dx === 'NG')
  const cautionZones = zones.filter((z) => z.dx === '要相談')
  const okZones = zones.filter((z) => z.dx === 'OK')

  const facilityName = profile.name?.trim() || 'お宿'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">診断結果</h1>
            <p className="text-xs text-slate-500">{facilityName} 様</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            会話に戻る
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <ProfileSection data={data} />
        <LossSection losses={losses} />
        <ZonesSection
          ngZones={ngZones}
          cautionZones={cautionZones}
          okZones={okZones}
        />
        <ImprovementsSection improvements={improvements} />

        <div className="pt-4 flex justify-center">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full bg-slate-900 px-6 py-3 text-white font-medium text-sm sm:text-base hover:bg-slate-700 transition-colors"
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
    ['スタッフ人数', p.staff_count != null ? `${p.staff_count} 名` : undefined],
    [
      '主な客層',
      [
        p.main_customer,
        p.foreign_ratio != null
          ? `（外国人 ${Math.round(p.foreign_ratio * 100)}%）`
          : undefined,
      ]
        .filter(Boolean)
        .join(''),
    ],
    ['宿泊パターン', p.stay_pattern],
  ]
  const visible = items.filter(([, v]) => v && v.length > 0)
  if (visible.length === 0) return null

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        お宿のプロフィール
      </h2>
      <dl className="space-y-1.5">
        {visible.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between gap-4 text-sm sm:text-base"
          >
            <dt className="text-slate-500 shrink-0">{k}</dt>
            <dd className="text-slate-900 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function LossSection({ losses }: { losses: AnalyzeResponse['losses'] }) {
  if (losses.monthly_yen_total === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          現状の損失
        </h2>
        <p className="text-slate-600 text-sm">
          会話からは具体的な損失を試算できませんでした。もう少し業務の内容を聞かせていただくと、金額として見える化できます。
        </p>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
        このまま続けると…
      </h2>
      <p className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
        毎月 {yenMan(losses.monthly_yen_total)} の損失
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {yen(losses.monthly_yen_total)} / 月 ・{' '}
        {losses.monthly_hours_total.toFixed(1)} 時間 / 月
      </p>
      <p className="mt-1 text-sm text-slate-600">
        年間に直すと <span className="font-semibold text-slate-900">{yen(losses.yearly_yen_total)}</span>
      </p>

      {losses.breakdown.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            内訳
          </p>
          <ul className="space-y-2">
            {losses.breakdown.map((b) => (
              <BreakdownRow key={b.operation_id} item={b} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function BreakdownRow({ item }: { item: LossBreakdownItem }) {
  return (
    <li className="flex justify-between gap-4 text-sm">
      <div className="flex-1 min-w-0">
        <p className="text-slate-900 truncate">{item.label}</p>
        <p className="text-xs text-slate-500">
          月 {item.monthly_hours.toFixed(1)} 時間 ・{' '}
          {item.monthly_occurrences.toLocaleString('ja-JP')} 回
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-slate-900 font-medium">{yen(item.monthly_yen_total)}</p>
        {item.monthly_yen_error > 0 && (
          <p className="text-xs text-slate-500">
            内ミス対応 {yen(item.monthly_yen_error)}
          </p>
        )}
      </div>
    </li>
  )
}

function ZonesSection({
  ngZones,
  cautionZones,
  okZones,
}: {
  ngZones: Zone[]
  cautionZones: Zone[]
  okZones: Zone[]
}) {
  if (ngZones.length + cautionZones.length + okZones.length === 0) return null

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        DXマップ
      </h2>
      <div className="space-y-3">
        {ngZones.length > 0 && (
          <ZoneGroup
            label="雰囲気を守りたい場所"
            description="ここはDXせず、体験価値を守ります"
            tone="ng"
            zones={ngZones}
          />
        )}
        {cautionZones.length > 0 && (
          <ZoneGroup
            label="要相談"
            description="慎重に検討したい場所"
            tone="caution"
            zones={cautionZones}
          />
        )}
        {okZones.length > 0 && (
          <ZoneGroup
            label="改善推奨ゾーン"
            description="お客様に見えない裏側、DXで効率化できます"
            tone="ok"
            zones={okZones}
          />
        )}
      </div>
    </section>
  )
}

const zoneToneClass = {
  ng: 'border-red-200 bg-red-50',
  caution: 'border-yellow-200 bg-yellow-50',
  ok: 'border-green-200 bg-green-50',
} as const
const zoneHeaderClass = {
  ng: 'text-red-900',
  caution: 'text-yellow-900',
  ok: 'text-green-900',
} as const

function ZoneGroup({
  label,
  description,
  tone,
  zones,
}: {
  label: string
  description: string
  tone: 'ng' | 'caution' | 'ok'
  zones: Zone[]
}) {
  return (
    <div className={`rounded-xl border ${zoneToneClass[tone]} p-3`}>
      <p className={`text-sm font-semibold ${zoneHeaderClass[tone]}`}>{label}</p>
      <p className={`text-xs ${zoneHeaderClass[tone]} opacity-80 mb-2`}>
        {description}
      </p>
      <ul className="space-y-2">
        {zones.map((z, i) => (
          <li key={`${z.area}-${i}`} className="text-sm">
            <p className="font-medium text-slate-900">{z.area}</p>
            {z.reason && (
              <p className="text-slate-700 text-xs mt-0.5">{z.reason}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImprovementsSection({
  improvements,
}: {
  improvements: ImprovementRec[]
}) {
  if (improvements.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          改善のおすすめ
        </h2>
        <p className="text-slate-600 text-sm">
          現時点ではご提案できる改善策がありません。もう少し業務内容を聞かせていただけると、優先順位を付けてご提案できます。
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 px-1">
        改善のおすすめ（優先度順）
      </h2>
      <ol className="space-y-3">
        {improvements.map((imp, i) => (
          <ImprovementCard key={imp.id} imp={imp} rank={i + 1} />
        ))}
      </ol>
    </section>
  )
}

function ImprovementCard({
  imp,
  rank,
}: {
  imp: ImprovementRec
  rank: number
}) {
  const topRank = rank === 1
  return (
    <li
      className={`bg-white rounded-2xl border p-4 sm:p-5 ${
        topRank ? 'border-slate-900 shadow-sm' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 inline-flex items-center justify-center rounded-full w-8 h-8 text-sm font-bold ${
            topRank ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">
              {imp.title}
            </h3>
            <span
              className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${difficultyClass[imp.difficulty]}`}
            >
              難易度 {difficultyLabel[imp.difficulty]}
            </span>
            {imp.blocked_by_ambience && (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800">
                雰囲気優先ゾーンに関連
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 mb-3">{imp.method}</p>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] text-slate-500 uppercase tracking-wide">
                月削減額
              </dt>
              <dd className="text-sm sm:text-base font-bold text-slate-900">
                {yen(imp.expected_reduction_yen)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] text-slate-500 uppercase tracking-wide">
                月削減時間
              </dt>
              <dd className="text-sm sm:text-base font-bold text-slate-900">
                {imp.expected_reduction_hours.toFixed(1)} h
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[10px] text-slate-500 uppercase tracking-wide">
                目安期間
              </dt>
              <dd className="text-sm sm:text-base font-bold text-slate-900">
                {imp.duration_days} 日
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </li>
  )
}
