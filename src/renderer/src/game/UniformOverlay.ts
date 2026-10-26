import type { Team } from '@shared/types'
import type { UniformPerson } from '../vision/overlayDetector'
import {
  computeCoverTransform,
  easeBox,
  mapNormalizedPoint,
  torsoQuadFromBox,
  type NormalizedBox
} from './uniformGeometry'
import { UNIFORM_ASSETS, type UniformAsset } from './uniformAssets'

interface Track {
  playerId: string
  team: Team
  box: NormalizedBox
  target: NormalizedBox
  lastSeen: number
  confidence: number
}

const TRACK_TIMEOUT_MS = 1500
const PATCH_WIDTH = 256
const PATCH_HEIGHT = 320

function createUniformPatch(
  image: HTMLImageElement,
  asset: UniformAsset
): HTMLCanvasElement {
  const patch = document.createElement('canvas')
  patch.width = PATCH_WIDTH
  patch.height = PATCH_HEIGHT
  const ctx = patch.getContext('2d')
  if (!ctx) return patch

  const { crop } = asset
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    PATCH_WIDTH,
    PATCH_HEIGHT
  )

  // Feather the patch edges so the photo's background does not appear as a
  // hard rectangle at the shoulder/hip boundary.
  const mask = document.createElement('canvas')
  mask.width = PATCH_WIDTH
  mask.height = PATCH_HEIGHT
  const maskCtx = mask.getContext('2d')
  if (maskCtx) {
    maskCtx.filter = 'blur(10px)'
    maskCtx.fillStyle = '#fff'
    maskCtx.fillRect(8, 8, PATCH_WIDTH - 16, PATCH_HEIGHT - 16)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mask, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  return patch
}

/**
 * Draws matched players' uniforms over the camera feed.
 *
 * This canvas is a separate DOM layer. The video element itself is untouched,
 * so VisionEngine still judges shots from the original pixels.
 */
export class UniformOverlay {
  private readonly ctx: CanvasRenderingContext2D
  private readonly patches: Partial<Record<Team, HTMLCanvasElement>> = {}
  private readonly tracks = new Map<string, Track>()
  private raf = 0
  private disposed = false
  private lastTime = 0
  private canvasWidth = 0
  private canvasHeight = 0
  private dpr = 1

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建换装画布')
    this.ctx = ctx
    this.loadPatch('red', UNIFORM_ASSETS.red)
    this.loadPatch('blue', UNIFORM_ASSETS.blue)
  }

  setPeople(people: UniformPerson[]): void {
    const now = performance.now()
    const seen = new Set<string>()
    for (const person of people) {
      seen.add(person.playerId)
      const existing = this.tracks.get(person.playerId)
      if (existing && existing.team === person.team) {
        existing.target = person.box
        existing.lastSeen = now
        existing.confidence = person.confidence
      } else {
        this.tracks.set(person.playerId, {
          playerId: person.playerId,
          team: person.team,
          box: person.box,
          target: person.box,
          lastSeen: now,
          confidence: person.confidence
        })
      }
    }

    for (const [id, track] of this.tracks) {
      if (!seen.has(id) && now - track.lastSeen > TRACK_TIMEOUT_MS) {
        this.tracks.delete(id)
      }
    }
  }

  start(): void {
    if (this.raf || this.disposed) return
    this.lastTime = performance.now()
    const tick = (now: number): void => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(tick)
      this.draw(now)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.tracks.clear()
    this.clear()
  }

  private loadPatch(team: Team, asset: UniformAsset): void {
    const image = new Image()
    image.decoding = 'async'
    image.onload = (): void => {
      if (!this.disposed) this.patches[team] = createUniformPatch(image, asset)
    }
    image.onerror = (): void => {
      console.warn('[overlay] failed to load uniform texture', asset.src)
    }
    image.src = asset.src
  }

  private clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvasWidth = Math.max(1, Math.round(rect.width))
    this.canvasHeight = Math.max(1, Math.round(rect.height))
    const pixelWidth = Math.round(this.canvasWidth * this.dpr)
    const pixelHeight = Math.round(this.canvasHeight * this.dpr)
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight
  }

  private draw(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000))
    this.lastTime = now
    const smoothing = 1 - Math.exp(-dt * 12)

    this.resize()
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
    if (this.canvasWidth <= 1 || this.canvasHeight <= 1) return

    const transform = computeCoverTransform(
      this.video.videoWidth,
      this.video.videoHeight,
      this.canvasWidth,
      this.canvasHeight
    )
    if (transform.width <= 0 || transform.height <= 0) return

    for (const [id, track] of this.tracks) {
      const age = now - track.lastSeen
      if (age > TRACK_TIMEOUT_MS) {
        this.tracks.delete(id)
        continue
      }
      track.box = easeBox(track.box, track.target, smoothing)

      const patch = this.patches[track.team]
      if (!patch) continue

      const quad = torsoQuadFromBox(track.box).map(([x, y]) =>
        mapNormalizedPoint(x, y, transform)
      )
      const xs = quad.map((point) => point[0])
      const ys = quad.map((point) => point[1])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const width = maxX - minX
      const height = maxY - minY
      if (width < 4 || height < 4) continue

      const fade =
        age > TRACK_TIMEOUT_MS * 0.6
          ? Math.max(0, 1 - (age - TRACK_TIMEOUT_MS * 0.6) / (TRACK_TIMEOUT_MS * 0.4))
          : 1

      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.moveTo(quad[0][0], quad[0][1])
      for (let index = 1; index < quad.length; index += 1) {
        this.ctx.lineTo(quad[index][0], quad[index][1])
      }
      this.ctx.closePath()
      this.ctx.clip()
      this.ctx.globalAlpha =
        Math.min(0.94, 0.55 + track.confidence * 0.4) * fade
      this.ctx.drawImage(patch, minX, minY, width, height)
      this.ctx.restore()
    }
  }
}
