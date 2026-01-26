export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">AI Interview Assistant</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-slate-900">HR 招募人員</div>
          <div className="text-xs text-slate-500">Demo Account</div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          HR
        </div>
      </div>
    </header>
  )
}
