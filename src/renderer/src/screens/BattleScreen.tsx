import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppInfo, AppSettings, Team } from '@shared/types'
import type {
  FieldLogRef,
  FieldRecognition,
  FieldServerResult,
  FieldSource,
  FieldTestBlock
} from '@shared/fieldLog'
import { deriveFieldOutcome } from '@shared/fieldLog'
import { useCamera } from '../hooks/useCamera'
import { useServerClock } from '../hooks/useServerClock'
import { BattleScene, type LockState } from '../game/BattleScene'
import { UniformOverlay } from '../game/UniformOverlay'
import { VisionEngine, type VisionFrameResult } from '../vision/engine'
import { OverlayDetector } from '../vision/overlayDetector'
import { audio } from '../game/audio'
import { formatClock } from '../utils/format'
import { teamLabel, teamShortLabel } from '../utils/teamLabels'
import type { RoomSession } from '../types'
import {
  endFieldSession,
  getFieldSessionId,
  localIsoNow,
  logFieldAnalyzeError,
  logFieldShot,
  makeFieldSessionId,
  startFieldSession,
  toFieldRef
} from '../fieldLog'
import { IconAlert, IconCrosshair, IconShield, IconUsers } from '../components/Icons'

interface BattleScreenProps {
  session: RoomSession
  settings: AppSettings
  appInfo: AppInfo | null
  onLeave: () => void
}

interface PendingFieldShot {
  sessionId: string
  shotSeq: number
  firedAt: string
  sentAt: number
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
  timer: number | null
}

interface LastFieldOutcome {
  shotSeq: number
  outcome: string
  intendedName: string | null
  recognizedName: string | null
}

interface LockInfo {
  state: LockState
  name?: string
  team?: Team
  confidence?: number
  source?: string
}

interface Feedback {
  text: string
  tone: 'success' | 'error' | 'info' | 'friendly'
}

interface DebugInfo {
  ms: number
  bodyCount: number
  faceScore: number | null
  clothingScore: number
  source: string
  canvasWidth: number
  canvasHeight: number
}

const REASON_TEXT: Record<string, string> = {
  'no-target': '未识别到目标',
  friendly: '队友 · 未造成伤害',
  'target-dead': '目标已阵亡',
  invulnerable: '目标处于复活保护',
  'invalid-target': '目标无效',
  'not-playing': '比赛未开始',
  dead: '你已阵亡',
  cooldown: '射速限制中'
}

