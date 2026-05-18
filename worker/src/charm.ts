// Charm extraction and charm-impact evaluation for improvement recommendations.
// "Charm" = the ryokan-specific appeal vector that drives downstream chat
// and improvement scoring.

import OpenAI from 'openai'
import type { ImprovementRec } from './analyze'

const PLACES_BASE = 'https://places.googleapis.com/v1'

export type PlaceCandidate = {
  place_id: string
  name: string
  address: string
  rating?: number
  user_rating_count?: number
}

export type Charm = {
  facility_name: string
  location?: string
  charm_tags: string[]
  charm_summary: string
  protect_keywords: string[]
  source: 'places' | 'manual'
  raw_reviews_count: number
  place_id?: string
}

type PlacesSearchResponse = {
  places?: Array<{
    id: string
    displayName?: { text?: string }
    formattedAddress?: string
    rating?: number
    userRatingCount?: number
  }>
}

type PlaceReview = {
  text?: { text?: string }
  originalText?: { text?: string }
  rating?: number
}

type PlaceDetailsResponse = {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  reviews?: PlaceReview[]
  rating?: number
}

export async function searchPlaces(
  query: string,
  apiKey: string,
): Promise<PlaceCandidate[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'ja',
      regionCode: 'JP',
      maxResultCount: 5,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Places searchText failed: ${res.status} ${detail}`)
  }
  const data = (await res.json()) as PlacesSearchResponse
  const places = data.places ?? []
  return places.map((p) => ({
    place_id: p.id,
    name: p.displayName?.text ?? '(no name)',
    address: p.formattedAddress ?? '',
    rating: p.rating,
    user_rating_count: p.userRatingCount,
  }))
}

export async function getPlaceReviews(
  placeId: string,
  apiKey: string,
): Promise<{ name: string; reviews: string[] }> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,reviews,rating',
      'Accept-Language': 'ja',
    },
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Places details failed: ${res.status} ${detail}`)
  }
  const data = (await res.json()) as PlaceDetailsResponse
  const name = data.displayName?.text ?? '(unknown)'
  const reviews = (data.reviews ?? [])
    .map((r) => r.text?.text ?? r.originalText?.text ?? '')
    .filter((s) => s.length > 0)
  return { name, reviews }
}

const CHARM_SYSTEM_PROMPT = `あなたは旅館の魅力を口コミから抽出する専門家です。
渡された口コミ群から、その旅館 *固有* の魅力を3〜5個のタグと、120字程度の短い要約として抽出してください。

【重要なルール】
- 「綺麗」「美味しい」「親切」などの一般的な形容詞ではなく、その旅館特有の具体的な体験・要素を抽出する
  (例: 良 = "深夜の静寂", "女将の手書き案内", "源泉かけ流し24時間"
       悪 = "綺麗", "美味しい", "丁寧")
- charm_tags: 5〜15字程度の名詞句で3〜5個
- charm_summary: 「この旅館は○○が魅力で、△△を大事にしている」という形で120字以内
- protect_keywords: DXによる効率化で壊れる可能性がある要素を3〜5個（charm_tagsと重複可）
- 口コミが少ない / 一般的すぎる場合は、無理に固有性を作らず "(一般的な旅館)" 等で正直に書く`

const CHARM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['charm_tags', 'charm_summary', 'protect_keywords'],
  properties: {
    charm_tags: {
      type: 'array',
      items: { type: 'string' },
    },
    charm_summary: { type: 'string' },
    protect_keywords: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

export async function extractCharm(params: {
  facility_name: string
  location?: string
  reviews: string[]
  openai: OpenAI
  model: string
  source: 'places' | 'manual'
  place_id?: string
}): Promise<Charm> {
  const { facility_name, location, reviews, openai, model, source, place_id } =
    params

  if (reviews.length === 0) {
    return {
      facility_name,
      location,
      charm_tags: [],
      charm_summary: '(口コミが取得できませんでした)',
      protect_keywords: [],
      source,
      raw_reviews_count: 0,
      place_id,
    }
  }

  const userPrompt = `旅館名: ${facility_name}\n${
    location ? `所在地: ${location}\n` : ''
  }\n【口コミ ${reviews.length}件】\n${reviews
    .map((r, i) => `(${i + 1}) ${r}`)
    .join('\n\n')}`

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHARM_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'charm_extraction',
        schema: CHARM_SCHEMA as unknown as Record<string, unknown>,
        strict: true,
      },
    },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as {
    charm_tags: string[]
    charm_summary: string
    protect_keywords: string[]
  }

  return {
    facility_name,
    location,
    charm_tags: parsed.charm_tags,
    charm_summary: parsed.charm_summary,
    protect_keywords: parsed.protect_keywords,
    source,
    raw_reviews_count: reviews.length,
    place_id,
  }
}

const CHARM_IMPACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['evaluations'],
  properties: {
    evaluations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'charm_impact', 'charm_impact_reason'],
        properties: {
          id: { type: 'string' },
          charm_impact: { type: 'string', enum: ['safe', 'caution', 'risk'] },
          charm_impact_reason: { type: 'string' },
        },
      },
    },
  },
} as const

export async function applyCharmImpact(
  improvements: ImprovementRec[],
  charm: Charm,
  openai: OpenAI,
  model: string,
): Promise<void> {
  const impList = improvements
    .map((imp) => `- id: ${imp.id}\n  改善策: ${imp.title}\n  内容: ${imp.method}`)
    .join('\n')

  const prompt = `以下の旅館の魅力タグと守るべき要素を踏まえ、各改善策が旅館の魅力に与える影響を評価してください。

【旅館の魅力】
魅力タグ: ${charm.charm_tags.join('、')}
守るべき要素: ${charm.protect_keywords.join('、')}

【改善策一覧】
${impList}

各改善策の charm_impact を以下の基準で評価:
- safe: 魅力への影響がほぼない
- caution: 実施方法次第では影響が出る可能性がある
- risk: この旅館の魅力を損なう可能性が高い

charm_impact_reason は20〜40字で具体的に。`

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'charm_impact_eval',
        schema: CHARM_IMPACT_SCHEMA as unknown as Record<string, unknown>,
        strict: true,
      },
    },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as {
    evaluations: Array<{ id: string; charm_impact: string; charm_impact_reason: string }>
  }

  const evalMap = new Map(parsed.evaluations.map((e) => [e.id, e]))
  for (const imp of improvements) {
    const ev = evalMap.get(imp.id)
    if (ev) {
      imp.charm_impact = ev.charm_impact as 'safe' | 'caution' | 'risk'
      imp.charm_impact_reason = ev.charm_impact_reason
    }
  }
}
