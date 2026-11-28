import { useEffect, useState } from 'react'
import {
  getPreferredPaperSize,
  PAPER_SIZE_STORAGE_KEY,
  setPreferredPaperSize,
  type PaperSize,
} from '@/shared/lib/pdfShare'

/** Global A4/A5 choice used by every print and PDF export. */
export default function PaperSizeSelect() {
  const [size, setSize] = useState<PaperSize>(getPreferredPaperSize)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === PAPER_SIZE_STORAGE_KEY) setSize(getPreferredPaperSize())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const choose = (next: PaperSize) => {
    setPreferredPaperSize(next)
    setSize(next)
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-white/20 bg-white/10 p-0.5"
      role="group"
      aria-label="حجم ورق الطباعة"
      title="حجم ورق الطباعة"
    >
      {(['a5', 'a4'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={size === option}
          className={`rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none transition-colors ${
            size === option
              ? 'bg-white text-[#1a4971] shadow-sm'
              : 'text-white/80 hover:bg-white/15 hover:text-white'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
