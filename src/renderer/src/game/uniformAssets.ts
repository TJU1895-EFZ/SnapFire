import type { Team } from '@shared/types'

export interface UniformCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface UniformAsset {
  src: string
  crop: UniformCrop
}

function assetUrl(file: string): string {
  if (typeof document === 'undefined') return `assets/uniforms/${file}`
  return new URL(`assets/uniforms/${file}`, document.baseURI).href
}

/**
 * Torso regions measured from the two supplied uniform photographs. The
 * numbers are source-image pixels; keeping them here makes it easy to swap
 * the photos for transparent cut-outs later.
 */
export const UNIFORM_ASSETS: Record<Team, UniformAsset> = {
  red: {
    src: assetUrl('red-army.jpg'),
    crop: { x: 510, y: 410, width: 250, height: 500 }
  },
  blue: {
    src: assetUrl('kmt.jpeg'),
    crop: { x: 340, y: 170, width: 155, height: 250 }
  }
}
