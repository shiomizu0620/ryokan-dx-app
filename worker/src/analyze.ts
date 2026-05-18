// Loss calculation + improvement prioritization.
// Pure functions: takes already-extracted facility data, returns numbers.
// See requirements.md §3.3 (loss formula) and §3.4 (priority score).

import {
  ERROR_HANDLING_YEN,
  IMPROVEMENTS,
  OPERATIONS,
  STAFF_HOURLY_YEN,
  type ImprovementPreset,
  type OperationId,
} from './presets'

export type ExtractedProfile = {
  name?: string
  rooms?: number
  staff_count?: number
  foreign_ratio?: number
  main_customer?: string
  stay_pattern?: string
}

export type ExtractedOperation = {
  id: OperationId
  monthly_occurrences: number
  reason?: string
}

export type ExtractedZone = {
  area: string
  dx: 'NG' | '要相談' | 'OK'
  reason?: string
  sensitivity?: 'high' | 'medium' | 'low'
  affected_operation_ids?: OperationId[]
}

export type ExtractedAnalysis = {
  profile: ExtractedProfile
  operations_in_use: ExtractedOperation[]
  zones: ExtractedZone[]
}

export type LossBreakdownItem = {
  operation_id: OperationId
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
  affects: OperationId[]
  expected_reduction_yen: number
  expected_reduction_hours: number
  score: number
  blocked_by_ambience: boolean
  charm_impact?: 'safe' | 'caution' | 'risk'
  charm_impact_reason?: string
}

const DIFFICULTY_SCORE: Record<'low' | 'medium' | 'high', number> = {
  low: 1,
  medium: 0.5,
  high: 0,
}

function ngOperationIds(zones: ExtractedZone[]): Set<OperationId> {
  const set = new Set<OperationId>()
  for (const z of zones) {
    if (z.dx !== 'NG') continue
    for (const id of z.affected_operation_ids ?? []) set.add(id)
  }
  return set
}

export function computeLosses(
  operations: ExtractedOperation[],
  zones: ExtractedZone[],
): LossSummary {
  const ng = ngOperationIds(zones)

  const breakdown: LossBreakdownItem[] = []
  for (const op of operations) {
    const preset = OPERATIONS.find((p) => p.id === op.id)
    if (!preset) continue
    const monthly_minutes = preset.minutes_per_occurrence * op.monthly_occurrences
    const monthly_hours = monthly_minutes / 60
    const yen_labor = Math.round(monthly_hours * STAFF_HOURLY_YEN)
    const yen_error = Math.round(
      preset.error_rate * op.monthly_occurrences * ERROR_HANDLING_YEN,
    )
    breakdown.push({
      operation_id: op.id,
      label: preset.label,
      monthly_occurrences: op.monthly_occurrences,
      monthly_hours: Math.round(monthly_hours * 10) / 10,
      monthly_yen_labor: yen_labor,
      monthly_yen_error: yen_error,
      monthly_yen_total: yen_labor + yen_error,
      blocked_by_zone: ng.has(op.id),
    })
  }

  const monthly_yen_total = breakdown.reduce(
    (s, b) => s + b.monthly_yen_total,
    0,
  )
  const monthly_hours_total =
    Math.round(breakdown.reduce((s, b) => s + b.monthly_hours, 0) * 10) / 10

  return {
    monthly_yen_total,
    monthly_hours_total,
    yearly_yen_total: monthly_yen_total * 12,
    breakdown,
  }
}

type ImprovementCandidate = {
  imp: ImprovementPreset
  affects: OperationId[]
  expected_reduction_yen: number
  expected_reduction_hours: number
  blocked: boolean
}

export function recommendImprovements(
  losses: LossSummary,
  zones: ExtractedZone[],
): ImprovementRec[] {
  const lossByOp = new Map(losses.breakdown.map((b) => [b.operation_id, b]))
  const ng = ngOperationIds(zones)

  const candidates: ImprovementCandidate[] = []
  for (const imp of IMPROVEMENTS) {
    // Only consider loss-reducing improvements with at least one matching op.
    if (imp.applies_to.length === 0 || imp.reduction_rate <= 0) continue
    const affects = imp.applies_to.filter((id) => lossByOp.has(id))
    if (affects.length === 0) continue
    let reduction_yen = 0
    let reduction_hours = 0
    for (const id of affects) {
      const b = lossByOp.get(id)!
      reduction_yen += b.monthly_yen_total * imp.reduction_rate
      reduction_hours += b.monthly_hours * imp.reduction_rate
    }
    candidates.push({
      imp,
      affects,
      expected_reduction_yen: Math.round(reduction_yen),
      expected_reduction_hours: Math.round(reduction_hours * 10) / 10,
      blocked: affects.some((id) => ng.has(id)),
    })
  }

  if (candidates.length === 0) return []

  const maxReduction = Math.max(...candidates.map((c) => c.expected_reduction_yen))

  return candidates
    .map((c): ImprovementRec => {
      const savings = maxReduction > 0 ? c.expected_reduction_yen / maxReduction : 0
      const difficulty = DIFFICULTY_SCORE[c.imp.difficulty]
      const ambience = c.blocked ? 0 : 1
      const score = savings * 0.5 + difficulty * 0.3 + ambience * 0.2
      return {
        id: c.imp.id,
        title: c.imp.title,
        method: c.imp.method,
        difficulty: c.imp.difficulty,
        duration_days: c.imp.duration_days,
        affects: c.affects,
        expected_reduction_yen: c.expected_reduction_yen,
        expected_reduction_hours: c.expected_reduction_hours,
        score: Math.round(score * 1000) / 1000,
        blocked_by_ambience: c.blocked,
      }
    })
    .sort((a, b) => b.score - a.score)
}
