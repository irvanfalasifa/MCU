import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { QRCodeSVG } from 'qrcode.react'
import { useToast } from '../../../components/toast/useToast'
import { db, functions } from '../../../services/firebase'
import { errorMessage } from '../../../lib/errors'
import { UNIT_CODES, UNIT_NAMES, type UnitCode } from '../../../types/mcu'
import { useEvents } from '../../events/EventContext'

type ParticipantRow = { id: string; queueNumber: string; seq: number; token: string }

type BatchResult = {
  participants: { participantId: string; queueNumber: string; trackingToken: string }[]
}

const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin

// Pembuatan dibagi per 25 peserta agar tiap permintaan ke server tetap ringan.
const CHUNK = 25
const MAX_TOTAL = 200

function seqOf(queueNumber: string): number {
  const n = Number.parseInt(queueNumber.split('-').pop() ?? '', 10)
  return Number.isNaN(n) ? 0 : n
}

export default function LabelsPage() {
  const toast = useToast()
  const { selected: event } = useEvents()
  const eventId = event?.id
  const closed = event?.status === 'selesai'

  const [count, setCount] = useState('10')
  const [selectedUnits, setSelectedUnits] = useState<UnitCode[]>([...UNIT_CODES])
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState('')

  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [size, setSize] = useState<'standard' | 'large'>('standard')
  const [withName, setWithName] = useState(false)

  useEffect(() => {
    if (!eventId) return

    const q = query(collection(db, 'participants'), where('eventId', '==', eventId))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => {
          const queueNumber = d.data().queueNumber as string
          return {
            id: d.id,
            queueNumber,
            seq: seqOf(queueNumber),
            token: d.data().trackingTokenId as string,
          }
        })
        next.sort((a, b) => a.seq - b.seq)
        setRows(next)
      },
      () => toast.error('Tidak dapat memuat daftar peserta.'),
    )
    return unsubscribe
  }, [eventId, toast])

  const visibleRows = eventId ? rows : []
  const fromN = from ? Number(from) : 1
  const toN = to ? Number(to) : Number.POSITIVE_INFINITY
  const labels = visibleRows.filter((row) => row.seq >= fromN && row.seq <= toN)
  const qrSize = size === 'large' ? 150 : 100

  function toggleUnit(code: UnitCode) {
    if (code === 'REG') return
    setSelectedUnits((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    )
  }

  async function handleCreate() {
    if (!eventId) return
    const total = Number(count)
    if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) {
      toast.error(`Jumlah peserta harus bilangan bulat 1 sampai ${MAX_TOTAL}.`)
      return
    }

    setCreating(true)
    const createdSeq: number[] = []
    try {
      const call = httpsCallable<
        { eventId: string; count: number; requiredUnits: UnitCode[] },
        BatchResult
      >(functions, 'createParticipantsBatch')

      let remaining = total
      while (remaining > 0) {
        const batchSize = Math.min(CHUNK, remaining)
        const done = total - remaining
        setProgress(`Membuat peserta ${done + 1} sampai ${done + batchSize} dari ${total}...`)
        const response = await call({
          eventId,
          count: batchSize,
          requiredUnits: selectedUnits,
        })
        response.data.participants.forEach((p) => createdSeq.push(seqOf(p.queueNumber)))
        remaining -= batchSize
      }
      toast.success(`${total} peserta berhasil didaftarkan.`)
    } catch (err) {
      const partial =
        createdSeq.length > 0 ? ` ${createdSeq.length} peserta sempat dibuat sebelum gagal.` : ''
      toast.error(`${errorMessage(err, 'Gagal mendaftarkan peserta.')}${partial}`)
    } finally {
      setCreating(false)
      setProgress('')
      if (createdSeq.length > 0) {
        setFrom(String(Math.min(...createdSeq)))
        setTo(String(Math.max(...createdSeq)))
      }
    }
  }

  return (
    <main>
      <div className="no-print">
        <h1>Label peserta</h1>
        <p className="page-sub">
          {event
            ? `Acara: ${event.name}. Daftarkan banyak peserta sekaligus, lalu cetak lembar label QR.`
            : 'Daftarkan banyak peserta sekaligus, lalu cetak lembar label QR.'}
        </p>

        {!event ? (
          <div className="panel empty">
            <p>Belum ada acara. Buat acara terlebih dahulu.</p>
            <Link className="btn btn-primary" to="/admin/events">
              Buat acara
            </Link>
          </div>
        ) : (
          <>
            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Daftarkan peserta sekaligus</h2>

              {closed ? (
                <p className="muted">
                  Acara ini sudah selesai, jadi peserta baru tidak dapat ditambahkan. Label yang
                  sudah ada tetap dapat dicetak.
                </p>
              ) : (
                <>
                  <label className="field" style={{ maxWidth: 220 }}>
                    <span>Jumlah peserta (1 sampai {MAX_TOTAL})</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_TOTAL}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                    />
                  </label>

                  <p className="muted" style={{ marginTop: 16 }}>
                    Pos pemeriksaan untuk semua peserta di bawah ini. Registrasi selalu wajib.
                  </p>
                  <div className="chips">
                    {UNIT_CODES.map((code) => {
                      const on = selectedUnits.includes(code)
                      const locked = code === 'REG'
                      return (
                        <label
                          key={code}
                          className={`${on ? 'chip chip-on' : 'chip'}${locked ? ' chip-locked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked}
                            onChange={() => toggleUnit(code)}
                          />
                          {UNIT_NAMES[code]}
                        </label>
                      )
                    })}
                  </div>

                  <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                    {creating ? 'Memproses...' : 'Buat peserta'}
                  </button>
                  {progress && <p className="muted">{progress}</p>}
                </>
              )}
            </section>

            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Cetak label</h2>
              <div className="form-grid">
                <label className="field">
                  <span>Dari nomor</span>
                  <input
                    type="number"
                    min={1}
                    value={from}
                    placeholder="1"
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Sampai nomor</span>
                  <input
                    type="number"
                    min={1}
                    value={to}
                    placeholder="semua"
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Ukuran label</span>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value as 'standard' | 'large')}
                  >
                    <option value="standard">Standar (±15 per halaman)</option>
                    <option value="large">Besar untuk lansia (±6 per halaman)</option>
                  </select>
                </label>
              </div>

              <label className="check-inline" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={withName}
                  onChange={(e) => setWithName(e.target.checked)}
                />
                Sertakan garis nama (diisi tangan, tidak disimpan di aplikasi)
              </label>

              <p style={{ marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => window.print()}
                  disabled={labels.length === 0}
                >
                  Cetak {labels.length} label
                </button>
              </p>
              <p className="muted" style={{ marginBottom: 0 }}>
                Cocokkan label dengan peserta di Registrasi. Label adalah kunci akses ke halaman
                progres, jadi minta peserta tidak membagikannya.
              </p>
            </section>
          </>
        )}
      </div>

      {event && (
        <>
          <h2 className="no-print">Pratinjau ({labels.length} label)</h2>
          {labels.length === 0 ? (
            <div className="panel empty no-print">
              Belum ada label pada rentang ini. Daftarkan peserta atau ubah rentang nomor.
            </div>
          ) : (
            <div className={`label-sheet print-area size-${size}`}>
              {labels.map((row) => (
                <div key={row.id} className="label-card">
                  <div className="label-event">{event.name}</div>
                  <div className="label-number">{row.queueNumber}</div>
                  <QRCodeSVG value={`${baseUrl}/track/${row.token}`} size={qrSize} />
                  <div className="label-hint">Pindai untuk melihat progres MCU</div>
                  {withName && <div className="label-name">Nama:</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}