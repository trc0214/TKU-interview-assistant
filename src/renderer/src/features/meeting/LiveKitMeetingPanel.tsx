import { memo } from 'react'
import '@livekit/components-styles'
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react'

type LiveKitMeetingPanelProps = {
  token: string
  serverUrl: string
  connect: boolean
  className?: string
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
}

function LiveKitMeetingPanelBase({
  token,
  serverUrl,
  connect,
  className,
  onConnected,
  onDisconnected,
  onError
}: LiveKitMeetingPanelProps) {
  const containerClassName = className ?? 'h-[72vh] min-h-[520px]'

  return (
    <div
      className={`${containerClassName} overflow-hidden rounded-md border border-slate-200 bg-slate-950`}
    >
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={connect}
        audio
        video
        onConnected={onConnected}
        onDisconnected={onDisconnected}
        onError={onError}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
      >
        <RoomAudioRenderer />
        <VideoConference />
      </LiveKitRoom>
    </div>
  )
}

export const LiveKitMeetingPanel = memo(
  LiveKitMeetingPanelBase,
  (prevProps, nextProps) =>
    prevProps.token === nextProps.token &&
    prevProps.serverUrl === nextProps.serverUrl &&
    prevProps.connect === nextProps.connect
)
