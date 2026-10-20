import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()

const UNIT_CODES = ['REG', 'FIS', 'LAB', 'RAD', 'USG', 'URI'] as const

function jakartaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}

export const createParticipant = onCall({ region: 'asia-southeast2' }, async (request) => {
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
  const units = UNIT_CODES.filter((code) => raw.includes(code))

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
      tx.set(db.collection('queues').doc(), {
        participantId: participantRef.id,
        unitCode,
        mcuDate,
        queueNumber: number,
        status: 'Belum mulai',
        queuedAt: FieldValue.serverTimestamp(),
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
      units: Object.fromEntries(units.map((code) => [code, 'Belum mulai'])),
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

const UNIT_STATUSES = [
  'Belum mulai',
  'Menunggu',
  'Sedang diperiksa',
  'Selesai',
  'Tidak diperlukan',
] as const
type UnitStatus = (typeof UNIT_STATUSES)[number]

const NEXT_STATUSES: Record<UnitStatus, UnitStatus[]> = {
  'Belum mulai': ['Menunggu', 'Sedang diperiksa'],
  Menunggu: ['Sedang diperiksa'],
  'Sedang diperiksa': ['Selesai'],
  Selesai: [],
  'Tidak diperlukan': [],
}

function overallFrom(statuses: UnitStatus[]): 'Belum dimulai' | 'Dalam proses' | 'Selesai' {
  const required = statuses.filter((s) => s !== 'Tidak diperlukan')
  if (required.length > 0 && required.every((s) => s === 'Selesai')) return 'Selesai'
  if (required.some((s) => s !== 'Belum mulai')) return 'Dalam proses'
  return 'Belum dimulai'
}

export const updateUnitStatus = onCall({ region: 'asia-southeast2' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const actorUid = request.auth.uid
  const role = request.auth.token.role
  const staffUnits: unknown = request.auth.token.unitCodes
  const isManager = role === 'admin' || role === 'coordinator'
  const isStaff = role === 'staff'
  if (!isManager && !isStaff) {
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

    if (isStaff && !(Array.isArray(staffUnits) && staffUnits.includes(unitCode))) {
      throw new HttpsError('permission-denied', 'Anda tidak bertugas di unit ini.')
    }
    if (queue.status !== from) {
      throw new HttpsError('failed-precondition', 'Status sudah berubah. Muat ulang daftar antrean.')
    }
    if (!NEXT_STATUSES[from].includes(to)) {
      throw new HttpsError('failed-precondition', 'Perubahan status tidak diizinkan.')
    }

    const participantRef = db.collection('participants').doc(queue.participantId)
    const participantSnap = await tx.get(participantRef)
    const siblingsSnap = await tx.get(
      db.collection('queues').where('participantId', '==', queue.participantId),
    )
    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'Peserta tidak ditemukan.')
    }

    const token = participantSnap.data()!.trackingTokenId as string
    const statuses = siblingsSnap.docs.map((d) =>
      d.id === queueId ? to : (d.data().status as UnitStatus),
    )
    const overall = overallFrom(statuses)

    const queueUpdate: Record<string, unknown> = {
      status: to,
      lastUpdatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (to === 'Sedang diperiksa') queueUpdate.startedAt = FieldValue.serverTimestamp()
    if (to === 'Selesai') queueUpdate.completedAt = FieldValue.serverTimestamp()

    tx.update(queueRef, queueUpdate)
    tx.update(participantRef, {
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.doc(`publicTracking/${token}`), {
      [`units.${unitCode}`]: to,
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(db.collection('auditLogs').doc(), {
      action: 'updateUnitStatus',
      actorUid,
      queueId,
      participantId: queue.participantId,
      unitCode,
      from,
      to,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})

export const regenerateToken = onCall({ region: 'asia-southeast2' }, async (request) => {
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

export const correctUnitStatus = onCall({ region: 'asia-southeast2' }, async (request) => {
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

    const token = participantSnap.data()!.trackingTokenId as string
    const statuses = siblingsSnap.docs.map((d) =>
      d.id === queueId ? to : (d.data().status as UnitStatus),
    )
    const overall = overallFrom(statuses)

    const queueUpdate: Record<string, unknown> = {
      status: to,
      lastUpdatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (to === 'Belum mulai' || to === 'Menunggu' || to === 'Tidak diperlukan') {
      queueUpdate.startedAt = null
      queueUpdate.completedAt = null
    }
    if (to === 'Sedang diperiksa') {
      queueUpdate.completedAt = null
      if (!queue.startedAt) queueUpdate.startedAt = FieldValue.serverTimestamp()
    }
    if (to === 'Selesai') {
      queueUpdate.completedAt = FieldValue.serverTimestamp()
      if (!queue.startedAt) queueUpdate.startedAt = FieldValue.serverTimestamp()
    }

    tx.update(queueRef, queueUpdate)
    tx.update(participantRef, {
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.doc(`publicTracking/${token}`), {
      [`units.${unitCode}`]: to,
      overallStatus: overall,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(db.collection('auditLogs').doc(), {
      action: 'correctUnitStatus',
      actorUid,
      queueId,
      participantId: queue.participantId,
      unitCode,
      from,
      to,
      reason: cleanReason,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})