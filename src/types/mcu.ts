import type { Timestamp } from 'firebase/firestore'

export const UNIT_CODES = ['REG', 'FIS', 'LAB', 'RAD', 'USG', 'URI'] as const
export type UnitCode = (typeof UNIT_CODES)[number]

export const UNIT_NAMES: Record<UnitCode, string> = {
  REG: 'Registrasi',
  FIS: 'Fisik Dokter',
  LAB: 'Laboratorium',
  RAD: 'Radiologi',
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

// Perpindahan status yang diperbolehkan (alur normal, hanya maju)
export const NEXT_STATUSES: Record<UnitStatus, UnitStatus[]> = {
  'Belum mulai': ['Menunggu', 'Sedang diperiksa'],
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
  overallStatus: OverallStatus
  units: Partial<Record<UnitCode, UnitStatus>>
  updatedAt: Timestamp
}

// users/{uid}
export interface AppUser {
  displayName: string
  role: UserRole
  unitCodes: UnitCode[]
  active: boolean
}