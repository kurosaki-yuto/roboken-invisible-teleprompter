/// <reference types="vite/client" />

import type { ElectronAPI } from '../../types/ipc'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
