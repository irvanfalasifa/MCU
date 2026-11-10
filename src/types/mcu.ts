import type { Timestamp } from 'firebase/firestore'

export const UNIT_CODES = ['REG', 'FIS', 'LAB', 'VIS', 'EKG', 'RAD', 'USG', 'URI'] as const
export type UnitCode = (typeof UNIT_CODES)[number]

export const UNIT_NAMES: Record<UnitCode, string> = {
  REG: 'Registrasi',
  FIS: 'Cek Fisik',
  LAB: 'Pengambilan Darah',
  VIS: 'Visus',
  EKG: 'EKG',
  RAD: 'Rontgen',
  USG: 'USG',
  URI: 'Urine',
}

export const UNIT_STATUSES = [
  'Belum mulai',
  'Menunggu',
  'Sedang diperiksa',
  'Selesai',
  'Tidak diperlukan',
] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

// Perpindahan status yang diperbolehkan (alur normal, hanya maju).
// 'Belum mulai' = pos belum terbuka; dibuka otomatis oleh sistem.
export const NEXT_STATUSES: Record<UnitStatus, UnitStatus[]> = {
  'Belum mulai': [],
  Menunggu: ['Sedang diperiksa'],
  'Sedang diperiksa': ['Selesai'],
  Selesai: [],
  'Tidak diperlukan': [],
}

export type OverallStatus = 'Belum dimulai' | 'Dalam proses' | 'Selesai'

export type UserRole = 'admin' | 'coordinator' | 'staff'

// participants/{participantId}
export interface Participant {
  participantId: string
  queueNumber: string
  mcuDate: string
  requiredUnits: UnitCode[]
  overallStatus: OverallStatus
  trackingTokenId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  isActive: boolean
}

// queues/{queueId}
export interface QueueItem {
  participantId: string
  unitCode: UnitCode
  queueNumber: string
  status: UnitStatus
  queuedAt: Timestamp
  startedAt: Timestamp | null
  completedAt: Timestamp | null
  lastUpdatedBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// publicTracking/{tokenId}: hanya informasi minimum
export interface PublicTracking {
  active: boolean
  queueNumber?: string
  eventName?: string
  overallStatus: OverallStatus
  units: Partial<Record<UnitCode, UnitStatus>>
  updatedAt: Timestamp
  eventId?: string
}

// users/{uid}
export interface AppUser {
  displayName: string
  role: UserRole
  unitCodes: UnitCode[]
  active: boolean
}

export const EVENT_TYPES = ['lansia', 'perusahaan', 'sekolah', 'lainnya'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  lansia: 'Lansia',
  perusahaan: 'Perusahaan',
  sekolah: 'Sekolah',
  lainnya: 'Lainnya',
}

export const EVENT_PREFIX_DEFAULT: Record<EventType, string> = {
  lansia: 'LNS',
  perusahaan: 'PRS',
  sekolah: 'SKL',
  lainnya: 'MCU',
}

export type EventStatus = 'aktif' | 'selesai'

export interface McuEvent {
  id: string
  name: string
  type: EventType
  date: string
  prefix: string
  status: EventStatus
  fasting: boolean
}

export interface BoardUnit {
  pending: number
  busy: number
  current: string | null
}

export interface PublicBoard {
  eventName?: string
  fasting?: boolean
  units: Partial<Record<UnitCode, BoardUnit>>
  updatedAt?: Timestamp
}