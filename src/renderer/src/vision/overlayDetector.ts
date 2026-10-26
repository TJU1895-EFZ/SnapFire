import type { FaceResult, ObjectResult } from '@vladmandic/human'
import type { GalleryEntry, Team } from '@shared/types'
import {
  clampNormalizedBox,
  type NormalizedBox
} from '../game/uniformGeometry'
import {
  FACE_ONLY_OVERLAY_CONFIG,
  OVERLAY_DETECTION_CONFIG
} from './config'
import {
  extractClothingDescriptorFromBox,
  matchIdentity
} from './descriptors'
import { detectWithHuman, getHuman } from './human'
import {
  faceBoxToPersonBox,
  pickFaceForBox,
  refineTorsoBox
} from './overlayMatch'

export interface UniformPerson {
  playerId: string
  name: string
  team: Team
  /** Normalized box in the camera frame. */
  box: NormalizedBox
  confidence: number
}

export type UniformPeopleListener = (people: UniformPerson[]) => void

const MAX_WIDTH = 640
const MIN_PERSON_SCORE = 0.3
const MIN_BOX_SIZE = 0.03
const BASE_INTERVAL_MS = 700
const MAX_INTERVAL_MS = 1600

function faceInsideAnyBox(face: FaceResult, boxes: NormalizedBox[]): boolean {
  const [fx, fy, fw, fh] = face.boxRaw
  const cx = fx + fw / 2
  const cy = fy + fh / 2
  return boxes.some(([x, y, w, h]) => {
    return cx >= x && cx <= x + w && cy >= y && cy <= y + h
  })
}

/**
 * Detects every person in the full camera frame and matches each one to a
 * player in the room gallery. This is deliberately independent of the
 * crosshair-crop VisionEngine: it drives the visual uniform overlay only and
 * never feeds the shot judgement.
 */
export class OverlayDetector {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D
  private video: HTMLVideoElement | null = null
  private gallery: GalleryEntry[] = []
  private selfId = ''
  private listener: UniformPeopleListener | null = null
  private running = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private objectFailed = false

  constructor() {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('无法创建换装检测画布')
    this.ctx = ctx
  }

  setSession(gallery: GalleryEntry[], selfId: string): void {
    this.gallery = gallery
    this.selfId = selfId
  }

  onPeople(listener: UniformPeopleListener): () => void {
    this.listener = listener
    return () => {
      if (this.listener === listener) this.listener = null
    }
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
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async loop(): Promise<void> {
    if (!this.running) return
    if (document.hidden) {
      this.timer = setTimeout(() => void this.loop(), 1500)
      return
    }
    const started = performance.now()
    const people = await this.detect()
    if (people && this.running) this.listener?.(people)
    if (!this.running) return
    const elapsed = performance.now() - started
    const delay = Math.max(
      BASE_INTERVAL_MS,
      Math.min(MAX_INTERVAL_MS, elapsed * 1.5)
    )
    this.timer = setTimeout(() => void this.loop(), delay)
  }

  private async detect(): Promise<UniformPerson[] | null> {
    if (this.inFlight) return null
    const video = this.video
    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return null
    }

    this.inFlight = true
    try {
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (this.canvas.width !== width) this.canvas.width = width
      if (this.canvas.height !== height) this.canvas.height = height
      this.ctx.drawImage(video, 0, 0, width, height)

      let result
      try {
        result = await detectWithHuman(
          this.canvas,
          this.objectFailed
            ? FACE_ONLY_OVERLAY_CONFIG
            : OVERLAY_DETECTION_CONFIG
        )
      } catch (error) {
        if (this.objectFailed) throw error
        this.objectFailed = true
        console.warn(
          '[overlay] multi-person detector unavailable, falling back to faces',
          error
        )
        result = await detectWithHuman(this.canvas, FACE_ONLY_OVERLAY_CONFIG)
      }

      const boxes = this.collectBoxes(result.object, result.face)
      if (boxes.length === 0 || this.gallery.length === 0) return []

      const human = await getHuman()
      const best = new Map<string, UniformPerson>()
      for (const box of boxes) {
        const face = pickFaceForBox(result.face, box)
        const torsoBox = refineTorsoBox(box, face)
        const clothing = extractClothingDescriptorFromBox(
          this.canvas,
          width,
          height,
          torsoBox,
          'other'
        )
        if (!clothing) continue
        const match = matchIdentity(
          face?.embedding ?? null,
          clothing,
          this.gallery,
          this.selfId,
          (a, b) => human.match.similarity(a, b)
        )
        if (!match) continue
        const existing = best.get(match.playerId)
        if (!existing || match.confidence > existing.confidence) {
          best.set(match.playerId, {
            playerId: match.playerId,
            name: match.name,
            team: match.team,
            box: torsoBox,
            confidence: match.confidence
          })
        }
      }
      return [...best.values()]
    } catch (error) {
      console.warn('[overlay] detection failed', error)
      return null
    } finally {
      this.inFlight = false
    }
  }

  private collectBoxes(
    objects: ObjectResult[],
    faces: FaceResult[]
  ): NormalizedBox[] {
    const boxes: NormalizedBox[] = []
    for (const object of objects) {
      if (object.label !== 'person' || object.score < MIN_PERSON_SCORE) continue
      const box = clampNormalizedBox(object.boxRaw)
      if (box[2] < MIN_BOX_SIZE || box[3] < MIN_BOX_SIZE) continue
      boxes.push(box)
    }

    // CenterNet can miss a person at the edge or in a crowd. Add a body box
    // for any face that is not already covered by a detected person.
    for (const face of faces) {
      if (!face.embedding) continue
      if (faceInsideAnyBox(face, boxes)) continue
      const box = faceBoxToPersonBox(face)
      if (box[2] < MIN_BOX_SIZE || box[3] < MIN_BOX_SIZE) continue
      boxes.push(box)
    }
    return boxes
  }
}
