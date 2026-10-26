import type { BodyKeypoint, BodyResult } from '@vladmandic/human'
import type {
  AppearanceData,
  ClothingDescriptor,
  EnrollmentView,
  GalleryEntry,
  Team
} from '@shared/types'

const HISTOGRAM_HUE_BINS = 12
const HISTOGRAM_SAT_BINS = 4
const HISTOGRAM_BINS = HISTOGRAM_HUE_BINS * HISTOGRAM_SAT_BINS
const GRID_SIZE = 3
const OUTPUT_SIZE = 64

/** Match tuning. These are deliberately conservative: a wrong identity means
 * damage is applied to the wrong player, so "unknown" is safer than a guess. */
export const FACE_ACCEPT = 0.55
export const FACE_MARGIN = 0.07
export const CLOTHING_ACCEPT = 0.7
export const CLOTHING_MARGIN = 0.05

export interface IdentityMatch {
  playerId: string
  name: string
  team: Team
  confidence: number
  source: 'face' | 'clothing' | 'combined'
  faceScore: number | null
  clothingScore: number
}

interface HSV {
  h: number
  s: number
  v: number
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta > 1e-6) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h /= 6
    if (h < 0) h += 1
  }
  const s = max <= 1e-6 ? 0 : delta / max
  return { h, s, v: max }
}

function keypoint(body: BodyResult, part: string): BodyKeypoint | undefined {
  return body.keypoints.find((point) => point.part === part)
}

function keypointRaw(body: BodyResult, part: string): [number, number] | null {
  const point = keypoint(body, part)
  if (!point || point.score < 0.15) return null
  const [x, y] = point.positionRaw
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [x, y]
}

