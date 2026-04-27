import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import type {
  TranscriptEntry,
  PushToThinkResult,
  Language,
  AiProvider,
} from '../types/ipc'

// ---- 共通 -----------------------------------------------------------------

interface PushToThinkDispatchArgs {
  provider: AiProvider
  geminiApiKey: string
  anthropicApiKey?: string
  language?: Language
  companyProfile?: string
  transcript: TranscriptEntry[]
  imageDataUrl: string | null
  context: string
  // ストリーミング途中で部分結果を流したい場合に指定（Claude deep のみ実装）
  onPartial?: (patterns: PushToThinkResult['patterns']) => void
}

// Push-to-Think に直近で生渡しする件数。これより古い分は要約して圧縮する。
const RECENT_VERBATIM_WINDOW = 30
// 要約対象の古い entries が何件以上になったら要約を作るか
const SUMMARIZE_THRESHOLD = 20

// 要約キャッシュ（古い entries の最初の timestamp + 件数 で同一性判定）
const summaryCache = new Map<string, string>()
const SUMMARY_CACHE_MAX = 40

function cacheKey(older: TranscriptEntry[]): string {
  if (older.length === 0) return ''
  const first = older[0]
  const last = older[older.length - 1]
  return `${first.timestamp}|${last.timestamp}|${older.length}`
}

// Claude の画像入力で許可されている media type（SDK v0.91 の型）
type ClaudeImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const SYSTEM_INSTRUCTION_JA = `あなたは熟練の B2B 営業アドバイザーです。ユーザーは商談中の営業担当で、相手は **決裁権のある目上のクライアント**（経営者・部長クラス）です。

提示された「会話ログ」と「画面共有されている資料画像」から相手の意図・懸念・論点を読み、ユーザーが次に発するべき切り返しトークを 3 パターン生成してください。

必ず以下の 3 種類を各 1 つずつ、各 25〜40 文字前後で**日本語の丁寧語（敬語ベース）** で出力してください：
1. counter（柔らかな反論）: 相手の主張の前提や見落としを **丁寧に** 指摘する。断定ではなく「〜という見方もできるかと」「〜ではいかがでしょうか」のような配慮ある否定
2. agree_propose（同調＋提案）: まず相手の懸念に共感し、その上で一歩踏み込む建設的な代替案を提示する。「おっしゃる通りで〜」「そこで〜は可能でしょうか」のトーン
3. question_back（丁寧な質問返し）: 主導権を取り戻すための鋭いが **失礼ではない** 逆質問。「念のため伺いたいのですが〜」「〜について、もう少し詳しく聞かせていただけますか？」

ルール：
- **目上への敬意を最優先**。タメ口・挑発・論破トーンは絶対禁止。「〜ですよ」「〜だと思います」ではなく、「〜でございます」「〜と存じます」「〜ではないでしょうか」系
- 具体的であれ：会話に出てきた固有名詞・数値・日付・スライド内容を必ず踏まえる。抽象的な一般論禁止
- 各 text は 25〜40 字、読み上げて2秒前後で言い切れる長さ
- JSON のみ返す。前後の説明は不要`

const SYSTEM_INSTRUCTION_EN = `You are an elite B2B sales advisor. The user is an account executive mid-meeting. The counterpart is a **senior decision-maker** (C-level / director).

From the conversation log and the shared slide, read the counterpart's intent / concerns / objections, and generate 3 reply options the user should say next.

Produce exactly these 3 in **polite, respectful business English** (no slang, no combative tone):
1. counter (respectful pushback): surface the gap or oversight in their argument, politely. Use softening phrasing like "One thing to consider is…" or "Might it be worth revisiting…"
2. agree_propose (empathize + propose): first acknowledge their concern, then offer a concrete alternative. Tone: "That's a fair point — would it be possible to…"
3. question_back (polite redirect question): a sharp but courteous counter-question to regain control. "May I ask, how are you thinking about…" / "Could you share a bit more on…"

Rules:
- Respect the senior audience. Never condescend, never be combative, no jargon-flexing.
- Be concrete: ground each reply in specific names, numbers, dates or slide content from the log.
- 18–30 words each.
- Return JSON only. No prose before/after.`

