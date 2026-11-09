import { createContext, useContext } from 'react'
import type { McuEvent } from '../../types/mcu'

export type EventState = {
  events: McuEvent[]
  selected: McuEvent | null
  ready: boolean
  setSelectedEventId: (id: string) => void
}

export const EventContext = createContext<EventState>({
  events: [],
  selected: null,
  ready: false,
  setSelectedEventId: () => {},
})

export function useEvents() {
  return useContext(EventContext)
}