import Human from '@vladmandic/human'
import type { Config, Input, Result } from '@vladmandic/human'
import { MAIN_DETECTION_CONFIG } from './config'

let instance: Human | null = null
let loading: Promise<Human> | null = null
let queue: Promise<unknown> = Promise.resolve()

function buildConfig(backend: 'webgl' | 'cpu'): Partial<Config> {
  return {
    backend,
    modelBasePath: './models/',
    cacheModels: true,
    debug: false,
    async: true,
    warmup: 'none',
    validateModels: false,
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: {
        enabled: true,
        modelPath: 'blazeface.json',
        maxDetected: 4,
        minConfidence: 0.3,
        minSize: 32,
        iouThreshold: 0.1,
        scale: 1.4,
        rotation: false,
        return: false,
        skipFrames: 0,
        skipTime: 0
      },
      // The mesh is only needed for detailed landmarks. The face description
      // model works directly on the detector crop, and skipping the mesh keeps
      // the per-frame cost low on laptop hardware.
      mesh: { enabled: false },
      attention: { enabled: false },
      iris: { enabled: false },
      emotion: { enabled: false },
      description: {
        enabled: true,
        modelPath: 'faceres.json',
        minConfidence: 0.2,
        skipFrames: 0,
        skipTime: 0
      },
      antispoof: { enabled: false },
      liveness: { enabled: false },
      gear: { enabled: false }
    },
    body: {
      enabled: true,
      modelPath: 'movenet-lightning.json',
      maxDetected: 1,
      minConfidence: 0.18,
      skipFrames: 0,
      skipTime: 0
    },
    hand: { enabled: false },
    object: {
      enabled: false,
      modelPath: 'centernet.json',
      maxDetected: 6,
      minConfidence: 0.3,
      iouThreshold: 0.4
    },
    gesture: { enabled: false },
    segmentation: { enabled: false }
  }
}

async function createHuman(backend: 'webgl' | 'cpu'): Promise<Human> {
  const human = new Human(buildConfig(backend))
  await human.load()
  return human
}

export function getHuman(): Promise<Human> {
  if (instance) return Promise.resolve(instance)
  if (loading) return loading
  loading = (async () => {
    try {
      instance = await createHuman('webgl')
      console.info('[vision] Human loaded with WebGL backend')
    } catch (error) {
      console.warn('[vision] WebGL backend unavailable, falling back to CPU', error)
      instance = await createHuman('cpu')
      console.info('[vision] Human loaded with CPU backend')
    }
    return instance
  })().finally(() => {
    loading = null
  })
  return loading
}

export function preloadHuman(): void {
  void getHuman().catch((error) => {
    console.error('[vision] failed to preload Human', error)
  })
}

let warmedUp = false
let warming: Promise<void> | null = null

/**
 * The first Human inference compiles WebGL shaders and can block the renderer
 * for several seconds. Pay that cost in the lobby (or the enrolment modal)
 * instead of on the first shot of a match.
 */
export function warmupHuman(): Promise<void> {
  if (warmedUp) return Promise.resolve()
  if (warming) return warming
  warming = (async () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 96
      canvas.height = 96
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#202428'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await detectWithHuman(canvas)
      console.info('[vision] warmup complete')
    } catch (error) {
      console.warn('[vision] warmup failed', error)
    } finally {
      warmedUp = true
      warming = null
    }
  })()
  return warming
}

/**
 * Human is not re-entrant. Serialize all detections so the lobby enrollment
 * modal and the battle loop can share a single model instance safely.
 */
export function detectWithHuman(
  input: Input,
  config: Partial<Config> = MAIN_DETECTION_CONFIG
): Promise<Result> {
  const next = queue.then(async () => {
    const human = await getHuman()
    return human.detect(input, config)
  })
  queue = next.catch(() => undefined)
  return next
}