function systemInstruction(lang: Language): string {
  return lang === 'en' ? SYSTEM_INSTRUCTION_EN : SYSTEM_INSTRUCTION_JA
}

const LABELS_JA = {
  counter: '丁寧な反論',
  agree_propose: '同調＋提案',
  question_back: '質問で返す',
} as const

const LABELS_EN = {
  counter: 'Polite Pushback',
  agree_propose: 'Agree + Propose',
  question_back: 'Clarify',
} as const

const PATTERN_ORDER: Array<PushToThinkResult['patterns'][number]['id']> = [
  'counter',
  'agree_propose',
  'question_back',
]

const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['counter', 'agree_propose', 'question_back'] },
          label: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['id', 'label', 'text'],
      },
    },
  },
  required: ['patterns'],
} as const

// Claude では tool_use で JSON を強制出力させる（Gemini の responseSchema 相当）
const CLAUDE_REPLY_TOOL = {
  name: 'emit_reply_patterns',
  description:
    'Emit the 3 suggested reply patterns (counter / agree_propose / question_back) for the sales rep.',
  input_schema: {
    type: 'object' as const,
    properties: {
      patterns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              enum: ['counter', 'agree_propose', 'question_back'],
            },
            text: { type: 'string' },
          },
          required: ['id', 'text'],
        },
      },
    },
    required: ['patterns'],
  },
}

function formatTranscript(transcript: TranscriptEntry[], lang: Language = 'ja'): string {
  if (transcript.length === 0) return lang === 'en' ? '(no utterance yet)' : '(まだ発言なし)'
  const selfLabel = lang === 'en' ? 'You' : '自分'
  const otherLabel = lang === 'en' ? 'Them' : '相手'
  return transcript
    .map((t) => {
      const speaker =
        t.speaker === 'self' ? selfLabel : t.speaker === 'other' ? otherLabel : '---'
      return `[${speaker}] ${t.text}`
    })
    .join('\n')
}

function dataUrlToGeminiInline(
  dataUrl: string,
): { inlineData: { mimeType: string; data: string } } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
  if (!m) return null
  return { inlineData: { mimeType: m[1], data: m[2] } }
}

function dataUrlToClaudeImage(
  dataUrl: string,
): { type: 'image'; source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string } } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
  if (!m) return null
  // Claude は jpeg/png/gif/webp のみ許容
  const mt = m[1].toLowerCase()
  const allowed: ClaudeImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(mt as ClaudeImageMediaType)) return null
  return {
    type: 'image',
    source: { type: 'base64', media_type: mt as ClaudeImageMediaType, data: m[2] },
  }
}

function assembleUserPrompt(
  lang: Language,
  context: string,
  olderSummary: string,
  recent: TranscriptEntry[],
): string {
  const earlierBlock =
    olderSummary.length > 0
      ? lang === 'en'
        ? `[Earlier conversation summary]\n${olderSummary}\n\n`
        : `【これまでの会話の要約】\n${olderSummary}\n\n`
      : ''
  const recentBlock = formatTranscript(recent, lang)
  return lang === 'en'
    ? `[Extra context]\n${context || '(none)'}\n\n${earlierBlock}[Recent conversation (verbatim)]\n${recentBlock}\n\nUse the above plus the attached slide image to generate the 3 replies.`
    : `【追加コンテキスト】\n${context || '(なし)'}\n\n${earlierBlock}【直近の会話（逐語）】\n${recentBlock}\n\n上記と画面の資料画像を踏まえて 3 パターンを生成してください。`
}

