import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { networkInterfaces } from 'node:os'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  COUNTDOWN_MS,
  DAMAGE_PER_HIT,
  DEFAULT_PORT,
  DEFAULT_ROOM_SETTINGS,
  DURATION_MAX,
  DURATION_MIN,
  INVULNERABLE_MS,
  KILL_LIMIT_MAX,
  KILL_LIMIT_MIN,
  MAX_HP,
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  PORT_ATTEMPTS,
  RESPAWN_MS,
  type AppearanceData,
  type ClientMessage,
  type GalleryEntry,
  type HostInfo,
  type KillFeedEntry,
  type MatchResult,
  type MatchScore,
  type PlayerPublic,
  type RoomPublicState,
  type RoomSettings,
  type ServerMessage,
  type Team,
  type MatchPhase
} from '../shared/types'

const FIRE_COOLDOWN_MS = 120
const KILL_FEED_SIZE = 6

interface InternalPlayer {
  id: string
  name: string
  team: Team | null
  ready: boolean
  connected: boolean
  appearance: AppearanceData | null
  socket: WebSocket | null
  joinedAt: number
  hp: number
  alive: boolean
  kills: number
  deaths: number
  shots: number
  hits: number
  respawnAt: number | null
  invulnerableUntil: number | null
  lastShotAt: number
}

function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return '玩家'
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 16)
  return cleaned || '玩家'
}

function isFiniteNumberArray(value: unknown, maxLength: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function sanitizeAppearance(value: unknown): AppearanceData | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AppearanceData>
  if (candidate.version !== 1) return null
  if (!Array.isArray(candidate.faceEmbeddings) || !Array.isArray(candidate.clothing)) return null
  if (candidate.faceEmbeddings.length > 16 || candidate.clothing.length > 12) return null

  const faceEmbeddings: number[][] = []
  for (const embedding of candidate.faceEmbeddings) {
    if (!isFiniteNumberArray(embedding, 4096) || embedding.length < 32) return null
    faceEmbeddings.push(embedding.map((n) => Number(n.toFixed(5))))
  }

  const clothing: AppearanceData['clothing'] = []
  for (const descriptor of candidate.clothing) {
    if (!descriptor || typeof descriptor !== 'object') return null
    if (
      descriptor.version !== 1 ||
      typeof descriptor.aspect !== 'number' ||
      !Number.isFinite(descriptor.aspect) ||
      !isFiniteNumberArray(descriptor.histogram, 512) ||
      !isFiniteNumberArray(descriptor.grid, 64)
    ) {
      return null
    }
    clothing.push({
      version: 1,
      view: descriptor.view ?? 'other',
      histogram: descriptor.histogram.map((n) => Number(n.toFixed(5))),
      grid: descriptor.grid.map((n) => Number(n.toFixed(5))),
      aspect: Number(descriptor.aspect.toFixed(4)),
      capturedAt: Number(descriptor.capturedAt) || Date.now()
    })
  }

  return {
    version: 1,
    faceEmbeddings,
    clothing,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now()
    // Deliberately no thumbnail: photos stay on the player's own laptop.
  }
}

function sanitizeSettings(value: unknown): RoomSettings | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RoomSettings>
  if (typeof candidate.durationMin !== 'number' || typeof candidate.killLimit !== 'number') {
    return null
  }
  return {
    durationMin: Math.round(Math.min(DURATION_MAX, Math.max(DURATION_MIN, candidate.durationMin))),
    killLimit: Math.round(Math.min(KILL_LIMIT_MAX, Math.max(KILL_LIMIT_MIN, candidate.killLimit)))
  }
}

function getLanIps(): string[] {
  const result: string[] = []
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address)
    }
  }
  const rank = (ip: string): number => {
    if (ip.startsWith('192.168.')) return 0
    if (ip.startsWith('10.')) return 1
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
    return 3
  }
  return result.sort((a, b) => rank(a) - rank(b))
}

function makeRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/**
 * Authoritative room and match server. It runs inside the host's Electron main
 * process. The host's own renderer connects to 127.0.0.1 like any other client.
 */