function pointInPolygon(px: number, py: number, polygon: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function normalizeHistogram(histogram: number[]): number[] {
  const sum = histogram.reduce((total, value) => total + value, 0)
  if (sum <= 0) return histogram
  return histogram.map((value) => value / sum)
}

function expandPolygon(
  polygon: Array<[number, number]>,
  factor: number
): Array<[number, number]> {
  const cx = polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length
  const cy = polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length
  return polygon.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

export interface TorsoCropRect {
  x: number
  y: number
  width: number
  height: number
}

interface KeypointPair {
  left: [number, number]
  right: [number, number]
}

/**
 * Crop rectangle for the torso. Keypoints are normalized 0..1; when they are
 * unavailable the body box supplies normalized fallbacks. Keeping both paths
 * in one function avoids mixing pixel and normalized units.
 */
export function computeTorsoCropRect(
  sourceWidth: number,
  sourceHeight: number,
  boxRaw: [number, number, number, number],
  shoulders: KeypointPair | null,
  hips: KeypointPair | null
): TorsoCropRect | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null
  const bodyX = boxRaw[0] * sourceWidth
  const bodyW = boxRaw[2] * sourceWidth

  const shoulderY = shoulders
    ? Math.min(shoulders.left[1], shoulders.right[1])
    : boxRaw[1] + boxRaw[3] * 0.18
  const hipY = hips
    ? Math.max(hips.left[1], hips.right[1])
    : boxRaw[1] + boxRaw[3] * 0.62
  const torsoHeight = Math.max(0.06, hipY - shoulderY)

  let xMin = bodyX + bodyW * 0.12
  let xMax = bodyX + bodyW * 0.88
  if (shoulders) {
    xMin = Math.min(shoulders.left[0], shoulders.right[0]) * sourceWidth
    xMax = Math.max(shoulders.left[0], shoulders.right[0]) * sourceWidth
  }
  if (hips) {
    xMin = Math.min(xMin, hips.left[0] * sourceWidth, hips.right[0] * sourceWidth)
    xMax = Math.max(xMax, hips.left[0] * sourceWidth, hips.right[0] * sourceWidth)
  }

  const marginX = Math.max(6, (xMax - xMin) * 0.12)
  const x = Math.max(0, Math.floor(xMin - marginX))
  const y = Math.max(
    0,
    Math.floor(shoulderY * sourceHeight - torsoHeight * sourceHeight * 0.08)
  )
  const right = Math.min(sourceWidth, Math.ceil(xMax + marginX))
  const bottom = Math.min(
    sourceHeight,
    Math.ceil(hipY * sourceHeight + torsoHeight * sourceHeight * 0.35)
  )
  const width = right - x
  const height = bottom - y
  if (width < 12 || height < 12) return null
  return { x, y, width, height }
}

/**
 * Builds a lighting-tolerant appearance descriptor from the torso area.
 * Used as the primary identity signal at 10 m, where faces are too small.
 */
export function extractClothingDescriptor(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  body: BodyResult,
  view: EnrollmentView
): ClothingDescriptor | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const leftShoulder = keypointRaw(body, 'leftShoulder')
  const rightShoulder = keypointRaw(body, 'rightShoulder')
  const leftHip = keypointRaw(body, 'leftHip')
  const rightHip = keypointRaw(body, 'rightHip')

  const crop = computeTorsoCropRect(
    sourceWidth,
    sourceHeight,
    body.boxRaw,
    leftShoulder && rightShoulder
      ? { left: leftShoulder, right: rightShoulder }
      : null,
    leftHip && rightHip ? { left: leftHip, right: rightHip } : null
  )
  if (!crop) return null
  const { x: cropX, y: cropY, width: cropW, height: cropH } = crop

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  const image = ctx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  const data = image.data

  // Map the torso quad into the 64x64 output so background pixels can be
  // ignored when computing colour statistics.
  const toOutput = (point: [number, number]): [number, number] => [
    ((point[0] * sourceWidth - cropX) / cropW) * OUTPUT_SIZE,
    ((point[1] * sourceHeight - cropY) / cropH) * OUTPUT_SIZE
  ]
  let polygon: Array<[number, number]> | null = null
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    polygon = expandPolygon(
      [
        toOutput(leftShoulder),
        toOutput(rightShoulder),
        toOutput(rightHip),
        toOutput(leftHip)
      ],
      1.12
    )
  }

  const histogram = new Array<number>(HISTOGRAM_BINS).fill(0)
  const gridWeight = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0)
  const gridHueCos = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0)
  const gridHueSin = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0)
  const gridSat = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0)
  const gridVal = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0)
  let maskedPixels = 0

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    for (let x = 0; x < OUTPUT_SIZE; x += 1) {
      if (polygon && !pointInPolygon(x + 0.5, y + 0.5, polygon)) continue
      const index = (y * OUTPUT_SIZE + x) * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const alpha = data[index + 3]
      if (alpha < 32) continue
      maskedPixels += 1
      const { h, s, v } = rgbToHsv(r, g, b)
      const weight = 0.2 + 0.8 * s
      const hueBin = Math.min(HISTOGRAM_HUE_BINS - 1, Math.floor(h * HISTOGRAM_HUE_BINS))
      const satBin = Math.min(HISTOGRAM_SAT_BINS - 1, Math.floor(s * HISTOGRAM_SAT_BINS))
      histogram[hueBin * HISTOGRAM_SAT_BINS + satBin] += weight

      const cellX = Math.min(GRID_SIZE - 1, Math.floor((x / OUTPUT_SIZE) * GRID_SIZE))
      const cellY = Math.min(GRID_SIZE - 1, Math.floor((y / OUTPUT_SIZE) * GRID_SIZE))
      const cell = cellY * GRID_SIZE + cellX
      gridWeight[cell] += weight
      gridHueCos[cell] += Math.cos(2 * Math.PI * h) * weight
      gridHueSin[cell] += Math.sin(2 * Math.PI * h) * weight
      gridSat[cell] += s * weight
      gridVal[cell] += v * weight
    }
  }

  if (maskedPixels < 120) {
    // The torso quad was unreliable (side view, partial body). Fall back to
    // the whole crop rather than returning a bad descriptor.
    histogram.fill(0)
    gridWeight.fill(0)
    gridHueCos.fill(0)
    gridHueSin.fill(0)
    gridSat.fill(0)
    gridVal.fill(0)
    for (let y = 0; y < OUTPUT_SIZE; y += 1) {
      for (let x = 0; x < OUTPUT_SIZE; x += 1) {
        const index = (y * OUTPUT_SIZE + x) * 4
        if (data[index + 3] < 32) continue
        const { h, s, v } = rgbToHsv(data[index], data[index + 1], data[index + 2])
        const weight = 0.2 + 0.8 * s
        const hueBin = Math.min(HISTOGRAM_HUE_BINS - 1, Math.floor(h * HISTOGRAM_HUE_BINS))
        const satBin = Math.min(HISTOGRAM_SAT_BINS - 1, Math.floor(s * HISTOGRAM_SAT_BINS))
        histogram[hueBin * HISTOGRAM_SAT_BINS + satBin] += weight
        const cellX = Math.min(GRID_SIZE - 1, Math.floor((x / OUTPUT_SIZE) * GRID_SIZE))
        const cellY = Math.min(GRID_SIZE - 1, Math.floor((y / OUTPUT_SIZE) * GRID_SIZE))
        const cell = cellY * GRID_SIZE + cellX
        gridWeight[cell] += weight
        gridHueCos[cell] += Math.cos(2 * Math.PI * h) * weight
        gridHueSin[cell] += Math.sin(2 * Math.PI * h) * weight
        gridSat[cell] += s * weight
        gridVal[cell] += v * weight
      }
    }
  }

  const grid: number[] = new Array(GRID_SIZE * GRID_SIZE * 3).fill(0)
  for (let cell = 0; cell < GRID_SIZE * GRID_SIZE; cell += 1) {
    const weight = gridWeight[cell]
    if (weight <= 0) continue
    let hue = Math.atan2(gridHueSin[cell] / weight, gridHueCos[cell] / weight) / (2 * Math.PI)
    if (hue < 0) hue += 1
    grid[cell * 3] = hue
    grid[cell * 3 + 1] = gridSat[cell] / weight
    grid[cell * 3 + 2] = gridVal[cell] / weight
  }

  return {
    version: 1,
    view,
    histogram: normalizeHistogram(histogram),
    grid,
    aspect: Number((cropW / cropH).toFixed(4)),
    capturedAt: Date.now()
  }
}

