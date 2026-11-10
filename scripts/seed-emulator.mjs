import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'mcu-tracking',
  firestore: { host: '127.0.0.1', port: 8080 },
})

await env.withSecurityRulesDisabled(async (ctx) => {
  // Pindahkan ke sini:
  const db = ctx.firestore()
  
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  
  await setDoc(doc(db, 'events', 'acara-contoh'), {
    name: 'MCU Contoh',
    type: 'lainnya',
    date: today,
    prefix: 'MCU',
    status: 'aktif',
    createdAt: Timestamp.now(),
    fasting: true,
  })
    const zeroUnit = { pending: 0, busy: 0, current: null }
  await setDoc(doc(db, 'publicBoard', 'acara-contoh'), {
    eventName: 'MCU Contoh',
    fasting: true,
    updatedAt: Timestamp.now(),
    units: {
      REG: zeroUnit, FIS: zeroUnit, LAB: zeroUnit, VIS: zeroUnit,
      EKG: zeroUnit, RAD: zeroUnit, USG: zeroUnit, URI: zeroUnit,
    },
  })

  await setDoc(doc(db, 'publicBoard', 'papan-contoh'), {
    eventName: 'Papan Demo',
    fasting: true,
    updatedAt: Timestamp.now(),
    units: {
      REG: { pending: 0, busy: 0, current: null },
      FIS: { pending: 5, busy: 1, current: 'DEM-004' },
      LAB: { pending: 9, busy: 0, current: null },
      VIS: { pending: 6, busy: 1, current: 'DEM-007' },
      EKG: { pending: 7, busy: 0, current: null },
      RAD: { pending: 4, busy: 0, current: null },
      USG: { pending: 8, busy: 1, current: 'DEM-002' },
      URI: { pending: 0, busy: 0, current: null },
    },
  })

  await setDoc(doc(db, 'publicTracking', 'token-contoh-123'), {
    active: true,
    queueNumber: 'MCU-001',
    overallStatus: 'Dalam proses',
    units: {
      REG: 'Selesai',
      FIS: 'Selesai',
      LAB: 'Menunggu',
      VIS: 'Menunggu',
      EKG: 'Menunggu',
      RAD: 'Menunggu',
      USG: 'Menunggu',
      URI: 'Belum mulai',
    },
    updatedAt: Timestamp.now(),
  })

  await setDoc(doc(db, 'publicTracking', 'token-dicabut'), {
    active: false,
    queueNumber: 'MCU-001',
    overallStatus: 'Dalam proses',
    units: { REG: 'Selesai' },
    updatedAt: Timestamp.now(),
  })
})

await env.cleanup()
console.log('Data contoh berhasil dibuat.')