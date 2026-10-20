import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppearanceData,
  type BackupPayload,
  type HistoryData,
  type MatchResult,
  type ProfileData
} from '../shared/types'

const MAX_HISTORY = 50

const PROFILE_FILE = 'profile.json'
const SETTINGS_FILE = 'settings.json'
const APPEARANCE_FILE = 'appearance.json'
const HISTORY_FILE = 'history.json'

function backupStamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}-${ms}`
}

/**
 * Local-only persistence. Everything lives in Electron's userData directory
 * as small JSON documents so it survives renderer reloads and app restarts.
 */
export class Storage {
  private readonly dir: string
  private profile: ProfileData | null = null
  private settings: AppSettings | null = null
  private appearance: AppearanceData | null | undefined = undefined
  private history: HistoryData | null = null
  private initialised = false
  private warnings: string[] = []

  constructor(baseDir?: string) {
    this.dir = baseDir ?? path.join(app.getPath('userData'), 'data')
  }

  getDirectory(): string {
    return this.dir
  }

  consumeWarnings(): string[] {
    const current = this.warnings
    this.warnings = []
    return current
  }

  private warn(message: string): void {
    this.warnings.push(message)
    console.warn('[storage]', message)
  }

  async init(): Promise<void> {
    if (this.initialised) return
    await fs.mkdir(this.dir, { recursive: true })
    this.initialised = true
  }

  private filePath(name: string): string {
    return path.join(this.dir, name)
  }

  private async readJson<T>(name: string): Promise<T | null> {
    const full = this.filePath(name)
    let raw: string
    try {
      raw = await fs.readFile(full, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        this.warn(`无法读取 ${name}：${error instanceof Error ? error.message : String(error)}`)
      }
      return null
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      const corruptName = `${path.basename(full)}.corrupt-${Date.now()}`
      await fs.rename(full, this.filePath(corruptName)).catch(() => undefined)
      this.warn(`${name} 已损坏，原文件已保留为 ${corruptName}，本次使用默认数据。`)
      return null
    }
  }

  private async writeJson(name: string, value: unknown): Promise<void> {
    const full = this.filePath(name)
    const tmp = `${full}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    try {
      await fs.rename(tmp, full)
    } catch {
      // Windows can refuse to replace an existing file if another process
      // has it open for a moment. Fall back to remove + rename.
      await fs.rm(full, { force: true })
      await fs.rename(tmp, full)
    }
  }

  private makeDefaultProfile(): ProfileData {
    const id = randomUUID()
    const now = Date.now()
    return {
      id,
      name: `玩家${id.slice(0, 4).toUpperCase()}`,
      createdAt: now,
      updatedAt: now
    }
  }

  async loadProfile(): Promise<ProfileData> {
    await this.init()
    if (!this.profile) {
      const stored = await this.readJson<Partial<ProfileData>>(PROFILE_FILE)
      if (stored && typeof stored.id === 'string' && stored.id.length > 0) {
        const now = Date.now()
        this.profile = {
          id: stored.id,
          name: typeof stored.name === 'string' && stored.name.trim() ? stored.name.trim() : '玩家',
          createdAt: typeof stored.createdAt === 'number' ? stored.createdAt : now,
          updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : now
        }
      } else {
        this.profile = this.makeDefaultProfile()
        await this.writeJson(PROFILE_FILE, this.profile)
      }
    }
    return this.profile
  }

  async saveProfile(profile: ProfileData): Promise<void> {
    await this.init()
    const name = profile.name.trim().slice(0, 16) || '玩家'
    this.profile = {
      ...profile,
      name,
      updatedAt: Date.now()
    }
    await this.writeJson(PROFILE_FILE, this.profile)
  }

  async loadSettings(): Promise<AppSettings> {
    await this.init()
    if (!this.settings) {
      const stored = await this.readJson<Partial<AppSettings>>(SETTINGS_FILE)
      this.settings = {
        volume:
          typeof stored?.volume === 'number'
            ? Math.min(1, Math.max(0, stored.volume))
            : DEFAULT_APP_SETTINGS.volume,
        detectionQuality:
          stored?.detectionQuality === 'performance' ||
          stored?.detectionQuality === 'balanced' ||
          stored?.detectionQuality === 'accurate'
            ? stored.detectionQuality
            : DEFAULT_APP_SETTINGS.detectionQuality,
        cameraDeviceId:
          typeof stored?.cameraDeviceId === 'string' ? stored.cameraDeviceId : null,
        showDebug: Boolean(stored?.showDebug),
        fieldTestLog: Boolean(stored?.fieldTestLog)
      }
    }
    return this.settings
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.init()
    this.settings = {
      ...settings,
      volume: Math.min(1, Math.max(0, settings.volume))
    }
    await this.writeJson(SETTINGS_FILE, this.settings)
  }

  async loadAppearance(): Promise<AppearanceData | null> {
    await this.init()
    if (this.appearance === undefined) {
      const stored = await this.readJson<AppearanceData>(APPEARANCE_FILE)
      this.appearance = this.isAppearance(stored) ? stored : null
    }
    return this.appearance
  }

  private isAppearance(value: unknown): value is AppearanceData {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<AppearanceData>
    return (
      candidate.version === 1 &&
      Array.isArray(candidate.faceEmbeddings) &&
      Array.isArray(candidate.clothing)
    )
  }

  async saveAppearance(appearance: AppearanceData | null): Promise<void> {
    await this.init()
    this.appearance = appearance
    await this.writeJson(APPEARANCE_FILE, appearance)
  }

  async loadHistory(): Promise<HistoryData> {
    await this.init()
    if (!this.history) {
      const stored = await this.readJson<HistoryData>(HISTORY_FILE)
      this.history =
        stored && Array.isArray(stored.matches) ? { matches: stored.matches } : { matches: [] }
    }
    return this.history
  }

  async addHistory(result: MatchResult): Promise<HistoryData> {
    const history = await this.loadHistory()
    const filtered = history.matches.filter((match) => match.matchId !== result.matchId)
    this.history = {
      matches: [result, ...filtered].slice(0, MAX_HISTORY)
    }
    await this.writeJson(HISTORY_FILE, this.history)
    return this.history
  }

  async clearHistory(): Promise<void> {
    await this.init()
    this.history = { matches: [] }
    await this.writeJson(HISTORY_FILE, this.history)
  }

  async createBackup(): Promise<BackupPayload> {
    const [profile, settings, appearance, history] = await Promise.all([
      this.loadProfile(),
      this.loadSettings(),
      this.loadAppearance(),
      this.loadHistory()
    ])
    return {
      formatVersion: 1,
      createdAt: Date.now(),
      profile,
      settings,
      appearance,
      history
    }
  }

  validateBackup(value: unknown): value is BackupPayload {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Partial<BackupPayload>
    if (candidate.formatVersion !== 1) return false
    if (typeof candidate.createdAt !== 'number') return false
    const profile = candidate.profile
    if (
      !profile ||
      typeof profile !== 'object' ||
      typeof profile.id !== 'string' ||
      typeof profile.name !== 'string'
    ) {
      return false
    }
    const settings = candidate.settings
    if (
      !settings ||
      typeof settings !== 'object' ||
      typeof settings.volume !== 'number' ||
      (settings.detectionQuality !== 'performance' &&
        settings.detectionQuality !== 'balanced' &&
        settings.detectionQuality !== 'accurate')
    ) {
      return false
    }
    if (candidate.appearance !== null && !this.isAppearance(candidate.appearance)) {
      return false
    }
    const history = candidate.history
    if (!history || typeof history !== 'object' || !Array.isArray(history.matches)) {
      return false
    }
    return true
  }

  async exportBackupTo(filePath: string): Promise<void> {
    const payload = await this.createBackup()
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  }

  async importBackup(payload: BackupPayload): Promise<void> {
    if (!this.validateBackup(payload)) {
      throw new Error('备份文件格式不正确或版本不兼容')
    }
    await this.init()
    // Keep the current state recoverable if the user imports by mistake.
    await this.writeAutoBackup()
    await this.writeJson(PROFILE_FILE, payload.profile)
    await this.writeJson(SETTINGS_FILE, payload.settings)
    await this.writeJson(APPEARANCE_FILE, payload.appearance)
    await this.writeJson(HISTORY_FILE, payload.history)
    this.profile = null
    this.settings = null
    this.appearance = undefined
    this.history = null
    await this.loadProfile()
  }

  async writeAutoBackup(): Promise<string | null> {
    try {
      await this.init()
      const payload = await this.createBackup()
      const dir = path.join(this.dir, 'backups')
      await fs.mkdir(dir, { recursive: true })
      const file = path.join(dir, `snapfire-backup-${backupStamp()}.json`)
      await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8')
      await this.pruneBackups(dir)
      return file
    } catch (error) {
      console.warn('[storage] auto backup failed', error)
      return null
    }
  }

  private async pruneBackups(dir: string): Promise<void> {
    try {
      const names = (await fs.readdir(dir))
        .filter((name) => /^snapfire-backup-.*\.json$/.test(name))
        .sort()
      while (names.length > 10) {
        const oldest = names.shift()
        if (oldest) await fs.rm(path.join(dir, oldest), { force: true })
      }
    } catch (error) {
      console.warn('[storage] failed to prune backups', error)
    }
  }

  async resetAll(): Promise<void> {
    await this.init()
    await Promise.all(
      [PROFILE_FILE, SETTINGS_FILE, APPEARANCE_FILE, HISTORY_FILE].map((name) =>
        fs.rm(this.filePath(name), { force: true }).catch(() => undefined)
      )
    )
    this.profile = null
    this.settings = null
    this.appearance = undefined
    this.history = null
    await this.loadProfile()
  }
}
