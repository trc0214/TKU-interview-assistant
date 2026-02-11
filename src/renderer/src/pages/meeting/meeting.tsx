import { JitsiMeeting } from '@jitsi/react-sdk'
import { useState } from 'react'

export function MeetingPage() {
  const [isStarted, setIsStarted] = useState(false)

  // 1. 初始進入頁面
  if (!isStarted) {
    return (
      <div style={{ textAlign: 'center' }}>
        <h1>進入會議</h1>
        <br />
        <button
          onClick={() => setIsStarted(true)}
          style={{
            padding: '12px 24px',
            fontSize: '18px',
            borderRadius: '8px',
            cursor: 'pointer',
            background: '#ffffff',
            border: 'none',
            color: 'black'
          }}
        >
          進入會議
        </button>
      </div>
    )
  }
  // 2. 會議進行頁面
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 頂部工具列 (可選，用來測試是否還有東西在畫面上) */}
      <div style={{ background: '#333', color: 'white', padding: '10px' }}>
        會議進行中... <button onClick={() => setIsStarted(false)}>離開</button>
      </div>

      {/* Jitsi 容器：必須給 flex: 1 或明確高度 */}
      <div style={{ flex: 1 }}>
        <JitsiMeeting
          domain="meet.jit.si"
          roomName="My-Unique-Electron-Room-123"
          configOverwrite={{
            startWithAudioMuted: true,
            disableModeratorIndicator: true,
            enableEmailInStats: false
          }}
          interfaceConfigOverwrite={{
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
          }}
          getIFrameRef={(iframeRef) => {
            iframeRef.style.height = '100%'
            iframeRef.style.width = '100%'
          }}
          onReadyToClose={() => {
            setIsStarted(false)
          }}
        />
      </div>
    </div>
  )
}

