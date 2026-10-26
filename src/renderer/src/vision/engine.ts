import type { BodyResult, FaceResult } from '@vladmandic/human'
import type {
  ClothingDescriptor,
  DetectionQuality,
  GalleryEntry
} from '@shared/types'
import { detectWithHuman, getHuman } from './human'
import {
  extractClothingDescriptor,
  matchIdentity,
  type IdentityMatch
} from './descriptors'

export interface VisionFrameResult {
  at: number
  target: BodyResult | null
  face: FaceResult | null
  clothing: ClothingDescriptor | null
  match: IdentityMatch | null
  bodyCount: number
  durationMs: number
  canvasWidth: number
  canvasHeight: number
}

type ResultListener = (result: VisionFrameResult) => void

const QUALITY_PRESETS: Record<
  DetectionQuality,
  { intervalMs: number; cropScale: number; maxWidth: number }
> = {
  performance: { intervalMs: 340, cropScale: 0.54, maxWidth: 720 },
  balanced: { intervalMs: 200, cropScale: 0.62, maxWidth: 960 },
  accurate: { intervalMs: 130, cropScale: 0.7, maxWidth: 1280 }
}

/**
 * Continuously analyses a centre crop of the camera feed. The crop is where
 * the crosshair lives, so one-person pose detection is enough even when other
 * players are visible at the edge of the screen.
 */
export class VisionEngine {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private listeners = new Set<ResultListener>()
  private gallery: GalleryEntry[] = []
  private selfId = ''
  private quality: DetectionQuality = 'balanced'
  private intervalMs = QUALITY_PRESETS.balanced.intervalMs
  private cropScale = QUALITY_PRESETS.balanced.cropScale
  private maxWidth = QUALITY_PRESETS.balanced.maxWidth
  private running = false
  private loopHandle: number | null = null
  private inFlight: Promise<VisionFrameResult | null> | null = null
  private lastResult: VisionFrameResult | null = null

  constructor() {
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('无法创建视觉分析画布')
    this.ctx = ctx
  }

  setSession(gallery: GalleryEntry[], selfId: string): void {
    this.gallery = gallery
    this.selfId = selfId
  }

  setQuality(quality: DetectionQuality): void {
    this.quality = quality
    const preset = QUALITY_PRESETS[quality]
    this.intervalMs = preset.intervalMs
    this.cropScale = preset.cropScale
    this.maxWidth = preset.maxWidth
  }

  onResult(listener: ResultListener): () => void {
    this.listeners.add(listener)
    if (this.lastResult) listener(this.lastResult)
    return () => this.listeners.delete(listener)
  }

  getLast(): VisionFrameResult | null {
    return this.lastResult
  }

  start(video: HTMLVideoElement): void {
    this.video = video
    if (this.running) return
    this.running = true
    void this.loop()
  }

  stop(): void {
    this.running = false
    this.video = null
    if (this.loopHandle !== null) {
      window.clearTimeout(this.loopHandle)
      this.loopHandle = null
    }
  }

  /**
   * Used when the player fires. Reuses a recent analysis if possible and
   * otherwise waits for a fresh one so the shot is judged on the current frame.
   * Automatic fire passes a wider window so the burst keeps its cadence while
   * the background loop keeps refreshing identities.
   */
  async analyzeNow(maxAgeMs = 100): Promise<VisionFrameResult | null> {
    if (
      this.lastResult &&
      Date.now() - this.lastResult.at < Math.max(0, maxAgeMs)
    ) {
      return this.lastResult
    }
    return this.perform()
  }

  private async loop(): Promise<void> {
    if (!this.running) return
    const started = performance.now()
    await this.perform()
    if (!this.running) return
    const elapsed = performance.now() - started
    const interval = document.hidden ? 1000 : this.intervalMs
    this.loopHandle = window.setTimeout(() => {
      void this.loop()
    }, Math.max(50, interval - elapsed))
  }

