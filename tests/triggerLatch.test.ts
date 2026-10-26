import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerLatch } from '@renderer/game/TriggerLatch'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TriggerLatch', () => {
  it('fires once immediately and keeps firing while held in auto mode', async () => {
    const onShot = vi.fn()
    const latch = new TriggerLatch(onShot, 'auto', 150)

    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(150)
    expect(onShot).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(300)
    expect(onShot).toHaveBeenCalledTimes(4)

    latch.release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onShot).toHaveBeenCalledTimes(4)
  })

  it('fires only once per press in semi mode', async () => {
    const onShot = vi.fn()
    const latch = new TriggerLatch(onShot, 'semi', 300)

    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(onShot).toHaveBeenCalledTimes(1)

    latch.release()
    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(2)
  })

  it('ignores repeated press events while already held', async () => {
    const onShot = vi.fn()
    const latch = new TriggerLatch(onShot, 'auto', 150)

    latch.press()
    latch.press()
    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(150)
    expect(onShot).toHaveBeenCalledTimes(2)
  })

  it('never overlaps a slow shot with the next automatic shot', async () => {
    let inFlight = 0
    let peak = 0
    const onShot = vi.fn(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise<void>((resolve) => setTimeout(resolve, 80))
      inFlight -= 1
    })
    const latch = new TriggerLatch(onShot, 'auto', 50)

    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(79)
    expect(onShot).toHaveBeenCalledTimes(1)

    // The first shot resolves at 80 ms; the next one starts immediately
    // because the requested 50 ms interval has already elapsed.
    await vi.advanceTimersByTimeAsync(1)
    expect(onShot).toHaveBeenCalledTimes(2)
    expect(peak).toBe(1)

    latch.release()
  })

  it('does not fire again when released while a shot is in flight', async () => {
    const deferred: { resolve?: () => void } = {}
    const onShot = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve
        })
    )
    const latch = new TriggerLatch(onShot, 'auto', 50)

    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    latch.release()
    deferred.resolve?.()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onShot).toHaveBeenCalledTimes(1)
  })

  it('stops the current burst when the fire mode changes', async () => {
    const onShot = vi.fn()
    const latch = new TriggerLatch(onShot, 'auto', 150)

    latch.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(onShot).toHaveBeenCalledTimes(1)

    latch.setMode('semi', 300)
    await vi.advanceTimersByTimeAsync(1000)
    expect(onShot).toHaveBeenCalledTimes(1)
    expect(latch.isActive).toBe(false)
  })
})
