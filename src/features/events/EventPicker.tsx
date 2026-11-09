import { useEvents } from './EventContext'

export default function EventPicker() {
  const { events, selected, setSelectedEventId } = useEvents()

  if (events.length === 0) return null

  return (
    <label className="event-picker">
      <span className="sr-only">Pilih acara</span>
      <select
        value={selected?.id ?? ''}
        onChange={(e) => setSelectedEventId(e.target.value)}
        aria-label="Pilih acara"
      >
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
            {ev.status === 'selesai' ? ' (selesai)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}