export class LanServer {
  private wss: WebSocketServer | null = null
  private port: number | null = null
  private roomCode = ''
  private hostToken = ''
  private hostId = ''
  private players = new Map<string, InternalPlayer>()
  private settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS }
  private phase: MatchPhase = 'lobby'
  private score: MatchScore = { red: 0, blue: 0 }
  private matchStartedAt: number | null = null
  private matchEndsAt: number | null = null
  private countdownEndsAt: number | null = null
  private killFeed: KillFeedEntry[] = []
  private result: MatchResult | null = null
  private tickTimer: NodeJS.Timeout | null = null
  private lastRoomBroadcast = 0
  private slowClients = new Map<WebSocket, { count: number; lastCheck: number }>()

  isRunning(): boolean {
    return this.wss !== null
  }

  getInfo(): HostInfo | null {
    if (!this.wss || this.port === null) return null
    return {
      port: this.port,
      roomCode: this.roomCode,
      lanIps: getLanIps(),
      hostToken: this.hostToken
    }
  }

  /**
   * Test-only hook used by the Electron smoke test to finish a match without
   * waiting for the real timer. It is never exposed to renderers unless the
   * main process was started with SNAPFIRE_TEST=1.
   */
  endMatchForTest(): void {
    this.endMatch()
  }

  async start(startPort = DEFAULT_PORT): Promise<HostInfo> {
    if (this.wss && this.port !== null) {
      const existing = this.getInfo()
      if (existing) return existing
    }
    this.resetRoom()
    const wss = await this.listenOnFreePort(startPort)
    this.wss = wss
    this.hostToken = randomBytes(16).toString('hex')
    this.roomCode = makeRoomCode()
    this.tickTimer = setInterval(() => this.tick(), 100)
    this.lastRoomBroadcast = 0

    wss.on('connection', (socket) => {
      socket.on('message', (raw) => this.handleRaw(socket, raw))
      socket.on('close', () => this.handleClose(socket))
      socket.on('error', (error) => {
        console.warn('[lan] socket error', error)
      })
    })
    wss.on('error', (error) => {
      console.error('[lan] server error', error)
    })

    console.log(`[lan] SnapFire room ${this.roomCode} listening on 0.0.0.0:${this.port}`)
    return this.getInfo() as HostInfo
  }

  async stop(): Promise<void> {
    this.slowClients.clear()
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    const wss = this.wss
    this.wss = null
    if (wss) {
      for (const client of wss.clients) {
        try {
          client.close(1001, 'room closed')
        } catch {
          // ignore
        }
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve())
      })
    }
    this.port = null
    this.resetRoom()
    console.log('[lan] server stopped')
  }

  private async listenOnFreePort(startPort: number): Promise<WebSocketServer> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
      const port = startPort + attempt
      try {
        const wss = await new Promise<WebSocketServer>((resolve, reject) => {
          const server = new WebSocketServer({
            host: '0.0.0.0',
            port,
            maxPayload: 2 * 1024 * 1024
          })
          const onError = (error: unknown) => {
            server.removeListener('listening', onListening)
            reject(error)
          }
          const onListening = () => {
            server.removeListener('error', onError)
            resolve(server)
          }
          server.once('error', onError)
          server.once('listening', onListening)
        })
        this.port = port
        return wss
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(
      `无法在 ${startPort}~${startPort + PORT_ATTEMPTS - 1} 端口启动房间服务：${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    )
  }

  private resetRoom(): void {
    this.hostId = ''
    this.players.clear()
    this.settings = { ...DEFAULT_ROOM_SETTINGS }
    this.phase = 'lobby'
    this.score = { red: 0, blue: 0 }
    this.matchStartedAt = null
    this.matchEndsAt = null
    this.countdownEndsAt = null
    this.killFeed = []
    this.result = null
    this.lastRoomBroadcast = 0
  }

  private handleRaw(socket: WebSocket, raw: RawData): void {
    let message: ClientMessage
    try {
      message = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      this.sendError(socket, '消息格式错误')
      return
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      this.sendError(socket, '消息格式错误')
      return
    }

    if (message.type === 'ping') {
      this.send(socket, { type: 'pong', t: message.t })
      return
    }

    const player = this.findBySocket(socket)
    if (!player) {
      if (message.type === 'join') {
        this.handleJoin(socket, message)
      } else {
        this.sendError(socket, '请先加入房间')
      }
      return
    }

    switch (message.type) {
      case 'join':
        this.sendError(socket, '已经在房间中')
        break
      case 'set-name':
        if (this.phase !== 'lobby') {
          this.sendError(socket, '比赛开始后不能修改昵称')
          break
        }
        player.name = sanitizeName(message.name)
        this.broadcastRoom()
        this.broadcastGallery()
        break
      case 'set-team':
        this.handleSetTeam(socket, player, message.team)
        break
      case 'set-ready':
        if (this.phase !== 'lobby') {
          this.sendError(socket, '比赛开始后不能修改准备状态')
          break
        }
        player.ready = Boolean(message.ready)
        this.broadcastRoom()
        break
      case 'set-appearance': {
        const appearance = sanitizeAppearance(message.appearance)
        if (!appearance) {
          this.sendError(socket, '建档数据无效，请重新采集')
          break
        }
        player.appearance = appearance
        player.ready = false
        this.broadcastRoom()
        this.broadcastGallery()
        break
      }
      case 'update-settings':
        this.handleUpdateSettings(socket, player, message.settings)
        break
      case 'start-match':
        this.handleStartMatch(socket, player)
        break
      case 'shot':
        this.handleShot(socket, player, message.targetId)
        break
      case 'return-lobby':
        this.handleReturnLobby(socket, player)
        break
      case 'leave':
        this.handleClose(socket)
        try {
          socket.close(1000, 'left room')
        } catch {
          // ignore
        }
        break
      default:
        this.sendError(socket, '未知消息类型')
        break
    }
  }

  private handleJoin(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: 'join' }>
  ): void {
    if (!this.wss) {
      this.sendError(socket, '房间服务未启动')
      return
    }
    if (typeof message.roomCode !== 'string' || message.roomCode.trim() !== this.roomCode) {
      this.sendError(socket, '房间号不正确')
      socket.close(4001, 'bad room code')
      return
    }
    if (typeof message.playerId !== 'string' || message.playerId.length < 8) {
      this.sendError(socket, '玩家标识无效')
      socket.close(4002, 'bad player id')
      return
    }

    const isHostJoin = typeof message.hostToken === 'string' && message.hostToken === this.hostToken
    let player = this.players.get(message.playerId)
    if (player) {
      if (player.socket && player.socket !== socket && player.socket.readyState === WebSocket.OPEN) {
        try {
          player.socket.close(4000, 'replaced by a new connection')
        } catch {
          // ignore
        }
      }
      player.socket = socket
      player.connected = true
      player.name = sanitizeName(message.name)
    } else {
      if (this.phase !== 'lobby') {
        this.sendError(socket, '比赛已经开始，无法加入')
        socket.close(4003, 'match already started')
        return
      }
      if (this.players.size >= MAX_PLAYERS) {
        this.sendError(socket, `房间已满（最多 ${MAX_PLAYERS} 人）`)
        socket.close(4004, 'room full')
        return
      }
      player = {
        id: message.playerId,
        name: sanitizeName(message.name),
        team: null,
        ready: false,
        connected: true,
        appearance: null,
        socket,
        joinedAt: Date.now(),
        hp: MAX_HP,
        alive: true,
        kills: 0,
        deaths: 0,
        shots: 0,
        hits: 0,
        respawnAt: null,
        invulnerableUntil: null,
        lastShotAt: 0
      }
      this.players.set(player.id, player)
    }

    if (isHostJoin) {
      this.hostId = player.id
      player.ready = true
    }

    this.send(socket, {
      type: 'welcome',
      selfId: player.id,
      isHost: player.id === this.hostId,
      room: this.roomState(),
      gallery: this.gallery()
    })
    this.broadcastRoom()
    this.broadcastGallery()
  }

  private handleSetTeam(
    socket: WebSocket,
    player: InternalPlayer,
    team: Team
  ): void {
    if (this.phase !== 'lobby') {
      this.sendError(socket, '比赛开始后不能更换队伍')
      return
    }
    if (team !== 'red' && team !== 'blue') {
      this.sendError(socket, '队伍无效')
      return
    }
    if (player.team === team) return
    const count = [...this.players.values()].filter(
      (candidate) => candidate.id !== player.id && candidate.team === team
    ).length
    if (count >= MAX_TEAM_SIZE) {
      this.sendError(socket, `该队伍已满（最多 ${MAX_TEAM_SIZE} 人）`)
      return
    }
    player.team = team
    player.ready = false
    this.broadcastRoom()
    this.broadcastGallery()
  }

  private handleUpdateSettings(
    socket: WebSocket,
    player: InternalPlayer,
    settings: RoomSettings
  ): void {
    if (player.id !== this.hostId) {
      this.sendError(socket, '只有房主可以修改比赛设置')
      return
    }
    if (this.phase !== 'lobby') {
      this.sendError(socket, '比赛开始后不能修改设置')
      return
    }
    const clean = sanitizeSettings(settings)
    if (!clean) {
      this.sendError(socket, '比赛设置无效')
      return
    }
    this.settings = clean
    this.broadcastRoom()
  }

  private handleStartMatch(socket: WebSocket, player: InternalPlayer): void {
    if (player.id !== this.hostId) {
      this.sendError(socket, '只有房主可以开始比赛')
      return
    }
    if (this.phase !== 'lobby') {
      this.sendError(socket, '比赛已经在进行中')
      return
    }
    const connected = [...this.players.values()].filter((candidate) => candidate.connected)
    if (connected.length < 2) {
      this.sendError(socket, '至少需要 2 名玩家才能开始')
      return
    }
    if (
      !connected.some((candidate) => candidate.team === 'red') ||
      !connected.some((candidate) => candidate.team === 'blue')
    ) {
      this.sendError(socket, '红队和蓝队都至少需要 1 名玩家')
      return
    }
    if (connected.some((candidate) => !candidate.team)) {
      this.sendError(socket, '还有玩家没有选择队伍')
      return
    }
    if (connected.some((candidate) => !candidate.appearance)) {
      this.sendError(socket, '还有玩家未完成人脸与衣着建档')
      return
    }
    if (connected.some((candidate) => candidate.id !== this.hostId && !candidate.ready)) {
      this.sendError(socket, '还有玩家没有准备')
      return
    }

    const now = Date.now()
    this.phase = 'countdown'
    this.score = { red: 0, blue: 0 }
    this.killFeed = []
    this.result = null
    this.countdownEndsAt = now + COUNTDOWN_MS
    this.matchStartedAt = null
    this.matchEndsAt = null
    for (const candidate of connected) {
      candidate.hp = MAX_HP
      candidate.alive = true
      candidate.kills = 0
      candidate.deaths = 0
      candidate.shots = 0
      candidate.hits = 0
      candidate.respawnAt = null
      candidate.invulnerableUntil = null
      candidate.lastShotAt = 0
    }
    this.broadcast({ type: 'match-start', room: this.roomState() })
    this.broadcastRoom()
  }

  private handleShot(socket: WebSocket, shooter: InternalPlayer, targetId: string | null): void {
    if (this.phase !== 'playing') {
      this.send(socket, { type: 'shot-result', hit: false, reason: 'not-playing' })
      return
    }
    if (!shooter.alive || !shooter.connected) {
      this.send(socket, { type: 'shot-result', hit: false, reason: 'dead' })
      return
    }
    const now = Date.now()
    if (now - shooter.lastShotAt < FIRE_COOLDOWN_MS) {
      // Duplicate key presses or an over-eager client. Reply so the
      // client does not wait for a 5-second timeout.
      this.send(socket, { type: 'shot-result', hit: false, reason: 'cooldown' })
      return
    }
    shooter.lastShotAt = now
    shooter.shots += 1

    if (!targetId || typeof targetId !== 'string') {
      this.send(socket, { type: 'shot-result', hit: false, reason: 'no-target' })
      this.broadcastRoom()
      return
    }
    if (targetId === shooter.id) {
      this.send(socket, { type: 'shot-result', hit: false, reason: 'invalid-target' })
      this.broadcastRoom()
      return
    }
    const target = this.players.get(targetId)
    if (!target) {
      this.send(socket, { type: 'shot-result', hit: false, reason: 'invalid-target' })
      this.broadcastRoom()
      return
    }
    if (!target.team || !shooter.team || target.team === shooter.team) {
      this.send(socket, { type: 'shot-result', hit: false, targetId, reason: 'friendly' })
      this.broadcastRoom()
      return
    }
    if (!target.alive || !target.connected) {
      this.send(socket, { type: 'shot-result', hit: false, targetId, reason: 'target-dead' })
      this.broadcastRoom()
      return
    }
    if (target.invulnerableUntil && now < target.invulnerableUntil) {
      this.send(socket, { type: 'shot-result', hit: false, targetId, reason: 'invulnerable' })
      this.broadcastRoom()
      return
    }

    shooter.hits += 1
    target.hp = Math.max(0, target.hp - DAMAGE_PER_HIT)
    const killed = target.hp <= 0
    if (killed) {
      target.alive = false
      target.deaths += 1
      target.respawnAt = now + RESPAWN_MS
      target.invulnerableUntil = null
      shooter.kills += 1
      this.score[shooter.team] += 1
      const entry: KillFeedEntry = {
        id: randomUUID(),
        killerId: shooter.id,
        killerName: shooter.name,
        killerTeam: shooter.team,
        victimId: target.id,
        victimName: target.name,
        victimTeam: target.team,
        at: now
      }
      this.killFeed = [entry, ...this.killFeed].slice(0, KILL_FEED_SIZE)
    }

    this.send(socket, {
      type: 'shot-result',
      hit: true,
      targetId,
      hp: target.hp,
      killed
    })
    this.broadcast({
      type: 'damage',
      shooterId: shooter.id,
      targetId,
      amount: DAMAGE_PER_HIT,
      hp: target.hp,
      killed
    })
    this.broadcastRoom()

    if (killed && this.score[shooter.team] >= this.settings.killLimit) {
      this.endMatch()
    }
  }

  private handleReturnLobby(socket: WebSocket, player: InternalPlayer): void {
    if (player.id !== this.hostId) {
      this.sendError(socket, '只有房主可以返回房间')
      return
    }
    if (this.phase !== 'ended') {
      this.sendError(socket, '比赛还没有结束')
      return
    }
    for (const [id, candidate] of this.players) {
      if (!candidate.connected) this.players.delete(id)
    }
    this.phase = 'lobby'
    this.score = { red: 0, blue: 0 }
    this.killFeed = []
    this.result = null
    this.matchStartedAt = null
    this.matchEndsAt = null
    this.countdownEndsAt = null
    for (const candidate of this.players.values()) {
      candidate.hp = MAX_HP
      candidate.alive = true
      candidate.kills = 0
      candidate.deaths = 0
      candidate.shots = 0
      candidate.hits = 0
      candidate.respawnAt = null
      candidate.invulnerableUntil = null
      candidate.ready = candidate.id === this.hostId
    }
    this.broadcastRoom()
    this.broadcastGallery()
  }

  private handleClose(socket: WebSocket): void {
    this.slowClients.delete(socket)
    const player = this.findBySocket(socket)
    if (!player) return
    player.connected = false
    player.socket = null
    player.ready = false

    // The host owns the room. If the host's client goes away, the room can no
    // longer be managed, so close it for everyone.
    if (player.id === this.hostId) {
      this.broadcast({ type: 'error', message: '房主已离开房间，房间已关闭' })
      setTimeout(() => {
        void this.stop()
      }, 80)
      return
    }

    if (this.phase === 'lobby') {
      this.players.delete(player.id)
    } else if (this.phase === 'countdown' || this.phase === 'playing') {
      player.alive = false
      player.respawnAt = null
    }
    this.broadcastRoom()
    this.broadcastGallery()
  }

  private findBySocket(socket: WebSocket): InternalPlayer | null {
    for (const player of this.players.values()) {
      if (player.socket === socket) return player
    }
    return null
  }

  private tick(): void {
    const now = Date.now()
    if (this.phase === 'countdown') {
      if (this.countdownEndsAt && now >= this.countdownEndsAt) {
        this.phase = 'playing'
        this.matchStartedAt = now
        this.matchEndsAt = now + this.settings.durationMin * 60_000
        this.countdownEndsAt = null
        this.broadcastRoom()
      } else if (now - this.lastRoomBroadcast >= 500) {
        this.broadcastRoom()
      }
      return
    }

    if (this.phase === 'playing') {
      let changed = false
      for (const player of this.players.values()) {
        if (!player.alive && player.respawnAt !== null && now >= player.respawnAt) {
          player.hp = MAX_HP
          player.alive = true
          player.respawnAt = null
          player.invulnerableUntil = now + INVULNERABLE_MS
          this.broadcast({ type: 'respawn', playerId: player.id })
          changed = true
        }
      }
      if (this.matchEndsAt && now >= this.matchEndsAt) {
        this.endMatch()
        return
      }
      if (changed || now - this.lastRoomBroadcast >= 500) {
        this.broadcastRoom()
      }
    }
  }

  private endMatch(): void {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    const now = Date.now()
    const winner: MatchResult['winner'] =
      this.score.red > this.score.blue
        ? 'red'
        : this.score.blue > this.score.red
          ? 'blue'
          : 'draw'
    const result: MatchResult = {
      matchId: randomUUID(),
      mode: 'urban',
      startedAt: this.matchStartedAt ?? now,
      endedAt: now,
      durationMin: this.settings.durationMin,
      killLimit: this.settings.killLimit,
      winner,
      score: { ...this.score },
      players: [...this.players.values()]
        .filter((player) => player.team !== null)
        .map((player) => ({
          id: player.id,
          name: player.name,
          team: player.team as Team,
          kills: player.kills,
          deaths: player.deaths,
          shots: player.shots,
          hits: player.hits,
          accuracy: player.shots > 0 ? Number((player.hits / player.shots).toFixed(3)) : 0
        }))
    }
    this.phase = 'ended'
    this.matchEndsAt = now
    this.countdownEndsAt = null
    this.result = result
    this.broadcast({ type: 'match-end', result })
    this.broadcastRoom()
  }

  private roomState(): RoomPublicState {
    const now = Date.now()
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      players: this.sortedPlayers().map((player) => this.publicPlayer(player)),
      settings: { ...this.settings },
      score: { ...this.score },
      matchStartedAt: this.matchStartedAt,
      matchEndsAt: this.matchEndsAt,
      remainingMs: this.matchEndsAt !== null ? Math.max(0, this.matchEndsAt - now) : null,
      countdownEndsAt: this.countdownEndsAt,
      serverNow: now,
      killFeed: this.killFeed.map((entry) => ({ ...entry })),
      result: this.result
    }
  }

  private sortedPlayers(): InternalPlayer[] {
    const teamRank = (team: Team | null): number =>
      team === 'red' ? 0 : team === 'blue' ? 1 : 2
    return [...this.players.values()].sort((a, b) => {
      if (a.id === this.hostId) return -1
      if (b.id === this.hostId) return 1
      const rankDiff = teamRank(a.team) - teamRank(b.team)
      if (rankDiff !== 0) return rankDiff
      return a.joinedAt - b.joinedAt
    })
  }

  private publicPlayer(player: InternalPlayer): PlayerPublic {
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      ready: player.ready,
      connected: player.connected,
      appearanceReady: player.appearance !== null,
      isHost: player.id === this.hostId,
      hp: player.hp,
      alive: player.alive,
      kills: player.kills,
      deaths: player.deaths,
      shots: player.shots,
      hits: player.hits,
      respawnAt: player.respawnAt,
      invulnerableUntil: player.invulnerableUntil
    }
  }

  private gallery(): GalleryEntry[] {
    return [...this.players.values()]
      .filter((player) => player.appearance !== null)
      .map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        appearance: player.appearance as AppearanceData
      }))
  }

  private broadcastRoom(): void {
    // During active play, `tick()` broadcasts every 500 ms, so per-shot
    // `broadcastRoom()` calls would be redundant.  Skip them to avoid
    // unnecessary JSON serialization and WebSocket sends.
    // During lobby / countdown, always broadcast immediately so state
    // changes (team, ready, appearance) are visible without delay.
    if (this.phase === 'playing' && Date.now() - this.lastRoomBroadcast < 500) return
    this.lastRoomBroadcast = Date.now()
    this.broadcast({ type: 'room', room: this.roomState() })
  }

  private broadcastGallery(): void {
    this.broadcast({ type: 'gallery', gallery: this.gallery() })
  }

  private broadcast(message: ServerMessage): void {
    if (!this.wss) return
    const payload = JSON.stringify(message)
    for (const client of this.wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue
      // If a client's send buffer is backing up, skip broadcasting this
      // message to it rather than blocking the entire event loop.
      if (client.bufferedAmount > 512 * 1024) {
        // Buffer > 512 KB: client is too slow. Skip this message and
        // schedule a disconnect after repeated skips.
        this.handleSlowClient(client)
        continue
      }
      try {
        client.send(payload)
      } catch {
        // ignore individual send failures
      }
    }
  }

  /**
   * Track clients whose send buffers are backing up. After 3 consecutive
   * skips (≈1.5 s at 500 ms tick rate), close the connection so the
   * client stops accumulating data and the server can move on.
   */
  private handleSlowClient(socket: WebSocket): void {
    const now = Date.now()
    const entry = this.slowClients.get(socket)
    if (!entry || now - entry.lastCheck > 1000) {
      // Reset counter if more than 1 s has passed since last check.
      this.slowClients.set(socket, { count: 1, lastCheck: now })
      return
    }
    entry.count += 1
    entry.lastCheck = now
    if (entry.count >= 3) {
      console.warn('[lan] client buffer backlog too high, disconnecting')
      this.slowClients.delete(socket)
      try {
        socket.close(1013, 'try again later')
      } catch {
        // ignore
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // ignore
    }
  }

  private sendError(socket: WebSocket, message: string): void {
    this.send(socket, { type: 'error', message })
  }
}
