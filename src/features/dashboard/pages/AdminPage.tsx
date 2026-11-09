import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG } from 'qrcode.react'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { useToast } from '../../../components/toast/useToast'
import { db, functions } from '../../../services/firebase'
import { errorMessage } from '../../../lib/errors'
import { overallPillClass } from '../../../lib/status'
import {
  UNIT_CODES,
  UNIT_NAMES,
  type OverallStatus,
  type UnitCode,
} from '../../../types/mcu'
import { useEvents } from '../../events/EventContext'

type ParticipantRow = {
  id: string
  queueNumber: string
  overallStatus: OverallStatus
  token: string
}

type CreateResult = { participantId: string; queueNumber: string; trackingToken: string }

const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin

export default function AdminPage() {
  const toast = useToast()
  const { selected: event } = useEvents()
  const eventId = event?.id
  const eventClosed = event?.status === 'selesai'

  const [selectedUnits, setSelectedUnits] = useState<UnitCode[]>([...UNIT_CODES])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmRow, setConfirmRow] = useState<ParticipantRow | null>(null)

  useEffect(() => {
    if (!eventId) return

    const q = query(collection(db, 'participants'), where('eventId', '==', eventId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          queueNumber: d.data().queueNumber as string,
          overallStatus: d.data().overallStatus as OverallStatus,
          token: d.data().trackingTokenId as string,
        }))
        next.sort((a, b) => a.queueNumber.localeCompare(b.queueNumber))
        setRows(next)
      },
      () => toast.error('Tidak dapat memuat daftar peserta.'),
    )
    return unsubscribe
  }, [eventId, toast])

  const visibleRows = eventId ? rows : []
  const selected = visibleRows.find((row) => row.id === selectedId) ?? null

  function toggleUnit(code: UnitCode) {
    if (code === 'REG') return
    setSelectedUnits((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    )
  }

  async function handleCreate() {
    if (!eventId) return
    setCreating(true)
    try {
      const call = httpsCallable<{ eventId: string; requiredUnits: UnitCode[] }, CreateResult>(
        functions,
        'createParticipant',
      )
      const response = await call({ eventId, requiredUnits: selectedUnits })
      setSelectedId(response.data.participantId)
      toast.success(`Peserta ${response.data.queueNumber} berhasil didaftarkan.`)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mendaftarkan peserta.'))
    } finally {
      setCreating(false)
    }
  }

  async function handleRegenerate() {
    if (!confirmRow) return
    const row = confirmRow
    setConfirmRow(null)
    setBusy(true)
    try {
      const call = httpsCallable<{ participantId: string }, { trackingToken: string }>(
        functions,
        'regenerateToken',
      )
      await call({ participantId: row.id })
      toast.success(`Token ${row.queueNumber} diganti. QR yang lama tidak berlaku lagi.`)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengganti token.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>Peserta MCU</h1>
      <p className="page-sub">
        {event
          ? `Acara: ${event.name}. Daftarkan peserta baru dan kelola QR tracking mereka.`
          : 'Daftarkan peserta baru dan kelola QR tracking mereka.'}
      </p>

      {!event ? (
        <div className="panel empty">
          <p>Belum ada acara. Buat acara terlebih dahulu sebelum mendaftarkan peserta.</p>
          <Link className="btn btn-primary" to="/admin/events">
            Buat acara
          </Link>
        </div>
      ) : (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Daftarkan peserta baru</h2>

          {eventClosed ? (
            <p className="muted">
              Acara ini sudah selesai, jadi peserta baru tidak dapat ditambahkan. Pilih acara
              lain di header atau aktifkan kembali acara ini di halaman Acara.
            </p>
          ) : (
            <>
              <p className="muted">
                Pilih pos pemeriksaan yang harus dilalui peserta. Registrasi selalu wajib.
              </p>

              <div className="chips">
                {UNIT_CODES.map((code) => {
                  const on = selectedUnits.includes(code)
                  const locked = code === 'REG'
                  return (
                    <label
                      key={code}
                      className={`${on ? 'chip chip-on' : 'chip'}${locked ? ' chip-locked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked}
                        onChange={() => toggleUnit(code)}
                      />
                      {UNIT_NAMES[code]}
                    </label>
                  )
                })}
              </div>

              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Memproses...' : 'Daftarkan peserta'}
              </button>
            </>
          )}
        </section>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <div
            className="modal modal-qr"
            role="dialog"
            aria-modal="true"
            aria-label={`QR ${selected.queueNumber}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="print-area label">
              <p>
                Nomor antrean: <strong>{selected.queueNumber}</strong>
              </p>
              <QRCodeSVG value={`${baseUrl}/track/${selected.token}`} size={190} />
              <p>
                <small>Pindai untuk melihat progres MCU Anda</small>
              </p>
            </div>
            <div className="row-actions">
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
                Cetak label
              </button>
              <a
                className="btn btn-sm"
                href={`/track/${selected.token}`}
                target="_blank"
                rel="noreferrer"
              >
                Buka tracking
              </a>
              <button
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => setConfirmRow(selected)}
              >
                Ganti token
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedId(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {event && (
        <>
          <h2>Peserta acara ini ({visibleRows.length})</h2>
          {visibleRows.length === 0 ? (
            <div className="panel empty">Belum ada peserta untuk acara ini.</div>
          ) : (
            <ul className="unit-list">
              {visibleRows.map((row) => (
                <li key={row.id}>
                  <span>
                    <span className="queue-no">{row.queueNumber}</span>
                    <span className={overallPillClass(row.overallStatus)}>
                      {row.overallStatus}
                    </span>
                  </span>
                  <button className="btn btn-sm" onClick={() => setSelectedId(row.id)}>
                    Lihat QR
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmRow !== null}
        title="Ganti token?"
        message={`Tautan dan QR lama untuk ${confirmRow?.queueNumber ?? ''} tidak akan berlaku lagi. Progres peserta tetap tersimpan.`}
        confirmLabel="Ya, ganti token"
        danger
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmRow(null)}
      />
    </main>
  )
}