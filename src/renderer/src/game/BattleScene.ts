import * as THREE from 'three'
import { WEAPONS, type WeaponId } from './weapons'

export type LockState = 'none' | 'unknown' | 'enemy' | 'teammate'

interface WeaponMaterials {
  metal: THREE.MeshStandardMaterial
  metalDark: THREE.MeshStandardMaterial
  polymer: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  fabric: THREE.MeshStandardMaterial
  fabricDark: THREE.MeshStandardMaterial
  glove: THREE.MeshStandardMaterial
  glowStrip: THREE.MeshBasicMaterial
}

interface WeaponView {
  group: THREE.Group
  flash: THREE.Sprite
  glow: THREE.Sprite
  light: THREE.PointLight
  sightDot: THREE.Sprite | null
  flashBaseScale: number
  glowBaseScale: number
  flashMs: number
}

interface SwitchState {
  to: WeaponId
  phase: 'out' | 'in'
  elapsedMs: number
}

function makeRadialTexture(
  inner: string,
  middle: string,
  outer: string,
  size = 128
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建纹理画布')
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  )
  gradient.addColorStop(0, inner)
  gradient.addColorStop(0.2, middle)
  gradient.addColorStop(0.55, outer)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeFlashTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建枪口火焰纹理')
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.12, 'rgba(255,245,190,1)')
  gradient.addColorStop(0.32, 'rgba(255,185,70,0.9)')
  gradient.addColorStop(0.6, 'rgba(255,100,20,0.3)')
  gradient.addColorStop(1, 'rgba(255,60,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = 'rgba(255,235,170,0.85)'
  ctx.lineWidth = 3
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(64 + Math.cos(angle) * 12, 64 + Math.sin(angle) * 12)
    ctx.lineTo(64 + Math.cos(angle) * 58, 64 + Math.sin(angle) * 58)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  return mesh
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
  segments = 16
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material
  )
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  return mesh
}

function limb(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  material: THREE.Material
): THREE.Mesh {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusEnd, radiusStart, length, 14, 1),
    material
  )
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  )
  return mesh
}

/**
 * First-person weapon view model. The camera feed is rendered by the DOM video
 * element behind this transparent WebGL canvas, so the gun/arms appear as an
 * AR overlay on top of the real world.
 *
 * Two view models live under `weaponRoot`. A switch lowers the root out of
 * frame, swaps visibility at the bottom, then raises the new weapon.
 */
