import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'mcu-tracking',
  firestore: { host: '127.0.0.1', port: 8080 },
})

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()

  await setDoc(doc(db, 'publicTracking', 'token-contoh-123'), {
    active: true,
    overallStatus: 'Dalam proses',
    units: {
      REG: 'Selesai',
      FIS: 'Sedang diperiksa',
      LAB: 'Selesai',
      RAD: 'Belum mulai',
      USG: 'Belum mulai',
      URI: 'Belum mulai',
    },
    updatedAt: Timestamp.now(),
  })

  await setDoc(doc(db, 'publicTracking', 'token-dicabut'), {
    active: false,
    overallStatus: 'Dalam proses',
    units: { REG: 'Selesai' },
    updatedAt: Timestamp.now(),
  })
})

await env.cleanup()
console.log('Data contoh berhasil dibuat.')