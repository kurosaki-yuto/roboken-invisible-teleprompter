import { app, BrowserWindow, ipcMain, globalShortcut, shell } from 'electron'
import { initMain } from 'electron-audio-loopback'
import { loadEnv } from './env'
import { loadSettings, saveSettings } from './settings'
import { captureRegion } from './capture'
import { pushToThink, pushToThinkFast, generateMeetingSummary } from './ai'
import { insertMeeting, listMeetings, getMeeting, updateMeetingFolder } from './db'
import { archiveMeeting, archiveBaseDir } from './archiver'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import {
  createDashboardWindow,
  createOverlayWindow,
  createTeleprompterWindow,
  registry,
} from './windows'
import type { CaptureBounds, TranscriptEntry } from '../types/ipc'
import { IPC } from '../types/ipc'

// システム音声ループバックを初期化（app.ready 前に呼ぶ必要あり）
initMain()

const dotenv = loadEnv()

// 優先順位: settings.json > .env > process.env
function resolveKeys() {
  const stored = loadSettings()
  const anthropicApiKey =
    stored.anthropicApiKey ||
    dotenv.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    ''
  // 明示的に claude を選んでいても、キーが無ければ gemini にフォールバック
  const storedProvider = stored.aiProvider ?? 'gemini'
  const aiProvider: 'gemini' | 'claude' =
    storedProvider === 'claude' && !anthropicApiKey ? 'gemini' : storedProvider
  return {
    geminiApiKey:
      stored.geminiApiKey ||
      dotenv.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      '',
    anthropicApiKey,
    deepgramApiKey:
      stored.deepgramApiKey ||
      dotenv.DEEPGRAM_API_KEY ||
      process.env.DEEPGRAM_API_KEY ||
      '',
    aiProvider,
    // stored が空のときだけ env 由来としてフラグ立て（UIで「.envから読込中」と表示するため）
    fromEnv:
      !stored.geminiApiKey &&
      !!(dotenv.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
    language: stored.language ?? 'ja',
    autoCoach: stored.autoCoach ?? false,
    companyProfile: stored.companyProfile ?? '',
  }
}

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function triggerThink() {
  // Dashboard に通知。Dashboard 側で直近 transcript+画像を集めて push-to-think を呼ぶ
  console.log('[main] triggerThink hotkey fired, dashboard=', !!registry.dashboard)
  registry.dashboard?.webContents.send(IPC.EV_TRIGGER_THINK)
}

// ----- IPC -----
ipcMain.handle(IPC.GET_API_KEYS, () => resolveKeys())

ipcMain.handle(
  IPC.SET_API_KEYS,
  async (
    _event,
    input: {
      geminiApiKey?: string
      anthropicApiKey?: string
      deepgramApiKey?: string
      aiProvider?: 'gemini' | 'claude'
      language?: 'ja' | 'en'
      autoCoach?: boolean
      companyProfile?: string
    },
  ) => {
    // input に明示されたフィールドだけ部分更新する（未指定は既存値を保持）
    const patch: Parameters<typeof saveSettings>[0] = {}
    if (input.geminiApiKey !== undefined) {
      patch.geminiApiKey = input.geminiApiKey.trim() || undefined
    }
    if (input.anthropicApiKey !== undefined) {
      patch.anthropicApiKey = input.anthropicApiKey.trim() || undefined
    }
    if (input.deepgramApiKey !== undefined) {
      patch.deepgramApiKey = input.deepgramApiKey.trim() || undefined
    }
    if (input.aiProvider !== undefined) patch.aiProvider = input.aiProvider
    if (input.language !== undefined) patch.language = input.language
    if (input.autoCoach !== undefined) patch.autoCoach = input.autoCoach
    if (input.companyProfile !== undefined) {
      patch.companyProfile = input.companyProfile
    }
    console.log(
      '[SET_API_KEYS] input keys:',
      Object.keys(input),
      'patch keys:',
      Object.keys(patch),
    )
    saveSettings(patch)
    const resolved = resolveKeys()
    console.log(
      '[SET_API_KEYS] after save, provider=',
      resolved.aiProvider,
      'geminiLen=',
      resolved.geminiApiKey.length,
      'anthropicLen=',
      resolved.anthropicApiKey.length,
    )
    return resolved
  },
)

ipcMain.handle(
  IPC.TEST_API_KEY,
  async (_event, geminiApiKey: string) => {
    if (!geminiApiKey?.trim()) {
      return { ok: false, error: 'API キーが空です' }
    }
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() })
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'ping',
        config: { thinkingConfig: { thinkingBudget: 0 } },
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'unknown' }
    }
  },
)

