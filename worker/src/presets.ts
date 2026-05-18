// Industry-average presets for the loss calculation engine.
// Source: requirements.md §5.

export const STAFF_HOURLY_YEN = 1500
export const ERROR_HANDLING_YEN = 2000
export const HIRE_COST_YEN = 300_000

export const OPERATION_IDS = [
  'paper_kitchen',
  'whiteboard_order',
  'verbal_staff',
  'paper_shift',
  'new_staff_onboarding',
  'reservation_phone',
  'checkin_manual',
  'checkout_manual',
  'cleaning_verbal',
  'amenity_request',
  'maintenance_log',
  'review_response',
  'multilingual_response',
  'invoice_manual',
  'occupancy_excel',
] as const
export type OperationId = (typeof OPERATION_IDS)[number]

export type OperationPreset = {
  id: OperationId
  label: string
  minutes_per_occurrence: number
  // 0..1. 0 means no per-occurrence error cost.
  error_rate: number
  natural_unit: 'per_day' | 'per_week' | 'per_month' | 'per_year' | 'per_hire'
  note: string
}

export const OPERATIONS: OperationPreset[] = [
  {
    id: 'paper_kitchen',
    label: '紙伝達（厨房→客室）',
    minutes_per_occurrence: 3,
    error_rate: 0.15,
    natural_unit: 'per_day',
    note: '持ち回りで変動',
  },
  {
    id: 'whiteboard_order',
    label: 'ホワイトボード注文管理',
    minutes_per_occurrence: 2,
    error_rate: 0.1,
    natural_unit: 'per_day',
    note: '書き直し含む',
  },
  {
    id: 'verbal_staff',
    label: '口頭でのスタッフ間連絡',
    minutes_per_occurrence: 1.5,
    error_rate: 0.2,
    natural_unit: 'per_day',
    note: '伝達漏れ多い',
  },
  {
    id: 'paper_shift',
    label: '紙のシフト管理',
    minutes_per_occurrence: 30,
    error_rate: 0,
    natural_unit: 'per_week',
    note: '作成時間',
  },
  {
    id: 'new_staff_onboarding',
    label: '新人教育（属人化）',
    minutes_per_occurrence: 40 * 60,
    error_rate: 0,
    natural_unit: 'per_hire',
    note: '立ち上がりまで',
  },
  {
    id: 'reservation_phone',
    label: '電話予約の手動台帳記録',
    minutes_per_occurrence: 10,
    error_rate: 0.08,
    natural_unit: 'per_day',
    note: '空室確認・記録・確認連絡含む',
  },
  {
    id: 'checkin_manual',
    label: '手書きチェックイン台帳',
    minutes_per_occurrence: 8,
    error_rate: 0.05,
    natural_unit: 'per_day',
    note: '記入・確認・部屋割り含む',
  },
  {
    id: 'checkout_manual',
    label: '手動精算・現金管理',
    minutes_per_occurrence: 10,
    error_rate: 0.06,
    natural_unit: 'per_day',
    note: '計算・領収書・レジ締め含む',
  },
  {
    id: 'cleaning_verbal',
    label: '清掃指示の口頭・紙連絡',
    minutes_per_occurrence: 2,
    error_rate: 0.12,
    natural_unit: 'per_day',
    note: '清掃漏れ・順番ミス含む',
  },
  {
    id: 'amenity_request',
    label: 'アメニティ・備品の口頭対応',
    minutes_per_occurrence: 3,
    error_rate: 0.1,
    natural_unit: 'per_day',
    note: '内線・口頭での都度対応',
  },
  {
    id: 'maintenance_log',
    label: '設備メンテのアナログ記録',
    minutes_per_occurrence: 15,
    error_rate: 0,
    natural_unit: 'per_month',
    note: '紙台帳への記録・引き継ぎ',
  },
  {
    id: 'review_response',
    label: '口コミ返信の手作業（じゃらん・楽天等）',
    minutes_per_occurrence: 20,
    error_rate: 0,
    natural_unit: 'per_month',
    note: 'サイトごとに個別ログイン・返信',
  },
  {
    id: 'multilingual_response',
    label: '外国人ゲストへの個別対応',
    minutes_per_occurrence: 15,
    error_rate: 0.1,
    natural_unit: 'per_day',
    note: '都度の通訳・案内・ジェスチャー対応',
  },
  {
    id: 'invoice_manual',
    label: '請求書・領収書の手書き',
    minutes_per_occurrence: 5,
    error_rate: 0.05,
    natural_unit: 'per_day',
    note: '法人請求・インボイス対応含む',
  },
  {
    id: 'occupancy_excel',
    label: '稼働予測・売上管理のExcel作業',
    minutes_per_occurrence: 60,
    error_rate: 0,
    natural_unit: 'per_week',
    note: '集計・グラフ更新・報告書作成',
  },
]

