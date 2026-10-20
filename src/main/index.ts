import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { Storage } from './storage'
import { LanServer } from './lanServer'
import { FieldLog } from './fieldLog'
import type {
  AppSettings,
  AppearanceData,
  BackupPayload,
  BackupResult,
  MatchResult,
  ProfileData
} from '../shared/types'

const userDataOverride = process.env['SNAPFIRE_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}
if (process.env['SNAPFIRE_FAKE_CAMERA'] === '1') {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
}

app.setName('SnapFire')
app.setAppUserModelId('com.snapfire.mr')

// A custom secure scheme is used instead of file:// in production. This makes
// fetch() work for the bundled face/body models and gives getUserMedia a
// proper secure context.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
}

let mainWindow: BrowserWindow | null = null
let storage: Storage
let lanServer: LanServer
let fieldLog: FieldLog

function createWindow(): void {
  const iconPath = [
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(__dirname, '../../build/icon.ico'),
    join(process.cwd(), 'build', 'icon.ico')
  ].find((candidate) => existsSync(candidate))

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#07090a',
    title: 'SnapFire',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadURL('app://snapfire/index.html')
  }
}

function registerAppProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer')
  const rootPrefix = rendererRoot.endsWith(sep) ? rendererRoot : `${rendererRoot}${sep}`
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)
      if (!pathname || pathname === '/') pathname = '/index.html'
      const filePath = normalize(join(rendererRoot, pathname))
      if (filePath !== rendererRoot && !filePath.startsWith(rootPrefix)) {
        return new Response('Forbidden', { status: 403 })
      }
      const data = await fs.readFile(filePath)
      const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': 'no-cache'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle('storage:load-profile', () => storage.loadProfile())
  ipcMain.handle('storage:save-profile', (_event, profile: ProfileData) =>
    storage.saveProfile(profile)
  )
  ipcMain.handle('storage:load-settings', () => storage.loadSettings())
  ipcMain.handle('storage:save-settings', (_event, settings: AppSettings) =>
    storage.saveSettings(settings)
  )
  ipcMain.handle('storage:load-appearance', () => storage.loadAppearance())
  ipcMain.handle('storage:save-appearance', (_event, appearance: AppearanceData | null) =>
    storage.saveAppearance(appearance)
  )
  ipcMain.handle('storage:load-history', () => storage.loadHistory())
  ipcMain.handle('storage:add-history', async (_event, result: MatchResult) => {
    const history = await storage.addHistory(result)
    await storage.writeAutoBackup()
    return history
  })
  ipcMain.handle('storage:clear-history', () => storage.clearHistory())
  ipcMain.handle('storage:reset-all', () => storage.resetAll())
  ipcMain.handle('storage:consume-warnings', () => storage.consumeWarnings())

  ipcMain.handle('backup:export', async (): Promise<BackupResult> => {
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')
    try {
      const options = {
        title: '导出 SnapFire 备份',
        defaultPath: `snapfire-backup-${stamp}.json`,
        filters: [{ name: 'SnapFire 备份', extensions: ['json'] }]
      }
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }
      await storage.exportBackupTo(result.filePath)
      return { ok: true, path: result.filePath }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '导出备份失败'
      }
    }
  })

  ipcMain.handle('backup:import', async (): Promise<BackupResult> => {
    try {
      const options = {
        title: '导入 SnapFire 备份',
        filters: [{ name: 'SnapFire 备份', extensions: ['json'] }],
        properties: ['openFile' as const]
      }
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true }
      }
      const filePath = result.filePaths[0]
      const raw = await fs.readFile(filePath, 'utf8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { ok: false, error: '备份文件不是有效的 JSON' }
      }
      if (!storage.validateBackup(parsed)) {
        return { ok: false, error: '备份文件格式不正确或版本不兼容' }
      }
      await storage.importBackup(parsed as BackupPayload)
      return { ok: true, path: filePath }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '导入备份失败'
      }
    }
  })

  ipcMain.handle('host:start', () => lanServer.start())
  ipcMain.handle('host:stop', () => lanServer.stop())
  ipcMain.handle('host:status', () => lanServer.getInfo())

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    userDataPath: storage.getDirectory(),
    platform: process.platform
  }))

  ipcMain.handle('field-log:append', (_event, entry: unknown) => fieldLog.append(entry))
  ipcMain.handle('field-log:info', () => fieldLog.info())
  ipcMain.handle('field-log:open', async () => {
    try {
      await fieldLog.ensureDirectory()
      const error = await shell.openPath(fieldLog.getDirectory())
      return error ? { ok: false, error } : { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '无法打开日志目录'
      }
    }
  })
}

app.whenReady().then(async () => {
  storage = new Storage()
  await storage.init()
  await storage.writeAutoBackup()
  fieldLog = new FieldLog()
  lanServer = new LanServer()
  if (process.env['SNAPFIRE_TEST'] === '1') {
    ;(globalThis as unknown as { __snapfireTest?: { endMatch: () => void } }).__snapfireTest = {
      endMatch: () => lanServer.endMatchForTest()
    }
  }
  if (!process.env['ELECTRON_RENDERER_URL']) {
    registerAppProtocol()
  }

  session.defaultSession.setPermissionCheckHandler((_contents, permission) => {
    return permission === 'media'
  })
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media')
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (lanServer) {
    void lanServer.stop()
  }
})
