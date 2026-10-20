import { useEffect, useState } from 'react'
import { useToast } from '../../../components/toast/useToast'
import { collection, onSnapshot, query, where, type Timestamp } from 'firebase/firestore'
import { db } from '../../../services/firebase'
import { todayJakarta } from '../../../lib/date'
import {
  UNIT_CODES,
  UNIT_NAMES,
  type OverallStatus,
  type UnitCode,
  type UnitStatus,
} from '../../../types/mcu'

// Batas menunggu (menit). Sesuaikan dengan keputusan operasional.
const WAIT_THRESHOLD_MINUTES = 30

type ParticipantRow = { id: string; overallStatus: OverallStatus }
type QueueRow = {
  id: string
  participantId: string
  queueNumber: string
  unitCode: UnitCode
  status: UnitStatus
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

function toMillis(value: unknown): number | null {
  if (value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis()
  }
  return null
}

function formatTime(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString('id-ID') : ''
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const body = rows.map((row) => row.map(escape).join(';')).join('\r\n')
  const csv = '\uFEFF' + 'sep=;\r\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function SummaryPage() {
  const toast = useToast()
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [queues, setQueues] = useState<QueueRow[]>([])
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const today = todayJakarta()

    const unsubscribeParticipants = onSnapshot(
      query(collection(db, 'participants'), where('mcuDate', '==', today)),
      (snap) => {
        setParticipants(
          snap.docs.map((d) => ({
            id: d.id,
            overallStatus: d.data().overallStatus as OverallStatus,
          })),
        )
      },
      () => setError('Tidak dapat memuat data peserta.'),
    )

    const unsubscribeQueues = onSnapshot(
      query(collection(db, 'queues'), where('mcuDate', '==', today)),
      (snap) => {
        setQueues(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              participantId: data.participantId as string,
              queueNumber: data.queueNumber as string,
              unitCode: data.unitCode as UnitCode,
              status: data.status as UnitStatus,
              startedAt: toMillis(data.startedAt),
              completedAt: toMillis(data.completedAt),
              updatedAt: toMillis(data.updatedAt) ?? 0,
            }
          }),
        )
      },
      () => setError('Tidak dapat memuat data antrean.'),
    )

    return () => {
      unsubscribeParticipants()
      unsubscribeQueues()
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const countOverall = (status: OverallStatus) =>
    participants.filter((p) => p.overallStatus === status).length

  const perUnit = UNIT_CODES.map((code) => {
    const items = queues.filter((q) => q.unitCode === code)
    const count = (status: UnitStatus) => items.filter((q) => q.status === status).length
    return {
      code,
      total: items.length,
      belumMulai: count('Belum mulai'),
      menunggu: count('Menunggu'),
      diperiksa: count('Sedang diperiksa'),
      selesai: count('Selesai'),
    }
  })

  const longWaiting = queues
    .filter(
      (q) => q.status === 'Menunggu' && now - q.updatedAt > WAIT_THRESHOLD_MINUTES * 60_000,
    )
    .sort((a, b) => a.updatedAt - b.updatedAt)

  function handleExport() {
    const overallById = new Map(participants.map((p) => [p.id, p.overallStatus]))
    const unitOrder = (code: UnitCode) => UNIT_CODES.indexOf(code)

    const sorted = [...queues].sort(
      (a, b) =>
        a.queueNumber.localeCompare(b.queueNumber) || unitOrder(a.unitCode) - unitOrder(b.unitCode),
    )

    const header = [
      'Nomor antrean',
      'Unit',
      'Status unit',
      'Status keseluruhan',
      'Mulai periksa',
      'Selesai',
      'Durasi (menit)',
    ]
    const lines = sorted.map((q) => [
      q.queueNumber,
      UNIT_NAMES[q.unitCode],
      q.status,
      overallById.get(q.participantId) ?? '',
      formatTime(q.startedAt),
      formatTime(q.completedAt),
      q.startedAt && q.completedAt
        ? String(Math.round((q.completedAt - q.startedAt) / 60000))
        : '',
    ])

      downloadCsv(`laporan-mcu-${todayJakarta()}.csv`, [header, ...lines])
      toast.success('Laporan berhasil diunduh.')
  }

  return (
    <main>
        <h1>Ringkasan hari ini</h1>
         <p className="page-sub">
           Pantau progres peserta dan antrean setiap unit secara langsung.
         </p>

         {error && (
           <div className="alert alert-error" role="alert">
             {error}
           </div>
         )}

      <div className="cards">
        <div className="card">
          Total peserta
          <strong>{participants.length}</strong>
        </div>
        <div className="card">
          Belum dimulai
          <strong>{countOverall('Belum dimulai')}</strong>
        </div>
        <div className="card">
          Dalam proses
          <strong>{countOverall('Dalam proses')}</strong>
        </div>
        <div className="card">
          Selesai
          <strong>{countOverall('Selesai')}</strong>
        </div>
      </div>

      <h2>Antrean per unit</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Belum mulai</th>
              <th>Menunggu</th>
              <th>Diperiksa</th>
              <th>Selesai</th>
            </tr>
          </thead>
          <tbody>
            {perUnit.map((u) => (
              <tr key={u.code}>
                <td>{UNIT_NAMES[u.code]}</td>
                <td>{u.belumMulai}</td>
                <td>{u.menunggu}</td>
                <td>{u.diperiksa}</td>
                <td>{u.selesai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Menunggu lebih dari {WAIT_THRESHOLD_MINUTES} menit</h2>
      {longWaiting.length === 0 ? (
        <p>Tidak ada antrean yang menunggu terlalu lama.</p>
      ) : (
        <ul className="unit-list">
          {longWaiting.map((q) => (
            <li key={q.id}>
              <span>
                <strong>{q.queueNumber}</strong> · {UNIT_NAMES[q.unitCode]}
              </span>
              <span>{Math.round((now - q.updatedAt) / 60000)} menit</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Laporan</h2>
          <p>
            <button
             className="btn btn-primary"
             onClick={handleExport}
             disabled={queues.length === 0}
           >
             Unduh laporan hari ini (CSV)
           </button>
      </p>
    </main>
  )
}