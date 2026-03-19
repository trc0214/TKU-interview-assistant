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

  const recruiterQuestion =
    'How do you approach product growth when you notice your key metrics are declining?'

  const [cheatQuery, setCheatQuery] = useState('')

  const [isMeetingStarted, setIsMeetingStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [interview, setInterview] = useState<Interview | null>(null)
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

  const cheatSheets = useMemo(() => {
    if (insight?.retrievedCheatsheets?.length) {
      return insight.retrievedCheatsheets.map((item) => ({
        title: item.title,
        situation: item.content,
      }))
    }

    return [
      {
        title: 'RAG System Design',
        situation: 'Use query rewrite, vector retrieval, and grounded synthesis with measurable outcomes.',
      },
      {
        title: 'MCP Integration',
        situation: 'Explain capability discovery, tool safety, and policy-governed invocation patterns.',
      },
      {
        title: 'Vector DB Trade-offs',
        situation: 'Cover index strategy, latency/recall balance, and metadata filtering for precision.',
      },
    ]
  }, [insight?.retrievedCheatsheets])

  const filteredCheatSheets = useMemo(() => {
    const query = cheatQuery.trim().toLowerCase()
    if (!query) return cheatSheets
    return cheatSheets.filter(
      (item) => item.title.toLowerCase().includes(query) || item.situation.toLowerCase().includes(query),
    )
  }, [cheatQuery, cheatSheets])

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

  const canSaveToInterview = Boolean(interviewId)

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
        recruiterQuestion,
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

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Interview Conversation</h2>
                <p className="mt-0.5 text-xs text-slate-500">Room: {roomName}</p>
              </div>
              <div className="text-xs text-slate-500">{meetingConnected ? 'Connected' : isMeetingStarted ? 'Connecting…' : 'Not started'}</div>
            </div>

            <div className="mt-3">
              {!isMeetingStarted ? (
                <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
                  <div className="relative flex h-[360px] items-center justify-center bg-slate-950">
                    <div className="rounded-md border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-200">
                      Video conference preview
                    </div>

                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-200">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 1v22" />
                          <path d="M5 8h14" />
                        </svg>
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 7l-7 5 7 5V7z" />
                          <path d="M1 5h15v14H1z" />
                        </svg>
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-900/60 bg-rose-950/30">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-rose-200" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 2 2 22" />
                          <path d="M2 2l20 20" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-950 p-3">
                    {meetingError ? <p className="text-xs text-rose-300">{meetingError}</p> : null}
                    {meetingDiagnosticHint ? (
                      <p className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                        {meetingDiagnosticHint}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-300">Start the meeting when you are ready.</p>
                      <button
                        type="button"
                        onClick={handleJoinMeeting}
                        disabled={isJoining || loading}
                        className="rounded-md bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isJoining ? 'Starting…' : 'Join'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : meetingToken && meetingServerUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>{meetingConnected ? 'LiveKit Connected' : 'LiveKit Connecting…'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        manualLeaveRef.current = true
                        void handleLeaveMeeting('completed')
                      }}
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      End
                    </button>
                  </div>

                  <LiveKitMeetingPanel
                    token={meetingToken}
                    serverUrl={meetingServerUrl}
                    connect={isMeetingStarted}
                    className="h-[360px]"
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
                <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  Unable to establish LiveKit connection.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">Recruiter</div>
              <div className="text-[11px] text-slate-500">Question</div>
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              {recruiterQuestion}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">You</div>
              <div className="text-[11px] text-slate-500">Status</div>
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800">
              {assistant.isListening ? '...You are talking...' : '...You are talking...'}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!assistant.isSupported || assistant.isListening}
                onClick={assistant.startListening}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start transcription
              </button>
              <button
                type="button"
                disabled={!assistant.isListening}
                onClick={assistant.stopListening}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Stop
              </button>
            </div>
            {assistant.error ? <p className="mt-2 text-xs text-rose-600">{assistant.error}</p> : null}
            {!assistant.isSupported ? (
              <p className="mt-2 text-xs text-amber-700">Speech recognition is not supported in this environment.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Answer Suggestion</h2>
              <div className="text-xs text-slate-500">Content helper</div>
            </div>

            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Question</div>
              <div className="mt-2 text-sm text-slate-800">{recruiterQuestion}</div>
            </div>

            <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Say this to buy you some time!
              </div>
              <div className="mt-2 text-sm text-slate-800">{insight?.bufferStatement || 'Run AI Interview Insight to generate a buffer statement.'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Answer Formulation</h2>
              <div className="text-xs text-slate-500">Talking Points</div>
            </div>

            {insightLoading ? <div className="mt-3 text-sm text-slate-600">Generating AI talking points…</div> : null}
            {insightError ? <div className="mt-3 text-sm text-rose-600">{insightError}</div> : null}

            <ol className="mt-3 space-y-3 text-sm text-slate-800">
              {(insight?.structuredTalkingPoints?.length ? insight.structuredTalkingPoints : [
                'Step 1 — Clarify the problem and success metric.',
                'Step 2 — Explain technical approach with trade-offs.',
                'Step 3 — Close with outcome and validation plan.',
              ]).map((point, index) => (
                <li key={`${index}-${point}`} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900">{index + 1}. {point}</div>
                </li>
              ))}
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerateInsights}
                disabled={insightLoading || !assistant.transcriptText.trim()}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {insightLoading ? 'Generating…' : 'Run AI Interview Insight'}
              </button>
              <button
                type="button"
                onClick={handleApplyInsightToInterview}
                disabled={!insight || saving || !canSaveToInterview}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Apply to Interview Record
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">CheatSheets</h2>
              <div className="flex items-center gap-2 text-slate-500">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                  <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1.5-2-3.5-2.4 1a8.4 8.4 0 0 0-5.2-2l-.5-2.6H9.6L9.1 3a8.4 8.4 0 0 0-5.2 2l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 .1 6l-2 1.5 2 3.5 2.4-1a8.4 8.4 0 0 0 5.2 2l.5 2.6h4.8l.5-2.6a8.4 8.4 0 0 0 5.2-2l2.4 1 2-3.5-2-1.5Z" />
                </svg>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Quick reference during the interview.</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-900" htmlFor="cheat-search">
                Search
              </label>
              <div className="text-xs text-slate-500">{filteredCheatSheets.length} items</div>
            </div>

            <input
              id="cheat-search"
              value={cheatQuery}
              onChange={(event) => setCheatQuery(event.target.value)}
              placeholder="Search CheatSheets"
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />

            <div className="mt-3 max-h-[520px] overflow-auto rounded-md border border-slate-200">
              {filteredCheatSheets.length ? (
                <ul className="divide-y divide-slate-200">
                  {filteredCheatSheets.map((item) => (
                    <li key={item.title} className="p-3">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Situation</div>
                      <div className="mt-1 text-sm text-slate-700">{item.situation}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 text-sm text-slate-600">No matches.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}