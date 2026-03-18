import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { inferInterviewInsights } from '../../api/aiAnalyses'
import {
  createInterviewMeetingToken,
  endInterviewAssistantSession,
  getInterview,
  getLatestInterviewAssistantSession,
  startInterviewAssistantSession,
  syncInterviewAssistantSession,
  updateInterview,
} from '../../api/interviews'
import type { Interview, InterviewAssistantSession, InterviewInsight } from '../../api/types'
import { type InterviewAssistantSnapshot, useInterviewAssistant } from '../../features/interviewAssistant'
import { loadDraft, type InterviewAssistantDraft } from '../../features/interviewAssistant/storage'
import { LiveKitMeetingPanel } from '../../features/meeting/LiveKitMeetingPanel'

function buildRoomName(interviewId?: number): string {
  return interviewId ? `interview-room-${interviewId}` : 'interview-room-general'
}

function toSnapshotFromServer(session: InterviewAssistantSession): InterviewAssistantSnapshot {
  return {
    startedAt: Date.parse(session.startedAt),
    transcriptEntries: session.transcriptEntries.map((entry) => ({
      id: entry.id,
      text: entry.text,
      createdAt: Date.parse(entry.createdAt),
      terms: entry.terms,
      source: entry.source,
    })),
    partialText: session.partialText,
    notes: session.notesSnapshot,
    updatedAt: Date.parse(session.lastSeenAt),
  }
}

function isLiveKitDnsTurnFailure(message: string): boolean {
  const normalizedMessage = message.toLowerCase()

  return (
    normalizedMessage.includes('failed to resolve address') ||
    normalizedMessage.includes('host.livekit.cloud') ||
    normalizedMessage.includes('errorcode: -105') ||
    normalizedMessage.includes('onsizereceived failed with error: -2') ||
    normalizedMessage.includes('could not establish pc connection') ||
    (normalizedMessage.includes('ice') && normalizedMessage.includes('failed'))
  )
}

function getMeetingDiagnosticHint(message: string | null): string | null {
  if (!message) return null
  if (!isLiveKitDnsTurnFailure(message)) return null

  return '偵測到 LiveKit TURN / DNS 連線異常。請檢查 VPN、防火牆與 DNS 設定，並確認網路允許 *.livekit.cloud 與 *.host.livekit.cloud 的連線。'
}

