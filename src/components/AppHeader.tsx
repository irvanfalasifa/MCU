import { NavLink } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../services/firebase'
import { useAuth } from '../features/auth/useAuth'
import type { UserRole } from '../types/mcu'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  coordinator: 'Koordinator',
  staff: 'Petugas',
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav-link active' : 'nav-link'

export default function AppHeader() {
  const { user, role } = useAuth()
  const isManager = role === 'admin' || role === 'coordinator'

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <span className="brand">🩺 MCU Tracker</span>

        <nav className="nav">
          <NavLink to="/staff" className={linkClass}>
            Antrean unit
          </NavLink>
          {isManager && (
            <NavLink to="/admin" end className={linkClass}>
              Peserta
            </NavLink>
          )}
          {isManager && (
            <NavLink to="/admin/summary" className={linkClass}>
              Ringkasan
            </NavLink>
          )}
        </nav>

        <div className="user-box">
          <span className="user-info">
            <strong>{user?.email}</strong>
            <small>{role ? ROLE_LABEL[role] : 'Tanpa peran'}</small>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}>
            Keluar
          </button>
        </div>
      </div>
    </header>
  )
}