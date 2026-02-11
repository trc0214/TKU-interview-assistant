import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { spawn } from 'child_process'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let pyProcess: any = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 這裡決定載入什麼
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 修正後的啟動邏輯
app.whenReady().then(() => {
  // [重點] 必須在這裡面設定 session 權限
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowList = ['media', 'audioCapture', 'videoCapture', 'screen']
    if (allowList.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  // 設定 App ID
  electronApp.setAppUserModelId('com.electron')

  // 快捷鍵優化
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function startPythonBackend() {
  // 定義虛擬環境中 python 執行檔的路徑 (Windows 為例)
  // 假設你把原本的 backend 資料夾放在 electron 專案根目錄
  const backendDir = path.join(app.getAppPath(), 'backend');
  const venvPath = path.join(backendDir, '.venv', 'Scripts', 'python.exe');

  pyProcess = spawn(venvPath, ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--workers', '1'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PYTHONPATH: backendDir, // 關鍵：告訴 Python backend 是搜尋模組的根目錄
      PYTHONIOENCODING: 'utf-8'
    }
  });

  pyProcess.stdout.on('data', (data) => console.log(`Python: ${data}`));
  pyProcess.stderr.on('data', (data) => console.error(`Python Error: ${data}`));
}

// 在 app.whenReady() 呼叫
app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
})

// 核心保護機制 A：當所有視窗關閉時
app.on('window-all-closed', () => {
  if (pyProcess) {
    console.log('正在關閉 Python 後端...');
    // 在 Windows 上，有時需要強制殺死整個進程樹
    pyProcess.kill(); 
    pyProcess = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 核心保護機制 B：當 App 準備退出時（保險鎖）
app.on('will-quit', () => {
  if (pyProcess) pyProcess.kill();
})