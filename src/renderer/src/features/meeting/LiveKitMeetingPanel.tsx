import '@livekit/components-styles'
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react'

type LiveKitMeetingPanelProps = {
  token: string
  serverUrl: string
  connect: boolean
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
}

export function LiveKitMeetingPanel({
  token,
  serverUrl,
  connect,
  onConnected,
  onDisconnected,
  onError,
}: LiveKitMeetingPanelProps) {
  return (
    <div className="h-[72vh] min-h-[520px] overflow-hidden rounded-md border border-slate-200 bg-slate-950">
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