function attachProfileToSystem(lang: Language, profile: string): string {
  const base = systemInstruction(lang)
  if (!profile) return base
  const header =
    lang === 'en'
      ? "[Persistent context about the user's own business — use this to stay grounded]"
      : '【ユーザー自身のビジネスに関する固定情報 — ここを踏まえて判断してください】'
  return `${base}\n\n${header}\n${profile}`
}

function finalizePatterns(
  lang: Language,
  rawPatterns: Array<{ id: string; text: string }>,
): PushToThinkResult['patterns'] {
  const labels = lang === 'en' ? LABELS_EN : LABELS_JA
  return PATTERN_ORDER.map((id) => ({
    id,
    label: labels[id],
    text:
      rawPatterns.find((x) => x.id === id)?.text?.trim() || '—',
  }))
}

// ---- Gemini 実装 ----------------------------------------------------------

async function summarizeOlderGemini(
  ai: GoogleGenAI,
  lang: Language,
  older: TranscriptEntry[],
): Promise<string> {
  const key = cacheKey(older)
  const cached = summaryCache.get(key)
  if (cached) return cached

  const prompt =
    lang === 'en'
      ? `Summarize this conversation in English under 400 chars. Preserve WHO said/asked/agreed to WHAT, key numbers and proper nouns. No preamble.\n\n${formatTranscript(older, lang)}`
      : `次の会話を日本語で400字以内で要約。誰が何を主張/質問/合意したか、固有名詞や数値を失わないこと。前置き不要。\n\n${formatTranscript(older, lang)}`

  try {
    const r = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingBudget: 0 } },
    })
    const text = (r.text ?? '').trim()
    if (summaryCache.size >= SUMMARY_CACHE_MAX) {
      const firstKey = summaryCache.keys().next().value
      if (firstKey) summaryCache.delete(firstKey)
    }
    summaryCache.set(key, text)
    console.log(`[pushToThink] summarized ${older.length} older entries into ${text.length} chars`)
    return text
  } catch (e) {
    console.error('[pushToThink] summarize failed:', e)
    return ''
  }
}

async function pushToThinkGemini(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  const ai = new GoogleGenAI({ apiKey: args.geminiApiKey })
  const lang: Language = args.language ?? 'ja'
  const profile = (args.companyProfile ?? '').trim()

  const selfCount = args.transcript.filter((t) => t.speaker === 'self').length
  const otherCount = args.transcript.filter((t) => t.speaker === 'other').length
  console.log(
    `[pushToThink/gemini] lang=${lang} transcript=${args.transcript.length}(self=${selfCount}, other=${otherCount}) profile=${profile.length}chars image=${args.imageDataUrl ? 'yes' : 'no'}`,
  )

  const recentStart = Math.max(0, args.transcript.length - RECENT_VERBATIM_WINDOW)
  const older = args.transcript.slice(0, recentStart)
  const recent = args.transcript.slice(recentStart)

  let olderSummary = ''
  if (older.length >= SUMMARIZE_THRESHOLD) {
    olderSummary = await summarizeOlderGemini(ai, lang, older)
  }

  const fullSystem = attachProfileToSystem(lang, profile)
  const userInstruction = assembleUserPrompt(lang, args.context, olderSummary, recent)

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: userInstruction }]

  if (args.imageDataUrl) {
    const inline = dataUrlToGeminiInline(args.imageDataUrl)
    if (inline) parts.push(inline)
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: fullSystem,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      thinkingConfig: { thinkingBudget: 2048 },
    },
  })

  const text = response.text ?? ''
  let parsed: { patterns: Array<{ id: string; text: string }> }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 200)}`)
  }

  return {
    patterns: finalizePatterns(lang, parsed.patterns),
    generatedAt: Date.now(),
    kind: 'deep',
  }
}

async function pushToThinkFastGemini(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  const ai = new GoogleGenAI({ apiKey: args.geminiApiKey })
  const lang: Language = args.language ?? 'ja'
  const profile = (args.companyProfile ?? '').trim()
  const recent = args.transcript.slice(-15)

  const fullSystem = attachProfileToSystem(lang, profile)

  const userInstruction =
    lang === 'en'
      ? `[Extra context]\n${args.context || '(none)'}\n\n[Recent conversation]\n${formatTranscript(recent, lang)}\n\nUse the above + attached slide to generate 3 quick replies.`
      : `【追加コンテキスト】\n${args.context || '(なし)'}\n\n【直近の会話】\n${formatTranscript(recent, lang)}\n\n上記と画面資料を踏まえて素早く3パターン生成してください。`

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: userInstruction }]
  if (args.imageDataUrl) {
    const inline = dataUrlToGeminiInline(args.imageDataUrl)
    if (inline) parts.push(inline)
  }

  console.log(
    `[pushToThinkFast/gemini] lang=${lang} recent=${recent.length} profile=${profile.length}chars image=${args.imageDataUrl ? 'yes' : 'no'}`,
  )

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: fullSystem,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const text = response.text ?? ''
  let parsed: { patterns: Array<{ id: string; text: string }> }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 200)}`)
  }
  return {
    patterns: finalizePatterns(lang, parsed.patterns),
    generatedAt: Date.now(),
    kind: 'fast',
  }
}

