import { Hono } from 'hono'
import { cors } from 'hono/cors'
import OpenAI from 'openai'
import { OPERATION_IDS } from './presets'
import {
  computeLosses,
  recommendImprovements,
  type ExtractedAnalysis,
} from './analyze'
import {
  searchPlaces,
  getPlaceReviews,
  extractCharm,
  applyCharmImpact,
  type Charm,
} from './charm'

type Bindings = {
  OPENAI_API_KEY: string
  PLACES_API_KEY: string
  DB: D1Database
}

const MODEL = 'gpt-4o-mini'

const SYSTEM_PROMPT = `あなたは旅館のDX診断を行うコンサルタント「番頭さん」です。
旅館・宿泊施設の現場担当者や経営者との会話を通じて、業務上の無駄を見つけ、
"雰囲気を守りたい場所" と "改善すべき場所" を区別して整理することが役目です。

【会話の流れ】
Step1: 挨拶と趣旨説明（旅館の無駄を一緒に見つけましょう、と伝える）
Step2: 施設情報を聞く（名前、客室数、スタッフ人数、主な客層、宿泊パターン、おおよその稼働率、スタッフの時給の目安、繁忙期は何ヶ月くらいか）
Step3: 既存ツールの確認（「今すでに使っているシステムやアプリはありますか？」と一問で確認する。PMSや予約システム、LINEなど）
Step4: オペレーションを聞く（すべてを順番に列挙せず、「一番手間がかかっていることは？」「アナログなまま残っていることは？」とオープンに聞いて把握する。以下の業務が該当するか確認する：料理・注文の伝達、予約受付・台帳管理、チェックイン・チェックアウト・精算、清掃指示・備品補充、スタッフ間の連絡、シフト管理、口コミ返信、外国人ゲスト対応、請求書・領収書、稼働予測・売上管理）
Step5: こだわりの確認（変えたくない場所、雰囲気を守りたい場所。お風呂・廊下・玄関・食事処などを具体的に）
Step6: 要約してユーザーに確認

【ルール】
- 一度の発言で質問は1〜2個まで。質問攻めにしない。
- 丁寧で柔らかい敬語。専門用語・カタカナ語は避ける。
- 7〜12ターンで完結を目指す。
- 「変えたくない」「雰囲気が大事」「お客様が喜ぶ」「伝統的に」などの発言が出たら、
  雰囲気優先ゾーンとして頭の中に記憶する（返答には書かない）。
- 既存ツールで既に解決済みの業務（例: PMSを使っているなら予約台帳は指摘しない）はオペレーション問題として扱わない。
- ユーザーが「もう十分」「これでお願い」と言ったら、Step6（要約）に進む。
- 十分な情報が揃ったと判断したら（Step5まで終わっていれば可）、Step6の要約メッセージを送る。その要約メッセージの末尾に、改行なしで [[COMPLETE]] とだけ追記する。ユーザーの確認を待たずに付ける。[[COMPLETE]] はメッセージ本文の最後に一度だけ付ける。これが診断開始のシグナルとなる。
- レポート生成は次のフェーズで実装されるため、現時点では会話のみを担当する。`