ipcMain.handle(
  IPC.TEST_ANTHROPIC_KEY,
  async (_event, anthropicApiKey: string) => {
    if (!anthropicApiKey?.trim()) {
      return { ok: false, error: 'API キーが空です' }
    }
    try {
      const client = new Anthropic({ apiKey: anthropicApiKey.trim() })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'unknown' }
    }
  },
)

ipcMain.on(IPC.START_SELECTION, () => {
  if (!registry.overlay) createOverlayWindow()
  registry.overlay?.show()
  registry.overlay?.focus()
})

ipcMain.on(IPC.FINISH_SELECTION, (_event, bounds: CaptureBounds) => {
  if (registry.overlay) {
    registry.overlay.close()
    registry.overlay = null
  }
  if (!registry.teleprompter) createTeleprompterWindow()
  // Dashboard と Teleprompter 両方に選択範囲を通知
  broadcast(IPC.EV_SELECTION_BOUNDS, bounds)
})

ipcMain.on(IPC.CANCEL_SELECTION, () => {
  if (registry.overlay) {
    registry.overlay.close()
    registry.overlay = null
  }
})

ipcMain.on(IPC.END_MEETING, () => {
  if (registry.teleprompter) {
    registry.teleprompter.close()
    registry.teleprompter = null
  }
  if (registry.overlay) {
    registry.overlay.close()
    registry.overlay = null
  }
  registry.dashboard?.show()
  registry.dashboard?.focus()
})

ipcMain.handle(
  IPC.CAPTURE_REGION,
  async (_event, bounds: CaptureBounds) => {
    return captureRegion(bounds)
  },
)

ipcMain.handle(
  IPC.PUSH_TO_THINK,
  async (
    _event,
    args: {
      transcript: TranscriptEntry[]
      imageDataUrl: string | null
      context: string
    },
  ) => {
    const keys = resolveKeys()
    if (keys.aiProvider === 'claude' && !keys.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not set')
    }
    if (keys.aiProvider === 'gemini' && !keys.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not set')
    }
    const result = await pushToThink({
      provider: keys.aiProvider,
      geminiApiKey: keys.geminiApiKey,
      anthropicApiKey: keys.anthropicApiKey,
      language: keys.language,
      companyProfile: keys.companyProfile,
      ...args,
      // Claude deep のストリーム途中結果を Teleprompter に逐次配信
      onPartial: (patterns) => {
        registry.teleprompter?.webContents.send(IPC.EV_PATTERNS, {
          patterns,
          generatedAt: Date.now(),
          kind: 'deep',
          partial: true,
        })
      },
    })
    registry.teleprompter?.webContents.send(IPC.EV_PATTERNS, result)
    return result
  },
)

ipcMain.handle(
  IPC.PUSH_TO_THINK_FAST,
  async (
    _event,
    args: {
      transcript: TranscriptEntry[]
      imageDataUrl: string | null
      context: string
    },
  ) => {
    const keys = resolveKeys()
    if (keys.aiProvider === 'claude' && !keys.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not set')
    }
    if (keys.aiProvider === 'gemini' && !keys.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not set')
    }
    const result = await pushToThinkFast({
      provider: keys.aiProvider,
      geminiApiKey: keys.geminiApiKey,
      anthropicApiKey: keys.anthropicApiKey,
      language: keys.language,
      companyProfile: keys.companyProfile,
      ...args,
    })
    registry.teleprompter?.webContents.send(IPC.EV_PATTERNS, result)
    return result
  },
)

