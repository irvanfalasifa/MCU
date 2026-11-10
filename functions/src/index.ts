import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  getFirestore,
  type DocumentData,
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

// ---------- Papan antrean publik (hanya angka dan nomor antrean) ----------

type BoardUnit = { pending: number; busy: number; current: string | null }
type StatusChange = { unitCode: string; from: UnitStatus; to: UnitStatus }

function emptyBoardUnits(): Record<string, BoardUnit> {
  const units: Record<string, BoardUnit> = {}
  UNIT_CODES.forEach((code) => {
    units[code] = { pending: 0, busy: 0, current: null }
  })
  return units
}

function boardUnitsAfter(
  existing: DocumentData | undefined,
  changes: StatusChange[],
  queueNumber: string,
): Record<string, BoardUnit> {
  const units = emptyBoardUnits()
  const saved = existing?.units as Record<string, Partial<BoardUnit>> | undefined
  if (saved) {
    UNIT_CODES.forEach((code) => {
      const u = saved[code]
      if (u) {
        units[code] = {
          pending: u.pending ?? 0,
          busy: u.busy ?? 0,
          current: u.current ?? null,
        }
      }
    })
  }

  changes.forEach(({ unitCode, from, to }) => {
    const u = units[unitCode]
    if (!u) return
    if (from === 'Menunggu') u.pending -= 1
    if (to === 'Menunggu') u.pending += 1
    if (from === 'Sedang diperiksa') {
      u.busy -= 1
      if (u.current === queueNumber || u.busy <= 0) u.current = null
    }
    if (to === 'Sedang diperiksa') {
      u.busy += 1
      u.current = queueNumber
    }
    u.pending = Math.max(0, u.pending)
    u.busy = Math.max(0, u.busy)
  })

  return units
}

