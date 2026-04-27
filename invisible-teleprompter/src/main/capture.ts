import { desktopCapturer, screen, nativeImage } from 'electron'
import type { CaptureBounds } from '../types/ipc'

// 指定矩形のスクリーンショットを dataURL で返す。
// primary display のソースを選び、nativeImage.crop で切り出す。
export async function captureRegion(bounds: CaptureBounds): Promise<string> {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.size

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  })

  // 複数ディスプレイ対策：display.id が一致するソースを優先、なければ先頭
  const source =
    sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]

  if (!source) {
    throw new Error('No screen source available for capture')
  }

  const image = source.thumbnail
  if (image.isEmpty()) {
    throw new Error('Captured thumbnail is empty')
  }

  // 座標をクランプ
  const cx = Math.max(0, Math.floor(bounds.x))
  const cy = Math.max(0, Math.floor(bounds.y))
  const cw = Math.min(width - cx, Math.max(1, Math.floor(bounds.width)))
  const ch = Math.min(height - cy, Math.max(1, Math.floor(bounds.height)))

  const cropped = image.crop({ x: cx, y: cy, width: cw, height: ch })
  return cropped.toDataURL()
}

export { nativeImage }
