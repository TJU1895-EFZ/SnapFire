import type { FaceResult } from '@vladmandic/human'
import {
  clampNormalizedBox,
  type NormalizedBox
} from '../game/uniformGeometry'

/**
 * Picks the most confident face whose centre sits in the upper part of a
 * person box. Face embeddings are the strongest identity signal; clothing is
 * only used when no usable face belongs to the person.
 */
export function pickFaceForBox(
  faces: FaceResult[],
  box: NormalizedBox
): FaceResult | null {
  const [x, y, w, h] = clampNormalizedBox(box)
  const candidates = faces
    .filter((face) => Boolean(face.embedding))
    .filter((face) => {
      const [fx, fy, fw, fh] = face.boxRaw
      const cx = fx + fw / 2
      const cy = fy + fh / 2
      return (
        cx >= x - w * 0.12 &&
        cx <= x + w * 1.12 &&
        cy >= y - h * 0.06 &&
        cy <= y + h * 0.65
      )
    })
    .sort((a, b) => b.boxScore - a.boxScore)
  return candidates[0] ?? null
}

/**
 * Builds a rough full-body box from a face when multi-person detection is
 * unavailable. The overlay is visual-only, so a generous box is fine.
 */
export function faceBoxToPersonBox(face: FaceResult): NormalizedBox {
  const [fx, fy, fw, fh] = face.boxRaw
  const cx = fx + fw / 2
  const width = Math.max(fw * 3.2, 0.12)
  const height = Math.max(fh * 7.5, 0.28)
  return clampNormalizedBox([cx - width / 2, fy - fh * 0.35, width, height])
}

/**
 * CenterNet boxes include raised arms and sometimes background, which makes
 * the torso patch drift sideways. The head sits over the torso, so use the
 * face centre and a face-relative width while staying inside the body box.
 */
export function refineTorsoBox(
  box: NormalizedBox,
  face: FaceResult | null
): NormalizedBox {
  const [x, y, w, h] = clampNormalizedBox(box)
  if (!face) return [x, y, w, h]
  const [fx, , fw] = face.boxRaw
  const cx = fx + fw / 2
  // The body box includes arms, so cap the torso at ~62% of its width and
  // keep it tied to the face size.
  const width = Math.max(0.08, Math.min(w * 0.62, fw * 2.8))
  const left = Math.max(x, Math.min(x + w - width, cx - width / 2))
  return clampNormalizedBox([left, y, width, h])
}
