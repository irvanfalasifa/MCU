import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../../services/firebase'
import type { UserRole } from '../../types/mcu'
import { AuthContext } from './useAuth'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      let nextRole: UserRole | null = null
      if (currentUser) {
        try {
          const token = await currentUser.getIdTokenResult()
          const claim = token.claims.role
          if (claim === 'admin' || claim === 'coordinator' || claim === 'staff') {
            nextRole = claim
          }
        } catch {
          nextRole = null
        }
      }
      setRole(nextRole)
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}