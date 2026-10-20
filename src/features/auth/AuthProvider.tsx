import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../../services/firebase'
import { UNIT_CODES, type UnitCode, type UserRole } from '../../types/mcu'
import { AuthContext } from './useAuth'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [unitCodes, setUnitCodes] = useState<UnitCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      let nextRole: UserRole | null = null
      let nextUnits: UnitCode[] = []
      if (currentUser) {
        try {
          const token = await currentUser.getIdTokenResult()
          const claim = token.claims.role
          if (claim === 'admin' || claim === 'coordinator' || claim === 'staff') {
            nextRole = claim
          }
          const rawUnits = token.claims.unitCodes
          if (Array.isArray(rawUnits)) {
            nextUnits = UNIT_CODES.filter((code) => rawUnits.includes(code))
          }
        } catch {
          nextRole = null
          nextUnits = []
        }
      }
      setRole(nextRole)
      setUnitCodes(nextUnits)
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, unitCodes, loading }}>
      {children}
    </AuthContext.Provider>
  )
}