import type {
  CombatMode,
  GalleryEntry,
  HostInfo,
  RoomPublicState
} from '@shared/types'
import type { NetClient } from './net/NetClient'

export interface RoomSession {
  net: NetClient
  room: RoomPublicState
  gallery: GalleryEntry[]
  selfId: string
  isHost: boolean
  hostInfo: HostInfo | null
  address: string
  mode: CombatMode
}

export type ToastTone = 'info' | 'success' | 'error'
