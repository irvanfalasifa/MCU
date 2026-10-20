import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG } from 'qrcode.react'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { useToast } from '../../../components/toast/useToast'
import { db, functions } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
import { errorMessage } from '../../../lib/errors'
import { overallPillClass } from '../../../lib/status'
import {
  UNIT_CODES,
  UNIT_NAMES,
  type OverallStatus,
  type UnitCode,
} from '../../../types/mcu'

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
  const [selectedUnits, setSelectedUnits] = useState<UnitCode[]>([...UNIT_CODES])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmRow, setConfirmRow] = useState<ParticipantRow | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'participants'), where('mcuDate', '==', todayJakarta()))
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
  }, [toast])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  function toggleUnit(code: UnitCode) {
    setSelectedUnits((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    )
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const call = httpsCallable<{ requiredUnits: UnitCode[] }, CreateResult>(
        functions,
        'createParticipant',
      )
      const response = await call({ requiredUnits: selectedUnits })
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
      <p className="page-sub">Daftarkan peserta baru dan kelola QR tracking mereka.</p>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Daftarkan peserta baru</h2>
        <p className="muted">Pilih unit pemeriksaan yang harus dilalui peserta.</p>

        <div className="chips">
          {UNIT_CODES.map((code) => {
            const on = selectedUnits.includes(code)
            return (
              <label key={code} className={on ? 'chip chip-on' : 'chip'}>
                <input type="checkbox" checked={on} onChange={() => toggleUnit(code)} />
                {UNIT_NAMES[code]}
              </label>
            )
          })}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={creating || selectedUnits.length === 0}
        >
          {creating ? 'Memproses...' : 'Daftarkan peserta'}
        </button>
      </section>

      {selected && (
        <section className="panel qr-panel">
          <div className="print-area label">
            <p>
              Nomor antrean: <strong>{selected.queueNumber}</strong>
            </p>
            <QRCodeSVG value={`${baseUrl}/track/${selected.token}`} size={180} />
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
              Buka halaman tracking
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
        </section>
      )}

      <h2>Peserta hari ini ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="panel empty">Belum ada peserta hari ini.</div>
      ) : (
        <ul className="unit-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                <span className="queue-no">{row.queueNumber}</span>
                <span className={overallPillClass(row.overallStatus)}>{row.overallStatus}</span>
              </span>
              <button className="btn btn-sm" onClick={() => setSelectedId(row.id)}>
                Lihat QR
              </button>
            </li>
          ))}
        </ul>
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