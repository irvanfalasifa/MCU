import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
import { errorMessage } from '../../../lib/errors'
import { useToast } from '../../../components/toast/useToast'
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

const ACTION_CLASS: Partial<Record<UnitStatus, string>> = {
  Menunggu: 'btn btn-sm',
  'Sedang diperiksa': 'btn btn-sm btn-primary',
  Selesai: 'btn btn-sm btn-success',
}

export default function StaffPage() {
  const { role, unitCodes } = useAuth()
  const toast = useToast()
  const isManager = role === 'admin' || role === 'coordinator'
  const units: UnitCode[] = [...UNIT_CODES]
  const defaultUnit: UnitCode =
    role === 'staff' && unitCodes[0] ? unitCodes[0] : UNIT_CODES[0]

  const [unit, setUnit] = useState<UnitCode | ''>(defaultUnit)
  const [rows, setRows] = useState<QueueRow[]>([])
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
      },
      () => toast.error('Tidak dapat memuat antrean.'),
    )

    return unsubscribe
  }, [unit, toast])

  async function change(row: QueueRow, newStatus: UnitStatus) {
    setBusyId(row.id)
    try {
      const call = httpsCallable<
        { queueId: string; expectedStatus: UnitStatus; newStatus: UnitStatus },
        { ok: boolean }
      >(functions, 'updateUnitStatus')
      await call({ queueId: row.id, expectedStatus: row.status, newStatus })
      toast.success(`Antrean ${row.queueNumber} diubah menjadi "${newStatus}".`)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah status.'))
    } finally {
      setBusyId(null)
    }
  }

  function openCorrection(row: QueueRow) {
    setCorrectingId(row.id)
    setCorrectionStatus(UNIT_STATUSES.find((s) => s !== row.status) ?? 'Belum mulai')
    setReason('')
  }

  async function submitCorrection(row: QueueRow) {
    if (reason.trim().length < 3) {
      toast.error('Alasan koreksi minimal 3 karakter.')
      return
    }
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
      toast.success(`Koreksi ${row.queueNumber} tersimpan: "${correctionStatus}".`)
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan koreksi.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main>
      <h1>Antrean {unit ? UNIT_NAMES[unit] : ''}</h1>
      <p className="page-sub">
        Pilih unit pemeriksaan, lalu proses antrean peserta hari ini.
      </p>

      {units.length === 0 ? (
        <div className="panel empty">
          Akun ini belum ditugaskan ke unit pemeriksaan mana pun.
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="field">
              <span>Unit pemeriksaan</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as UnitCode)}>
                {units.map((code) => (
                  <option key={code} value={code}>
                    {UNIT_NAMES[code]}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">{rows.length} antrean hari ini</span>
          </div>

          {rows.length === 0 ? (
            <div className="panel empty">Belum ada antrean hari ini.</div>
          ) : (
            <ul className="unit-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <span className="queue-no">{row.queueNumber}</span>

                  <span className="row-actions">
                    <StatusBadge status={row.status} />
                    {NEXT_STATUSES[row.status].map((next) => (
                      <button
                        key={next}
                        className={ACTION_CLASS[next] ?? 'btn btn-sm'}
                        disabled={busyId === row.id}
                        onClick={() => change(row, next)}
                      >
                        {ACTION_LABEL[next]}
                      </button>
                    ))}
                    {isManager && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => openCorrection(row)}
                      >
                        Koreksi
                      </button>
                    )}
                  </span>

                  {correctingId === row.id && (
                    <div className="correction">
                      <label className="field">
                        <span>Ubah status menjadi</span>
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
                      <label className="field">
                        <span>Alasan koreksi (wajib)</span>
                        <input
                          type="text"
                          value={reason}
                          maxLength={200}
                          placeholder="Contoh: salah menekan tombol"
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <span className="row-actions">
                        <button className="btn btn-sm" onClick={() => setCorrectingId(null)}>
                          Batal
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busyId === row.id}
                          onClick={() => submitCorrection(row)}
                        >
                          Simpan koreksi
                        </button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}