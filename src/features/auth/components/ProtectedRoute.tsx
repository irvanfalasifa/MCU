import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import AppHeader from '../../../components/AppHeader'
import type { UserRole } from '../../../types/mcu'
import { useAuth } from '../useAuth'

type Props = {
  children: ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, loading } = useAuth()

  if (loading) return <div className="center-screen">Memuat...</div>
  if (!user) return <Navigate to="/login" replace />

  const allowed = !allowedRoles || (role !== null && allowedRoles.includes(role))

  return (
    <>
      <AppHeader />
      {allowed ? (
        children
      ) : (
        <main>
          <div className="panel empty">
            <h1>Akses ditolak</h1>
            <p>Akun Anda tidak memiliki izin untuk membuka halaman ini.</p>
          </div>
        </main>
      )}
    </>
  )
}