import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
import type { UserRole } from '../../types/mcu'

export type AuthState = {
  user: User | null
  role: UserRole | null
  loading: boolean
}

export const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}