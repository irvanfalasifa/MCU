import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG } from 'qrcode.react'
import { db, functions } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
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
  const [selectedUnits, setSelectedUnits] = useState<UnitCode[]>([...UNIT_CODES])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      () => setError('Tidak dapat memuat daftar peserta.'),
    )
    return unsubscribe
  }, [])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  function toggleUnit(code: UnitCode) {
    setSelectedUnits((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    )
  }

  async function handleCreate() {
    setError('')
    setCreating(true)
    try {
      const call = httpsCallable<{ requiredUnits: UnitCode[] }, CreateResult>(
        functions,
        'createParticipant',
      )
      const response = await call({ requiredUnits: selectedUnits })
      setSelectedId(response.data.participantId)
    } catch (err) {
      console.error('createParticipant gagal:', err)
      setError(err instanceof Error ? err.message : 'Gagal membuat peserta.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRegenerate(row: ParticipantRow) {
    const ok = window.confirm(
      `Ganti token untuk ${row.queueNumber}? Tautan dan QR yang lama tidak akan berlaku lagi.`,
    )
    if (!ok) return

    setError('')
    setBusy(true)
    try {
      const call = httpsCallable<{ participantId: string }, { trackingToken: string }>(
        functions,
        'regenerateToken',
      )
      await call({ participantId: row.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti token.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>Dashboard Admin</h1>
      <h2>Daftarkan peserta</h2>

      <fieldset>
        <legend>Unit pemeriksaan yang diperlukan</legend>
        {UNIT_CODES.map((code) => (
          <label key={code} className="check">
            <input
              type="checkbox"
              checked={selectedUnits.includes(code)}
              onChange={() => toggleUnit(code)}
            />
            {UNIT_NAMES[code]}
          </label>
        ))}
      </fieldset>

      <p>
        <button onClick={handleCreate} disabled={creating || selectedUnits.length === 0}>
          {creating ? 'Memproses...' : 'Daftarkan peserta'}
        </button>
      </p>

      {error && <p role="alert">{error}</p>}

      {selected && (
        <section className="result">
          <div className="print-area label">
            <p>
              Nomor antrean: <strong>{selected.queueNumber}</strong>
            </p>
            <QRCodeSVG value={`${baseUrl}/track/${selected.token}`} size={180} />
            <p>
              <small>Pindai untuk melihat progres MCU Anda</small>
            </p>
          </div>
          <p className="row-actions">
            <button onClick={() => window.print()}>Cetak label</button>
            <a href={`/track/${selected.token}`} target="_blank" rel="noreferrer">
              Buka halaman tracking
            </a>
            <button onClick={() => handleRegenerate(selected)} disabled={busy}>
              Ganti token
            </button>
            <button onClick={() => setSelectedId(null)}>Tutup</button>
          </p>
        </section>
      )}

      <h2>Peserta hari ini</h2>
      {rows.length === 0 ? (
        <p>Belum ada peserta hari ini.</p>
      ) : (
        <ul className="unit-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                <strong>{row.queueNumber}</strong> · {row.overallStatus}
              </span>
              <button onClick={() => setSelectedId(row.id)}>Lihat QR</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}