ipcMain.handle(
  IPC.SAVE_MEETING,
  async (
    _event,
    args: {
      title: string
      startedAt: number
      endedAt: number
      transcript: TranscriptEntry[]
      images: string[]
    },
  ) => {
    const keys = resolveKeys()

    const transcriptText = args.transcript
      .map((t) => {
        const s =
          t.speaker === 'self'
            ? '自分'
            : t.speaker === 'other'
              ? '相手'
              : '---'
        return `[${s}] ${t.text}`
      })
      .join('\n')

    const hasAnyKey =
      (keys.aiProvider === 'claude' && !!keys.anthropicApiKey) ||
      (keys.aiProvider === 'gemini' && !!keys.geminiApiKey)

    let summaryMarkdown = ''
    if (hasAnyKey && args.transcript.length > 0) {
      try {
        summaryMarkdown = await generateMeetingSummary({
          provider: keys.aiProvider,
          geminiApiKey: keys.geminiApiKey,
          anthropicApiKey: keys.anthropicApiKey,
          language: keys.language,
          transcript: args.transcript,
          imageDataUrls: args.images,
          title: args.title,
        })
      } catch (e) {
        console.error('[summary] generation failed', e)
      }
    }

    // 先に DB 挿入して id を確保 → それをアーカイブファイル名にも使える
    const saved = insertMeeting({
      title: args.title,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      transcript: transcriptText,
      summaryMarkdown,
      imageDataUrls: args.images,
    })

    // ローカルファイルとして ~/Documents/Mienaq/ に同時書き出し
    let folderPath = ''
    try {
      const archived = archiveMeeting({
        id: saved.id,
        title: args.title,
        startedAt: args.startedAt,
        endedAt: args.endedAt,
        transcript: args.transcript,
        summaryMarkdown,
        imageDataUrls: args.images,
        companyProfile: keys.companyProfile,
        language: keys.language,
      })
      folderPath = archived.folderPath
      console.log('[archive] wrote', folderPath, archived.files.length, 'files')

      // DB に folder_path を後追い更新
      updateMeetingFolder(saved.id, folderPath)
      saved.folderPath = folderPath
    } catch (e) {
      console.error('[archive] failed', e)
    }

    return saved
  },
)

ipcMain.handle(IPC.LIST_MEETINGS, () => listMeetings())
ipcMain.handle(IPC.GET_MEETING, (_event, id: number) => getMeeting(id))

ipcMain.handle(IPC.OPEN_ARCHIVE_FOLDER, () => {
  const dir = archiveBaseDir()
  shell.openPath(dir)
  return dir
})

ipcMain.handle(IPC.REVEAL_IN_FOLDER, (_event, p: string) => {
  if (p && typeof p === 'string') shell.showItemInFolder(p)
})

// ----- Lifecycle -----
app.whenReady().then(() => {
  createDashboardWindow()

  // Push-to-Think: 複数の組み合わせをすべて登録（ユーザーの押しグセや他アプリ衝突対策）
  const thinkAccelerators = [
    'CommandOrControl+K', // Mac: Cmd+K / Win: Ctrl+K
    'Control+Command+K', // Mac: Cmd+Ctrl+K（両方同時押し派）
    'CommandOrControl+Shift+K', // 衝突時の予備
    'F9', // 修飾キーなし予備（他アプリに奪われにくい）
  ]
  for (const accel of thinkAccelerators) {
    const ok = globalShortcut.register(accel, triggerThink)
    console.log(`[main] globalShortcut "${accel}" registered=${ok}`)
  }

  // Overlay 表示/非表示トグル
  const okT = globalShortcut.register('CommandOrControl+Shift+T', () => {
    const t = registry.teleprompter
    if (!t) return
    if (t.isVisible()) t.hide()
    else t.show()
  })
  console.log('[main] globalShortcut Cmd+Shift+T registered=', okT)

  // パニックキー：全ウィンドウを一発で隠す。もう一度押すと Dashboard を復帰。
  // プロセス自体は生かすので録音セッションや transcript は失われない（完全終了は Cmd+Q / Alt+F4）。
  const panicToggle = () => {
    const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    const anyVisible = all.some((w) => w.isVisible())
    if (anyVisible) {
      for (const w of all) {
        if (w.isVisible()) w.hide()
      }
      console.log('[main] panicToggle: hid all windows')
    } else {
      if (registry.dashboard && !registry.dashboard.isDestroyed()) {
        registry.dashboard.show()
        registry.dashboard.focus()
      } else {
        createDashboardWindow()
      }
      console.log('[main] panicToggle: restored dashboard')
    }
  }
  for (const accel of ['CommandOrControl+Shift+H', 'F8']) {
    const ok = globalShortcut.register(accel, panicToggle)
    console.log(`[main] globalShortcut "${accel}" (panic-hide) registered=${ok}`)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!registry.dashboard) createDashboardWindow()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