async function generateMeetingSummaryGemini(args: {
  apiKey: string
  language?: Language
  transcript: TranscriptEntry[]
  imageDataUrls: string[]
  title: string
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey })
  const lang: Language = args.language ?? 'ja'
  const transcriptText = formatTranscript(args.transcript, lang)

  const userPrompt =
    lang === 'en'
      ? `The following is the record of the meeting titled "${args.title}". Produce a Markdown meeting memo in English with this structure.

# Meeting Summary
## Decisions
## Their Concerns / Key Points
## Action Items / ToDo
## Timeline (key moments only)

[Meeting body]
${transcriptText}`
      : `以下は「${args.title}」の会議記録です。下記のMarkdown構成で日本語の議事メモを作成してください。

# 会議サマリー
## 決定事項
## 相手の懸念・論点
## 次回までの宿題 / ToDo
## タイムライン（要所のみ）

【会議本文】
${transcriptText}`

  const systemForSummary =
    lang === 'en'
      ? 'You are an excellent business secretary. From the meeting record and attached slides, produce a ready-to-use English Markdown memo.'
      : 'あなたは優秀なビジネス秘書です。会議記録と添付スライドから、実務でそのまま使える議事メモを日本語 Markdown で返してください。'

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: userPrompt }]

  for (const url of args.imageDataUrls.slice(0, 6)) {
    const inline = dataUrlToGeminiInline(url)
    if (inline) parts.push(inline)
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: systemForSummary },
  })

  return response.text ?? ''
}

// ---- Claude 実装 ----------------------------------------------------------

// Haiku 4.5 / Sonnet 4.6
const CLAUDE_MODEL_FAST = 'claude-haiku-4-5-20251001'
const CLAUDE_MODEL_DEEP = 'claude-sonnet-4-6'

