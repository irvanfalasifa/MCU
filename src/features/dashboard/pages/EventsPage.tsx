import { useState, type FormEvent } from 'react'
import { httpsCallable } from 'firebase/functions'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { useToast } from '../../../components/toast/useToast'
import { functions } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
import { errorMessage } from '../../../lib/errors'
import {
  EVENT_PREFIX_DEFAULT,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  type EventStatus,
  type EventType,
  type McuEvent,
} from '../../../types/mcu'
import { useEvents } from '../../events/EventContext'

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function EventsPage() {
  const toast = useToast()
  const { events, selected, setSelectedEventId } = useEvents()

  const [name, setName] = useState('')
  const [type, setType] = useState<EventType>('perusahaan')
  const [date, setDate] = useState(todayJakarta())
  const [prefixInput, setPrefixInput] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmEvent, setConfirmEvent] = useState<McuEvent | null>(null)

  const prefix = prefixInput ?? EVENT_PREFIX_DEFAULT[type]

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 3) {
      toast.error('Nama acara minimal 3 karakter.')
      return
    }
    if (!/^[A-Z]{2,5}$/.test(prefix)) {
      toast.error('Awalan nomor antrean harus 2 sampai 5 huruf kapital.')
      return
    }

    setSaving(true)
    try {
      const call = httpsCallable<
        { name: string; type: EventType; date: string; prefix: string },
        { eventId: string }
      >(functions, 'createEvent')
      const response = await call({ name, type, date, prefix })
      setSelectedEventId(response.data.eventId)
      toast.success(`Acara "${name.trim()}" berhasil dibuat.`)
      setName('')
      setPrefixInput(null)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal membuat acara.'))
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(event: McuEvent, status: EventStatus) {
    try {
      const call = httpsCallable<{ eventId: string; status: EventStatus }, { ok: boolean }>(
        functions,
        'setEventStatus',
      )
      await call({ eventId: event.id, status })
      toast.success(
        status === 'selesai'
          ? `Acara "${event.name}" ditandai selesai.`
          : `Acara "${event.name}" diaktifkan kembali.`,
      )
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah status acara.'))
    }
  }

  return (
    <main>
      <h1>Acara MCU</h1>
      <p className="page-sub">
        Setiap kegiatan MCU dicatat sebagai satu acara dengan nomor antreannya sendiri.
      </p>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Buat acara baru</h2>
        <form className="form" onSubmit={handleCreate}>
          <div className="form-grid">
            <label className="field">
              <span>Nama acara</span>
              <input
                type="text"
                value={name}
                maxLength={80}
                placeholder="Contoh: MCU PT Contoh"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Jenis</span>
              <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tanggal</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Awalan nomor antrean</span>
              <input
                type="text"
                value={prefix}
                maxLength={5}
                onChange={(e) => setPrefixInput(e.target.value.toUpperCase())}
              />
            </label>
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Memproses...' : 'Buat acara'}
            </button>
          </div>
        </form>
      </section>

      <h2>Daftar acara ({events.length})</h2>
      {events.length === 0 ? (
        <div className="panel empty">Belum ada acara. Buat acara pertama di atas.</div>
      ) : (
        <ul className="unit-list">
          {events.map((ev) => (
            <li key={ev.id}>
              <span className="event-info">
                <strong>{ev.name}</strong>
                <small>
                  {EVENT_TYPE_LABEL[ev.type]} · {formatDate(ev.date)} · awalan {ev.prefix}
                </small>
              </span>
              <span className="row-actions">
                <span className={ev.status === 'aktif' ? 'pill pill-active' : 'pill pill-idle'}>
                  {ev.status === 'aktif' ? 'Aktif' : 'Selesai'}
                </span>
                {selected?.id === ev.id ? (
                  <span className="muted">Dipilih</span>
                ) : (
                  <button className="btn btn-sm" onClick={() => setSelectedEventId(ev.id)}>
                    Pilih
                  </button>
                )}
                {ev.status === 'aktif' ? (
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirmEvent(ev)}>
                    Tandai selesai
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => changeStatus(ev, 'aktif')}
                  >
                    Aktifkan kembali
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmEvent !== null}
        title="Tandai acara selesai?"
        message={`Setelah selesai, peserta baru tidak dapat ditambahkan dan petugas tidak dapat mengubah status untuk "${confirmEvent?.name ?? ''}". Admin tetap dapat mengoreksi dan mengaktifkan kembali.`}
        confirmLabel="Ya, tandai selesai"
        onConfirm={() => {
          if (confirmEvent) void changeStatus(confirmEvent, 'selesai')
          setConfirmEvent(null)
        }}
        onCancel={() => setConfirmEvent(null)}
      />
    </main>
  )
}