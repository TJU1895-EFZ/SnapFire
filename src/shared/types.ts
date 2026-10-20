// Shared types and constants used by the Electron main process, preload,
// and the React renderer.

import type {
  FieldLogAppendResult,
  FieldLogEntry,
  FieldLogInfo,
  FieldLogOpenResult
} from './fieldLog'

export type Team = 'red' | 'blue'
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'ended'
export type GameMode = 'urban'
export type EnrollmentView = 'front' | 'back' | 'left' | 'right' | 'other'
export type DetectionQuality = 'performance' | 'balanced' | 'accurate'

export const MAX_PLAYERS = 6
export const MAX_TEAM_SIZE = 3
export const MAX_HP = 100
export const DAMAGE_PER_HIT = 25
export const RESPAWN_MS = 5000
export const INVULNERABLE_MS = 2000
export const COUNTDOWN_MS = 3000
export const DEFAULT_PORT = 17890
export const PORT_ATTEMPTS = 20
export const PROTOCOL_VERSION = 1

export const DURATION_MIN = 3
export const DURATION_MAX = 10
export const KILL_LIMIT_MIN = 10
export const KILL_LIMIT_MAX = 30

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  durationMin: 5,
  killLimit: 10
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  volume: 0.8,
  detectionQuality: 'balanced',
  cameraDeviceId: null,
  showDebug: false,
  fieldTestLog: false
}

export interface RoomSettings {
  durationMin: number
  killLimit: number
}

export interface ClothingDescriptor {
  version: 1
  view: EnrollmentView
  /** Normalized HSV histogram. */
  histogram: number[]
  /** 3x3 grid of mean HSV values, normalized to 0..1. */
  grid: number[]
  /** Torso width / height at capture time. */
  aspect: number
  capturedAt: number
}

export interface AppearanceData {
  version: 1
  faceEmbeddings: number[][]
  clothing: ClothingDescriptor[]
  updatedAt: number
  /** Small JPEG data URL, kept locally for the lobby preview. */
  thumbnail?: string
}

export interface PlayerPublic {
  id: string
  name: string
  team: Team | null
  ready: boolean
  connected: boolean
  appearanceReady: boolean
  isHost: boolean
  hp: number
  alive: boolean
  kills: number
  deaths: number
  shots: number
  hits: number
  respawnAt: number | null
  invulnerableUntil: number | null
}

export interface MatchScore {
  red: number
  blue: number
}

export interface KillFeedEntry {
  id: string
  killerId: string
  killerName: string
  killerTeam: Team
  victimId: string
  victimName: string
  victimTeam: Team
  at: number
}

export interface MatchResultPlayer {
  id: string
  name: string
  team: Team
  kills: number
  deaths: number
  shots: number
  hits: number
  accuracy: number
}

export interface MatchResult {
  matchId: string
  mode: GameMode
  startedAt: number
  endedAt: number
  durationMin: number
  killLimit: number
  winner: Team | 'draw'
  score: MatchScore
  players: MatchResultPlayer[]
}

export interface RoomPublicState {
  roomCode: string
  hostId: string
  phase: MatchPhase
  players: PlayerPublic[]
  settings: RoomSettings
  score: MatchScore
  matchStartedAt: number | null
  matchEndsAt: number | null
  remainingMs: number | null
  countdownEndsAt: number | null
  /** Server clock at the moment this state was produced. Clients use it to
   * convert absolute timestamps without assuming their clocks are in sync. */
  serverNow: number
  killFeed: KillFeedEntry[]
  result: MatchResult | null
}

export interface GalleryEntry {
  id: string
  name: string
  team: Team | null
  appearance: AppearanceData
}

export type ClientMessage =
  | { type: 'join'; roomCode: string; playerId: string; name: string; hostToken?: string }
  | { type: 'set-name'; name: string }
  | { type: 'set-team'; team: Team }
  | { type: 'set-ready'; ready: boolean }
  | { type: 'set-appearance'; appearance: AppearanceData }
  | { type: 'update-settings'; settings: RoomSettings }
  | { type: 'start-match' }
  | { type: 'shot'; targetId: string | null }
  | { type: 'return-lobby' }
  | { type: 'leave' }
  | { type: 'ping'; t: number }

export type ServerMessage =
  | {
      type: 'welcome'
      selfId: string
      isHost: boolean
      room: RoomPublicState
      gallery: GalleryEntry[]
    }
  | { type: 'room'; room: RoomPublicState }
  | { type: 'gallery'; gallery: GalleryEntry[] }
  | {
      type: 'shot-result'
      hit: boolean
      targetId?: string
      hp?: number
      killed?: boolean
      reason?: string
    }
  | {
      type: 'damage'
      shooterId: string
      targetId: string
      amount: number
      hp: number
      killed: boolean
    }
  | { type: 'respawn'; playerId: string }
  | { type: 'match-start'; room: RoomPublicState }
  | { type: 'match-end'; result: MatchResult }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number }

export interface ProfileData {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  volume: number
  detectionQuality: DetectionQuality
  cameraDeviceId: string | null
  showDebug: boolean
  /** Writes per-shot recognition diagnostics to a local JSONL file. */
  fieldTestLog: boolean
}

export interface HistoryData {
  matches: MatchResult[]
}

export interface BackupPayload {
  formatVersion: 1
  createdAt: number
  profile: ProfileData
  settings: AppSettings
  appearance: AppearanceData | null
  history: HistoryData
}

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface HostInfo {
  port: number
  roomCode: string
  lanIps: string[]
  hostToken: string
}

export interface AppInfo {
  version: string
  userDataPath: string
  platform: string
}

export interface SnapFireApi {
  storage: {
    loadProfile: () => Promise<ProfileData>
    saveProfile: (profile: ProfileData) => Promise<void>
    loadSettings: () => Promise<AppSettings>
    saveSettings: (settings: AppSettings) => Promise<void>
    loadAppearance: () => Promise<AppearanceData | null>
    saveAppearance: (appearance: AppearanceData | null) => Promise<void>
    loadHistory: () => Promise<HistoryData>
    addHistory: (result: MatchResult) => Promise<HistoryData>
    clearHistory: () => Promise<void>
    resetAll: () => Promise<void>
    consumeWarnings: () => Promise<string[]>
  }
  backup: {
    export: () => Promise<BackupResult>
    import: () => Promise<BackupResult>
  }
  host: {
    start: () => Promise<HostInfo>
    stop: () => Promise<void>
    status: () => Promise<HostInfo | null>
  }
  app: {
    info: () => Promise<AppInfo>
  }
  fieldLog: {
    append: (entry: FieldLogEntry) => Promise<FieldLogAppendResult>
    info: () => Promise<FieldLogInfo>
    openDirectory: () => Promise<FieldLogOpenResult>
  }
}
