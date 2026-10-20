import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: () => path.join(os.tmpdir(), 'snapfire-mock-userdata')
  }
}))

import { FieldLog } from '../src/main/fieldLog'
import {
  FIELD_LOG_SCHEMA_VERSION,
  deriveFieldOutcome,
  type FieldLogEntry,
  type FieldRecognition,
  type FieldLogRef
} from '@shared/fieldLog'

let dir: string
let log: FieldLog

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snapfire-fieldlog-'))
  log = new FieldLog(dir)
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

function sessionEntry(): FieldLogEntry {
  return {
    schemaVersion: FIELD_LOG_SCHEMA_VERSION,
    type: 'session',
    sessionId: 'FT-1',
    at: '2026-11-08T14:00:00.000+08:00',
    appVersion: '0.1.1',
    platform: 'win32',
    roomCode: '1234',
    isHost: true,
    self: { id: 'p1', name: 'P1', team: 'red' },
    players: [
      { id: 'p1', name: 'P1', team: 'red' },
      { id: 'p2', name: 'P2', team: 'blue' }
    ],
    detectionQuality: 'balanced',
    camera: { width: 1920, height: 1080 }
  }
}

function shotEntry(shotSeq: number): FieldLogEntry {
  return {
    schemaVersion: FIELD_LOG_SCHEMA_VERSION,
    type: 'shot',
    sessionId: 'FT-1',
    shotSeq,
    at: '2026-11-08T14:01:00.000+08:00',
    block: { distanceM: 6, orientation: 'front', lighting: 'normal' },
    intended: { id: 'p2', name: 'P2', team: 'blue' },
    recognized: {
      id: 'p2',
      name: 'P2',
      team: 'blue',
      confidence: 0.86,
      source: 'combined',
      faceScore: 0.81,
      clothingScore: 0.93
    },
    debug: {
      detectMs: 412,
      bodyCount: 1,
      canvasWidth: 960,
      canvasHeight: 540,
      cameraWidth: 1920,
      cameraHeight: 1080,
      source: 'combined'
    },
    server: { hit: true, killed: false, targetId: 'p2', hp: 75 },
    outcome: 'CORRECT',
    recognitionCorrect: true,
    damageToWrongPlayer: false,
    latencyMs: 42
  }
}

describe('FieldLog', () => {
  it('appends entries as ordered JSONL lines', async () => {
    await log.append(sessionEntry())
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => log.append(shotEntry(index + 1)))
    )

    const raw = await fs.readFile(log.getCurrentFile(), 'utf8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(21)

    const parsed = lines.map((line) => JSON.parse(line) as FieldLogEntry)
    expect(parsed[0].type).toBe('session')
    expect(
      parsed.slice(1).map((entry) => (entry.type === 'shot' ? entry.shotSeq : -1))
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
  })

  it('rejects unknown, malformed and oversized entries', async () => {
    await expect(log.append(null)).resolves.toMatchObject({ ok: false })
    await expect(log.append({ type: 'nope' })).resolves.toMatchObject({
      ok: false
    })
    await expect(
      log.append({ schemaVersion: 999, type: 'session' })
    ).resolves.toMatchObject({ ok: false })
    await expect(
      log.append({
        schemaVersion: FIELD_LOG_SCHEMA_VERSION,
        type: 'shot',
        filler: 'x'.repeat(300 * 1024)
      })
    ).resolves.toMatchObject({ ok: false })

    await expect(fs.readdir(dir)).resolves.toHaveLength(0)
  })
})

describe('deriveFieldOutcome', () => {
  const intended: FieldLogRef = { id: 'p2', name: 'P2', team: 'blue' }
  const recognized = (id: string): FieldRecognition => ({
    id,
    name: id.toUpperCase(),
    team: 'blue',
    confidence: 0.8,
    source: 'clothing',
    faceScore: null,
    clothingScore: 0.9
  })

  it('marks the intended target as correct even when the server rejects damage', () => {
    const result = deriveFieldOutcome({
      intended,
      recognized: recognized('p2'),
      server: { hit: false, killed: false, targetId: 'p2', reason: 'invulnerable' }
    })
    expect(result.outcome).toBe('CORRECT')
    expect(result.recognitionCorrect).toBe(true)
    expect(result.damageToWrongPlayer).toBe(false)
  })

  it('flags wrong attribution and wrong damage separately', () => {
    const result = deriveFieldOutcome({
      intended,
      recognized: recognized('p3'),
      server: { hit: true, killed: false, targetId: 'p3', hp: 75 }
    })
    expect(result.outcome).toBe('WRONG')
    expect(result.recognitionCorrect).toBe(false)
    expect(result.damageToWrongPlayer).toBe(true)
  })

  it('distinguishes no match, friendly and invalid shots', () => {
    expect(
      deriveFieldOutcome({
        intended,
        recognized: null,
        server: { hit: false, killed: false, reason: 'no-target' }
      }).outcome
    ).toBe('NO_MATCH')

    expect(
      deriveFieldOutcome({
        intended,
        recognized: recognized('p2'),
        server: { hit: false, killed: false, targetId: 'p2', reason: 'friendly' }
      }).outcome
    ).toBe('FRIENDLY')

    expect(
      deriveFieldOutcome({
        intended,
        recognized: recognized('p2'),
        server: { hit: false, killed: false, reason: 'not-playing' }
      }).outcome
    ).toBe('INVALID')
  })

  it('requires an intended target and a server result for a usable outcome', () => {
    expect(
      deriveFieldOutcome({
        intended: null,
        recognized: recognized('p2'),
        server: { hit: true, killed: false, targetId: 'p2', hp: 75 }
      }).outcome
    ).toBe('UNLABELED')

    expect(
      deriveFieldOutcome({
        intended,
        recognized: recognized('p2'),
        server: null
      }).outcome
    ).toBe('ERROR')
  })
})
