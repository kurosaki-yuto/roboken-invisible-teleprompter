import { contextBridge, ipcRenderer } from 'electron'
import type {
  CaptureBounds,
  ElectronAPI,
  TranscriptEntry,
  PushToThinkResult,
  LicenseStateView,
} from '../types/ipc'
import { IPC } from '../types/ipc'

const api: ElectronAPI = {
  startSelection: () => ipcRenderer.send(IPC.START_SELECTION),
  finishSelection: (bounds) => ipcRenderer.send(IPC.FINISH_SELECTION, bounds),
  cancelSelection: () => ipcRenderer.send(IPC.CANCEL_SELECTION),
  endMeeting: () => ipcRenderer.send(IPC.END_MEETING),

  getApiKeys: () => ipcRenderer.invoke(IPC.GET_API_KEYS),
  setApiKeys: (settings) => ipcRenderer.invoke(IPC.SET_API_KEYS, settings),
  testApiKey: (key) => ipcRenderer.invoke(IPC.TEST_API_KEY, key),
  testAnthropicKey: (key) => ipcRenderer.invoke(IPC.TEST_ANTHROPIC_KEY, key),

  captureRegion: (bounds) => ipcRenderer.invoke(IPC.CAPTURE_REGION, bounds),

  pushToThink: (args) => ipcRenderer.invoke(IPC.PUSH_TO_THINK, args),
  pushToThinkFast: (args) => ipcRenderer.invoke(IPC.PUSH_TO_THINK_FAST, args),

  saveMeeting: (args) => ipcRenderer.invoke(IPC.SAVE_MEETING, args),
  listMeetings: () => ipcRenderer.invoke(IPC.LIST_MEETINGS),
  getMeeting: (id) => ipcRenderer.invoke(IPC.GET_MEETING, id),

  openArchiveFolder: () => ipcRenderer.invoke(IPC.OPEN_ARCHIVE_FOLDER),
  revealInFolder: (p) => ipcRenderer.invoke(IPC.REVEAL_IN_FOLDER, p),

  enableLoopbackAudio: () => ipcRenderer.invoke(IPC.ENABLE_LOOPBACK),
  disableLoopbackAudio: () => ipcRenderer.invoke(IPC.DISABLE_LOOPBACK),

  getLicense: () => ipcRenderer.invoke(IPC.GET_LICENSE),
  activateLicense: (key) => ipcRenderer.invoke(IPC.ACTIVATE_LICENSE, key),
  deactivateLicense: () => ipcRenderer.invoke(IPC.DEACTIVATE_LICENSE),
  refreshLicense: () => ipcRenderer.invoke(IPC.REFRESH_LICENSE),
  setInternalBypass: (enabled) => ipcRenderer.invoke(IPC.SET_INTERNAL_BYPASS, enabled),

  onSelectionBounds: (cb) => {
    const handler = (_event: unknown, bounds: CaptureBounds) => cb(bounds)
    ipcRenderer.on(IPC.EV_SELECTION_BOUNDS, handler as any)
    return () => ipcRenderer.removeListener(IPC.EV_SELECTION_BOUNDS, handler as any)
  },
  onTriggerThink: (cb) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.EV_TRIGGER_THINK, handler)
    return () => ipcRenderer.removeListener(IPC.EV_TRIGGER_THINK, handler)
  },
  onTranscript: (cb) => {
    const handler = (_event: unknown, entry: TranscriptEntry) => cb(entry)
    ipcRenderer.on(IPC.EV_TRANSCRIPT, handler as any)
    return () => ipcRenderer.removeListener(IPC.EV_TRANSCRIPT, handler as any)
  },
  onPatternsUpdated: (cb) => {
    const handler = (_event: unknown, result: PushToThinkResult) => cb(result)
    ipcRenderer.on(IPC.EV_PATTERNS, handler as any)
    return () => ipcRenderer.removeListener(IPC.EV_PATTERNS, handler as any)
  },
  onLicenseChanged: (cb) => {
    const handler = (_event: unknown, state: LicenseStateView) => cb(state)
    ipcRenderer.on(IPC.EV_LICENSE_CHANGED, handler as any)
    return () => ipcRenderer.removeListener(IPC.EV_LICENSE_CHANGED, handler as any)
  },
}

contextBridge.exposeInMainWorld('api', api)
