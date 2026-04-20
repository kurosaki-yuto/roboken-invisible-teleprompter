import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Dashboard → Overlay ウィンドウを開く
  startSelection: () => {
    ipcRenderer.send('start-selection')
  },

  // Overlay → 選択した矩形座標をメインに送信
  finishSelection: (bounds: { x: number; y: number; width: number; height: number }) => {
    ipcRenderer.send('finish-selection', bounds)
  },

  // Overlay → 画面選択をスキップしてそのままTeleprompterを起動
  skipSelection: () => {
    ipcRenderer.send('skip-selection')
  },

  // Dashboard → 指定領域のスクリーンショットを取得
  captureScreen: (): Promise<string | null> => {
    return ipcRenderer.invoke('capture-screen')
  },

  // Dashboard → Teleprompter にカンペ内容を送信
  sendToTeleprompter: (answers: string[]) => {
    ipcRenderer.send('send-to-teleprompter', answers)
  },

  // Teleprompter → カンペ内容を受信するリスナー登録
  onShowAnswers: (callback: (answers: string[]) => void) => {
    ipcRenderer.on('show-answers', (_event, answers) => callback(answers))
    // クリーンアップ関数を返す
    return () => {
      ipcRenderer.removeAllListeners('show-answers')
    }
  },

  // Main → Dashboard の Cmd+K トリガーを受信
  onTriggerThink: (callback: () => void) => {
    ipcRenderer.on('trigger-think', callback)
    return () => {
      ipcRenderer.removeAllListeners('trigger-think')
    }
  },

  // 会議終了（文字起こし + 画像 + 録音秒数を送信）
  endMeeting: (transcript: string, images: string[], durationSeconds: number) => {
    ipcRenderer.send('end-meeting', { transcript, images, durationSeconds })
  },

  // 会議保存完了通知を受信
  onMeetingSaved: (callback: () => void) => {
    ipcRenderer.on('meeting-saved', callback)
    return () => {
      ipcRenderer.removeAllListeners('meeting-saved')
    }
  },

  // 議事録一覧を取得
  getMeetings: () => ipcRenderer.invoke('get-meetings'),

  // 議事録詳細を取得
  getMeeting: (id: number) => ipcRenderer.invoke('get-meeting', id),

  // 設定値の取得・保存
  getSetting: (key: string): Promise<string> => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('set-setting', { key, value }),

  // Zoom 検知通知を受信
  onZoomDetected: (callback: () => void) => {
    ipcRenderer.on('zoom-detected', callback)
    return () => {
      ipcRenderer.removeAllListeners('zoom-detected')
    }
  },

  // Dashboard → ライブ文字起こしを Teleprompter へ転送
  sendLiveTranscript: (lines: string[]) => {
    ipcRenderer.send('update-live-transcript', lines)
  },

  // Teleprompter → ライブ文字起こしを受信
  onLiveTranscript: (callback: (lines: string[]) => void) => {
    ipcRenderer.on('live-transcript-updated', (_event, lines) => callback(lines))
    return () => {
      ipcRenderer.removeAllListeners('live-transcript-updated')
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
