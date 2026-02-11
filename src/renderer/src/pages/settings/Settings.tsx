import { useState } from 'react'

export function SettingsPage() {
  const [aiEnabled, setAiEnabled] = useState(true)
  const [weight, setWeight] = useState(60)
  const [mode, setMode] = useState<'general' | 'technical'>('general')

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-slate-900">系統設定</div>
        <div className="mt-1 text-sm text-slate-600">展示系統可調整性（僅 UI）</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="space-y-6">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            <span>
              <span className="font-medium text-slate-900">是否啟用 AI 分析</span>
              <div className="mt-1 text-xs text-slate-500">關閉後仍可瀏覽頁面（前端展示）</div>
            </span>
          </label>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-900">AI 分析權重調整</div>
              <div className="text-sm font-semibold text-slate-900 tabular-nums">{weight}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="mt-3 w-full"
            />
            <div className="mt-1 text-xs text-slate-500">僅 UI，不影響實際計算</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900">面試問題生成模式</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="general">一般</option>
              <option value="technical">技術導向</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
