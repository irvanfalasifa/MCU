import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  getFirestore,
  type QuerySnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()

const REGION = 'asia-southeast2'

const UNIT_CODES = ['REG', 'FIS', 'LAB', 'VIS', 'EKG', 'RAD', 'USG', 'URI'] as const

const UNIT_STATUSES = [
  'Belum mulai',
  'Menunggu',
  'Sedang diperiksa',
  'Selesai',
  'Tidak diperlukan',
] as const
type UnitStatus = (typeof UNIT_STATUSES)[number]

type OverallStatus = 'Belum dimulai' | 'Dalam proses' | 'Selesai'

// Alur normal (hanya maju). 'Belum mulai' = pos belum terbuka; dibuka otomatis.
const NEXT_STATUSES: Record<UnitStatus, UnitStatus[]> = {
  'Belum mulai': [],
  Menunggu: ['Sedang diperiksa'],
  'Sedang diperiksa': ['Selesai'],
  Selesai: [],
  'Tidak diperlukan': [],
}

function jakartaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}

function overallFrom(statuses: UnitStatus[]): OverallStatus {
  const required = statuses.filter((s) => s !== 'Tidak diperlukan')
  if (required.length > 0 && required.every((s) => s === 'Selesai')) return 'Selesai'
  if (required.some((s) => s === 'Sedang diperiksa' || s === 'Selesai')) return 'Dalam proses'
  return 'Belum dimulai'
}

// ---------- Aturan alur ----------

// USG dianggap menghalangi Urine jika ada di paket dan belum selesai.
function isUsgPending(statuses: Map<string, UnitStatus>): boolean {
  const usg = statuses.get('USG')
  return usg !== undefined && usg !== 'Selesai' && usg !== 'Tidak diperlukan'
}

// Pos yang harus dibuka (Belum mulai -> Menunggu) berdasarkan status saat ini.
function unitsToUnlock(statuses: Map<string, UnitStatus>): string[] {
  if (statuses.get('REG') !== 'Selesai') return []
  const result: string[] = []
  statuses.forEach((status, code) => {
    if (code === 'REG' || status !== 'Belum mulai') return
    if (code === 'URI' && isUsgPending(statuses)) return
    result.push(code)
  })
  return result
}

function currentStatusMap(siblings: QuerySnapshot): Map<string, UnitStatus> {
  const map = new Map<string, UnitStatus>()
  siblings.docs.forEach((d) => {
    map.set(d.data().unitCode as string, d.data().status as UnitStatus)
  })
  return map
}

// Menerapkan satu perubahan status ke peta status peserta, lalu membuka pos
// yang memenuhi syarat. Mengembalikan status keseluruhan dan perubahan unit.
function applyChange(params: {
  tx: Transaction
  siblings: QuerySnapshot
  queueId: string
  to: UnitStatus
  actorUid: string
}) {
  const { tx, siblings, queueId, to, actorUid } = params

  const statusMap = new Map<string, UnitStatus>()
  const unitUpdates: Record<string, UnitStatus> = {}

  siblings.docs.forEach((d) => {
    const code = d.data().unitCode as string
    if (d.id === queueId) {
      statusMap.set(code, to)
      unitUpdates[code] = to
    } else {
      statusMap.set(code, d.data().status as UnitStatus)
    }
  })

  const unlocked = unitsToUnlock(statusMap)
  siblings.docs.forEach((d) => {
    const code = d.data().unitCode as string
    if (unlocked.includes(code)) {
      tx.update(d.ref, {
        status: 'Menunggu',
        queuedAt: FieldValue.serverTimestamp(),
        lastUpdatedBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
      })
      statusMap.set(code, 'Menunggu')
      unitUpdates[code] = 'Menunggu'
    }
  })

  return {
    overall: overallFrom(Array.from(statusMap.values())),
    unitUpdates,
    unlocked,
  }
}

function publicUpdateFor(
  overall: OverallStatus,
  unitUpdates: Record<string, UnitStatus>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    overallStatus: overall,
    updatedAt: FieldValue.serverTimestamp(),
  }
  Object.keys(unitUpdates).forEach((code) => {
    update[`units.${code}`] = unitUpdates[code]
  })
  return update
}

// ---------- createParticipant ----------