const ANALYSIS_SYSTEM_PROMPT = `あなたは旅館DX診断の解析担当です。
これまでの会話履歴を読み、施設プロフィール・現在使われている業務オペレーション・雰囲気優先ゾーンを構造化JSONで出力してください。

【operations_in_use のID一覧】（該当するもののみ含める。既存ツールで解決済みの業務は含めない）
- paper_kitchen: 紙伝達（厨房→客室）
- whiteboard_order: ホワイトボード注文管理
- verbal_staff: 口頭でのスタッフ間連絡
- paper_shift: 紙のシフト管理
- new_staff_onboarding: 新人教育（属人化）
- reservation_phone: 電話予約の手動台帳記録（OTAシステム・PMS使用済みなら除外）
- checkin_manual: 手書きチェックイン台帳（PMSで管理中なら除外）
- checkout_manual: 手動精算・現金管理（POSや精算システム使用済みなら除外）
- cleaning_verbal: 清掃指示の口頭・紙連絡
- amenity_request: アメニティ・備品の口頭対応（内線・都度対応）
- maintenance_log: 設備メンテのアナログ記録（紙台帳・ノート管理）
- review_response: 口コミ返信の手作業（じゃらん・楽天・Google等）
- multilingual_response: 外国人ゲストへの個別対応（通訳・ジェスチャー対応）
- invoice_manual: 請求書・領収書の手書き（法人・インボイス含む）
- occupancy_excel: 稼働予測・売上管理のExcel作業（PMSのレポート機能使用中なら除外）

【monthly_occurrences の推定方法】
会話内容と施設規模（客室数・スタッフ数・稼働率）から推定。稼働率が不明な場合は0.7を仮定。
- paper_kitchen / whiteboard_order: 1日の食事提供数×30。例: 16室稼働・1泊2食なら 16×2×30=960回/月
- verbal_staff: 1日のスタッフ間連絡回数×30。スタッフ数×5回/人を目安に
- paper_shift: 週1回作成 → 4回/月
- new_staff_onboarding: 年間採用数÷12。例: 年6人なら0.5回/月
- reservation_phone: 月間チェックイン組数の推定値。客室数×稼働率×30÷平均泊数
- checkin_manual / checkout_manual: reservation_phoneとほぼ同数
- cleaning_verbal: 稼働客室数×30。例: 16室×30=480回/月
- amenity_request: 稼働客室数×0.2×30（宿泊客の約20%が要求と仮定）
- maintenance_log: 週1〜3件 → 4〜12回/月。施設規模・築年数で判断
- review_response: 月間チェックイン組数×0.25（約25%が口コミ投稿と仮定）
- multilingual_response: 月間ゲスト数×外国人比率×1.5（1人あたり案内1.5回）
- invoice_manual: 月間チェックイン組数×0.15（法人・領収書要求の割合）
- occupancy_excel: 週1回 → 4回/月

【zones.dx の値】
- "NG": 雰囲気・体験の価値が高くデジタル化すべきでない
- "要相談": 慎重に検討
- "OK": デジタル化を推奨

zones.affected_operation_ids: そのゾーンが上記オペレーションIDのどれと関連するかを配列で。関係なければ空配列。

【profile の全フィールド】会話に出てこない場合は null を入れてください（必ず全フィールドを返す）。
- name: 施設名
- rooms: 客室数（整数）
- staff_count: スタッフ人数（整数）
- foreign_ratio: 外国人ゲストの割合（0〜1の数値）
- main_customer: 主な客層（例: "ファミリー"・"カップル"・"ビジネス"）
- stay_pattern: 宿泊パターン（例: "1泊2食"・"素泊まり"）
- occupancy_rate: 稼働率（0〜1の数値）
- avg_hourly_wage: スタッフの平均時給（円。損失計算に直接使用されるため重要）
- busy_months_per_year: 繁忙期の月数（整数、1〜12）
- existing_tools: 現在使用中のシステム・アプリ名の配列（例: ["じゃらんnet", "LINE", "Excel"]）

【improvement_notes の書き方】
以下9つの改善策IDそれぞれについて、この施設向けの個別アドバイスを書いてください。
その施設で検出されたオペレーションに関係ない場合は null にしてください。

- imp_form_line: GoogleフォームとLINE活用（紙伝達・口頭連絡・備品要求の改善）
- imp_order_app: 専用オーダーアプリ（料理・注文管理の改善）
- imp_shift_app: シフト管理アプリ（紙シフトの改善）
- imp_manual_digital: マニュアルのデジタル化（新人教育の改善）
- imp_qr_multilingual: 多言語QR案内（外国人対応の改善）
- imp_pms: PMS（宿泊管理システム）（予約・チェックイン・精算・稼働管理の改善）
- imp_cleaning_app: 清掃・客室管理アプリ（清掃指示・備品補充の改善）
- imp_maintenance_app: 設備管理デジタル化（メンテ記録の改善）
- imp_review_tool: 口コミ一括管理ツール（口コミ返信の改善）

書き方のポイント:
- 施設の規模・既存ツール・客層を具体的に言及する（例: "20室規模なら〜"、"すでにLINEをお使いとのことで〜"）
- 具体的なツール名と費用感を入れる（例: "シフボード 月3,300円〜"、"無料のGoogleフォーム"）
- 最初の一歩を示す（例: "まず〇〇から試してみることをお勧めします"）
- 40〜80字程度の簡潔さを保つ`

