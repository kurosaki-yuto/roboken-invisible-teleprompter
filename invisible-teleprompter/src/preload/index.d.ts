import { ElectronAPI } from '@electron-toolkit/preload'

interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
}

interface MeetingRecord {
  id: number
  title: string
  date: Date
  durationSeconds: number
  summary: string
  totalTranscript: string
}

interface MeetingDetail extends MeetingRecord {
  images: { id: number; imagePath: string; timestamp: Date }[]
}

interface Api {
  startSelection: () => void
  finishSelection: (bounds: SelectionBounds) => void
  skipSelection: () => void
  captureScreen: () => Promise<string | null>
  sendToTeleprompter: (answers: string[]) => void
  onShowAnswers: (callback: (answers: string[]) => void) => () => void
  onTriggerThink: (callback: () => void) => () => void
  endMeeting: (transcript: string, images: string[], durationSeconds: number) => void
  onMeetingSaved: (callback: () => void) => () => void
  getMeetings: () => Promise<MeetingRecord[]>
  getMeeting: (id: number) => Promise<MeetingDetail | null>
  getSetting: (key: string) => Promise<string>
  setSetting: (key: string, value: string) => Promise<void>
  onZoomDetected: (callback: () => void) => () => void
  sendLiveTranscript: (lines: string[]) => void
  onLiveTranscript: (callback: (lines: string[]) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