export const createParticipant = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator') {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki izin.')
  }

  const raw: unknown = request.data?.requiredUnits
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every((c) => UNIT_CODES.includes(c))
  ) {
    throw new HttpsError('invalid-argument', 'Daftar unit pemeriksaan tidak valid.')
  }
  // Registrasi selalu wajib.
  const units = UNIT_CODES.filter((code) => code === 'REG' || raw.includes(code))

  const actorUid = request.auth.uid
  const mcuDate = jakartaDate()
  const token = randomBytes(32).toString('base64url')

  const participantRef = db.collection('participants').doc()
  const counterRef = db.doc(`counters/${mcuDate}`)
  const publicRef = db.doc(`publicTracking/${token}`)

  const queueNumber = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef)
    const last = counterSnap.exists ? (counterSnap.data()?.last as number) : 0
    const next = last + 1
    const number = `MCU-${String(next).padStart(3, '0')}`

    tx.set(counterRef, { last: next })

    tx.set(participantRef, {
      participantId: participantRef.id,
      queueNumber: number,
      mcuDate,
      requiredUnits: units,
      overallStatus: 'Belum dimulai',
      trackingTokenId: token,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      isActive: true,
    })

    for (const unitCode of units) {
      const isReg = unitCode === 'REG'
      tx.set(db.collection('queues').doc(), {
        participantId: participantRef.id,
        unitCode,
        mcuDate,
        queueNumber: number,
        status: isReg ? 'Menunggu' : 'Belum mulai',
        queuedAt: isReg ? FieldValue.serverTimestamp() : null,
        startedAt: null,
        completedAt: null,
        lastUpdatedBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    tx.set(publicRef, {
      active: true,
      queueNumber: number,
      overallStatus: 'Belum dimulai',
      units: Object.fromEntries(
        units.map((code) => [code, code === 'REG' ? 'Menunggu' : 'Belum mulai']),
      ),
      updatedAt: FieldValue.serverTimestamp(),
    })

    tx.set(db.collection('auditLogs').doc(), {
      action: 'createParticipant',
      actorUid,
      participantId: participantRef.id,
      at: FieldValue.serverTimestamp(),
    })

    return number
  })

  return { participantId: participantRef.id, queueNumber, trackingToken: token }
})

// ---------- updateUnitStatus ----------

