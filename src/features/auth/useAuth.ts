import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
import type { UnitCode, UserRole } from '../../types/mcu'

export type AuthState = {
  user: User | null
  role: UserRole | null
  unitCodes: UnitCode[]
  loading: boolean
}

export const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  unitCodes: [],
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}