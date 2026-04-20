const MAX_HEIGHT = 40
const BAR_WIDTH = 4
const BAR_GAP = 3
const TOTAL_BARS = 16

interface WaveformBarsProps {
  levels: number[]
  active?: boolean
}

export default function WaveformBars({
  levels,
  active = true
}: WaveformBarsProps): React.JSX.Element {
  const totalWidth = TOTAL_BARS * (BAR_WIDTH + BAR_GAP) - BAR_GAP

  return (
    <svg
      width={totalWidth}
      height={MAX_HEIGHT * 2}
      viewBox={`0 0 ${totalWidth} ${MAX_HEIGHT * 2}`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      {Array.from({ length: TOTAL_BARS }, (_, i) => {
        const level = active ? (levels[i] ?? 0) : 0
        const barH = Math.max(3, level * MAX_HEIGHT)
        const x = i * (BAR_WIDTH + BAR_GAP)
        const yCenter = MAX_HEIGHT

        return (
          <rect
            key={i}
            x={x}
            y={yCenter - barH}
            width={BAR_WIDTH}
            height={barH * 2}
            rx={BAR_WIDTH / 2}
            fill={active && level > 0.03 ? 'url(#barGrad)' : 'rgba(255,255,255,0.12)'}
            className="waveform-bar"
          />
        )
      })}
    </svg>
  )
}