export const updateUnitStatus = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const actorUid = request.auth.uid
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki izin.')
  }

  const { queueId, expectedStatus, newStatus } = request.data ?? {}
  if (
    typeof queueId !== 'string' ||
    queueId.length === 0 ||
    !UNIT_STATUSES.includes(expectedStatus) ||
    !UNIT_STATUSES.includes(newStatus)
  ) {
    throw new HttpsError('invalid-argument', 'Data permintaan tidak valid.')
  }
  const from = expectedStatus as UnitStatus
  const to = newStatus as UnitStatus

  const queueRef = db.collection('queues').doc(queueId)

  await db.runTransaction(async (tx) => {
    const queueSnap = await tx.get(queueRef)
    if (!queueSnap.exists) {
      throw new HttpsError('not-found', 'Antrean tidak ditemukan.')
    }
    const queue = queueSnap.data()!
    const unitCode = queue.unitCode as string

    const participantRef = db.collection('participants').doc(queue.participantId)
    const participantSnap = await tx.get(participantRef)
    const siblingsSnap = await tx.get(
      db.collection('queues').where('participantId', '==', queue.participantId),
    )
    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'Peserta tidak ditemukan.')
    }

    if (queue.status !== from) {
      throw new HttpsError('failed-precondition', 'Status sudah berubah. Muat ulang daftar antrean.')
    }
    if (!NEXT_STATUSES[from].includes(to)) {
      throw new HttpsError('failed-precondition', 'Perubahan status tidak diizinkan.')
    }

    if (to === 'Sedang diperiksa') {
      const current = currentStatusMap(siblingsSnap)
      if (unitCode !== 'REG' && current.get('REG') !== 'Selesai') {
        throw new HttpsError('failed-precondition', 'Registrasi belum selesai.')
      }
      if (unitCode === 'URI' && isUsgPending(current)) {
        throw new HttpsError(
          'failed-precondition',
          'USG harus selesai lebih dulu sebelum pengambilan urine.',
        )
      }
    }

    const { overall, unitUpdates, unlocked } = applyChange({
      tx,
      siblings: siblingsSnap,
      queueId,
      to,
      actorUid,
    })

    const queueUpdate: Record<string, unknown> = {
      status: to,
      lastUpdatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (to === 'Sedang diperiksa') queueUpdate.startedAt = FieldValue.serverTimestamp()
    if (to === 'Selesai') queueUpdate.completedAt = FieldValue.serverTimestamp()

    const token = participantSnap.data()!.trackingTokenId as string

    tx.update(queueRef, queueUpdate)
    tx.update(participantRef, {
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.doc(`publicTracking/${token}`), publicUpdateFor(overall, unitUpdates))
    tx.set(db.collection('auditLogs').doc(), {
      action: 'updateUnitStatus',
      actorUid,
      queueId,
      participantId: queue.participantId,
      unitCode,
      from,
      to,
      unlocked,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})

// ---------- correctUnitStatus ----------

export const correctUnitStatus = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator') {
    throw new HttpsError(
      'permission-denied',
      'Hanya admin atau koordinator yang dapat mengoreksi status.',
    )
  }
  const actorUid = request.auth.uid

  const { queueId, expectedStatus, newStatus, reason } = request.data ?? {}
  const cleanReason = typeof reason === 'string' ? reason.trim() : ''
  if (
    typeof queueId !== 'string' ||
    queueId.length === 0 ||
    !UNIT_STATUSES.includes(expectedStatus) ||
    !UNIT_STATUSES.includes(newStatus) ||
    expectedStatus === newStatus ||
    cleanReason.length < 3 ||
    cleanReason.length > 200
  ) {
    throw new HttpsError('invalid-argument', 'Data koreksi tidak valid. Alasan minimal 3 karakter.')
  }
  const from = expectedStatus as UnitStatus
  const to = newStatus as UnitStatus

  const queueRef = db.collection('queues').doc(queueId)

  await db.runTransaction(async (tx) => {
    const queueSnap = await tx.get(queueRef)
    if (!queueSnap.exists) {
      throw new HttpsError('not-found', 'Antrean tidak ditemukan.')
    }
    const queue = queueSnap.data()!
    const unitCode = queue.unitCode as string

    if (queue.status !== from) {
      throw new HttpsError('failed-precondition', 'Status sudah berubah. Muat ulang daftar antrean.')
    }

    const participantRef = db.collection('participants').doc(queue.participantId)
    const participantSnap = await tx.get(participantRef)
    const siblingsSnap = await tx.get(
      db.collection('queues').where('participantId', '==', queue.participantId),
    )
    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'Peserta tidak ditemukan.')
    }

    const { overall, unitUpdates, unlocked } = applyChange({
      tx,
      siblings: siblingsSnap,
      queueId,
      to,
      actorUid,
    })

    const queueUpdate: Record<string, unknown> = {
      status: to,
      lastUpdatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (to === 'Belum mulai' || to === 'Menunggu' || to === 'Tidak diperlukan') {
      queueUpdate.startedAt = null
      queueUpdate.completedAt = null
    }
    if (to === 'Menunggu') {
      queueUpdate.queuedAt = FieldValue.serverTimestamp()
    }
    if (to === 'Sedang diperiksa') {
      queueUpdate.completedAt = null
      if (!queue.startedAt) queueUpdate.startedAt = FieldValue.serverTimestamp()
    }
    if (to === 'Selesai') {
      queueUpdate.completedAt = FieldValue.serverTimestamp()
      if (!queue.startedAt) queueUpdate.startedAt = FieldValue.serverTimestamp()
    }

    const token = participantSnap.data()!.trackingTokenId as string

    tx.update(queueRef, queueUpdate)
    tx.update(participantRef, {
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.doc(`publicTracking/${token}`), publicUpdateFor(overall, unitUpdates))
    tx.set(db.collection('auditLogs').doc(), {
      action: 'correctUnitStatus',
      actorUid,
      queueId,
      participantId: queue.participantId,
      unitCode,
      from,
      to,
      unlocked,
      reason: cleanReason,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})

// ---------- regenerateToken ----------

export const regenerateToken = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator') {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki izin.')
  }

  const participantId = request.data?.participantId
  if (typeof participantId !== 'string' || participantId.length === 0) {
    throw new HttpsError('invalid-argument', 'Data permintaan tidak valid.')
  }

  const actorUid = request.auth.uid
  const participantRef = db.collection('participants').doc(participantId)
  const newToken = randomBytes(32).toString('base64url')

  await db.runTransaction(async (tx) => {
    const participantSnap = await tx.get(participantRef)
    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'Peserta tidak ditemukan.')
    }

    const oldToken = participantSnap.data()!.trackingTokenId as string
    const oldRef = db.doc(`publicTracking/${oldToken}`)
    const oldSnap = await tx.get(oldRef)
    if (!oldSnap.exists) {
      throw new HttpsError('not-found', 'Data tracking tidak ditemukan.')
    }

    tx.set(db.doc(`publicTracking/${newToken}`), {
      ...oldSnap.data(),
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(oldRef, { active: false })
    tx.update(participantRef, {
      trackingTokenId: newToken,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(db.collection('auditLogs').doc(), {
      action: 'regenerateToken',
      actorUid,
      participantId,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { trackingToken: newToken }
})