export default function Toast({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div
      className="fixed bottom-6 inset-inline-0 flex justify-center z-50 px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-slate-950/95 backdrop-blur-md text-white px-5 py-3.5 rounded-2xl shadow-float border border-white/15 animate-fade-in-up max-w-md text-center text-sm font-bold flex items-center gap-2.5">
        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  )
}
