import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error'

export type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
}

export const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}