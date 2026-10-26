import type { Config } from '@vladmandic/human'

/**
 * Human keeps one mutable config. Every detection call therefore states the
 * modules it needs, otherwise a shot analysis could inherit the overlay's
 * disabled body module (or the overlay could skip object detection).
 */
export const MAIN_DETECTION_CONFIG: Partial<Config> = {
  face: {
    enabled: true,
    detector: { maxDetected: 4, minConfidence: 0.3, minSize: 32 }
  },
  body: { enabled: true },
  object: { enabled: false }
}

/** Full-frame pass used only by the Long March uniform overlay. */
export const OVERLAY_DETECTION_CONFIG: Partial<Config> = {
  face: {
    enabled: true,
    detector: { maxDetected: 6, minConfidence: 0.32, minSize: 28 }
  },
  body: { enabled: false },
  object: {
    enabled: true,
    modelPath: 'centernet.json',
    maxDetected: 6,
    minConfidence: 0.3,
    iouThreshold: 0.4
  }
}

/** Fallback when the multi-person model cannot be loaded. */
export const FACE_ONLY_OVERLAY_CONFIG: Partial<Config> = {
  face: {
    enabled: true,
    detector: { maxDetected: 6, minConfidence: 0.32, minSize: 28 }
  },
  body: { enabled: false },
  object: { enabled: false }
}
