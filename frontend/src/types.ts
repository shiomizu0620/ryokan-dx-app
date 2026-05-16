// Shared types for the chat ↔ analyze flow.
// Mirrors worker/src/analyze.ts response shape — keep in sync when fields change.

export type Message = { role: 'user' | 'assistant'; content: string }

export type Profile = {
  name?: string
  rooms?: number
  staff_count?: number
  foreign_ratio?: number
  main_customer?: string
  stay_pattern?: string
}

export type OperationInUse = {
  id: string
  monthly_occurrences: number
  reason?: string
}

export type Zone = {
  area: string
  dx: 'NG' | '要相談' | 'OK'
  reason?: string
  sensitivity?: 'high' | 'medium' | 'low'
  affected_operation_ids?: string[]
}

export type LossBreakdownItem = {
  operation_id: string
  label: string
  monthly_occurrences: number
  monthly_hours: number
  monthly_yen_labor: number
  monthly_yen_error: number
  monthly_yen_total: number
  blocked_by_zone: boolean
}

export type LossSummary = {
  monthly_yen_total: number
  monthly_hours_total: number
  yearly_yen_total: number
  breakdown: LossBreakdownItem[]
}

export type ImprovementRec = {
  id: string
  title: string
  method: string
  difficulty: 'low' | 'medium' | 'high'
  duration_days: number
  affects: string[]
  expected_reduction_yen: number
  expected_reduction_hours: number
  score: number
  blocked_by_ambience: boolean
}

export type AnalyzeResponse = {
  profile: Profile
  operations_in_use: OperationInUse[]
  zones: Zone[]
  losses: LossSummary
  improvements: ImprovementRec[]
}
