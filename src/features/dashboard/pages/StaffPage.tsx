import { signOut } from 'firebase/auth'
import { auth } from '../../../services/firebase'
import { useAuth } from '../../auth/useAuth'

export default function StaffPage() {
  const { user } = useAuth()

  return (
    <main>
      <h1>Dashboard Petugas</h1>
      <p>Login sebagai: {user?.email}</p>
      <button onClick={() => signOut(auth)}>Keluar</button>
    </main>
  )
}