function writeBoard(
  tx: Transaction,
  eventId: string,
  existing: DocumentData | undefined,
  changes: StatusChange[],
  queueNumber: string,
) {
  tx.set(
    db.doc(`publicBoard/${eventId}`),
    {
      units: boardUnitsAfter(existing, changes, queueNumber),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
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

  const { eventId, requiredUnits } = request.data ?? {}
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new HttpsError('invalid-argument', 'Acara belum dipilih.')
  }

  const raw: unknown = requiredUnits
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
  const token = randomBytes(32).toString('base64url')

  const eventRef = db.collection('events').doc(eventId)
  const counterRef = db.doc(`counters/${eventId}`)
  const participantRef = db.collection('participants').doc()
  const publicRef = db.doc(`publicTracking/${token}`)

  const queueNumber = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Acara tidak ditemukan.')
    }
    const event = eventSnap.data()!
    if (event.status !== 'aktif') {
      throw new HttpsError('failed-precondition', 'Acara ini sudah selesai.')
    }

    const counterSnap = await tx.get(counterRef)
    const boardSnap = await tx.get(db.doc(`publicBoard/${eventId}`))

    const last = counterSnap.exists ? (counterSnap.data()?.last as number) : 0
    const next = last + 1
    const number = `${event.prefix as string}-${String(next).padStart(3, '0')}`
    const mcuDate = event.date as string

    tx.set(counterRef, { last: next })

    tx.set(participantRef, {
      participantId: participantRef.id,
      eventId,
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
        eventId,
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
      eventId,
      eventName: event.name as string,
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
      eventId,
      participantId: participantRef.id,
      at: FieldValue.serverTimestamp(),
    })

    writeBoard(
      tx,
      eventId,
      boardSnap.data(),
      [{ unitCode: 'REG', from: 'Belum mulai', to: 'Menunggu' }],
      number,
    )

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
    const eventId = queue.eventId as string | undefined

    const participantRef = db.collection('participants').doc(queue.participantId)
    const participantSnap = await tx.get(participantRef)
    const siblingsSnap = await tx.get(
      db.collection('queues').where('participantId', '==', queue.participantId),
    )
    const eventSnap = eventId ? await tx.get(db.collection('events').doc(eventId)) : null
    const boardSnap = eventId ? await tx.get(db.doc(`publicBoard/${eventId}`)) : null

    if (eventSnap?.exists && eventSnap.data()?.status === 'selesai') {
      throw new HttpsError('failed-precondition', 'Acara ini sudah selesai.')
    }
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

    if (eventId) {
      const changes: StatusChange[] = [
        { unitCode, from, to },
        ...unlocked.map(
          (code): StatusChange => ({ unitCode: code, from: 'Belum mulai', to: 'Menunggu' }),
        ),
      ]
      writeBoard(tx, eventId, boardSnap?.data(), changes, queue.queueNumber as string)
    }

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
    const eventId = queue.eventId as string | undefined

    if (queue.status !== from) {
      throw new HttpsError('failed-precondition', 'Status sudah berubah. Muat ulang daftar antrean.')
    }

    const participantRef = db.collection('participants').doc(queue.participantId)
    const participantSnap = await tx.get(participantRef)
    const siblingsSnap = await tx.get(
      db.collection('queues').where('participantId', '==', queue.participantId),
    )
    const boardSnap = eventId ? await tx.get(db.doc(`publicBoard/${eventId}`)) : null

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

    if (eventId) {
      const changes: StatusChange[] = [
        { unitCode, from, to },
        ...unlocked.map(
          (code): StatusChange => ({ unitCode: code, from: 'Belum mulai', to: 'Menunggu' }),
        ),
      ]
      writeBoard(tx, eventId, boardSnap?.data(), changes, queue.queueNumber as string)
    }

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

// ---------- createEvent dan setEventStatus ----------

const EVENT_TYPES = ['lansia', 'perusahaan', 'sekolah', 'lainnya'] as const

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const createEvent = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator') {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki izin.')
  }
  const actorUid = request.auth.uid

  const { name, type, date, prefix, fasting } = request.data ?? {}
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanPrefix = typeof prefix === 'string' ? prefix.trim().toUpperCase() : ''
  const cleanFasting = typeof fasting === 'boolean' ? fasting : true

  if (
    cleanName.length < 3 ||
    cleanName.length > 80 ||
    !EVENT_TYPES.includes(type) ||
    !isValidDate(date) ||
    !/^[A-Z]{2,5}$/.test(cleanPrefix)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Data acara tidak valid. Periksa nama, jenis, tanggal, dan awalan (2 sampai 5 huruf).',
    )
  }

  const eventRef = db.collection('events').doc()
  const batch = db.batch()
  batch.set(eventRef, {
    name: cleanName,
    type,
    date,
    prefix: cleanPrefix,
    fasting: cleanFasting,
    status: 'aktif',
    createdBy: actorUid,
    createdAt: FieldValue.serverTimestamp(),
  })
  batch.set(db.doc(`publicBoard/${eventRef.id}`), {
    eventName: cleanName,
    fasting: cleanFasting,
    units: emptyBoardUnits(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(db.collection('auditLogs').doc(), {
    action: 'createEvent',
    actorUid,
    eventId: eventRef.id,
    at: FieldValue.serverTimestamp(),
  })
  await batch.commit()

  return { eventId: eventRef.id }
})

export const setEventStatus = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Anda harus login.')
  }
  const role = request.auth.token.role
  if (role !== 'admin' && role !== 'coordinator') {
    throw new HttpsError('permission-denied', 'Anda tidak memiliki izin.')
  }
  const actorUid = request.auth.uid

  const { eventId, status } = request.data ?? {}
  if (
    typeof eventId !== 'string' ||
    eventId.length === 0 ||
    (status !== 'aktif' && status !== 'selesai')
  ) {
    throw new HttpsError('invalid-argument', 'Data permintaan tidak valid.')
  }

  const eventRef = db.collection('events').doc(eventId)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Acara tidak ditemukan.')
    }
    tx.update(eventRef, { status })
    tx.set(db.collection('auditLogs').doc(), {
      action: 'setEventStatus',
      actorUid,
      eventId,
      status,
      at: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true }
})