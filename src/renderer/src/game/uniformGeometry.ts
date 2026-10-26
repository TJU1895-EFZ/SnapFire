export type NormalizedBox = [number, number, number, number]
export type NormalizedPoint = [number, number]

export interface CoverTransform {
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/** Clips a detector box to the video frame without shifting it. */
export function clampNormalizedBox(box: NormalizedBox): NormalizedBox {
  const left = Math.max(0, Math.min(1, box[0]))
  const top = Math.max(0, Math.min(1, box[1]))
  const right = Math.max(left, Math.min(1, box[0] + box[2]))
  const bottom = Math.max(top, Math.min(1, box[1] + box[3]))
  return [left, top, right - left, bottom - top]
}

/**
 * Approximate the torso of a full-body box. CenterNet boxes include the head
 * and legs, so shoulders sit just below the top and hips a little past the
 * middle. The slight taper makes the patch read as clothing rather than a
 * rectangle pasted over the person.
 */
export function torsoQuadFromBox(box: NormalizedBox): NormalizedPoint[] {
  const [x, y, w, h] = clampNormalizedBox(box)
  const cx = x + w / 2
  const shoulderY = y + h * 0.2
  const hipY = y + h * 0.58
  const shoulderHalf = w * 0.27
  const hipHalf = w * 0.21
  return [
    [cx - shoulderHalf, shoulderY],
    [cx + shoulderHalf, shoulderY],
    [cx + hipHalf, hipY],
    [cx - hipHalf, hipY]
  ]
}

/**
 * The camera video uses `object-fit: cover`, so normalized video coordinates
 * have to be scaled and cropped before they line up with the overlay canvas.
 */
export function computeCoverTransform(
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number
): CoverTransform {
  if (videoWidth <= 0 || videoHeight <= 0 || displayWidth <= 0 || displayHeight <= 0) {
    return { offsetX: 0, offsetY: 0, width: 0, height: 0 }
  }
  const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  return {
    offsetX: (displayWidth - width) / 2,
    offsetY: (displayHeight - height) / 2,
    width,
    height
  }
}

export function mapNormalizedPoint(
  x: number,
  y: number,
  transform: CoverTransform
): NormalizedPoint {
  return [
    transform.offsetX + x * transform.width,
    transform.offsetY + y * transform.height
  ]
}

/** Exponential smoothing in normalized space; alpha is clamped to 0..1. */
export function easeBox(
  current: NormalizedBox,
  target: NormalizedBox,
  alpha: number
): NormalizedBox {
  const t = Math.max(0, Math.min(1, alpha))
  if (t === 0) return current
  if (t === 1) return target
  return [
    current[0] + (target[0] - current[0]) * t,
    current[1] + (target[1] - current[1]) * t,
    current[2] + (target[2] - current[2]) * t,
    current[3] + (target[3] - current[3]) * t
  ]
}
