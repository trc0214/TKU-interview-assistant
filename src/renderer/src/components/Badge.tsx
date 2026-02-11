type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

const toneClasses: Record<BadgeTone, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-800',
  info: 'bg-sky-100 text-sky-800',
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: BadgeTone }) {
  return (
    <span className={[
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      toneClasses[tone],
    ].join(' ')}>
      {label}
    </span>
  )
}
