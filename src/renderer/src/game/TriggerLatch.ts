import type { FireMode } from './weapons'

/**
 * Turns a press/release pair into shots.
 *
 * - `semi` fires once per press; holding does nothing more.
 * - `auto` keeps firing while held, waiting for each shot analysis to finish
 *   before scheduling the next one so slow inference cannot stack up.
 *
 * The scheduler is deliberately framework-free so the cadence rules can be
 * tested without a browser or a React renderer.
 */
export class TriggerLatch {
  private active = false
  private token = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private resolveWait: (() => void) | null = null

  constructor(
    private readonly onShot: () => void | Promise<void>,
    private mode: FireMode = 'auto',
    private fireIntervalMs = 150
  ) {}

  /** Stops any active burst and applies new trigger semantics. */
  setMode(mode: FireMode, fireIntervalMs: number): void {
    this.release()
    this.mode = mode
    this.fireIntervalMs = Math.max(1, fireIntervalMs)
  }

  press(): void {
    if (this.active) return
    this.active = true
    this.token += 1
    void this.run(this.token)
  }

  release(): void {
    this.active = false
    this.token += 1
    this.clearTimer()
  }

  get isActive(): boolean {
    return this.active
  }

  dispose(): void {
    this.release()
  }

  private async run(token: number): Promise<void> {
    while (this.active && token === this.token) {
      const started = Date.now()
      try {
        await this.onShot()
      } catch (error) {
        console.warn('[trigger] shot handler failed', error)
      }
      if (!this.active || token !== this.token) return
      if (this.mode === 'semi') return
      const remaining = this.fireIntervalMs - (Date.now() - started)
      if (remaining > 0) {
        await this.wait(remaining)
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolveWait = resolve
      this.timer = setTimeout(() => {
        this.timer = null
        this.resolveWait = null
        resolve()
      }, ms)
    })
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.resolveWait) {
      const resolve = this.resolveWait
      this.resolveWait = null
      resolve()
    }
  }
}
