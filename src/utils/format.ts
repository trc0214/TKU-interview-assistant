export function formatDate(isoDate: string) {
  return isoDate
}

export function formatResumeStatus(status: 'received' | 'analyzed' | 'interviewed') {
  switch (status) {
    case 'received':
      return '已收到'
    case 'analyzed':
      return '已分析'
    case 'interviewed':
      return '已面試'
    default:
      return '—'
  }
}

export function formatJobStatus(status: 'open' | 'closed') {
  switch (status) {
    case 'open':
      return '招募中'
    case 'closed':
      return '已關閉'
    default:
      return '—'
  }
}
