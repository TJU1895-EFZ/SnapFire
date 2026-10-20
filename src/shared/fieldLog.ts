// Types and pure helpers for the field-test JSONL log. The log is written by
// the main process under userData/field-logs and is never uploaded anywhere.

import type { DetectionQuality, MatchResult, MatchScore, Team } from './types'

export const FIELD_LOG_SCHEMA_VERSION = 1

export type FieldLighting = 'normal' | 'dim' | 'backlit'
export type FieldOrientation = 'front' | 'back'
export type FieldSource = 'face' | 'clothing' | 'combined' | 'descriptor-only' | 'none'

export type FieldOutcome =
  | 'CORRECT'
  | 'WRONG'
  | 'NO_MATCH'
  | 'FRIENDLY'
  | 'INVALID'
  | 'ERROR'
  | 'UNLABELED'

export interface FieldLogRef {
  id: string
  name: string
  team: Team | null
}

export interface FieldTestBlock {
  distanceM: number
  orientation: FieldOrientation
  lighting: FieldLighting
}

export interface FieldRecognition {
  id: string
  name: string
  team: Team | null
  confidence: number
  source: 'face' | 'clothing' | 'combined'
  faceScore: number | null
  clothingScore: number | null
}

export interface FieldServerResult {
  hit: boolean
  killed: boolean
  targetId?: string
  hp?: number
  reason?: string
}

export interface FieldSessionEntry {
  schemaVersion: number
  type: 'session'
  sessionId: string
  at: string
  appVersion: string
  platform: string
  roomCode: string
  isHost: boolean
  self: FieldLogRef
  players: FieldLogRef[]
  detectionQuality: DetectionQuality
  camera: { width: number | null; height: number | null }
}

export interface FieldShotEntry {
  schemaVersion: number
  type: 'shot'
  sessionId: string
  shotSeq: number
  at: string
  block: FieldTestBlock
  intended: FieldLogRef | null
  recognized: FieldRecognition | null
  debug: {
    detectMs: number
    bodyCount: number
    canvasWidth: number
    canvasHeight: number
    cameraWidth: number | null
    cameraHeight: number | null
    source: FieldSource
  }
  server: FieldServerResult | null
  outcome: FieldOutcome
  recognitionCorrect: boolean | null
  damageToWrongPlayer: boolean
  latencyMs: number | null
  error?: string
}

export interface FieldAnalyzeErrorEntry {
  schemaVersion: number
  type: 'analyze-error'
  sessionId: string
  shotSeq: number
  at: string
  block: FieldTestBlock
  intended: FieldLogRef | null
  message: string
}

export interface FieldMatchEndEntry {
  schemaVersion: number
  type: 'match-end'
  sessionId: string
  at: string
  matchId: string
  result: MatchResult
  score: MatchScore
  roomCode: string
}

export type FieldLogEntry =
  | FieldSessionEntry
  | FieldShotEntry
  | FieldAnalyzeErrorEntry
  | FieldMatchEndEntry

export interface FieldLogAppendResult {
  ok: boolean
  path?: string
  error?: string
}

export interface FieldLogInfo {
  directory: string
  file: string
}

export interface FieldLogOpenResult {
  ok: boolean
  error?: string
}

export interface FieldOutcomeInput {
  intended: FieldLogRef | null
  recognized: FieldRecognition | null
  server: FieldServerResult | null
}

export interface FieldOutcomeResult {
  outcome: FieldOutcome
  recognitionCorrect: boolean | null
  damageToWrongPlayer: boolean
}

const INVALID_SERVER_REASONS = new Set(['not-playing', 'dead', 'invalid-target'])

/**
 * Turns the raw recognition and server payloads into the outcome vocabulary
 * used by the field-test report. Recognition correctness is kept separate from
 * damage so that shots rejected by the server (dead/invulnerable target) are
 * still counted as correct locks.
 */
export function deriveFieldOutcome(input: FieldOutcomeInput): FieldOutcomeResult {
  const { intended, recognized, server } = input
  const recognitionCorrect =
    intended && recognized ? recognized.id === intended.id : null
  const damageToWrongPlayer = Boolean(
    server?.hit && intended && server.targetId && server.targetId !== intended.id
  )

  let outcome: FieldOutcome
  if (!server) {
    outcome = 'ERROR'
  } else if (server.reason && INVALID_SERVER_REASONS.has(server.reason)) {
    outcome = 'INVALID'
  } else if (!intended) {
    outcome = 'UNLABELED'
  } else if (server.reason === 'friendly') {
    outcome = 'FRIENDLY'
  } else if (!recognized) {
    outcome = 'NO_MATCH'
  } else if (recognized.id === intended.id) {
    outcome = 'CORRECT'
  } else {
    outcome = 'WRONG'
  }

  return { outcome, recognitionCorrect, damageToWrongPlayer }
}