export function BattleScreen({
  session,
  settings,
  appInfo,
  onLeave
}: BattleScreenProps): React.JSX.Element {
  const camera = useCamera({ autoStart: true, deviceId: settings.cameraDeviceId })
  const { videoRef, status: cameraStatus, error: cameraError, resolution, start: startCamera } =
    camera
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const uniformCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<BattleScene | null>(null)
  const overlayRendererRef = useRef<UniformOverlay | null>(null)
  const overlayDetectorRef = useRef<OverlayDetector | null>(null)
  const engineRef = useRef<VisionEngine | null>(null)
  const engineStartedRef = useRef(false)
  const sessionRef = useRef(session)
  const settingsRef = useRef(settings)
  const selfTeamRef = useRef<Team | null>(null)
  const lastFireRef = useRef(0)
  const resolvingRef = useRef(false)
  const onLeaveRef = useRef(onLeave)
  const [lock, setLock] = useState<LockInfo>({ state: 'none' })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hitMarker, setHitMarker] = useState(0)
  const [damageFlash, setDamageFlash] = useState(false)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const [visionWarm, setVisionWarm] = useState(false)
  const [fieldBlock, setFieldBlock] = useState<FieldTestBlock>({
    distanceM: 3,
    orientation: 'front',
    lighting: 'normal'
  })
  const [intendedId, setIntendedId] = useState<string | null>(null)
  const [fieldSessionId, setFieldSessionId] = useState<string | null>(null)
  const [lastFieldOutcome, setLastFieldOutcome] = useState<LastFieldOutcome | null>(
    null
  )

  const fieldBlockRef = useRef<FieldTestBlock>(fieldBlock)
  const intendedIdRef = useRef<string | null>(null)
  const shotSeqRef = useRef(0)
  const pendingShotRef = useRef<PendingFieldShot | null>(null)
  const resolutionRef = useRef(resolution)
  const appInfoRef = useRef(appInfo)

  const serverNow = useServerClock(session.room)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    resolutionRef.current = resolution
  }, [resolution])

  useEffect(() => {
    appInfoRef.current = appInfo
  }, [appInfo])

  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  const selfPlayer = useMemo(
    () => session.room.players.find((player) => player.id === session.selfId) ?? null,
    [session.room.players, session.selfId]
  )

  useEffect(() => {
    selfTeamRef.current = selfPlayer?.team ?? null
  }, [selfPlayer?.team])

  // --- Field test logging ---------------------------------------------------
  const fieldCandidates = useMemo(
    () => session.room.players.filter((player) => player.id !== session.selfId),
    [session.room.players, session.selfId]
  )
  const intendedPlayer = useMemo(
    () => fieldCandidates.find((player) => player.id === intendedId) ?? null,
    [fieldCandidates, intendedId]
  )

  const chooseIntended = useCallback((id: string | null) => {
    intendedIdRef.current = id
    setIntendedId(id)
  }, [])

  const updateFieldBlock = useCallback((patch: Partial<FieldTestBlock>) => {
    setFieldBlock((previous) => {
      const next = { ...previous, ...patch }
      fieldBlockRef.current = next
      return next
    })
  }, [])

  const finalizePendingShot = useCallback(
    (error: string | null, server?: FieldServerResult) => {
      const pending = pendingShotRef.current
      if (!pending) return
      pendingShotRef.current = null
      if (pending.timer !== null) {
        window.clearTimeout(pending.timer)
        pending.timer = null
      }
      const derived = deriveFieldOutcome({
        intended: pending.intended,
        recognized: pending.recognized,
        server: server ?? null
      })
      const outcome = error ? 'ERROR' : derived.outcome
      logFieldShot({
        sessionId: pending.sessionId,
        shotSeq: pending.shotSeq,
        at: pending.firedAt,
        block: pending.block,
        intended: pending.intended,
        recognized: pending.recognized,
        debug: pending.debug,
        server: server ?? null,
        outcome,
        recognitionCorrect: derived.recognitionCorrect,
        damageToWrongPlayer: derived.damageToWrongPlayer,
        latencyMs: server ? Date.now() - pending.sentAt : null,
        error: error ?? undefined
      })
      setLastFieldOutcome({
        shotSeq: pending.shotSeq,
        outcome,
        intendedName: pending.intended?.name ?? null,
        recognizedName: pending.recognized?.name ?? null
      })
    },
    []
  )

  useEffect(() => {
    if (!settingsRef.current.fieldTestLog) return
    const current = sessionRef.current
    const self = current.room.players.find((player) => player.id === current.selfId)
    if (!self) return
    const info = appInfoRef.current
    const id = makeFieldSessionId(current.room.roomCode)
    startFieldSession({
      sessionId: id,
      at: localIsoNow(),
      appVersion: info?.version ?? 'unknown',
      platform: info?.platform ?? 'unknown',
      roomCode: current.room.roomCode,
      isHost: current.isHost,
      self: toFieldRef(self),
      players: current.room.players.map(toFieldRef),
      detectionQuality: settingsRef.current.detectionQuality,
      camera: resolutionRef.current
        ? { width: resolutionRef.current.width, height: resolutionRef.current.height }
        : { width: null, height: null }
    })
    setFieldSessionId(id)
    return () => {
      finalizePendingShot('离开战斗，未收到服务端结果')
      endFieldSession()
    }
    // One session per battle-screen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Three.js weapon view model -----------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: BattleScene
    try {
      scene = new BattleScene(canvas)
    } catch (error) {
      setSceneError(
        error instanceof Error ? `AR 画面初始化失败：${error.message}` : 'AR 画面初始化失败'
      )
      return
    }
    sceneRef.current = scene
    scene.start()
    const parent = canvas.parentElement
    const resize = (): void => {
      if (parent) scene.resize(parent.clientWidth, parent.clientHeight)
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (parent) observer.observe(parent)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  // --- Vision loop ---------------------------------------------------------
  useEffect(() => {
    const engine = new VisionEngine()
    engineRef.current = engine
    engine.setSession(sessionRef.current.gallery, sessionRef.current.selfId)
    engine.setQuality(settingsRef.current.detectionQuality)
    const off = engine.onResult((result: VisionFrameResult) => {
      setVisionWarm(true)
      setDebugInfo({
        ms: result.durationMs,
        bodyCount: result.bodyCount,
        faceScore: result.match?.faceScore ?? null,
        clothingScore: result.match?.clothingScore ?? 0,
        source: result.match?.source ?? (result.clothing ? 'descriptor-only' : '—'),
        canvasWidth: result.canvasWidth,
        canvasHeight: result.canvasHeight
      })
      if (result.match) {
        const state: LockState =
          result.match.team === selfTeamRef.current ? 'teammate' : 'enemy'
        setLock({
          state,
          name: result.match.name,
          team: result.match.team,
          confidence: result.match.confidence,
          source: result.match.source
        })
        sceneRef.current?.setLock(state)
      } else if (result.target) {
        setLock({ state: 'unknown' })
        sceneRef.current?.setLock('unknown')
      } else {
        setLock({ state: 'none' })
        sceneRef.current?.setLock('none')
      }
    })
    const video = videoRef.current
    if (video && video.readyState >= 2) {
      engine.start(video)
      engineStartedRef.current = true
    }
    return () => {
      off()
      engine.stop()
      engineRef.current = null
      engineStartedRef.current = false
    }
    // Engine must live for the whole battle screen. Session data is fed
    // through refs or dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cameraStatus !== 'ready') return
    const video = videoRef.current
    const engine = engineRef.current
    if (video && engine && !engineStartedRef.current) {
      engine.start(video)
      engineStartedRef.current = true
    }
  }, [cameraStatus, videoRef])

  useEffect(() => {
    engineRef.current?.setSession(session.gallery, session.selfId)
  }, [session.gallery, session.selfId])

  // --- Uniform overlay (Long March) ---------------------------------------
  useEffect(() => {
    if (session.mode !== 'long-march' || cameraStatus !== 'ready') return undefined
    const canvas = uniformCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return undefined

    let renderer: UniformOverlay
    let detector: OverlayDetector
    try {
      renderer = new UniformOverlay(canvas, video)
      detector = new OverlayDetector()
    } catch (error) {
      console.warn('[battle] uniform overlay unavailable', error)
      return undefined
    }

    overlayRendererRef.current = renderer
    overlayDetectorRef.current = detector
    detector.setSession(session.gallery, session.selfId)
    const detach = detector.onPeople((people) => renderer.setPeople(people))
    renderer.start()
    detector.start(video)

    return () => {
      detach()
      detector.stop()
      renderer.stop()
      overlayDetectorRef.current = null
      overlayRendererRef.current = null
    }
  }, [session.mode, session.gallery, session.selfId, cameraStatus, videoRef])

  useEffect(() => {
    engineRef.current?.setQuality(settings.detectionQuality)
  }, [settings.detectionQuality])

  // --- Network feedback ----------------------------------------------------
  useEffect(() => {
    const off = session.net.on((event) => {
      if (event.type === 'shot-result') {
        finalizePendingShot(null, {
          hit: event.hit,
          killed: Boolean(event.killed),
          targetId: event.targetId,
          hp: event.hp,
          reason: event.reason
        })
        if (event.hit) {
          setHitMarker((value) => value + 1)
          audio.hit()
          if (event.killed) audio.kill()
          setFeedback({
            text: event.killed ? '击倒目标' : '命中',
            tone: 'success'
          })
        } else {
          const text = REASON_TEXT[event.reason ?? ''] ?? '未命中'
          if (event.reason === 'friendly') audio.friendly()
          else audio.miss()
          setFeedback({
            text,
            tone: event.reason === 'friendly' ? 'friendly' : 'info'
          })
        }
      } else if (event.type === 'damage') {
        if (event.targetId === session.selfId) {
          setDamageFlash(true)
          audio.damage()
          setFeedback({ text: `受到 ${event.amount} 点伤害`, tone: 'error' })
        }
      } else if (event.type === 'respawn' && event.playerId === session.selfId) {
        audio.respawn()
        setFeedback({ text: '已复活 · 2 秒保护', tone: 'info' })
      }
    })
    return off
  }, [session.net, session.selfId, finalizePendingShot])

  useEffect(() => {
    if (!feedback) return
    const handle = window.setTimeout(() => setFeedback(null), 1700)
    return () => window.clearTimeout(handle)
  }, [feedback])

  useEffect(() => {
    if (!damageFlash) return
    const handle = window.setTimeout(() => setDamageFlash(false), 340)
    return () => window.clearTimeout(handle)
  }, [damageFlash])

  // --- Fire ----------------------------------------------------------------
  const fire = useCallback(() => {
    const current = sessionRef.current
    const room = current.room
    if (room.phase !== 'playing') return
    const self = room.players.find((player) => player.id === current.selfId)
    if (!self?.alive) return
    const now = performance.now()
    if (now - lastFireRef.current < 250) return
    if (resolvingRef.current) return
    lastFireRef.current = now
    resolvingRef.current = true
    audio.unlock()
    sceneRef.current?.fire()
    audio.gunshot()

    const fieldSession = settingsRef.current.fieldTestLog
      ? getFieldSessionId()
      : null
    const block = { ...fieldBlockRef.current }
    const intendedPlayerNow = intendedIdRef.current
      ? room.players.find((player) => player.id === intendedIdRef.current) ?? null
      : null
    const intended = intendedPlayerNow ? toFieldRef(intendedPlayerNow) : null
    const shotSeq = fieldSession ? ++shotSeqRef.current : 0
    const firedAt = localIsoNow()

    const engine = engineRef.current
    if (!engine) {
      resolvingRef.current = false
      if (fieldSession) {
        logFieldAnalyzeError({
          sessionId: fieldSession,
          shotSeq,
          at: firedAt,
          block,
          intended,
          message: '识别引擎未就绪'
        })
        setLastFieldOutcome({
          shotSeq,
          outcome: 'ERROR',
          intendedName: intended?.name ?? null,
          recognizedName: null
        })
      }
      return
    }
    void engine
      .analyzeNow()
      .then((result) => {
        const live = sessionRef.current
        const liveSelf = live.room.players.find((player) => player.id === live.selfId)
        const stillPlaying = live.room.phase === 'playing' && Boolean(liveSelf?.alive)
        const recognized: FieldRecognition | null = result?.match
          ? {
              id: result.match.playerId,
              name: result.match.name,
              team: result.match.team,
              confidence: result.match.confidence,
              source: result.match.source,
              faceScore: result.match.faceScore,
              clothingScore: result.match.clothingScore
            }
          : null
        const source: FieldSource =
          result?.match?.source ?? (result?.clothing ? 'descriptor-only' : 'none')
        const debug = {
          detectMs: result?.durationMs ?? 0,
          bodyCount: result?.bodyCount ?? 0,
          canvasWidth: result?.canvasWidth ?? 0,
          canvasHeight: result?.canvasHeight ?? 0,
          cameraWidth: resolutionRef.current?.width ?? null,
          cameraHeight: resolutionRef.current?.height ?? null,
          source
        }
        if (fieldSession) {
          const pending: PendingFieldShot = {
            sessionId: fieldSession,
            shotSeq,
            firedAt,
            sentAt: Date.now(),
            block,
            intended,
            recognized,
            debug,
            timer: null
          }
          pending.timer = window.setTimeout(
            () => finalizePendingShot('服务端结果超时'),
            5000
          )
          pendingShotRef.current = pending
        }
        if (!stillPlaying) {
          finalizePendingShot('开火后比赛已结束')
          resolvingRef.current = false
          return
        }
        const sent = live.net.send({
          type: 'shot',
          targetId: result?.match?.playerId ?? null
        })
        if (!sent) finalizePendingShot('网络发送失败')
      })
      .catch((error) => {
        if (fieldSession) {
          logFieldAnalyzeError({
            sessionId: fieldSession,
            shotSeq,
            at: firedAt,
            block,
            intended,
            message: error instanceof Error ? error.message : '识别失败'
          })
          setLastFieldOutcome({
            shotSeq,
            outcome: 'ERROR',
            intendedName: intended?.name ?? null,
            recognizedName: null
          })
        }
        setFeedback({ text: '识别失败，本次未命中', tone: 'error' })
      })
      .finally(() => {
        resolvingRef.current = false
      })
  }, [finalizePendingShot])

  const requestLeave = useCallback(() => {
    if (window.confirm('确定离开本局吗？离开后将回到首页。')) {
      onLeaveRef.current()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if (settingsRef.current.fieldTestLog && !typing && !event.repeat) {
        const live = sessionRef.current
        const candidates = live.room.players.filter(
          (player) => player.id !== live.selfId
        )
        if (event.key === '0') {
          event.preventDefault()
          chooseIntended(null)
          return
        }
        const index = Number.parseInt(event.key, 10)
        if (Number.isInteger(index) && index >= 1 && index <= candidates.length) {
          event.preventDefault()
          chooseIntended(candidates[index - 1].id)
          return
        }
      }

      if (event.code === 'Space' && !event.repeat) {
        if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
          return
        }
        event.preventDefault()
        fire()
      } else if (event.code === 'Escape') {
        event.preventDefault()
        requestLeave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fire, requestLeave, chooseIntended])

  const room = session.room
  const self = selfPlayer
  const remaining =
    room.matchEndsAt !== null
      ? Math.max(0, room.matchEndsAt - serverNow)
      : room.phase === 'countdown'
        ? room.settings.durationMin * 60_000
        : room.remainingMs ?? 0
  const countdownMs =
    room.phase === 'countdown' && room.countdownEndsAt !== null
      ? Math.max(0, room.countdownEndsAt - serverNow)
      : 0
  const respawnMs =
    self && !self.alive && self.respawnAt !== null
      ? Math.max(0, self.respawnAt - serverNow)
      : 0
  const isDead = room.phase === 'playing' && self !== null && !self.alive
  const invulnerable = Boolean(
    self?.invulnerableUntil !== null &&
      self?.invulnerableUntil !== undefined &&
      self.invulnerableUntil > serverNow
  )
  const hpPercent = Math.max(0, Math.min(100, self?.hp ?? 0))
  const lockText =
    lock.state === 'enemy'
      ? `锁定 · ${lock.name ?? '敌人'}`
      : lock.state === 'teammate'
        ? `队友 · ${lock.name ?? ''}`
        : lock.state === 'unknown'
          ? '目标未识别'
          : ''
  const lockedTeamLabel = lock.team
    ? teamLabel(lock.team, session.mode)
    : null
  const lockLabelClass =
    lock.team === 'red'
      ? 'lock-label--team-red'
      : lock.team === 'blue'
        ? 'lock-label--team-blue'
        : lock.state === 'unknown'
          ? 'lock-label--unknown'
          : ''

  return (
    <div
      className={`battle-screen ${damageFlash ? 'is-damaged' : ''}`}
      onMouseDown={(event) => {
        if (event.button === 0) {
          event.preventDefault()
          fire()
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video ref={videoRef} className="battle-video" autoPlay muted playsInline />
      {session.mode === 'long-march' && (
        <canvas
          ref={uniformCanvasRef}
          className="battle-uniform-canvas"
          data-uniform-overlay="true"
          aria-hidden="true"
        />
      )}
      <canvas ref={canvasRef} className="battle-canvas" />
      <div className="battle-vignette" aria-hidden="true" />
      <div className={`damage-vignette ${damageFlash ? 'is-active' : ''}`} aria-hidden="true" />

      <div className="battle-hud">
        <div className="battle-top">
          <div className="score-board">
            <div className="score-board__side score-board__side--red">
              <span>{teamLabel('red', session.mode)}</span>
              <strong>{room.score.red}</strong>
            </div>
            <div className="score-board__timer">
              <span className="match-timer">{formatClock(remaining)}</span>
              <small>
                {room.settings.durationMin} MIN · {room.settings.killLimit} KILLS
              </small>
            </div>
            <div className="score-board__side score-board__side--blue">
              <span>{teamLabel('blue', session.mode)}</span>
              <strong>{room.score.blue}</strong>
            </div>
          </div>
          <button
            className="battle-leave"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={requestLeave}
            title="离开本局（Esc）"
          >
            ESC 离开
          </button>
        </div>

        <div className="battle-roster">
          <div className="battle-roster__head">
            <IconUsers />
            <span>战场人员</span>
          </div>
          {room.players.map((player) => (
            <div
              key={player.id}
              className={`roster-row roster-row--${player.team ?? 'neutral'} ${
                player.alive ? '' : 'is-dead'
              } ${player.id === session.selfId ? 'is-self' : ''}`}
            >
              <span className="roster-name">
                {player.name}
                {player.id === session.selfId ? '（你）' : ''}
              </span>
              <span className="roster-team">
                {player.team ? teamShortLabel(player.team, session.mode) : '—'}
              </span>
              <span className="roster-hp">{player.alive ? Math.round(player.hp) : 0}</span>
            </div>
          ))}
        </div>

        <div className="kill-feed">
          {room.killFeed.slice(0, 5).map((entry) => (
            <div className="kill-feed__row" key={entry.id}>
              <span className={`text-${entry.killerTeam}`}>{entry.killerName}</span>
              <span className="kill-feed__arrow">›</span>
              <span className={`text-${entry.victimTeam}`}>{entry.victimName}</span>
            </div>
          ))}
        </div>

        <div className="battle-bottom-left">
          <div className={`self-hp ${hpPercent <= 25 ? 'is-low' : ''}`}>
            <div className="self-hp__head">
              <span>{self?.name ?? '你'}</span>
              <span>
                {Math.round(self?.hp ?? 0)} / 100
              </span>
            </div>
            <div className="self-hp__bar">
              <div className="self-hp__fill" style={{ width: `${hpPercent}%` }} />
            </div>
            <div className="self-hp__meta">
              {invulnerable && <span className="chip chip--blue">复活保护</span>}
              {self?.team && (
                <span className={`chip chip--${self.team}`}>
                  {teamLabel(self.team, session.mode)}
                </span>
              )}
              <span className={`chip ${visionWarm ? 'chip--green' : 'chip--amber'}`}>
                {visionWarm ? '识别在线' : '识别预热中'}
              </span>
            </div>
          </div>
        </div>

        <div className="battle-bottom-right">
          <div className={`lock-panel lock-panel--${lock.state}`}>
            <IconCrosshair />
            <div>
              <strong>
                {lock.state === 'none' ? '未锁定目标' : lockText}
                {lockedTeamLabel && lock.team && (
                  <span className={`lock-team lock-team--${lock.team}`}>
                    {lockedTeamLabel}
                  </span>
                )}
              </strong>
              <span>
                {lock.state === 'enemy'
                  ? `置信度 ${Math.round((lock.confidence ?? 0) * 100)}% · ${
                      lock.source === 'combined'
                        ? '人脸+衣着'
                        : lock.source === 'face'
                          ? '人脸'
                          : '衣着'
                    }`
                  : lock.state === 'teammate'
                    ? '准心覆盖的是队友，射击不会造成伤害'
                    : lock.state === 'unknown'
                      ? '无法确认身份，本次射击按未命中处理'
                      : '把准心对准已建档的玩家'}
              </span>
            </div>
          </div>
          <div className="fire-hint">
            <span>空格 / 鼠标左键</span>
            <strong>开火</strong>
          </div>
        </div>

        <div className={`crosshair crosshair--${lock.state}`} aria-hidden="true">
          <span className="crosshair__dot" />
          <span className="crosshair__line crosshair__line--top" />
          <span className="crosshair__line crosshair__line--right" />
          <span className="crosshair__line crosshair__line--bottom" />
          <span className="crosshair__line crosshair__line--left" />
        </div>

        {lock.state !== 'none' && (
          <div className={`lock-label ${lockLabelClass}`}>
            {lockText}
            {lockedTeamLabel && lock.team && (
              <span className={`lock-team lock-team--${lock.team}`}>
                {lockedTeamLabel}
              </span>
            )}
          </div>
        )}

        {hitMarker > 0 && (
          <div className="hit-marker" key={hitMarker} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        )}

        {feedback && (
          <div className={`shot-feedback shot-feedback--${feedback.tone}`}>
            {feedback.text}
          </div>
        )}

        {room.phase === 'countdown' && (
          <div className="countdown-overlay">
            <div className="countdown-number">
              {Math.max(1, Math.ceil(countdownMs / 1000))}
            </div>
            <p>准备交战</p>
            <span>倒计时结束后才能开火</span>
          </div>
        )}

        {isDead && (
          <div className="death-overlay">
            <div className="death-mark">×</div>
            <h2>阵亡</h2>
            <p>{Math.max(1, Math.ceil(respawnMs / 1000))} 秒后复活</p>
            <span>复活后 2 秒内免疫伤害</span>
          </div>
        )}

        {cameraStatus === 'starting' && (
          <div className="camera-overlay">
            <IconCrosshair />
            <h2>正在打开摄像头…</h2>
            <p>请允许应用访问摄像头</p>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="camera-overlay camera-overlay--error">
            <IconAlert />
            <h2>摄像头不可用</h2>
            <p>{cameraError ?? '请检查摄像头权限和设备连接'}</p>
            <div className="camera-overlay__actions">
              <button
                className="secondary-button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => void startCamera(settings.cameraDeviceId)}
              >
                重试
              </button>
              <button
                className="ghost-button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={requestLeave}
              >
                离开本局
              </button>
            </div>
          </div>
        )}

        {sceneError && (
          <div className="scene-warning">
            <IconAlert />
            <span>{sceneError}</span>
          </div>
        )}

        {settings.fieldTestLog && (
          <div
            className="field-test-panel"
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          >
            <div className="field-test-panel__head">
              <span>FIELD TEST</span>
              <strong>{fieldSessionId ?? '记录中'}</strong>
            </div>
            <div className="field-test-row">
              <span>距离</span>
              {[3, 6, 10].map((distance) => (
                <button
                  key={distance}
                  type="button"
                  className={fieldBlock.distanceM === distance ? 'is-active' : ''}
                  onClick={() => updateFieldBlock({ distanceM: distance })}
                >
                  {distance}m
                </button>
              ))}
            </div>
            <div className="field-test-row">
              <span>朝向</span>
              <button
                type="button"
                className={fieldBlock.orientation === 'front' ? 'is-active' : ''}
                onClick={() => updateFieldBlock({ orientation: 'front' })}
              >
                正面
              </button>
              <button
                type="button"
                className={fieldBlock.orientation === 'back' ? 'is-active' : ''}
                onClick={() => updateFieldBlock({ orientation: 'back' })}
              >
                背面
              </button>
            </div>
            <div className="field-test-row">
              <span>光照</span>
              <button
                type="button"
                className={fieldBlock.lighting === 'normal' ? 'is-active' : ''}
                onClick={() => updateFieldBlock({ lighting: 'normal' })}
              >
                正常
              </button>
              <button
                type="button"
                className={fieldBlock.lighting === 'dim' ? 'is-active' : ''}
                onClick={() => updateFieldBlock({ lighting: 'dim' })}
              >
                偏暗
              </button>
              <button
                type="button"
                className={fieldBlock.lighting === 'backlit' ? 'is-active' : ''}
                onClick={() => updateFieldBlock({ lighting: 'backlit' })}
              >
                逆光
              </button>
            </div>
            <div className="field-test-row field-test-row--targets">
              <span>意图</span>
              {fieldCandidates.map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  className={intendedId === player.id ? 'is-active' : ''}
                  onClick={() => chooseIntended(player.id)}
                >
                  {index + 1} {player.name}
                </button>
              ))}
              <button
                type="button"
                className={intendedId === null ? 'is-active' : ''}
                onClick={() => chooseIntended(null)}
              >
                清除
              </button>
            </div>
            <div className="field-test-panel__hint">
              {intendedPlayer
                ? `意图：${intendedPlayer.name} · 数字键 1-${fieldCandidates.length}`
                : '未标注意图：该枪不计入正确率'}
            </div>
            {lastFieldOutcome && (
              <div
                className={`field-test-last field-test-last--${lastFieldOutcome.outcome.toLowerCase()}`}
              >
                #{lastFieldOutcome.shotSeq} {lastFieldOutcome.outcome}
                {lastFieldOutcome.intendedName
                  ? ` · 意图 ${lastFieldOutcome.intendedName}`
                  : ''}
                {lastFieldOutcome.recognizedName
                  ? ` · 识别 ${lastFieldOutcome.recognizedName}`
                  : ''}
              </div>
            )}
          </div>
        )}

        {settings.showDebug && (
          <div className="debug-panel">
            <div>
              <span>PHASE</span>
              <strong>{room.phase}</strong>
            </div>
            <div>
              <span>SERVER</span>
              <strong>{room.serverNow}</strong>
            </div>
            <div>
              <span>CD END</span>
              <strong>{room.countdownEndsAt ?? '—'}</strong>
            </div>
            <div>
              <span>EST NOW</span>
              <strong>{Math.round(serverNow)}</strong>
            </div>
            <div>
              <span>CD MS</span>
              <strong>{Math.round(countdownMs)}</strong>
            </div>
            <div>
              <span>DETECT</span>
              <strong>{debugInfo ? `${debugInfo.ms.toFixed(0)} ms` : '—'}</strong>
            </div>
            <div>
              <span>BODIES</span>
              <strong>{debugInfo?.bodyCount ?? 0}</strong>
            </div>
            <div>
              <span>FACE</span>
              <strong>
                {debugInfo?.faceScore !== null && debugInfo?.faceScore !== undefined
                  ? debugInfo.faceScore.toFixed(2)
                  : '—'}
              </strong>
            </div>
            <div>
              <span>CLOTH</span>
              <strong>{debugInfo?.clothingScore.toFixed(2) ?? '—'}</strong>
            </div>
            <div>
              <span>SOURCE</span>
              <strong>{debugInfo?.source ?? '—'}</strong>
            </div>
            <div>
              <span>CANVAS</span>
              <strong>
                {debugInfo ? `${debugInfo.canvasWidth}×${debugInfo.canvasHeight}` : '—'}
              </strong>
            </div>
            <div>
              <span>CAMERA</span>
              <strong>{resolution ? `${resolution.width}×${resolution.height}` : '—'}</strong>
            </div>
          </div>
        )}

        <div className="battle-team-hint">
          <IconShield />
          <span>
            识别到敌人才能扣血；不确定时按未命中处理。队友不会受到伤害。
          </span>
        </div>
      </div>
    </div>
  )
}