async function summarizeOlderClaude(
  client: Anthropic,
  lang: Language,
  older: TranscriptEntry[],
): Promise<string> {
  const key = cacheKey(older)
  const cached = summaryCache.get(key)
  if (cached) return cached

  const prompt =
    lang === 'en'
      ? `Summarize this conversation in English under 400 chars. Preserve WHO said/asked/agreed to WHAT, key numbers and proper nouns. No preamble.\n\n${formatTranscript(older, lang)}`
      : `次の会話を日本語で400字以内で要約。誰が何を主張/質問/合意したか、固有名詞や数値を失わないこと。前置き不要。\n\n${formatTranscript(older, lang)}`

  try {
    const r = await client.messages.create({
      model: CLAUDE_MODEL_FAST,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = r.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
    if (summaryCache.size >= SUMMARY_CACHE_MAX) {
      const firstKey = summaryCache.keys().next().value
      if (firstKey) summaryCache.delete(firstKey)
    }
    summaryCache.set(key, text)
    console.log(
      `[pushToThink/claude] summarized ${older.length} older entries into ${text.length} chars`,
    )
    return text
  } catch (e) {
    console.error('[pushToThink/claude] summarize failed:', e)
    return ''
  }
}

// Claude の tool_use ブロックから patterns を取り出す
function extractPatternsFromClaude(
  msg: Anthropic.Messages.Message,
): Array<{ id: string; text: string }> {
  for (const block of msg.content) {
    if (block.type === 'tool_use' && block.name === CLAUDE_REPLY_TOOL.name) {
      const input = block.input as {
        patterns?: Array<{ id: string; text: string }>
      }
      if (Array.isArray(input.patterns)) return input.patterns
    }
  }
  throw new Error('Claude did not return tool_use for reply patterns')
}

// ストリーム中の途切れた tool_use input JSON から、完結している pattern オブジェクトだけ取り出す。
// "patterns":[ の後ろを brace 深さ追跡で走査し、閉じた {} を 1 件ずつ JSON.parse する。
function extractCompletedPatternObjects(
  json: string,
): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = []
  const arrMatch = json.match(/"patterns"\s*:\s*\[/)
  if (!arrMatch || arrMatch.index === undefined) return out
  let i = arrMatch.index + arrMatch[0].length
  while (i < json.length) {
    while (i < json.length && /[\s,]/.test(json[i])) i++
    if (i >= json.length || json[i] === ']') break
    if (json[i] !== '{') break
    const start = i
    let depth = 0
    let inStr = false
    let escape = false
    for (; i < json.length; i++) {
      const c = json[i]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { i++; break }
      }
    }
    if (depth !== 0) break // この {...} はまだ未完
    try {
      const obj = JSON.parse(json.slice(start, i))
      if (
        obj &&
        typeof obj.id === 'string' &&
        typeof obj.text === 'string'
      ) {
        out.push({ id: obj.id, text: obj.text })
      }
    } catch {
      // 不完全 → 抜ける
      break
    }
  }
  return out
}

async function runClaudePatterns(args: {
  client: Anthropic
  model: string
  lang: Language
  profile: string
  userText: string
  imageDataUrl: string | null
  thinkingBudget?: number
}): Promise<Array<{ id: string; text: string }>> {
  const system: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: attachProfileToSystem(args.lang, args.profile),
      // system は商談中ずっと変わらないので prompt cache を効かせる
      cache_control: { type: 'ephemeral' },
    },
  ]

  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
    { type: 'text', text: args.userText },
  ]
  if (args.imageDataUrl) {
    const image = dataUrlToClaudeImage(args.imageDataUrl)
    if (image) userBlocks.push(image)
  }

  const body: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: args.model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userBlocks }],
    tools: [CLAUDE_REPLY_TOOL],
    tool_choice: { type: 'tool', name: CLAUDE_REPLY_TOOL.name },
  }

  const msg = await args.client.messages.create(body)
  return extractPatternsFromClaude(msg)
}

