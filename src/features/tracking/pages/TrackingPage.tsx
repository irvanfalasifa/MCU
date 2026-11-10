import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../services/firebase'
import { overallPillClass } from '../../../lib/status'
import { suggestUnit } from '../../../lib/suggest'
import {
  UNIT_CODES,
  UNIT_NAMES,
  type PublicBoard,
  type PublicTracking,
} from '../../../types/mcu'
import StatusBadge from '../components/StatusBadge'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; data: PublicTracking }

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-page">
      <header className="public-header">
        <span className="brand">🩺 MCU Tracker</span>
      </header>
      <main className="tracking">{children}</main>
    </div>
  )
}

function readBladder(token: string | undefined): boolean {
  if (!token) return false
  try {
    return window.localStorage.getItem(`mcu.bladder:${token}`) === '1'
  } catch {
    return false
  }
}

export default function TrackingPage() {
  const { token } = useParams()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [board, setBoard] = useState<PublicBoard | null>(null)
  const [fullBladder, setFullBladder] = useState(() => readBladder(token))

  const eventId = state.kind === 'ready' ? state.data.eventId : undefined

  useEffect(() => {
    if (!token) return

    const unsubscribe = onSnapshot(
      doc(db, 'publicTracking', token),
      (snap) => {
        if (snap.exists()) {
          setState({ kind: 'ready', data: snap.data() as PublicTracking })
        } else {
          setState({ kind: 'invalid' })
        }
      },
      () => setState({ kind: 'invalid' }),
    )

    return unsubscribe
  }, [token])

  useEffect(() => {
    if (!eventId) return

    const unsubscribe = onSnapshot(
      doc(db, 'publicBoard', eventId),
      (snap) => setBoard(snap.exists() ? (snap.data() as PublicBoard) : null),
      () => setBoard(null),
    )

    return unsubscribe
  }, [eventId])

  function toggleBladder(value: boolean) {
    setFullBladder(value)
    try {
      window.localStorage.setItem(`mcu.bladder:${token}`, value ? '1' : '0')
    } catch {
      // penyimpanan tidak tersedia; pilihan hanya berlaku selama halaman terbuka
    }
  }

  if (state.kind === 'loading') {
    return (
      <PublicShell>
        <div className="panel empty">Memuat progres Anda...</div>
      </PublicShell>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <PublicShell>
        <div className="panel empty">
          <h1>Tautan tidak valid</h1>
          <p>Tautan ini tidak ditemukan atau sudah tidak aktif. Silakan hubungi petugas.</p>
        </div>
      </PublicShell>
    )
  }

  const { data } = state

  const rows = UNIT_CODES.flatMap((code) => {
    const status = data.units[code]
    return status ? [{ code, status }] : []
  })
  const required = rows.filter((row) => row.status !== 'Tidak diperlukan')
  const done = required.filter((row) => row.status === 'Selesai').length
  const percent = required.length ? Math.round((done / required.length) * 100) : 0

  const suggestion = suggestUnit({
    units: data.units,
    board,
    fasting: board?.fasting === true,
    fullBladder,
  })
  const suggestedUnit = suggestion.kind === 'go' ? suggestion.unit : null

  return (
    <PublicShell>
      <section className="hero">
        {data.eventName && <span className="hero-event">{data.eventName}</span>}
        <span className="hero-label">Nomor antrean</span>
        <span className="hero-number">{data.queueNumber ?? '—'}</span>
        <span className={overallPillClass(data.overallStatus)}>{data.overallStatus}</span>
      </section>

      <section className="panel next-step">
        <span className="next-label">Langkah berikutnya</span>

        {suggestion.kind === 'done' && (
          <p className="next-text">Semua pemeriksaan selesai. Terima kasih!</p>
        )}
        {suggestion.kind === 'locked' && (
          <p className="next-text">Menunggu pos berikutnya dibuka oleh petugas.</p>
        )}
        {suggestion.kind === 'in-progress' && (
          <p className="next-text">
            Selesaikan pemeriksaan di {UNIT_NAMES[suggestion.unit]}.
          </p>
        )}
        {suggestion.kind === 'go' && (
          <>
            <p className="next-text">Silakan menuju {UNIT_NAMES[suggestion.unit]}</p>
            <p className="next-reason">{suggestion.reason}</p>
          </>
        )}

        {data.units.USG === 'Menunggu' && (
          <label className="check-inline">
            <input
              type="checkbox"
              checked={fullBladder}
              onChange={(e) => toggleBladder(e.target.checked)}
            />
            Saya sudah kebelet (kandung kemih penuh)
          </label>
        )}

        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Saran ini hanya membantu memilih urutan. Ikuti arahan petugas.
        </p>
      </section>

      <section className="panel">
        <div className="progress-head">
          <strong>
            {done} dari {required.length} pemeriksaan selesai
          </strong>
          <span>{percent}%</span>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <ul className="unit-list">
        {rows.map(({ code, status }) => {
          const boardUnit = board?.units[code]
          const busy = (boardUnit?.busy ?? 0) > 0
          return (
            <li key={code} className={suggestedUnit === code ? 'is-suggested' : undefined}>
              <span>{UNIT_NAMES[code]}</span>
              <span className="row-actions">
                {suggestedUnit === code && <span className="tag tag-suggest">Disarankan</span>}
                {status === 'Menunggu' && boardUnit && (
                  <span className={busy ? 'tag tag-busy' : 'tag tag-free'}>
                    {busy ? 'Sibuk' : 'Kosong'}
                  </span>
                )}
                <StatusBadge status={status} />
              </span>
            </li>
          )
        })}
      </ul>

      {data.updatedAt && (
        <p className="updated">
          Diperbarui: {data.updatedAt.toDate().toLocaleString('id-ID')}
        </p>
      )}
    </PublicShell>
  )
}