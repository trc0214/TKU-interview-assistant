import { useMemo, useState } from 'react'

export function TagInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const normalized = useMemo(() => value.map((t) => t.trim()).filter(Boolean), [value])

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (!tag) return
    if (normalized.some((t) => t.toLowerCase() === tag.toLowerCase())) return
    onChange([...normalized, tag])
    setDraft('')
  }

  const removeTag = (tag: string) => {
    onChange(normalized.filter((t) => t !== tag))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {normalized.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              aria-label={`Remove ${tag}`}
              title="點擊移除"
            >
              <span>{tag}</span>
              <span className="text-slate-500">×</span>
            </button>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(draft)
              }
            }}
            placeholder={placeholder ?? '輸入後按 Enter 新增'}
            className="min-w-[12ch] flex-1 border-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-1 text-xs text-slate-500">支援 Enter 新增，點擊 tag 可移除（僅 UI）</div>
    </div>
  )
}
