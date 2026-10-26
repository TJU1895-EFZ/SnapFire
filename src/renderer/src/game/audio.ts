/**
 * Small procedural sound engine. No audio assets are needed, which keeps the
 * build fully offline and avoids licensing issues.
 */
class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private volume = 0.8

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value))
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02)
    }
  }

  getVolume(): number {
    return this.volume
  }

  unlock(): void {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') void ctx.resume()
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) throw new Error('当前环境不支持 Web Audio')
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      const compressor = this.ctx.createDynamicsCompressor()
      compressor.threshold.value = -18
      compressor.knee.value = 12
      compressor.ratio.value = 6
      compressor.attack.value = 0.003
      compressor.release.value = 0.2
      this.master.connect(compressor)
      compressor.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private noiseBuffer(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
    return buffer
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startHz: number,
    endHz: number,
    duration: number,
    gainValue: number,
    startAt = 0
  ): void {
    const start = ctx.currentTime + startAt
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(startHz, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), start + duration)
    gain.gain.setValueAtTime(gainValue, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    if (this.master) gain.connect(this.master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  gunshot(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      const start = ctx.currentTime
      const noise = ctx.createBufferSource()
      noise.buffer = this.noiseBuffer(ctx, 0.16, 3.4)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(1500, start)
      band.frequency.exponentialRampToValueAtTime(420, start + 0.15)
      band.Q.value = 0.7
      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.9, start)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15)
      noise.connect(band)
      band.connect(noiseGain)
      if (this.master) noiseGain.connect(this.master)
      noise.start(start)
      noise.stop(start + 0.17)

      this.tone(ctx, 'sine', 155, 48, 0.16, 0.75)
      this.tone(ctx, 'triangle', 900, 300, 0.045, 0.16)
    } catch {
      // Audio is non-critical.
    }
  }

  pistolShot(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      const start = ctx.currentTime
      const noise = ctx.createBufferSource()
      noise.buffer = this.noiseBuffer(ctx, 0.11, 4.2)
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(2400, start)
      band.frequency.exponentialRampToValueAtTime(820, start + 0.1)
      band.Q.value = 0.9
      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(0.72, start)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1)
      noise.connect(band)
      band.connect(noiseGain)
      if (this.master) noiseGain.connect(this.master)
      noise.start(start)
      noise.stop(start + 0.12)

      this.tone(ctx, 'sine', 220, 72, 0.1, 0.5)
      this.tone(ctx, 'triangle', 1450, 620, 0.035, 0.2)
    } catch {
      // Audio is non-critical.
    }
  }

  weaponSwitch(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'square', 860, 700, 0.03, 0.055)
      this.tone(ctx, 'square', 1180, 960, 0.035, 0.05, 0.09)
    } catch {
      // ignore
    }
  }

  hit(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'square', 1250, 1100, 0.045, 0.12)
      this.tone(ctx, 'sine', 1900, 1700, 0.035, 0.08, 0.03)
    } catch {
      // ignore
    }
  }

  kill(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'triangle', 680, 700, 0.09, 0.12)
      this.tone(ctx, 'triangle', 1020, 1040, 0.14, 0.1, 0.08)
    } catch {
      // ignore
    }
  }

  friendly(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'sine', 420, 300, 0.09, 0.08)
    } catch {
      // ignore
    }
  }

  miss(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'sine', 260, 200, 0.05, 0.05)
    } catch {
      // ignore
    }
  }

  damage(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      const start = ctx.currentTime
      const noise = ctx.createBufferSource()
      noise.buffer = this.noiseBuffer(ctx, 0.2, 2.2)
      const low = ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = 500
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.55, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      noise.connect(low)
      low.connect(gain)
      if (this.master) gain.connect(this.master)
      noise.start(start)
      noise.stop(start + 0.24)
      this.tone(ctx, 'sine', 90, 55, 0.2, 0.35)
    } catch {
      // ignore
    }
  }

  respawn(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'sine', 440, 880, 0.22, 0.1)
      this.tone(ctx, 'triangle', 660, 1320, 0.18, 0.06, 0.06)
    } catch {
      // ignore
    }
  }

  click(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'square', 1600, 1400, 0.025, 0.05)
    } catch {
      // ignore
    }
  }

  error(): void {
    if (this.volume <= 0) return
    try {
      const ctx = this.ensure()
      this.tone(ctx, 'sawtooth', 180, 120, 0.18, 0.08)
    } catch {
      // ignore
    }
  }
}

export const audio = new AudioEngine()
