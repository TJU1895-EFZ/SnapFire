import {
  FIELD_LOG_SCHEMA_VERSION,
  type FieldAnalyzeErrorEntry,
  type FieldLogEntry,
  type FieldSessionEntry,
  type FieldShotEntry,
  type FieldLogRef
} from '@shared/fieldLog'
import type { MatchResult, MatchScore } from '@shared/types'

let activeSessionId: string | null = null

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** ISO-8601 timestamp with the local UTC offset, so logs line up with the
 * timestamps written on the paper record sheet. */
export function localIsoNow(date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(
    date.getMilliseconds(),
    3
  )}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export function makeFieldSessionId(roomCode: string): string {
  const date = new Date()
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  const room = roomCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'ROOM'
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `FT-${stamp}-${room}-${suffix}`
}

function append(entry: FieldLogEntry): void {
  const api = window.snapfire?.fieldLog
  if (!api) return
  void api
    .append(entry)
    .then((result) => {
      if (!result.ok) console.warn('[field-log] append failed', result.error)
    })
    .catch((error) => console.warn('[field-log] append failed', error))
}

export function startFieldSession(
  entry: Omit<FieldSessionEntry, 'schemaVersion' | 'type'>
): string {
  activeSessionId = entry.sessionId
  append({ schemaVersion: FIELD_LOG_SCHEMA_VERSION, type: 'session', ...entry })
  return entry.sessionId
}

export function endFieldSession(): void {
  activeSessionId = null
}

export function getFieldSessionId(): string | null {
  return activeSessionId
}

export function logFieldShot(
  entry: Omit<FieldShotEntry, 'schemaVersion' | 'type'>
): void {
  append({ schemaVersion: FIELD_LOG_SCHEMA_VERSION, type: 'shot', ...entry })
}

export function logFieldAnalyzeError(
  entry: Omit<FieldAnalyzeErrorEntry, 'schemaVersion' | 'type'>
): void {
  append({ schemaVersion: FIELD_LOG_SCHEMA_VERSION, type: 'analyze-error', ...entry })
}

export function logFieldMatchEnd(
  result: MatchResult,
  score: MatchScore,
  roomCode: string
): void {
  if (!activeSessionId) return
  append({
    schemaVersion: FIELD_LOG_SCHEMA_VERSION,
    type: 'match-end',
    sessionId: activeSessionId,
    at: localIsoNow(),
    matchId: result.matchId,
    result,
    score,
    roomCode
  })
}

export function toFieldRef(player: {
  id: string
  name: string
  team: 'red' | 'blue' | null
}): FieldLogRef {
  return { id: player.id, name: player.name, team: player.team }
}
