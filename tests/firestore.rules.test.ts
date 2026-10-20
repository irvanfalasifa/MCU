import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const unauth = () => env.unauthenticatedContext().firestore()
const staff = () => env.authenticatedContext('uid-staff').firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mcu-tracking',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const base = {
      overallStatus: 'Dalam proses',
      units: { REG: 'Selesai', LAB: 'Menunggu' },
      updatedAt: new Date(),
    }
    await setDoc(doc(db, 'publicTracking', 'token-aktif'), { ...base, active: true })
    await setDoc(doc(db, 'publicTracking', 'token-dicabut'), { ...base, active: false })
    await setDoc(doc(db, 'participants', 'p1'), { queueNumber: 'MCU-001' })
    await setDoc(doc(db, 'queues', 'q1'), { unitCode: 'LAB' })
    await setDoc(doc(db, 'queues', 'q2'), { unitCode: 'RAD' })
    await setDoc(doc(db, 'users', 'uid-staff'), { role: 'staff' })
  })
})

describe('publicTracking', () => {
  it('pengunjung boleh membaca dokumen aktif', async () => {
    await assertSucceeds(getDoc(doc(unauth(), 'publicTracking', 'token-aktif')))
  })

  it('pengunjung tidak boleh membaca token yang dicabut', async () => {
    await assertFails(getDoc(doc(unauth(), 'publicTracking', 'token-dicabut')))
  })

  it('pengunjung tidak boleh membaca token yang tidak ada', async () => {
    await assertFails(getDoc(doc(unauth(), 'publicTracking', 'tebakan-asal')))
  })

  it('pengunjung tidak boleh mendaftar seluruh koleksi', async () => {
    await assertFails(getDocs(collection(unauth(), 'publicTracking')))
  })

  it('pengunjung tidak boleh menulis', async () => {
    await assertFails(
      setDoc(doc(unauth(), 'publicTracking', 'token-aktif'), { active: true }),
    )
  })

  it('petugas yang login tidak boleh menulis langsung dari browser', async () => {
    await assertFails(
      setDoc(doc(staff(), 'publicTracking', 'token-aktif'), { active: true }),
    )
  })
})

describe('data internal', () => {
  it('pengunjung tidak boleh membaca participants', async () => {
    await assertFails(getDoc(doc(unauth(), 'participants', 'p1')))
  })

  it('petugas login tidak boleh membaca participants dan queues langsung', async () => {
    await assertFails(getDoc(doc(staff(), 'participants', 'p1')))
    await assertFails(getDoc(doc(staff(), 'queues', 'q1')))
  })

  it('pengguna tidak boleh menaikkan role sendiri', async () => {
    await assertFails(
      setDoc(doc(staff(), 'users', 'uid-staff'), { role: 'admin' }),
    )
  })
})

describe('antrean per unit', () => {
  const as = (uid: string, claims: Record<string, unknown>) =>
    env.authenticatedContext(uid, claims).firestore()

  it('petugas LAB boleh membaca antrean LAB', async () => {
    const db = as('u1', { role: 'staff', unitCodes: ['LAB'] })
    await assertSucceeds(getDoc(doc(db, 'queues', 'q1')))
  })

  it('petugas LAB tidak boleh membaca antrean RAD', async () => {
    const db = as('u1', { role: 'staff', unitCodes: ['LAB'] })
    await assertFails(getDoc(doc(db, 'queues', 'q2')))
  })

  it('petugas LAB boleh query unit LAB, tidak boleh query unit RAD', async () => {
    const db = as('u1', { role: 'staff', unitCodes: ['LAB'] })
    await assertSucceeds(getDocs(query(collection(db, 'queues'), where('unitCode', '==', 'LAB'))))
    await assertFails(getDocs(query(collection(db, 'queues'), where('unitCode', '==', 'RAD'))))
  })

  it('admin boleh membaca semua antrean', async () => {
    const db = as('u2', { role: 'admin' })
    await assertSucceeds(getDocs(collection(db, 'queues')))
  })

  it('petugas tidak boleh menulis antrean dari browser', async () => {
    const db = as('u1', { role: 'staff', unitCodes: ['LAB'] })
    await assertFails(setDoc(doc(db, 'queues', 'q1'), { status: 'Selesai' }))
  })
})