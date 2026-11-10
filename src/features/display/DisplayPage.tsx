import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { UNIT_CODES, UNIT_NAMES, type PublicBoard } from '../../types/mcu'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'ready'; board: PublicBoard }

export default function DisplayPage() {
  const { eventId } = useParams()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

  useEffect(() => {
    if (!eventId) return

    const unsubscribe = onSnapshot(
      doc(db, 'publicBoard', eventId),
      (snap) =>
        setState(
          snap.exists()
            ? { kind: 'ready', board: snap.data() as PublicBoard }
            : { kind: 'missing' },
        ),
      () => setState({ kind: 'missing' }),
    )

    return unsubscribe
  }, [eventId])

  if (state.kind === 'loading') {
    return <div className="board">Memuat papan antrean...</div>
  }

  if (state.kind === 'missing') {
    return (
      <div className="board">
        <h1>Papan antrean tidak ditemukan</h1>
        <p className="board-footer">Periksa kembali alamat papan antrean.</p>
      </div>
    )
  }

  const { board } = state

  return (
    <div className="board">
      <header className="board-header">
        <h1>{board.eventName ?? 'Papan Antrean MCU'}</h1>
        <span className="board-time">
          {board.updatedAt
            ? `Diperbarui ${board.updatedAt.toDate().toLocaleTimeString('id-ID')}`
            : ''}
        </span>
      </header>

      <div className="board-grid">
        {UNIT_CODES.map((code) => {
          const unit = board.units[code]
          const busy = (unit?.busy ?? 0) > 0
          const pending = unit?.pending ?? 0
          return (
            <section key={code} className={busy ? 'board-card busy' : 'board-card free'}>
              <h2>{UNIT_NAMES[code]}</h2>
              <p className="board-state">{busy ? 'SIBUK' : 'KOSONG'}</p>
              <p className="board-now">
                {busy
                  ? unit?.current
                    ? `Sedang diperiksa: ${unit.current}`
                    : 'Sedang diperiksa'
                  : pending > 0
                    ? 'Silakan masuk'
                    : 'Tidak ada antrean'}
              </p>
              <p className="board-pending">Belum menjalani: {pending}</p>
            </section>
          )
        })}
      </div>

      <p className="board-footer">Papan ini hanya menampilkan nomor antrean, tanpa nama.</p>
    </div>
  )
}