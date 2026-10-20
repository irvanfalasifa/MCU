import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../services/firebase'
import { overallPillClass } from '../../../lib/status'
import {
  UNIT_CODES,
  UNIT_NAMES,
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

export default function TrackingPage() {
  const { token } = useParams()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

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

  return (
    <PublicShell>
      <section className="hero">
        <span className="hero-label">Nomor antrean</span>
        <span className="hero-number">{data.queueNumber ?? '—'}</span>
        <span className={overallPillClass(data.overallStatus)}>{data.overallStatus}</span>
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
        {rows.map(({ code, status }) => (
          <li key={code}>
            <span>{UNIT_NAMES[code]}</span>
            <StatusBadge status={status} />
          </li>
        ))}
      </ul>

      {data.updatedAt && (
        <p className="updated">
          Diperbarui: {data.updatedAt.toDate().toLocaleString('id-ID')}
        </p>
      )}
    </PublicShell>
  )
}