export class BattleScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly weaponRoot: THREE.Group
  private readonly weapons: Record<WeaponId, WeaponView>
  private readonly basePosition = new THREE.Vector3()
  private readonly baseQuaternion = new THREE.Quaternion()
  private readonly flashTexture: THREE.CanvasTexture
  private readonly dotTexture: THREE.CanvasTexture
  private readonly clock = new THREE.Clock()
  private raf = 0
  private recoil = 0
  private flashUntil = 0
  private lockState: LockState = 'none'
  private activeWeapon: WeaponId = 'rifle'
  private switchState: SwitchState | null = null
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100)
    this.scene.add(this.camera)

    const ambient = new THREE.HemisphereLight(0xc7d9e8, 0x241c12, 1.0)
    this.scene.add(ambient)
    const key = new THREE.DirectionalLight(0xffd7ad, 2.0)
    key.position.set(1.5, 2.2, 1.2)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x8fc4ff, 1.0)
    rim.position.set(-1.5, 0.6, -1.6)
    this.scene.add(rim)
    const fill = new THREE.PointLight(0xffe2bd, 0.55, 2.8, 2)
    fill.position.set(0.4, 0.18, 0.25)
    this.scene.add(fill)

    const materials: WeaponMaterials = {
      metal: new THREE.MeshStandardMaterial({
        color: 0x2f353a,
        metalness: 0.7,
        roughness: 0.32
      }),
      metalDark: new THREE.MeshStandardMaterial({
        color: 0x171b1e,
        metalness: 0.58,
        roughness: 0.48
      }),
      polymer: new THREE.MeshStandardMaterial({
        color: 0x23282b,
        metalness: 0.08,
        roughness: 0.8
      }),
      accent: new THREE.MeshStandardMaterial({
        color: 0x3a4247,
        metalness: 0.55,
        roughness: 0.4
      }),
      fabric: new THREE.MeshStandardMaterial({
        color: 0x3a4034,
        metalness: 0.02,
        roughness: 0.94
      }),
      fabricDark: new THREE.MeshStandardMaterial({
        color: 0x20241d,
        metalness: 0.02,
        roughness: 0.97
      }),
      glove: new THREE.MeshStandardMaterial({
        color: 0x22272a,
        metalness: 0.06,
        roughness: 0.82
      }),
      glowStrip: new THREE.MeshBasicMaterial({ color: 0xff9d2e })
    }

    this.flashTexture = makeFlashTexture()
    this.dotTexture = makeRadialTexture(
      'rgba(255,255,255,1)',
      'rgba(255,70,50,0.95)',
      'rgba(255,20,10,0.3)',
      64
    )

    this.weaponRoot = new THREE.Group()
    const basePos = new THREE.Vector3(0.245, -0.255, -0.6)
    const target = new THREE.Vector3(0, -0.012, -2.6)
    const look = new THREE.Matrix4().lookAt(basePos, target, new THREE.Vector3(0, 1, 0))
    this.weaponRoot.quaternion.setFromRotationMatrix(look)
    this.weaponRoot.position.copy(basePos)
    this.weaponRoot.scale.setScalar(0.74)
    this.camera.add(this.weaponRoot)
    this.basePosition.copy(this.weaponRoot.position)
    this.baseQuaternion.copy(this.weaponRoot.quaternion)

    this.weapons = {
      rifle: this.buildRifle(materials),
      pistol: this.buildPistol(materials)
    }
    this.weaponRoot.add(this.weapons.rifle.group, this.weapons.pistol.group)
    this.applyWeaponVisibility()

    this.resize(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight
    )
  }

  start(): void {
    if (this.raf) return
    this.clock.start()
    const animate = () => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(animate)
      this.update()
    }
    this.raf = requestAnimationFrame(animate)
  }

  fire(): void {
    if (this.disposed || this.switchState) return
    const view = this.weapons[this.activeWeapon]
    this.recoil = WEAPONS[this.activeWeapon].recoil
    this.flashUntil = performance.now() + view.flashMs
  }

  setLock(state: LockState): void {
    if (this.disposed || this.lockState === state) return
    this.lockState = state
    const sightDot = this.weapons.rifle.sightDot
    if (!sightDot) return
    const material = sightDot.material as THREE.SpriteMaterial
    if (state === 'enemy') {
      material.color.setHex(0xff2a1f)
      sightDot.scale.set(0.022, 0.022, 0.022)
    } else if (state === 'teammate') {
      material.color.setHex(0x3f9bff)
      sightDot.scale.set(0.018, 0.018, 0.018)
    } else if (state === 'unknown') {
      material.color.setHex(0xffb02e)
      sightDot.scale.set(0.018, 0.018, 0.018)
    } else {
      material.color.setHex(0xff3b30)
      sightDot.scale.set(0.016, 0.016, 0.016)
    }
  }

  /** Starts the lower → swap → raise transition. Returns false if ignored. */
  switchWeapon(next: WeaponId): boolean {
    if (this.disposed || next === this.activeWeapon || this.switchState) return false
    this.switchState = { to: next, phase: 'out', elapsedMs: 0 }
    this.flashUntil = 0
    this.recoil = 0
    return true
  }

  getActiveWeapon(): WeaponId {
    return this.activeWeapon
  }

  isSwitching(): boolean {
    return this.switchState !== null
  }

  resize(width: number, height: number): void {
    if (this.disposed) return
    const safeWidth = Math.max(1, width)
    const safeHeight = Math.max(1, height)
    this.renderer.setSize(safeWidth, safeHeight, false)
    this.camera.aspect = safeWidth / safeHeight
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      } else if (object instanceof THREE.Sprite) {
        object.material.dispose()
      }
    })
    this.flashTexture.dispose()
    this.dotTexture.dispose()
    this.renderer.dispose()
  }

  private applyWeaponVisibility(): void {
    this.weapons.rifle.group.visible = this.activeWeapon === 'rifle'
    this.weapons.pistol.group.visible = this.activeWeapon === 'pistol'
  }

  private buildMuzzle(
    group: THREE.Group,
    position: [number, number, number],
    flashScale: number,
    glowScale: number,
    flashMs: number
  ): Pick<WeaponView, 'flash' | 'glow' | 'light' | 'flashBaseScale' | 'glowBaseScale' | 'flashMs'> {
    const flashMaterial = new THREE.SpriteMaterial({
      map: this.flashTexture,
      color: 0xffc070,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
    const flash = new THREE.Sprite(flashMaterial)
    flash.position.set(...position)
    flash.scale.setScalar(flashScale)
    flash.renderOrder = 20
    group.add(flash)

    const glowMaterial = flashMaterial.clone()
    glowMaterial.opacity = 0
    const glow = new THREE.Sprite(glowMaterial)
    glow.position.set(...position)
    glow.scale.setScalar(glowScale)
    glow.renderOrder = 19
    group.add(glow)

    const light = new THREE.PointLight(0xffa54a, 0, 3.5, 2)
    light.position.set(...position)
    group.add(light)

    return {
      flash,
      glow,
      light,
      flashBaseScale: flashScale,
      glowBaseScale: glowScale,
      flashMs
    }
  }

  private buildRifle(materials: WeaponMaterials): WeaponView {
    const group = new THREE.Group()

    // --- Rifle body -------------------------------------------------------
    group.add(box(0.085, 0.105, 0.38, materials.metal, [0, 0, -0.09]))
    group.add(box(0.072, 0.028, 0.36, materials.accent, [0, 0.067, -0.1]))
    group.add(box(0.076, 0.086, 0.31, materials.metalDark, [0, 0.004, -0.43]))
    group.add(box(0.082, 0.02, 0.28, materials.accent, [0, 0.047, -0.44]))
    group.add(box(0.066, 0.018, 0.24, materials.metalDark, [0, -0.043, -0.45]))
    group.add(box(0.062, 0.085, 0.2, materials.polymer, [0, -0.005, 0.19]))
    group.add(box(0.074, 0.115, 0.055, materials.polymer, [0, -0.008, 0.295]))
    group.add(box(0.05, 0.135, 0.062, materials.polymer, [0, -0.105, 0.02], [-0.28, 0, 0]))
    group.add(box(0.056, 0.17, 0.1, materials.metalDark, [0, -0.13, -0.1], [0.18, 0, 0]))
    group.add(box(0.058, 0.02, 0.09, materials.accent, [0, -0.052, -0.1]))

    // Barrel + muzzle brake.
    group.add(
      cylinder(0.013, 0.014, 0.3, materials.metal, [0, 0.004, -0.72], [Math.PI / 2, 0, 0], 18)
    )
    group.add(
      cylinder(
        0.021,
        0.019,
        0.075,
        materials.metalDark,
        [0, 0.004, -0.9],
        [Math.PI / 2, 0, 0],
        14
      )
    )
    group.add(
      cylinder(0.017, 0.017, 0.05, materials.metal, [0, 0.004, -0.945], [Math.PI / 2, 0, 0], 14)
    )
    // Handguard vents and accent strip.
    for (let i = 0; i < 4; i += 1) {
      group.add(box(0.078, 0.008, 0.03, materials.metalDark, [0, 0.026, -0.33 - i * 0.055]))
    }
    group.add(box(0.004, 0.008, 0.2, materials.metal, [0.043, 0.005, -0.43]))
    group.add(box(0.005, 0.01, 0.22, materials.glowStrip, [0.046, 0.032, -0.43]))

    // Optic: base, frame, rear/front glass planes.
    group.add(box(0.05, 0.022, 0.1, materials.metalDark, [0, 0.09, -0.1]))
    group.add(box(0.006, 0.07, 0.075, materials.metalDark, [-0.028, 0.135, -0.1]))
    group.add(box(0.006, 0.07, 0.075, materials.metalDark, [0.028, 0.135, -0.1]))
    group.add(box(0.056, 0.006, 0.075, materials.metalDark, [0, 0.168, -0.1]))
    group.add(box(0.056, 0.006, 0.075, materials.metalDark, [0, 0.102, -0.1]))
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.048, 0.058),
      new THREE.MeshBasicMaterial({
        color: 0x6fd0ff,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide
      })
    )
    glass.position.set(0, 0.135, -0.126)
    group.add(glass)

    const muzzle = this.buildMuzzle(group, [0, 0.004, -0.98], 0.34, 0.62, 120)

    // Red dot sight reticle.
    const dotMaterial = new THREE.SpriteMaterial({
      map: this.dotTexture,
      color: 0xff3b30,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
    const sightDot = new THREE.Sprite(dotMaterial)
    sightDot.position.set(0, 0.135, -0.082)
    sightDot.scale.set(0.016, 0.016, 0.016)
    sightDot.renderOrder = 30
    group.add(sightDot)

    // --- Arms -------------------------------------------------------------
    const rightElbow = new THREE.Vector3(0.19, -0.47, 0.3)
    const rightWrist = new THREE.Vector3(0.025, -0.14, 0.045)
    const leftElbow = new THREE.Vector3(-0.18, -0.48, 0.08)
    const leftWrist = new THREE.Vector3(-0.018, -0.032, -0.4)
    group.add(limb(rightElbow, rightWrist, 0.048, 0.034, materials.fabric))
    group.add(limb(leftElbow, leftWrist, 0.05, 0.036, materials.fabric))
    group.add(
      limb(
        rightWrist.clone().add(new THREE.Vector3(0.03, -0.06, 0.04)),
        rightWrist,
        0.041,
        0.031,
        materials.fabricDark
      )
    )
    group.add(
      limb(
        leftWrist.clone().add(new THREE.Vector3(-0.035, -0.07, 0.05)),
        leftWrist,
        0.042,
        0.032,
        materials.fabricDark
      )
    )
    const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), materials.glove)
    rightGlove.scale.set(0.055, 0.072, 0.06)
    rightGlove.position.set(0.008, -0.135, 0.02)
    group.add(rightGlove)
    const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), materials.glove)
    leftGlove.scale.set(0.052, 0.06, 0.07)
    leftGlove.position.set(-0.006, -0.03, -0.405)
    group.add(leftGlove)
    group.add(box(0.045, 0.018, 0.05, materials.metalDark, [0.02, -0.1, 0.025], [0.2, 0, 0]))
    group.add(box(0.04, 0.016, 0.05, materials.metalDark, [0.004, 0.006, -0.43], [0.2, 0, 0]))

    return {
      group,
      sightDot,
      ...muzzle
    }
  }

  private buildPistol(materials: WeaponMaterials): WeaponView {
    const group = new THREE.Group()
    // The rifle's long barrel reaches into frame from an off-screen stock;
    // the pistol is short, so shift its whole view model left and up and
    // shrink it a little to keep the slide readable without filling the HUD.
    group.position.set(-0.13, 0.11, 0.08)
    group.scale.setScalar(0.62)

    // Slide, frame and grip.
    group.add(box(0.048, 0.052, 0.235, materials.metal, [0, 0.02, -0.3]))
    group.add(box(0.043, 0.018, 0.215, materials.accent, [0, 0.052, -0.3]))
    group.add(box(0.044, 0.036, 0.13, materials.metalDark, [0, -0.018, -0.22]))
    group.add(box(0.038, 0.145, 0.062, materials.polymer, [0, -0.105, -0.145], [-0.2, 0, 0]))
    group.add(box(0.042, 0.012, 0.068, materials.metalDark, [0, -0.185, -0.128], [-0.2, 0, 0]))
    group.add(box(0.012, 0.05, 0.03, materials.metalDark, [0, -0.06, -0.245]))
    // Trigger guard.
    group.add(box(0.03, 0.008, 0.006, materials.metalDark, [0, -0.075, -0.255]))
    group.add(box(0.005, 0.038, 0.006, materials.metalDark, [0.014, -0.058, -0.255]))
    group.add(box(0.005, 0.038, 0.006, materials.metalDark, [-0.014, -0.058, -0.255]))
    // Sights.
    group.add(box(0.028, 0.009, 0.008, materials.metalDark, [0, 0.064, -0.215]))
    group.add(box(0.006, 0.011, 0.01, materials.metalDark, [0, 0.064, -0.408]))
    // Barrel and small accent strip.
    group.add(
      cylinder(0.011, 0.011, 0.11, materials.metal, [0, 0.02, -0.45], [Math.PI / 2, 0, 0], 14)
    )
    group.add(box(0.004, 0.007, 0.18, materials.glowStrip, [0.025, 0.034, -0.3]))

    const muzzle = this.buildMuzzle(group, [0, 0.02, -0.505], 0.22, 0.4, 90)

    // --- Arms -------------------------------------------------------------
    const rightElbow = new THREE.Vector3(0.2, -0.43, 0.22)
    const rightWrist = new THREE.Vector3(0.02, -0.095, -0.085)
    const leftElbow = new THREE.Vector3(-0.2, -0.42, 0.12)
    const leftWrist = new THREE.Vector3(-0.025, -0.075, -0.155)
    group.add(limb(rightElbow, rightWrist, 0.047, 0.033, materials.fabric))
    group.add(limb(leftElbow, leftWrist, 0.048, 0.034, materials.fabric))
    group.add(
      limb(
        rightWrist.clone().add(new THREE.Vector3(0.03, -0.055, 0.035)),
        rightWrist,
        0.04,
        0.03,
        materials.fabricDark
      )
    )
    group.add(
      limb(
        leftWrist.clone().add(new THREE.Vector3(-0.035, -0.065, 0.045)),
        leftWrist,
        0.041,
        0.031,
        materials.fabricDark
      )
    )
    const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), materials.glove)
    rightGlove.scale.set(0.054, 0.07, 0.058)
    rightGlove.position.set(0.012, -0.09, -0.105)
    group.add(rightGlove)
    const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), materials.glove)
    leftGlove.scale.set(0.05, 0.058, 0.062)
    leftGlove.position.set(-0.018, -0.07, -0.17)
    group.add(leftGlove)

    return {
      group,
      sightDot: null,
      ...muzzle
    }
  }

  private update(): void {
    const dt = Math.min(0.05, this.clock.getDelta())
    const t = this.clock.elapsedTime

    let dip = 0
    if (this.switchState) {
      this.switchState.elapsedMs += dt * 1000
      if (this.switchState.phase === 'out') {
        const duration = WEAPONS[this.activeWeapon].switchOutMs
        const progress = Math.min(1, this.switchState.elapsedMs / duration)
        dip = progress
        if (progress >= 1) {
          this.activeWeapon = this.switchState.to
          this.applyWeaponVisibility()
          this.switchState.phase = 'in'
          this.switchState.elapsedMs = 0
          dip = 1
        }
      } else {
        const duration = WEAPONS[this.activeWeapon].switchInMs
        const progress = Math.min(1, this.switchState.elapsedMs / duration)
        dip = 1 - progress
        if (progress >= 1) {
          this.switchState = null
          dip = 0
        }
      }
    }

    this.recoil = Math.max(0, this.recoil - dt * 6.2)

    const swayX = Math.sin(t * 0.9) * 0.0018
    const swayY = Math.cos(t * 1.17) * 0.0014
    this.weaponRoot.position.copy(this.basePosition)
    this.weaponRoot.position.x += swayX
    this.weaponRoot.position.y += swayY
    this.weaponRoot.position.z += this.recoil * 0.035
    this.weaponRoot.position.y += this.recoil * 0.012
    this.weaponRoot.position.y -= dip * 0.34
    this.weaponRoot.position.z += dip * 0.14
    this.weaponRoot.quaternion.copy(this.baseQuaternion)
    this.weaponRoot.rotateX(this.recoil * 0.06 + dip * 0.55)
    this.weaponRoot.rotateZ(Math.sin(t * 0.7) * 0.004 + dip * 0.16)

    const now = performance.now()
    const view = this.weapons[this.activeWeapon]
    const flash = now < this.flashUntil
      ? Math.max(0, (this.flashUntil - now) / view.flashMs)
      : 0
    const flashMaterial = view.flash.material as THREE.SpriteMaterial
    const glowMaterial = view.glow.material as THREE.SpriteMaterial
    flashMaterial.opacity = flash
    glowMaterial.opacity = flash * 0.55
    view.light.intensity = flash * 9
    view.flash.scale.setScalar(view.flashBaseScale + flash * 0.1)
    view.glow.scale.setScalar(view.glowBaseScale + flash * 0.2)

    for (const id of ['rifle', 'pistol'] as const) {
      if (id === this.activeWeapon) continue
      const inactive = this.weapons[id]
      ;(inactive.flash.material as THREE.SpriteMaterial).opacity = 0
      ;(inactive.glow.material as THREE.SpriteMaterial).opacity = 0
      inactive.light.intensity = 0
    }

    if (view.sightDot) {
      const dot = view.sightDot.material as THREE.SpriteMaterial
      dot.opacity = 0.8 + Math.sin(t * 2.2) * 0.12
    }

    this.renderer.render(this.scene, this.camera)
  }
}
