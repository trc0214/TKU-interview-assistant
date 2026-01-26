import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="text-sm font-medium text-slate-900">頁面不存在</div>
      <div className="mt-1 text-sm text-slate-600">請使用側邊欄切換頁面。</div>
      <div className="mt-4">
        <Link to="/dashboard" className="text-sm text-slate-700 hover:text-slate-900 hover:underline">
          返回 Dashboard
        </Link>
      </div>
    </div>
  )
}
