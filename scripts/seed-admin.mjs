import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
initializeApp({ projectId: 'mcu-tracking' })
const auth = getAuth()

const accounts = [
  { email: 'admin@contoh.test', password: 'admin123456', displayName: 'Admin Uji', role: 'admin' },
  { email: 'petugas@contoh.test', password: 'petugas123456', displayName: 'Petugas Uji', role: 'staff' },
]

for (const account of accounts) {
  let user
  try {
    user = await auth.getUserByEmail(account.email)
  } catch {
    user = await auth.createUser({
      email: account.email,
      password: account.password,
      displayName: account.displayName,
    })
  }
  await auth.setCustomUserClaims(user.uid, { role: account.role })
  console.log('Akun emulator siap:', account.email, '→', account.role)
}