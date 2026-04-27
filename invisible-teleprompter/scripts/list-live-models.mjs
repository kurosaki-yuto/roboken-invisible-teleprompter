// Settings画面で保存したGemini APIキーを使って、このキーで利用可能なLive(bidi)モデル一覧を取得する。
// 使い方: `node scripts/list-live-models.mjs`
import fs from 'fs'
import path from 'path'
import os from 'os'

const settingsPath = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'invisible-teleprompter',
  'settings.json',
)

let apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    apiKey = s.geminiApiKey
  } catch {
    // ignore
  }
}
if (!apiKey) {
  console.error(`APIキーが見つからない。環境変数 GEMINI_API_KEY か ${settingsPath} に必要`)
  process.exit(1)
}

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`,
)
if (!res.ok) {
  console.error('API呼び出し失敗', res.status, await res.text())
  process.exit(1)
}
const data = await res.json()
const liveModels = (data.models ?? []).filter((m) =>
  (m.supportedGenerationMethods ?? []).includes('bidiGenerateContent'),
)

if (liveModels.length === 0) {
  console.log('このキーで利用可能な Live(bidi) モデルは 0 件')
  console.log('=== 全 model 名（上位30件） ===')
  for (const m of (data.models ?? []).slice(0, 30)) {
    console.log(
      `- ${m.name}  (methods: ${(m.supportedGenerationMethods ?? []).join(',')})`,
    )
  }
} else {
  console.log('=== 利用可能 Live モデル ===')
  for (const m of liveModels) {
    console.log(`✓ ${m.name}`)
  }
}
