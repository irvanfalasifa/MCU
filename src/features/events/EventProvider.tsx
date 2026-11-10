import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useToast } from '../../components/toast/useToast'
import type { EventStatus, EventType, McuEvent } from '../../types/mcu'
import { useAuth } from '../auth/useAuth'
import { EventContext } from './EventContext'

const STORAGE_KEY = 'mcu.eventId'

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export default function EventProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth()
  const toast = useToast()
  const [events, setEvents] = useState<McuEvent[]>([])
  const [ready, setReady] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(readStored)

  const enabled = user !== null && role !== null

  useEffect(() => {
    if (!enabled) return

    const q = query(collection(db, 'events'), orderBy('date', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setEvents(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: data.name as string,
              type: data.type as EventType,
              date: data.date as string,
              prefix: data.prefix as string,
              status: data.status as EventStatus,
                fasting: data.fasting === true,
            }
          }),
        )
        setReady(true)
      },
      () => toast.error('Tidak dapat memuat daftar acara.'),
    )
    return unsubscribe
  }, [enabled, toast])

  const visible = useMemo(() => (enabled ? events : []), [enabled, events])

  const selected = useMemo(
    () =>
      visible.find((e) => e.id === selectedId) ??
      visible.find((e) => e.status === 'aktif') ??
      visible[0] ??
      null,
    [visible, selectedId],
  )

  const setSelectedEventId = useCallback((id: string) => {
    setSelectedId(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // penyimpanan tidak tersedia; pilihan hanya berlaku selama halaman terbuka
    }
  }, [])

  const value = useMemo(
    () => ({ events: visible, selected, ready, setSelectedEventId }),
    [visible, selected, ready, setSelectedEventId],
  )

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}