  private perform(): Promise<VisionFrameResult | null> {
    if (this.inFlight) return this.inFlight
    const promise = this.runOnce()
      .then((result) => {
        if (result) {
          this.lastResult = result
          for (const listener of this.listeners) {
            try {
              listener(result)
            } catch (error) {
              console.error('vision listener failed', error)
            }
          }
        }
        return result
      })
      .catch((error) => {
        console.warn('[vision] detection failed', error)
        return null
      })
      .finally(() => {
        this.inFlight = null
      })
    this.inFlight = promise
    return promise
  }

  private async runOnce(): Promise<VisionFrameResult | null> {
    const video = this.video
    if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null
    }
    const vw = video.videoWidth
    const vh = video.videoHeight
    const cropW = Math.round(vw * this.cropScale)
    const cropH = Math.round(vh * Math.min(0.82, this.cropScale + 0.18))
    const cropX = Math.max(0, Math.round((vw - cropW) / 2))
    const cropY = Math.max(0, Math.round((vh - cropH) / 2))
    const scale = Math.min(1, this.maxWidth / cropW)
    const canvasW = Math.max(1, Math.round(cropW * scale))
    const canvasH = Math.max(1, Math.round(cropH * scale))
    if (this.canvas.width !== canvasW) this.canvas.width = canvasW
    if (this.canvas.height !== canvasH) this.canvas.height = canvasH
    this.ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvasW, canvasH)

    const started = performance.now()
    const human = await getHuman()
    const result = await detectWithHuman(this.canvas)
    const durationMs = performance.now() - started

    const target = this.pickTarget(result.body)
    if (!target) {
      return {
        at: Date.now(),
        target: null,
        face: null,
        clothing: null,
        match: null,
        bodyCount: result.body.length,
        durationMs,
        canvasWidth: canvasW,
        canvasHeight: canvasH
      }
    }

    const face = this.pickFace(result.face, target, canvasW)
    const clothing = extractClothingDescriptor(
      this.canvas,
      canvasW,
      canvasH,
      target,
      'other'
    )
    const match =
      clothing && this.gallery.length > 0
        ? matchIdentity(
            face?.embedding ?? null,
            clothing,
            this.gallery,
            this.selfId,
            (a, b) => human.match.similarity(a, b)
          )
        : null

    return {
      at: Date.now(),
      target,
      face,
      clothing,
      match,
      bodyCount: result.body.length,
      durationMs,
      canvasWidth: canvasW,
      canvasHeight: canvasH
    }
  }

  private pickTarget(bodies: BodyResult[]): BodyResult | null {
    let best: { body: BodyResult; contains: boolean; distance: number } | null = null
    for (const body of bodies) {
      if (body.score < 0.18) continue
      const [bx, by, bw, bh] = body.boxRaw
      if (bw <= 0 || bh <= 0) continue
      const cx = bx + bw / 2
      const cy = by + bh / 2
      const contains =
        0.5 >= bx - 0.035 &&
        0.5 <= bx + bw + 0.035 &&
        0.5 >= by - 0.035 &&
        0.5 <= by + bh + 0.035
      const distance = Math.hypot(cx - 0.5, cy - 0.5)
      if (!contains && distance > 0.32) continue
      if (
        !best ||
        (contains && !best.contains) ||
        (contains === best.contains && distance < best.distance) ||
        (contains === best.contains &&
          Math.abs(distance - best.distance) < 0.02 &&
          body.score > best.body.score)
      ) {
        best = { body, contains, distance }
      }
    }
    return best?.body ?? null
  }

  private pickFace(faces: FaceResult[], body: BodyResult, canvasW: number): FaceResult | null {
    const [bx, by, bw, bh] = body.boxRaw
    const candidates = faces
      .filter((face) => Boolean(face.embedding))
      .filter((face) => face.boxRaw[2] * canvasW >= 24)
      .filter((face) => {
        const [fx, fy, fw, fh] = face.boxRaw
        const cx = fx + fw / 2
        const cy = fy + fh / 2
        return (
          cx >= bx - 0.12 &&
          cx <= bx + bw + 0.12 &&
          cy >= by - 0.12 &&
          cy <= by + bh + 0.12
        )
      })
      .sort((a, b) => b.boxScore - a.boxScore)
    return candidates[0] ?? null
  }
}
