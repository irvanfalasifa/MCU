import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../../../services/firebase'
import {
  NEXT_STATUSES,
  UNIT_CODES,
  UNIT_NAMES,
  type UnitCode,
  type UnitStatus,
} from '../../../types/mcu'
import { useAuth } from '../../auth/useAuth'
import StatusBadge from '../../tracking/components/StatusBadge'
import { todayJakarta } from '../../../lib/date'

type QueueRow = { id: string; queueNumber: string; status: UnitStatus }

const ACTION_LABEL: Partial<Record<UnitStatus, string>> = {
  Menunggu: 'Tandai menunggu',
  'Sedang diperiksa': 'Mulai periksa',
  Selesai: 'Selesaikan',
}

export default function StaffPage() {
  const { user, role, unitCodes } = useAuth()
  const units: UnitCode[] = role === 'staff' ? unitCodes : [...UNIT_CODES]

  const [unit, setUnit] = useState<UnitCode | ''>(units[0] ?? '')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!unit) return

    const q = query(
      collection(db, 'queues'),
      where('unitCode', '==', unit),
      where('mcuDate', '==', todayJakarta()),
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          queueNumber: d.data().queueNumber as string,
          status: d.data().status as UnitStatus,
        }))
        next.sort((a, b) => a.queueNumber.localeCompare(b.queueNumber))
        setRows(next)
        setError('')
      },
      () => setError('Tidak dapat memuat antrean.'),
    )

    return unsubscribe
  }, [unit])

  async function change(row: QueueRow, newStatus: UnitStatus) {
    setError('')
    setBusyId(row.id)
    try {
      const call = httpsCallable<
        { queueId: string; expectedStatus: UnitStatus; newStatus: UnitStatus },
        { ok: boolean }
      >(functions, 'updateUnitStatus')
      await call({ queueId: row.id, expectedStatus: row.status, newStatus })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main>
      <h1>Dashboard Petugas</h1>
      <p>Login sebagai: {user?.email}</p>

      {units.length === 0 ? (
        <p>Akun ini belum ditugaskan ke unit pemeriksaan mana pun.</p>
      ) : (
        <>
          <label>
            Unit
            <select value={unit} onChange={(e) => setUnit(e.target.value as UnitCode)}>
              {units.map((code) => (
                <option key={code} value={code}>
                  {UNIT_NAMES[code]}
                </option>
              ))}
            </select>
          </label>

          {error && <p role="alert">{error}</p>}

          {rows.length === 0 ? (
            <p>Belum ada antrean hari ini.</p>
          ) : (
            <ul className="unit-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <strong>{row.queueNumber}</strong>
                  <span className="row-actions">
                    <StatusBadge status={row.status} />
                    {NEXT_STATUSES[row.status].map((next) => (
                      <button
                        key={next}
                        disabled={busyId === row.id}
                        onClick={() => change(row, next)}
                      >
                        {ACTION_LABEL[next]}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p>
        <button onClick={() => signOut(auth)}>Keluar</button>
      </p>
    </main>
  )
}