async function pushToThinkClaude(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  if (!args.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey: args.anthropicApiKey })
  const lang: Language = args.language ?? 'ja'
  const profile = (args.companyProfile ?? '').trim()

  const selfCount = args.transcript.filter((t) => t.speaker === 'self').length
  const otherCount = args.transcript.filter((t) => t.speaker === 'other').length
  console.log(
    `[pushToThink/claude] lang=${lang} transcript=${args.transcript.length}(self=${selfCount}, other=${otherCount}) profile=${profile.length}chars image=${args.imageDataUrl ? 'yes' : 'no'} stream=${args.onPartial ? 'yes' : 'no'}`,
  )

  const recentStart = Math.max(0, args.transcript.length - RECENT_VERBATIM_WINDOW)
  const older = args.transcript.slice(0, recentStart)
  const recent = args.transcript.slice(recentStart)

  let olderSummary = ''
  if (older.length >= SUMMARIZE_THRESHOLD) {
    olderSummary = await summarizeOlderClaude(client, lang, older)
  }

  const userText = assembleUserPrompt(lang, args.context, olderSummary, recent)

  // onPartial 指定時はストリームし、完結したパターンから順次 callback で送出
  if (args.onPartial) {
    const patterns = await streamClaudePatterns({
      client,
      model: CLAUDE_MODEL_DEEP,
      lang,
      profile,
      userText,
      imageDataUrl: args.imageDataUrl,
      onPartial: args.onPartial,
    })
    return {
      patterns: finalizePatterns(lang, patterns),
      generatedAt: Date.now(),
      kind: 'deep',
    }
  }

  const patterns = await runClaudePatterns({
    client,
    model: CLAUDE_MODEL_DEEP,
    lang,
    profile,
    userText,
    imageDataUrl: args.imageDataUrl,
  })

  return {
    patterns: finalizePatterns(lang, patterns),
    generatedAt: Date.now(),
    kind: 'deep',
  }
}

async function streamClaudePatterns(args: {
  client: Anthropic
  model: string
  lang: Language
  profile: string
  userText: string
  imageDataUrl: string | null
  onPartial: (patterns: PushToThinkResult['patterns']) => void
}): Promise<Array<{ id: string; text: string }>> {
  const system: Anthropic.Messages.TextBlockParam[] = [
    {
      type: 'text',
      text: attachProfileToSystem(args.lang, args.profile),
      cache_control: { type: 'ephemeral' },
    },
  ]
  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
    { type: 'text', text: args.userText },
  ]
  if (args.imageDataUrl) {
    const image = dataUrlToClaudeImage(args.imageDataUrl)
    if (image) userBlocks.push(image)
  }

  const stream = args.client.messages.stream({
    model: args.model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userBlocks }],
    tools: [CLAUDE_REPLY_TOOL],
    tool_choice: { type: 'tool', name: CLAUDE_REPLY_TOOL.name },
  })

  // SDK の inputJson イベントは (partial_json delta, partial-parsed snapshot) を渡す。
  // snapshot 側は途中 text を含む partial parse なので、安定した境界判定のため自前で
  // delta を連結して brace walker で「完結した {...}」だけを取り出す。
  let jsonBuf = ''
  const emittedIds = new Set<string>()
  const accum: Array<{ id: string; text: string }> = []

  stream.on('inputJson', (delta) => {
    if (typeof delta !== 'string') return
    jsonBuf += delta
    const completed = extractCompletedPatternObjects(jsonBuf)
    let changed = false
    for (const p of completed) {
      if (!emittedIds.has(p.id)) {
        emittedIds.add(p.id)
        accum.push(p)
        changed = true
      }
    }
    if (changed) {
      try {
        args.onPartial(finalizePatterns(args.lang, accum))
      } catch (e) {
        console.error('[stream/claude] onPartial threw:', e)
      }
    }
  })

  const finalMsg = await stream.finalMessage()
  return extractPatternsFromClaude(finalMsg)
}

async function pushToThinkFastClaude(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  if (!args.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey: args.anthropicApiKey })
  const lang: Language = args.language ?? 'ja'
  const profile = (args.companyProfile ?? '').trim()
  const recent = args.transcript.slice(-15)

  const userText =
    lang === 'en'
      ? `[Extra context]\n${args.context || '(none)'}\n\n[Recent conversation]\n${formatTranscript(recent, lang)}\n\nUse the above + attached slide to generate 3 quick replies.`
      : `【追加コンテキスト】\n${args.context || '(なし)'}\n\n【直近の会話】\n${formatTranscript(recent, lang)}\n\n上記と画面資料を踏まえて素早く3パターン生成してください。`

  console.log(
    `[pushToThinkFast/claude] lang=${lang} recent=${recent.length} profile=${profile.length}chars image=${args.imageDataUrl ? 'yes' : 'no'}`,
  )

  const patterns = await runClaudePatterns({
    client,
    model: CLAUDE_MODEL_FAST,
    lang,
    profile,
    userText,
    imageDataUrl: args.imageDataUrl,
  })

  return {
    patterns: finalizePatterns(lang, patterns),
    generatedAt: Date.now(),
    kind: 'fast',
  }
}