export const IMPROVEMENT_IDS = [
  'imp_form_line',
  'imp_order_app',
  'imp_shift_app',
  'imp_manual_digital',
  'imp_qr_multilingual',
  'imp_pms',
  'imp_cleaning_app',
  'imp_maintenance_app',
  'imp_review_tool',
] as const
export type ImprovementId = (typeof IMPROVEMENT_IDS)[number]

export type ImprovementPreset = {
  id: ImprovementId
  title: string
  applies_to: OperationId[]
  // 0..1. 0 means no direct loss-reduction; excluded from auto-prioritized recommendations.
  reduction_rate: number
  difficulty: 'low' | 'medium' | 'high'
  duration_days: number
  method: string
}

export const IMPROVEMENTS: ImprovementPreset[] = [
  {
    id: 'imp_form_line',
    title: 'GoogleフォームとLINE活用',
    applies_to: ['paper_kitchen', 'verbal_staff', 'amenity_request'],
    reduction_rate: 0.6,
    difficulty: 'low',
    duration_days: 7,
    method: 'Googleフォームで注文・要望受付、LINEで通知',
  },
  {
    id: 'imp_order_app',
    title: '専用オーダーアプリ導入',
    applies_to: ['paper_kitchen', 'whiteboard_order'],
    reduction_rate: 0.8,
    difficulty: 'medium',
    duration_days: 30,
    method: 'タブレット型のオーダーシステム',
  },
  {
    id: 'imp_shift_app',
    title: 'シフト管理アプリ',
    applies_to: ['paper_shift'],
    reduction_rate: 0.7,
    difficulty: 'low',
    duration_days: 14,
    method: 'シフト管理SaaSの導入',
  },
  {
    id: 'imp_manual_digital',
    title: 'マニュアルのデジタル化',
    applies_to: ['new_staff_onboarding'],
    reduction_rate: 0.5,
    difficulty: 'low',
    duration_days: 14,
    method: '動画＋共有ドキュメントでマニュアル整備',
  },
  {
    id: 'imp_qr_multilingual',
    title: '多言語QR案内',
    applies_to: ['multilingual_response'],
    reduction_rate: 0.4,
    difficulty: 'low',
    duration_days: 7,
    method: 'QRコードで多言語の館内案内・サービス説明を提供',
  },
  {
    id: 'imp_pms',
    title: 'PMS（宿泊管理システム）導入',
    applies_to: ['reservation_phone', 'checkin_manual', 'checkout_manual', 'occupancy_excel'],
    reduction_rate: 0.75,
    difficulty: 'high',
    duration_days: 90,
    method: 'クラウド型PMSで予約・チェックイン・精算・稼働管理を一元化',
  },
  {
    id: 'imp_cleaning_app',
    title: '清掃・客室管理アプリ',
    applies_to: ['cleaning_verbal', 'amenity_request'],
    reduction_rate: 0.65,
    difficulty: 'low',
    duration_days: 14,
    method: 'タブレットで清掃状況・備品補充をリアルタイム共有',
  },
  {
    id: 'imp_maintenance_app',
    title: '設備管理デジタル化',
    applies_to: ['maintenance_log'],
    reduction_rate: 0.6,
    difficulty: 'low',
    duration_days: 7,
    method: '設備点検・修繕記録をスマホアプリで管理・共有',
  },
  {
    id: 'imp_review_tool',
    title: '口コミ一括管理ツール',
    applies_to: ['review_response'],
    reduction_rate: 0.5,
    difficulty: 'low',
    duration_days: 7,
    method: 'じゃらん・楽天・Google等の口コミを一画面で管理・返信',
  },
]
