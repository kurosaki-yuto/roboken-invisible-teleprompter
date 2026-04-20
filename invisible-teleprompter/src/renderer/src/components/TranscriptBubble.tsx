import { motion } from 'framer-motion'

interface TranscriptBubbleProps {
  text: string
  index: number
  isLatest: boolean
}

export default function TranscriptBubble({
  text,
  index,
  isLatest
}: TranscriptBubbleProps): React.JSX.Element {
  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, x: -12, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="flex justify-start"
    >
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
          isLatest
            ? 'text-gray-100 bg-white/10 border border-white/10'
            : 'text-gray-300 bg-white/[0.04]'
        }`}
      >
        {text}
      </div>
    </motion.div>
  )
}