/**
 * Torso descriptor from a detector box rather than pose keypoints.
 *
 * The uniform overlay only needs a rough torso crop for each person detected
 * by CenterNet; this helper keeps that approximation out of the shot-judging
 * path.
 */
export function extractClothingDescriptorFromBox(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  boxRaw: [number, number, number, number],
  view: EnrollmentView
): ClothingDescriptor | null {
  const body = { boxRaw, keypoints: [] } as unknown as BodyResult
  return extractClothingDescriptor(source, sourceWidth, sourceHeight, body, view)
}

export function histogramIntersection(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < length; i += 1) sum += Math.min(a[i], b[i])
  return Math.max(0, Math.min(1, sum))
}

function gridSimilarity(a: number[], b: number[]): number {
  const cells = Math.min(a.length, b.length) / 3
  if (cells <= 0) return 0
  let total = 0
  for (let cell = 0; cell < cells; cell += 1) {
    const ha = a[cell * 3]
    const sa = a[cell * 3 + 1]
    const va = a[cell * 3 + 2]
    const hb = b[cell * 3]
    const sb = b[cell * 3 + 1]
    const vb = b[cell * 3 + 2]
    const hueSim = (Math.cos(2 * Math.PI * (ha - hb)) + 1) / 2
    const satSim = 1 - Math.abs(sa - sb)
    const valSim = 1 - Math.abs(va - vb)
    total += 0.38 * hueSim + 0.42 * satSim + 0.2 * valSim
  }
  return total / cells
}

export function clothingSimilarity(a: ClothingDescriptor, b: ClothingDescriptor): number {
  if (!a.histogram.length || !b.histogram.length) return 0
  const hist = histogramIntersection(a.histogram, b.histogram)
  const grid = gridSimilarity(a.grid, b.grid)
  const aspectSim =
    1 - Math.min(1, Math.abs(a.aspect - b.aspect) / Math.max(a.aspect, b.aspect, 0.01))
  return Math.max(0, Math.min(1, 0.62 * hist + 0.33 * grid + 0.05 * aspectSim))
}

/**
 * Face matching uses Human's own normalized descriptor similarity. The
 * embeddings are stored raw, exactly as Human produces them.
 */
export function faceSimilarity(
  humanMatchSimilarity: (a: number[], b: number[]) => number,
  a: number[],
  b: number[]
): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  try {
    return humanMatchSimilarity(a, b)
  } catch {
    return 0
  }
}

export interface IdentityCandidate {
  entry: GalleryEntry
  clothingScore: number
  faceScore: number | null
  rank: number
  source: 'face' | 'clothing' | 'combined'
}

export function matchIdentity(
  faceEmbedding: number[] | null,
  clothing: ClothingDescriptor,
  gallery: GalleryEntry[],
  selfId: string,
  faceSimilarityFn: (a: number[], b: number[]) => number
): IdentityMatch | null {
  const candidates: IdentityCandidate[] = []
  for (const entry of gallery) {
    if (entry.id === selfId || !entry.team) continue
    if (!entry.appearance) continue
    let clothingScore = 0
    for (const descriptor of entry.appearance.clothing) {
      clothingScore = Math.max(clothingScore, clothingSimilarity(clothing, descriptor))
    }
    let faceScore: number | null = null
    if (faceEmbedding && entry.appearance.faceEmbeddings.length > 0) {
      let best = 0
      for (const embedding of entry.appearance.faceEmbeddings) {
        best = Math.max(best, faceSimilarityFn(faceEmbedding, embedding))
      }
      faceScore = best
    }
    const faceOk = faceScore !== null && faceScore >= FACE_ACCEPT
    const clothingOk = clothingScore >= CLOTHING_ACCEPT
    if (!faceOk && !clothingOk) continue
    const source: IdentityCandidate['source'] =
      faceOk && clothingOk ? 'combined' : faceOk ? 'face' : 'clothing'
    const rank = faceOk
      ? 0.72 * (faceScore as number) + 0.28 * clothingScore
      : clothingScore
    candidates.push({ entry, clothingScore, faceScore, rank, source })
  }

  candidates.sort((a, b) => b.rank - a.rank)
  const top = candidates[0]
  if (!top) return null
  const second = candidates[1]
  const requiredMargin =
    top.faceScore !== null && top.source !== 'clothing' ? FACE_MARGIN : CLOTHING_MARGIN
  if (second && top.rank - second.rank < requiredMargin) return null
  const confidence = top.faceScore !== null && top.source !== 'clothing'
    ? Math.min(1, 0.65 * (top.faceScore as number) + 0.35 * top.clothingScore)
    : top.clothingScore
  return {
    playerId: top.entry.id,
    name: top.entry.name,
    team: top.entry.team as Team,
    confidence,
    source: top.source,
    faceScore: top.faceScore,
    clothingScore: top.clothingScore
  }
}

export function appearanceToGalleryEntry(
  id: string,
  name: string,
  team: Team | null,
  appearance: AppearanceData
): GalleryEntry {
  return { id, name, team, appearance }
}
