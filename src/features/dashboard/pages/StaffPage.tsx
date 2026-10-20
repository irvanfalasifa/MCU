import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
import {
  NEXT_STATUSES,
  UNIT_CODES,
  UNIT_NAMES,
  UNIT_STATUSES,
  type UnitCode,
  type UnitStatus,
} from '../../../types/mcu'
import { useAuth } from '../../auth/useAuth'
import StatusBadge from '../../tracking/components/StatusBadge'

type QueueRow = { id: string; queueNumber: string; status: UnitStatus }

const ACTION_LABEL: Partial<Record<UnitStatus, string>> = {
  Menunggu: 'Tandai menunggu',
  'Sedang diperiksa': 'Mulai periksa',
  Selesai: 'Selesaikan',
}

export default function StaffPage() {
  const { user, role, unitCodes } = useAuth()
  const isManager = role === 'admin' || role === 'coordinator'
  const units: UnitCode[] = role === 'staff' ? unitCodes : [...UNIT_CODES]

  const [unit, setUnit] = useState<UnitCode | ''>(units[0] ?? '')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const [correctionStatus, setCorrectionStatus] = useState<UnitStatus>('Belum mulai')
  const [reason, setReason] = useState('')

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

  function openCorrection(row: QueueRow) {
    setCorrectingId(row.id)
    setCorrectionStatus(UNIT_STATUSES.find((s) => s !== row.status) ?? 'Belum mulai')
    setReason('')
    setError('')
  }

  async function submitCorrection(row: QueueRow) {
    setError('')
    setBusyId(row.id)
    try {
      const call = httpsCallable<
        { queueId: string; expectedStatus: UnitStatus; newStatus: UnitStatus; reason: string },
        { ok: boolean }
      >(functions, 'correctUnitStatus')
      await call({
        queueId: row.id,
        expectedStatus: row.status,
        newStatus: correctionStatus,
        reason,
      })
      setCorrectingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan koreksi.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main>
      <h1>Dashboard Petugas</h1>
      <p>Login sebagai: {user?.email}</p>
      {isManager && (
        <p>
          <Link to="/admin">Ke dashboard admin</Link>
        </p>
      )}

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
                    {isManager && (
                      <button onClick={() => openCorrection(row)}>Koreksi</button>
                    )}
                  </span>

                  {correctingId === row.id && (
                    <div className="correction">
                      <label>
                        Ubah status menjadi
                        <select
                          value={correctionStatus}
                          onChange={(e) => setCorrectionStatus(e.target.value as UnitStatus)}
                        >
                          {UNIT_STATUSES.filter((s) => s !== row.status).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Alasan koreksi (wajib)
                        <input
                          type="text"
                          value={reason}
                          maxLength={200}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <span className="row-actions">
                        <button disabled={busyId === row.id} onClick={() => submitCorrection(row)}>
                          Simpan koreksi
                        </button>
                        <button onClick={() => setCorrectingId(null)}>Batal</button>
                      </span>
                    </div>
                  )}
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