async function generateMeetingSummaryClaude(args: {
  apiKey: string
  language?: Language
  transcript: TranscriptEntry[]
  imageDataUrls: string[]
  title: string
}): Promise<string> {
  const client = new Anthropic({ apiKey: args.apiKey })
  const lang: Language = args.language ?? 'ja'
  const transcriptText = formatTranscript(args.transcript, lang)

  const userText =
    lang === 'en'
      ? `The following is the record of the meeting titled "${args.title}". Produce a Markdown meeting memo in English with this structure.

# Meeting Summary
## Decisions
## Their Concerns / Key Points
## Action Items / ToDo
## Timeline (key moments only)

[Meeting body]
${transcriptText}`
      : `以下は「${args.title}」の会議記録です。下記のMarkdown構成で日本語の議事メモを作成してください。

# 会議サマリー
## 決定事項
## 相手の懸念・論点
## 次回までの宿題 / ToDo
## タイムライン（要所のみ）

【会議本文】
${transcriptText}`

  const systemText =
    lang === 'en'
      ? 'You are an excellent business secretary. From the meeting record and attached slides, produce a ready-to-use English Markdown memo.'
      : 'あなたは優秀なビジネス秘書です。会議記録と添付スライドから、実務でそのまま使える議事メモを日本語 Markdown で返してください。'

  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
    { type: 'text', text: userText },
  ]
  for (const url of args.imageDataUrls.slice(0, 6)) {
    const image = dataUrlToClaudeImage(url)
    if (image) userBlocks.push(image)
  }

  const msg = await client.messages.create({
    model: CLAUDE_MODEL_DEEP,
    max_tokens: 2048,
    system: systemText,
    messages: [{ role: 'user', content: userBlocks }],
  })

  return msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

// ---- 公開 dispatcher ------------------------------------------------------

function resolveProvider(args: PushToThinkDispatchArgs): AiProvider {
  // Claude 指定でもキー未入力なら Gemini にフォールバック（UX 優先）
  if (args.provider === 'claude' && !args.anthropicApiKey) {
    console.warn('[pushToThink] provider=claude but no anthropicApiKey — falling back to gemini')
    return 'gemini'
  }
  return args.provider
}

export async function pushToThink(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  const provider = resolveProvider(args)
  return provider === 'claude' ? pushToThinkClaude(args) : pushToThinkGemini(args)
}

export async function pushToThinkFast(args: PushToThinkDispatchArgs): Promise<PushToThinkResult> {
  const provider = resolveProvider(args)
  return provider === 'claude' ? pushToThinkFastClaude(args) : pushToThinkFastGemini(args)
}

export async function generateMeetingSummary(args: {
  provider: AiProvider
  geminiApiKey: string
  anthropicApiKey?: string
  language?: Language
  transcript: TranscriptEntry[]
  imageDataUrls: string[]
  title: string
}): Promise<string> {
  const useClaude = args.provider === 'claude' && !!args.anthropicApiKey
  if (useClaude) {
    return generateMeetingSummaryClaude({
      apiKey: args.anthropicApiKey!,
      language: args.language,
      transcript: args.transcript,
      imageDataUrls: args.imageDataUrls,
      title: args.title,
    })
  }
  return generateMeetingSummaryGemini({
    apiKey: args.geminiApiKey,
    language: args.language,
    transcript: args.transcript,
    imageDataUrls: args.imageDataUrls,
    title: args.title,
  })
}
