import { BrowserWindow, screen, app } from 'electron'
import path from 'path'

const DEV_URL = 'http://localhost:5174'

export interface WindowRegistry {
  dashboard: BrowserWindow | null
  overlay: BrowserWindow | null
  teleprompter: BrowserWindow | null
}

export const registry: WindowRegistry = {
  dashboard: null,
  overlay: null,
  teleprompter: null,
}

function devMode(): boolean {
  return !app.isPackaged
}

function preloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js')
}

function loadRoute(win: BrowserWindow, hash = '') {
  const dev = devMode()
  if (dev) {
    win.loadURL(`${DEV_URL}/${hash ? '#' + hash : ''}`)
  } else {
    // dist/main/main/windows.js → ../../renderer/index.html
    win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'), {
      hash: hash || undefined,
    })
  }
}

export function createDashboardWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    // hiddenInset は macOS 専用。Win では default を使う（タイトルバー表示）。
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0b0b10',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  loadRoute(win, '/')
  if (devMode()) win.webContents.openDevTools({ mode: 'detach' })
  registry.dashboard = win
  win.on('closed', () => {
    registry.dashboard = null
  })
  return win
}

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { x, y } = display.bounds
  const { width, height } = display.size

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    focusable: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRoute(win, '/overlay')
  registry.overlay = win
  win.on('closed', () => {
    registry.overlay = null
  })
  return win
}

export function createTeleprompterWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width } = display.size
  const winWidth = 900
  const winHeight = 200
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 420,
    minHeight: 120,
    x: Math.floor((width - winWidth) / 2),
    y: 40,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  // 画面共有で映らないように
  win.setContentProtection(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRoute(win, '/teleprompter')
  registry.teleprompter = win
  win.on('closed', () => {
    registry.teleprompter = null
  })
  return win
}
