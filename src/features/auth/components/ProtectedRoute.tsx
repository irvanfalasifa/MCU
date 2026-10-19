import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../../services/firebase'
import type { UserRole } from '../../../types/mcu'
import { useAuth } from '../useAuth'

type Props = {
  children: ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, loading } = useAuth()

  if (loading) return <p>Memuat...</p>
  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return (
      <main>
        <h1>Akses ditolak</h1>
        <p>Akun Anda tidak memiliki izin untuk membuka halaman ini.</p>
        <button onClick={() => signOut(auth)}>Keluar</button>
      </main>
    )
  }

  return <>{children}</>
}