const app = new Hono<{ Bindings: Bindings }>()

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (
        origin === 'http://localhost:5173' ||
        origin === 'https://ryokan-dx-app.pages.dev' ||
        origin.endsWith('.ryokan-dx-app.pages.dev')
      ) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/', (c) => c.text('ryokan-dx worker'))

app.get('/api/health', async (c) => {
  const key = c.env.OPENAI_API_KEY
  const places = c.env.PLACES_API_KEY
  let db_ok = false
  try {
    await c.env.DB.prepare('SELECT 1').first()
    db_ok = true
  } catch {
    db_ok = false
  }
  return c.json({
    ok: true,
    has_openai_key: typeof key === 'string' && key.length > 0,
    has_places_key: typeof places === 'string' && places.length > 0,
    db_ok,
  })
})

type CharmSearchRequest = { facility_name?: string; location?: string }

app.post('/api/charm/search', async (c) => {
  let body: CharmSearchRequest
  try {
    body = await c.req.json<CharmSearchRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const name = body.facility_name?.trim()
  if (!name) {
    return c.json({ error: 'facility_name required' }, 400)
  }
  if (!c.env.PLACES_API_KEY) {
    return c.json({ error: 'PLACES_API_KEY not configured' }, 500)
  }
  const query = body.location ? `${name} ${body.location}` : name
  try {
    const candidates = await searchPlaces(query, c.env.PLACES_API_KEY)
    return c.json({ candidates })
  } catch (e) {
    console.error('Places search failed:', e)
    return c.json({ error: 'places search failed', detail: String(e) }, 500)
  }
})

type CharmRequest = {
  facility_name?: string
  location?: string
  place_id?: string
  manual_reviews?: string
}

app.post('/api/charm', async (c) => {
  let body: CharmRequest
  try {
    body = await c.req.json<CharmRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const facilityName = body.facility_name?.trim()
  if (!facilityName) {
    return c.json({ error: 'facility_name required' }, 400)
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let reviews: string[] = []
  let source: 'places' | 'manual' = 'manual'
  let resolvedName = facilityName

  if (body.manual_reviews && body.manual_reviews.trim().length > 0) {
    // Split user-pasted reviews on blank lines or 2+ newlines.
    reviews = body.manual_reviews
      .split(/\n\s*\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
    source = 'manual'
  } else if (body.place_id) {
    if (!c.env.PLACES_API_KEY) {
      return c.json({ error: 'PLACES_API_KEY not configured' }, 500)
    }
    try {
      const result = await getPlaceReviews(body.place_id, c.env.PLACES_API_KEY)
      reviews = result.reviews
      resolvedName = result.name || facilityName
      source = 'places'
    } catch (e) {
      console.error('Place details failed:', e)
      return c.json(
        { error: 'place details failed', detail: String(e) },
        500,
      )
    }
  } else {
    return c.json(
      { error: 'either place_id or manual_reviews is required' },
      400,
    )
  }

  let charm: Charm
  try {
    charm = await extractCharm({
      facility_name: resolvedName,
      location: body.location,
      reviews,
      openai: client,
      model: MODEL,
      source,
      place_id: body.place_id,
    })
  } catch (e) {
    console.error('Charm extraction failed:', e)
    return c.json(
      { error: 'charm extraction failed', detail: String(e) },
      500,
    )
  }

  return c.json(charm)
})

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { messages?: ChatMessage[]; facility_id?: string; charm?: Charm }

function buildCharmPromptBlock(charm: Charm): string {
  return `\n\n【このお宿の魅力（口コミから抽出済み）】
施設名: ${charm.facility_name}
魅力タグ: ${charm.charm_tags.join('、')}
概要: ${charm.charm_summary}
守るべき要素: ${charm.protect_keywords.join('、')}

ヒアリングでは、業務の無駄を聞き出しながら「その改善がこの旅館の魅力を損なわないか」もさりげなく確認してください。特に「${charm.protect_keywords[0] ?? ''}」などに関わる場所や作業は慎重に扱ってください。`
}

type FacilityRow = { profile_json: string; zones_json: string }

app.post('/api/chat', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const messages = body.messages ?? []
  if (messages.length === 0) {
    return c.json({ error: 'messages required' }, 400)
  }

  let systemPrompt = SYSTEM_PROMPT
  if (body.charm) {
    systemPrompt += buildCharmPromptBlock(body.charm)
  }

  // Inject previous facility data into system prompt for return visits
  if (body.facility_id) {
    try {
      const prev = await c.env.DB.prepare(
        'SELECT profile_json, zones_json FROM facilities WHERE facility_id = ? LIMIT 1',
      )
        .bind(body.facility_id)
        .first<FacilityRow>()

      if (prev) {
        systemPrompt +=
          `\n\n【前回の診断データ（参考）】\nこの施設は以前に診断済みです。以下の情報を把握した上で、変化点や追加情報を中心に確認してください。新規に聞く必要のない項目はスキップしてください。\n\n施設プロフィール: ${prev.profile_json}\n雰囲気優先ゾーン: ${prev.zones_json}`
      }
    } catch (e) {
      console.error('D1 fetch for chat context failed (non-fatal):', e)
    }
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  let stream
  try {
    stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    })
  } catch (e) {
    console.error('OpenAI chat completion failed:', e)
    return c.json(
      { error: 'failed to start chat', detail: String(e) },
      500,
    )
  }

  const encoder = new TextEncoder()
  const bodyStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) controller.enqueue(encoder.encode(delta))
        }
      } catch (e) {
        console.error('OpenAI stream error:', e)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(bodyStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// OpenAI structured outputs requires strict mode:
// - additionalProperties: false on every object
// - every property must appear in `required`
// - optional fields use `type: ['T', 'null']`
const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profile', 'operations_in_use', 'zones', 'improvement_notes'],
  properties: {
    profile: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'rooms',
        'staff_count',
        'foreign_ratio',
        'main_customer',
        'stay_pattern',
        'occupancy_rate',
        'avg_hourly_wage',
        'busy_months_per_year',
        'existing_tools',
      ],
      properties: {
        name: { type: ['string', 'null'] },
        rooms: { type: ['integer', 'null'] },
        staff_count: { type: ['integer', 'null'] },
        foreign_ratio: { type: ['number', 'null'] },
        main_customer: { type: ['string', 'null'] },
        stay_pattern: { type: ['string', 'null'] },
        occupancy_rate: { type: ['number', 'null'] },
        avg_hourly_wage: { type: ['integer', 'null'] },
        busy_months_per_year: { type: ['integer', 'null'] },
        existing_tools: { type: ['array', 'null'], items: { type: 'string' } },
      },
    },
    operations_in_use: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'monthly_occurrences', 'reason'],
        properties: {
          id: { type: 'string', enum: [...OPERATION_IDS] },
          monthly_occurrences: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
    improvement_notes: {
      type: 'object',
      additionalProperties: false,
      required: [
        'imp_form_line',
        'imp_order_app',
        'imp_shift_app',
        'imp_manual_digital',
        'imp_qr_multilingual',
        'imp_pms',
        'imp_cleaning_app',
        'imp_maintenance_app',
        'imp_review_tool',
      ],
      properties: {
        imp_form_line: { type: ['string', 'null'] },
        imp_order_app: { type: ['string', 'null'] },
        imp_shift_app: { type: ['string', 'null'] },
        imp_manual_digital: { type: ['string', 'null'] },
        imp_qr_multilingual: { type: ['string', 'null'] },
        imp_pms: { type: ['string', 'null'] },
        imp_cleaning_app: { type: ['string', 'null'] },
        imp_maintenance_app: { type: ['string', 'null'] },
        imp_review_tool: { type: ['string', 'null'] },
      },
    },
    zones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'area',
          'dx',
          'reason',
          'sensitivity',
          'affected_operation_ids',
        ],
        properties: {
          area: { type: 'string' },
          dx: { type: 'string', enum: ['NG', '要相談', 'OK'] },
          reason: { type: 'string' },
          sensitivity: { type: 'string', enum: ['high', 'medium', 'low'] },
          affected_operation_ids: {
            type: 'array',
            items: { type: 'string', enum: [...OPERATION_IDS] },
          },
        },
      },
    },
  },
} as const

