import { useState } from 'react'
import { Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../services/firebase'
import { UNIT_CODES, UNIT_NAMES, type UnitCode } from '../../../types/mcu'
import { QRCodeSVG } from 'qrcode.react'

const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin

type CreateResult = {
  participantId: string
  queueNumber: string
  trackingToken: string
}

export default function AdminPage() {
  const [selected, setSelected] = useState<UnitCode[]>([...UNIT_CODES])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CreateResult | null>(null)

  function toggle(code: UnitCode) {
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    )
  }

  async function handleCreate() {
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const call = httpsCallable<{ requiredUnits: UnitCode[] }, CreateResult>(
        functions,
        'createParticipant',
      )
      const response = await call({ requiredUnits: selected })
      setResult(response.data)
    } catch (err) {
      console.error('createParticipant gagal:', err)
      setError(err instanceof Error ? err.message : 'Gagal membuat peserta.')
    } finally {
      setLoading(false)
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
              checked={selected.includes(code)}
              onChange={() => toggle(code)}
            />
            {UNIT_NAMES[code]}
          </label>
        ))}
      </fieldset>

      <p>
        <button onClick={handleCreate} disabled={loading || selected.length === 0}>
          {loading ? 'Memproses...' : 'Daftarkan peserta'}
        </button>
      </p>

      {error && <p role="alert">{error}</p>}

            {result && (
        <section className="result">
          <div className="print-area label">
            <p>
              Nomor antrean: <strong>{result.queueNumber}</strong>
            </p>
            <QRCodeSVG
              value={`${baseUrl}/track/${result.trackingToken}`}
              size={180}
            />
            <p>
              <small>Pindai untuk melihat progres MCU Anda</small>
            </p>
          </div>
          <p>
            <button onClick={() => window.print()}>Cetak label</button>{' '}
            <Link to={`/track/${result.trackingToken}`} target="_blank">
              Buka halaman tracking
            </Link>
          </p>
        </section>
      )}
    </main>
  )
}