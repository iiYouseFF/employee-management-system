export default function Toast({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div
      className="fixed bottom-6 inset-inline-0 flex justify-center z-50 px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-float border border-white/10 animate-fade-in-up max-w-md text-center text-sm font-semibold flex items-center gap-2.5">
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>{message}</span>
      </div>
    </div>
  )
}