app.post('/api/analyze', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const messages = body.messages ?? []
  if (messages.length === 0) {
    return c.json({ error: 'messages required' }, 400)
  }

  const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })

  const analysisPrompt = body.charm
    ? ANALYSIS_SYSTEM_PROMPT +
      `\n\n【このお宿の魅力情報（charm_impact 判定の参考にすること）】\n魅力タグ: ${body.charm.charm_tags.join('、')}\n守るべき要素: ${body.charm.protect_keywords.join('、')}`
    : ANALYSIS_SYSTEM_PROMPT

  let raw: string
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: analysisPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ryokan_analysis',
          schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
    })
    raw = response.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.error('OpenAI analysis failed:', e)
    return c.json({ error: 'analysis failed', detail: String(e) }, 500)
  }

  let extracted: ExtractedAnalysis
  try {
    extracted = JSON.parse(raw) as ExtractedAnalysis
  } catch (e) {
    console.error('Failed to parse OpenAI JSON:', raw, e)
    return c.json({ error: 'invalid analysis output', raw }, 500)
  }

  const ops = extracted.operations_in_use ?? []
  const zones = extracted.zones ?? []
  const losses = computeLosses(ops, zones, extracted.profile)
  const improvements = recommendImprovements(losses, zones, extracted.improvement_notes)

  if (body.charm && improvements.length > 0) {
    try {
      await applyCharmImpact(improvements, body.charm, client, MODEL)
    } catch (e) {
      console.error('charm_impact evaluation failed (non-fatal):', e)
    }
  }

  // Persist to D1 (non-fatal: analysis result is returned even if DB write fails)
  let facility_id: string | null = null
  try {
    const facilityName = extracted.profile?.name ?? null
    if (facilityName) {
      const existing = await c.env.DB.prepare(
        'SELECT facility_id FROM facilities WHERE name = ? LIMIT 1',
      )
        .bind(facilityName)
        .first<{ facility_id: string }>()

      if (existing) {
        facility_id = existing.facility_id
        await c.env.DB.prepare(
          `UPDATE facilities SET profile_json=?, zones_json=?, losses_json=?, improvements_json=?, charm_json=?, updated_at=datetime('now') WHERE facility_id=?`,
        )
          .bind(
            JSON.stringify(extracted.profile),
            JSON.stringify(zones),
            JSON.stringify(losses),
            JSON.stringify(improvements),
            JSON.stringify(body.charm ?? {}),
            facility_id,
          )
          .run()
      } else {
        facility_id = crypto.randomUUID()
        await c.env.DB.prepare(
          `INSERT INTO facilities (facility_id, name, profile_json, zones_json, losses_json, improvements_json, charm_json) VALUES (?,?,?,?,?,?,?)`,
        )
          .bind(
            facility_id,
            facilityName,
            JSON.stringify(extracted.profile),
            JSON.stringify(zones),
            JSON.stringify(losses),
            JSON.stringify(improvements),
            JSON.stringify(body.charm ?? {}),
          )
          .run()
      }
    } else {
      facility_id = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO facilities (facility_id, name, profile_json, zones_json, losses_json, improvements_json, charm_json) VALUES (?,?,?,?,?,?,?)`,
      )
        .bind(
          facility_id,
          '未設定',
          JSON.stringify(extracted.profile),
          JSON.stringify(zones),
          JSON.stringify(losses),
          JSON.stringify(improvements),
          JSON.stringify(body.charm ?? {}),
        )
        .run()
    }

    const session_id = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO sessions (session_id, facility_id, messages_json, ended_at) VALUES (?,?,?,datetime('now'))`,
    )
      .bind(session_id, facility_id, JSON.stringify(messages))
      .run()
  } catch (e) {
    console.error('D1 save failed (non-fatal):', e)
  }

  return c.json({
    facility_id,
    profile: extracted.profile ?? {},
    operations_in_use: ops,
    zones,
    losses,
    improvements,
  })
})

export default app
