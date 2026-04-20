import { app, shell, BrowserWindow, ipcMain, screen, globalShortcut, session } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  saveMeeting,
  getAllMeetings,
  getMeeting,
  getSetting,
  setSetting,
  runMigrations
} from './meetingService'

let dashboardWindow: BrowserWindow | null = null
let teleprompterWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

// Zoom 検知ステート
let zoomNotified = false // 今回の Zoom セッションで通知済みか
let meetingActive = false // 録音中か（重複通知防止）

function pollZoom(): void {
  exec('pgrep -x "zoom.us"', (err, stdout) => {
    const running = !err && stdout.trim().length > 0
    if (running && !zoomNotified && !meetingActive) {
      zoomNotified = true
      if (dashboardWindow) {
        dashboardWindow.show()
        dashboardWindow.focus()
        dashboardWindow.webContents.send('zoom-detected')
      }
    }
    if (!running) {
      zoomNotified = false
    }
  })
}

// 選択された画面領域（スクリーンショット用に保持）
let selectedBounds: { x: number; y: number; width: number; height: number } | null = null

function loadWindow(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function createDashboardWindow(): void {
  if (dashboardWindow) {
    dashboardWindow.focus()
    return
  }

  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  dashboardWindow.on('ready-to-show', () => {
    dashboardWindow!.show()
  })

  dashboardWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  dashboardWindow.on('closed', () => {
    dashboardWindow = null
  })

  loadWindow(dashboardWindow, '/')
}

function createTeleprompterWindow(): void {
  if (teleprompterWindow) return

  teleprompterWindow = new BrowserWindow({
    width: 800,
    height: 280,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  teleprompterWindow.on('ready-to-show', () => {
    teleprompterWindow!.show()
  })

  // Zoom 等の画面共有で Teleprompter が映り込まないようにする
  teleprompterWindow.setContentProtection(true)

  // Zoom 操作を邪魔しないようにクリックスルーを有効化
  teleprompterWindow.setIgnoreMouseEvents(true, { forward: true })

  teleprompterWindow.on('closed', () => {
    teleprompterWindow = null
  })

  loadWindow(teleprompterWindow, '/teleprompter')
}

function createOverlayWindow(): void {
  if (overlayWindow) return

  const { bounds } = screen.getPrimaryDisplay()

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    fullscreen: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow!.show()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  loadWindow(overlayWindow, '/overlay')
}

// IPC: Dashboard から「Start Meeting」押下 → Overlay を開く
ipcMain.on('start-selection', () => {
  meetingActive = true
  createOverlayWindow()
})

// IPC: Overlay でドラッグ完了 → 座標を保存 → Teleprompter を起動
ipcMain.on(
  'finish-selection',
  (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    console.log('[main] Selected bounds:', bounds)
    selectedBounds = bounds

    if (overlayWindow) overlayWindow.close()
    createTeleprompterWindow()
  }
)

// IPC: Overlay でスキップ → selectedBounds なしで Teleprompter を起動
ipcMain.on('skip-selection', () => {
  meetingActive = true
  selectedBounds = null

  if (overlayWindow) overlayWindow.close()
  createTeleprompterWindow()
})

// IPC: スクリーンショットを Base64 で返す（Zoom ウィンドウ優先、なければ全画面クロップ）
ipcMain.handle('capture-screen', async () => {
  const { desktopCapturer } = await import('electron')
  const { width, height } = screen.getPrimaryDisplay().bounds

  // Zoom ウィンドウを優先してキャプチャ
  const windowSources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: Math.round(width / 2), height: Math.round(height / 2) }
  })
  const zoomSource = windowSources.find(
    (s) => s.name.toLowerCase().includes('zoom') && s.thumbnail.getSize().width > 0
  )
  if (zoomSource) {
    return zoomSource.thumbnail.toDataURL()
  }

  // フォールバック: 画面全体（selectedBounds があればクロップ）
  const screenSources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })
  if (screenSources.length === 0) return null

  const thumbnail = screenSources[0].thumbnail
  if (selectedBounds) {
    return thumbnail.crop(selectedBounds).toDataURL()
  }
  return thumbnail.toDataURL()
})

// IPC: Dashboard → Teleprompter にカンペ内容を転送
ipcMain.on('send-to-teleprompter', (_event, answers: string[]) => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('show-answers', answers)
  }
})

// IPC: Dashboard → Teleprompter にライブ文字起こしを転送
ipcMain.on('update-live-transcript', (_event, lines: string[]) => {
  if (teleprompterWindow) {
    teleprompterWindow.webContents.send('live-transcript-updated', lines)
  }
})

// IPC: 設定値の取得・保存
ipcMain.handle('get-setting', async (_event, key: string) => {
  return getSetting(key)
})

ipcMain.handle('set-setting', async (_event, { key, value }: { key: string; value: string }) => {
  await setSetting(key, value)
})

// IPC: 会議終了 → AI 要約生成 → SQLite 保存
ipcMain.on(
  'end-meeting',
  async (_event, data: { transcript: string; images: string[]; durationSeconds: number }) => {
    console.log('[main] Meeting ended. Transcript length:', data.transcript.length)
    if (teleprompterWindow) {
      teleprompterWindow.close()
    }
    const imagesDir = join(app.getPath('userData'), 'meeting-images')
    try {
      await saveMeeting({
        transcript: data.transcript,
        imageDataUrls: data.images ?? [],
        imagesDir,
        durationSeconds: data.durationSeconds ?? 0
      })
      // Dashboard に完了を通知
      meetingActive = false
      zoomNotified = false
      if (dashboardWindow) {
        dashboardWindow.webContents.send('meeting-saved')
      }
    } catch (err) {
      console.error('[main] Failed to save meeting:', err)
    }
  }
)

// IPC: 議事録一覧を取得
ipcMain.handle('get-meetings', async () => {
  return getAllMeetings()
})

// IPC: 議事録詳細を取得
ipcMain.handle('get-meeting', async (_event, id: number) => {
  return getMeeting(id)
})

app.whenReady().then(async () => {
  await runMigrations()
  electronApp.setAppUserModelId('com.invisible-teleprompter')

  // Web Speech API のマイクアクセスを自動許可
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createDashboardWindow()

  // Zoom 検知ポーリング（5秒ごと）
  setInterval(pollZoom, 5000)

  // Cmd+K (Mac) / Ctrl+K (Win/Linux) → Dashboard に trigger-think イベントを送信
  globalShortcut.register('CommandOrControl+K', () => {
    if (dashboardWindow) {
      dashboardWindow.webContents.send('trigger-think')
    }
  })

  // Ctrl+Space / F8 → 代替 AI 相談ショートカット（Zoom キーと衝突時の退避先）
  globalShortcut.register('F8', () => {
    if (dashboardWindow) {
      dashboardWindow.webContents.send('trigger-think')
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createDashboardWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
