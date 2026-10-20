import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../services/firebase'
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
      <main>
        <p>Memuat...</p>
      </main>
    )
  }

  if (state.kind === 'invalid') {
    return (
      <main>
        <h1>Tautan tidak valid</h1>
        <p>Tautan ini tidak ditemukan atau sudah tidak aktif. Silakan hubungi petugas.</p>
      </main>
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
    <main>
      <h1>Progress MCU Anda</h1>
      {data.queueNumber && (
        <p className="queue-number">
          Nomor antrean: <strong>{data.queueNumber}</strong>
        </p>
      )}
      <p>
        Status keseluruhan: <strong>{data.overallStatus}</strong>
      </p>

      <div
        className="progress"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-text">
        {done} dari {required.length} pemeriksaan selesai
      </p>

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
          <small>Diperbarui: {data.updatedAt.toDate().toLocaleString('id-ID')}</small>
        </p>
      )}
    </main>
  )
}