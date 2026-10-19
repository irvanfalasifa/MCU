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