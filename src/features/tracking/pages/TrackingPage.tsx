import { useParams } from 'react-router-dom'

export default function TrackingPage() {
  const { token } = useParams()

  return (
    <main>
      <h1>Tracking Progress MCU</h1>
      <p>Token dari QR Code: {token}</p>
    </main>
  )
}