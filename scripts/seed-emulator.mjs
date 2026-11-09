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
  })

  await setDoc(doc(db, 'publicTracking', 'token-contoh-123'), {
    active: true,
    queueNumber: 'MCU-001',
    overallStatus: 'Dalam proses',
    units: {
      REG: 'Selesai',
      FIS: 'Sedang diperiksa',
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