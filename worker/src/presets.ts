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
] as const
export type OperationId = (typeof OPERATION_IDS)[number]

export type OperationPreset = {
  id: OperationId
  label: string
  minutes_per_occurrence: number
  // 0..1. 0 means no per-occurrence error cost (e.g. shift sheet writing).
  error_rate: number
  // Natural cadence — informational. Gemini converts to monthly_occurrences.
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
]

export const IMPROVEMENT_IDS = [
  'imp_form_line',
  'imp_order_app',
  'imp_shift_app',
  'imp_manual_digital',
  'imp_qr_multilingual',
] as const
export type ImprovementId = (typeof IMPROVEMENT_IDS)[number]

export type ImprovementPreset = {
  id: ImprovementId
  title: string
  applies_to: OperationId[]
  // 0..1. Multilingual QR has no direct loss-reduction so it's 0;
  // such entries are excluded from auto-prioritized recommendations.
  reduction_rate: number
  difficulty: 'low' | 'medium' | 'high'
  duration_days: number
  method: string
}

export const IMPROVEMENTS: ImprovementPreset[] = [
  {
    id: 'imp_form_line',
    title: 'GoogleフォームとLINE活用',
    applies_to: ['paper_kitchen', 'verbal_staff'],
    reduction_rate: 0.6,
    difficulty: 'low',
    duration_days: 7,
    method: 'Googleフォームで注文受付、LINEで通知',
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
    applies_to: [],
    reduction_rate: 0,
    difficulty: 'low',
    duration_days: 7,
    method: 'QRコードで多言語の館内案内',
  },
]