export function MeetingPage(): ReactElement {
  const [searchParams] = useSearchParams()
  const interviewIdParam = Number(searchParams.get('interviewId'))
  const interviewId = Number.isFinite(interviewIdParam) ? interviewIdParam : undefined
  const roomName = searchParams.get('room') || buildRoomName(interviewId)

  const [isMeetingStarted, setIsMeetingStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [interview, setInterview] = useState<Interview | null>(null)
  const [timerTick, setTimerTick] = useState(0)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const [insight, setInsight] = useState<InterviewInsight | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [meetingError, setMeetingError] = useState<string | null>(null)
  const [meetingConnected, setMeetingConnected] = useState(false)
  const [meetingToken, setMeetingToken] = useState<string | null>(null)
  const [meetingServerUrl, setMeetingServerUrl] = useState<string | null>(null)
  const [assistantSession, setAssistantSession] = useState<InterviewAssistantSession | null>(null)
  const [recoverableServerSession, setRecoverableServerSession] = useState<InterviewAssistantSession | null>(null)
  const [recoverableLocalDraft, setRecoverableLocalDraft] = useState<InterviewAssistantDraft | null>(null)
  const [dismissedRecovery, setDismissedRecovery] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const syncedEntryIdsRef = useRef<Set<string>>(new Set())
  const syncingRef = useRef(false)
  const manualLeaveRef = useRef(false)
  const endingSessionRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function loadInterview(): Promise<void> {
      if (!interviewId) {
        setInterview(null)
        return
      }

      try {
        setLoading(true)
        setLoadError(null)
        const response = await getInterview(interviewId)
        if (cancelled) return
        setInterview(response)
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : '載入面試資訊失敗'
        setLoadError(message)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInterview()

    return () => {
      cancelled = true
    }
  }, [interviewId])

  const assistant = useInterviewAssistant({
    interviewId,
    interviewer: interview?.interviewer,
    candidateName: interview?.candidateName || '',
  })

  const internalMeetingLink = interviewId
    ? `/meeting?interviewId=${interviewId}`
    : `/meeting?room=${roomName}`

  useEffect(() => {
    if (!interviewId) {
      setRecoverableLocalDraft(loadDraft(undefined))
      return
    }

    const currentInterviewId = interviewId

    let cancelled = false

    async function loadRecoverableSession(): Promise<void> {
      try {
        const [session, localDraft] = await Promise.all([
          getLatestInterviewAssistantSession(currentInterviewId),
          Promise.resolve(loadDraft(currentInterviewId)),
        ])
        if (cancelled) return

        setRecoverableLocalDraft(localDraft)
        if (session && (session.transcriptEntries.length || session.notesSnapshot.trim() || session.partialText.trim())) {
          setRecoverableServerSession(session)
          setAssistantSession(session)
          syncedEntryIdsRef.current = new Set(session.transcriptEntries.map((entry) => entry.id))
        } else {
          setRecoverableServerSession(null)
        }
      } catch (error: unknown) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : '載入可復原會議失敗'
        setSyncError(message)
      }
    }

    void loadRecoverableSession()

    return () => {
      cancelled = true
    }
  }, [interviewId])

  useEffect(() => {
    if (!assistant.startedAt) return

    const timerId = window.setInterval(() => {
      setTimerTick((previous) => previous + 1)
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [assistant.startedAt])

  const canSaveToInterview = Boolean(interviewId)

  const sessionDurationLabel = useMemo(() => {
    if (!assistant.startedAt) return '00:00:00'

    const elapsedMs = Date.now() - assistant.startedAt
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
    const seconds = String(totalSeconds % 60).padStart(2, '0')

    return `${hours}:${minutes}:${seconds}`
  }, [assistant.startedAt, timerTick])

  const meetingDiagnosticHint = useMemo(() => getMeetingDiagnosticHint(meetingError), [meetingError])

  const showRecoveryPrompt = !dismissedRecovery && !assistant.hasSessionContent && Boolean(recoverableServerSession || recoverableLocalDraft)

  async function pushAssistantSync(options?: {
    eventType?: string
    eventPayload?: Record<string, unknown>
    meetingConnectedOverride?: boolean
  }): Promise<void> {
    if (!interviewId || !assistantSession || syncingRef.current) return

    const pendingEntries = assistant.transcriptEntries.filter((entry) => !syncedEntryIdsRef.current.has(entry.id))
    if (!pendingEntries.length && !options?.eventType && !assistant.notes.trim() && !assistant.partialText.trim()) {
      return
    }

    try {
      syncingRef.current = true
      const nextSession = await syncInterviewAssistantSession(interviewId, {
        sessionId: assistantSession.id,
        notes: assistant.notes,
        partialText: assistant.partialText,
        meetingConnected: options?.meetingConnectedOverride ?? meetingConnected,
        transcriptEntries: pendingEntries.map((entry) => ({
          id: entry.id,
          text: entry.text,
          createdAt: new Date(entry.createdAt).toISOString(),
          terms: entry.terms,
          source: 'speech',
          sessionId: assistantSession.id,
        })),
        eventType: options?.eventType,
        eventPayload: options?.eventPayload,
      })

      pendingEntries.forEach((entry) => syncedEntryIdsRef.current.add(entry.id))
      setAssistantSession(nextSession)
      setRecoverableServerSession(nextSession)
      setSyncError(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '同步面試草稿失敗'
      setSyncError(message)
    } finally {
      syncingRef.current = false
    }
  }

  useEffect(() => {
    if (!interviewId || !assistantSession?.id) return

    const intervalId = window.setInterval(() => {
      void pushAssistantSync()
    }, 8000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [assistant.partialText, assistant.notes, assistant.transcriptEntries, assistantSession?.id, interviewId, meetingConnected])

  async function handleJoinMeeting(): Promise<void> {
    try {
      setIsJoining(true)
      setMeetingError(null)
      setMeetingConnected(false)

      const session = await createInterviewMeetingToken({
        interviewId,
        roomName,
        participantName: interview?.interviewer || undefined,
      })

      setMeetingToken(session.token)
      setMeetingServerUrl(session.wsUrl)

      if (interviewId) {
        const startedSession = await startInterviewAssistantSession(interviewId, {
          roomName,
          participantIdentity: session.participantIdentity,
          participantDisplayName: session.participantDisplayName,
        })
        setAssistantSession(startedSession)
        setRecoverableServerSession(startedSession)
        syncedEntryIdsRef.current = new Set(startedSession.transcriptEntries.map((entry) => entry.id))
      }

      setIsMeetingStarted(true)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '建立 LiveKit 會議失敗'
      setMeetingError(message)
      setIsMeetingStarted(false)
      setMeetingToken(null)
      setMeetingServerUrl(null)
    } finally {
      setIsJoining(false)
    }
  }

  async function handleLeaveMeeting(reason: 'completed' | 'disconnected' | 'canceled'): Promise<void> {
    try {
      if (interviewId && assistantSession && !endingSessionRef.current) {
        endingSessionRef.current = true
        const ended = await endInterviewAssistantSession(interviewId, {
          sessionId: assistantSession.id,
          reason,
          notes: assistant.notes,
          partialText: assistant.partialText,
        })
        setAssistantSession(ended)
        setRecoverableServerSession(ended)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '結束面試 session 失敗'
      setSyncError(message)
    } finally {
      endingSessionRef.current = false
      setMeetingConnected(false)
      setIsMeetingStarted(false)
      setMeetingToken(null)
      setMeetingServerUrl(null)
    }
  }

  async function handleSaveInterviewNotes(): Promise<void> {
    if (!interviewId || !interview) return

    try {
      setSaving(true)
      setSaveMessage(null)

      const nextNotes = assistant.notes.trim() || assistant.transcriptText
      const updated = await updateInterview(interviewId, {
        notes: nextNotes,
        meetingLink: interview.meetingLink || internalMeetingLink,
        location: interview.location || 'online',
      })

      setInterview(updated)
      setSaveMessage('已同步到面試紀錄')
      assistant.persistDraft()
      await pushAssistantSync({ eventType: 'manual_save', eventPayload: { source: 'notes' } })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '儲存面試紀錄失敗'
      setSaveMessage(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateInsights(): Promise<void> {
    try {
      setInsightLoading(true)
      setInsightError(null)

      const response = await inferInterviewInsights({
        interviewId,
        jobId: interview?.jobId,
        resumeId: interview?.resumeId,
        candidateName: interview?.candidateName || '',
        interviewer: interview?.interviewer || '',
        interviewRound: interview?.interviewRound || '',
        transcriptText: assistant.transcriptText,
        notesText: assistant.notes,
        keyTerms: assistant.keyTerms,
        focusPriority: 'matching_score',
        context: {
          roomName,
          isOnline: assistant.isOnline,
          meetingConnected,
          transcriptCount: assistant.transcriptEntries.length,
          sessionId: assistantSession?.id,
        },
      })

      setInsight(response)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI 推論失敗'
      setInsightError(message)
    } finally {
      setInsightLoading(false)
    }
  }

  async function handleApplyInsightToInterview(): Promise<void> {
    if (!insight || !interview || !interviewId) return

    const recommendationMap: Record<InterviewInsight['recommendation'], string> = {
      pass: 'pass',
      hold: 'hold',
      reject: 'reject',
    }

    const aiDecisionSection = [
      '## AI Decision Support',
      `- Matching Score: ${insight.matchingScore}`,
      `- Communication Score: ${insight.communicationScore}`,
      `- Technical Depth Score: ${insight.technicalDepthScore}`,
      `- Confidence: ${insight.confidence}`,
      `- Recommendation: ${insight.recommendation}`,
      '',
      '### Summary',
      insight.summary || 'N/A',
      '',
      '### Risk Flags',
      ...(insight.riskFlags.length ? insight.riskFlags.map((item) => `- ${item}`) : ['- None']),
      '',
      '### Follow-up Questions',
      ...(insight.followUpQuestions.length ? insight.followUpQuestions.map((item) => `- ${item}`) : ['- None']),
      '',
    ].join('\n')

    const mergedNotes = [assistant.notes.trim(), aiDecisionSection].filter(Boolean).join('\n\n')
    assistant.setNotes(mergedNotes)

    try {
      setSaving(true)
      setSaveMessage(null)

      const updated = await updateInterview(interviewId, {
        notes: mergedNotes,
        rating: insight.matchingScore,
        decision: recommendationMap[insight.recommendation],
        meetingLink: interview.meetingLink || internalMeetingLink,
        location: interview.location || 'online',
        status: 'awaiting_review',
      })

      setInterview(updated)
      setSaveMessage('已套用 AI 建議並同步到面試紀錄')
      assistant.persistDraft()
      await pushAssistantSync({ eventType: 'ai_insight_applied', eventPayload: { recommendation: insight.recommendation } })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '套用 AI 建議失敗'
      setSaveMessage(message)
    } finally {
      setSaving(false)
    }
  }

  function handleRestoreServerDraft(): void {
    if (!recoverableServerSession) return
    assistant.restoreSnapshot(toSnapshotFromServer(recoverableServerSession))
    setDismissedRecovery(true)
    void pushAssistantSync({ eventType: 'server_draft_restored' })
  }

  function handleRestoreLocalDraft(): void {
    const restored = assistant.restoreDraft()
    if (!restored) return
    setDismissedRecovery(true)
    void pushAssistantSync({ eventType: 'local_draft_restored' })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">線上面試助理</h1>
            <p className="mt-1 text-sm text-slate-600">
              {interview
                ? `${interview.candidateName ?? `resume-${interview.resumeId}`} / ${interview.jobTitle ?? `job-${interview.jobId}`}`
                : '未綁定特定面試，可作為臨時會議紀錄使用。'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Room: {roomName}</p>
            {loading ? <p className="mt-2 text-xs text-slate-500">載入面試資料中…</p> : null}
            {loadError ? <p className="mt-2 text-xs text-rose-600">{loadError}</p> : null}
            {syncError ? <p className="mt-2 text-xs text-amber-700">{syncError}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/interviews"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              返回面試管理
            </Link>

            {canSaveToInterview ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveInterviewNotes}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '同步中…' : '同步到面試紀錄'}
              </button>
            ) : null}
          </div>
        </div>

        {saveMessage ? <p className="mt-2 text-xs text-slate-600">{saveMessage}</p> : null}
      </div>

      {showRecoveryPrompt ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium">偵測到未完成的面試草稿</div>
          <p className="mt-1 text-xs text-amber-800">可從後端 session 或本機草稿恢復，避免中斷後資料只留在瀏覽器。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recoverableServerSession ? (
              <button
                type="button"
                onClick={handleRestoreServerDraft}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                從伺服器草稿恢復
              </button>
            ) : null}
            {recoverableLocalDraft ? (
              <button
                type="button"
                onClick={handleRestoreLocalDraft}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                從本機草稿恢復
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDismissedRecovery(true)}
              className="rounded-md border border-transparent px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              稍後處理
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          {!isMeetingStarted ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">準備進入線上會議</p>
              {meetingError ? <p className="text-xs text-rose-600">{meetingError}</p> : null}
              {meetingDiagnosticHint ? (
                <p className="max-w-[560px] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {meetingDiagnosticHint}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleJoinMeeting}
                disabled={isJoining || loading}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isJoining ? '正在建立房間…' : '進入會議'}
              </button>

              <p className="text-xs text-slate-500">會議已改為 LiveKit 自架流程，並會持續把逐字稿與會議事件寫回後端。</p>
            </div>
          ) : meetingToken && meetingServerUrl ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>{meetingConnected ? 'LiveKit 已連線' : 'LiveKit 連線中…'}</span>
                <button
                  type="button"
                  onClick={() => {
                    manualLeaveRef.current = true
                    void handleLeaveMeeting('completed')
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  結束並離開會議
                </button>
              </div>
              {meetingDiagnosticHint ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {meetingDiagnosticHint}
                </p>
              ) : null}

              <LiveKitMeetingPanel
                token={meetingToken}
                serverUrl={meetingServerUrl}
                connect={isMeetingStarted}
                onConnected={() => {
                  setMeetingConnected(true)
                  setMeetingError(null)
                  void pushAssistantSync({
                    eventType: 'meeting_connected',
                    eventPayload: { roomName },
                    meetingConnectedOverride: true,
                  })
                }}
                onDisconnected={() => {
                  if (manualLeaveRef.current) {
                    manualLeaveRef.current = false
                    return
                  }
                  void handleLeaveMeeting('disconnected')
                }}
                onError={(error) => {
                  setMeetingConnected(false)
                  setMeetingError(error.message)
                  void pushAssistantSync({
                    eventType: 'meeting_error',
                    eventPayload: { message: error.message },
                    meetingConnectedOverride: false,
                  })
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-[480px] items-center justify-center rounded-md border border-dashed border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              無法建立 LiveKit 連線，請重新進入會議。
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Interview Assistant</h2>
              <span className="text-xs text-slate-500">{assistant.isOnline ? 'Online' : 'Offline'}</span>
            </div>

            <p className="mt-2 text-xs text-slate-500">Session Duration: {sessionDurationLabel}</p>
            {assistantSession ? (
              <p className="mt-1 text-xs text-slate-500">Session #{assistantSession.id} / Events {assistantSession.eventCount}</p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              語音辨識方案：{assistant.recognitionProvider}
              {assistant.recognitionUsedFallback ? '（fallback）' : ''}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!assistant.isSupported || assistant.isListening}
                onClick={assistant.startListening}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                開始轉錄
              </button>
              <button
                type="button"
                disabled={!assistant.isListening}
                onClick={assistant.stopListening}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                停止轉錄
              </button>
              <button
                type="button"
                onClick={() => assistant.regenerateNotes()}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                產生筆記
              </button>
              <button
                type="button"
                onClick={handleRestoreLocalDraft}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                復原本機草稿
              </button>
              <button
                type="button"
                onClick={() => assistant.resetSession(true)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                清空
              </button>
            </div>

            {assistant.error ? <p className="mt-2 text-xs text-rose-600">{assistant.error}</p> : null}
            {!assistant.isSupported ? (
              <p className="mt-2 text-xs text-amber-700">目前環境不支援即時語音辨識，仍可手動編輯筆記。</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">關鍵詞</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {assistant.keyTerms.length ? (
                assistant.keyTerms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                  >
                    {term}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">尚無偵測結果</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">即時逐字稿</h3>
            {assistant.partialText ? (
              <p className="mt-2 rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs text-sky-700">
                {assistant.partialText}
              </p>
            ) : null}

            <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
              {assistant.transcriptEntries.length ? (
                assistant.transcriptEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                  >
                    <div className="mb-1 text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleTimeString()}</div>
                    <div>{entry.text}</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">等待語音輸入…</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">面試筆記</h3>
            <textarea
              value={assistant.notes}
              onChange={(event) => assistant.setNotes(event.target.value)}
              rows={14}
              className="mt-3 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="在此整理重點、評估、後續問題與決策建議"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">AI 決策支援</h3>
              <button
                type="button"
                disabled={insightLoading}
                onClick={handleGenerateInsights}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {insightLoading ? '推論中…' : '執行 AI 推論'}
              </button>
            </div>

            {insightError ? <p className="mt-2 text-xs text-rose-600">{insightError}</p> : null}

            {insight ? (
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <div>Matching: {insight.matchingScore}</div>
                  <div>Communication: {insight.communicationScore}</div>
                  <div>Technical: {insight.technicalDepthScore}</div>
                  <div>Confidence: {insight.confidence}</div>
                  <div>Recommendation: {insight.recommendation}</div>
                  {insight.usedFallback ? <div className="text-amber-700">Fallback 模式（模型服務未可用）</div> : null}
                </div>

                <p>{insight.summary || '尚無摘要'}</p>

                <button
                  type="button"
                  disabled={!canSaveToInterview || saving}
                  onClick={handleApplyInsightToInterview}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  套用建議到評分/決策/筆記
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">推論後可直接回填面試評分與決策建議。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}