import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">🔍</div>
        <h1>Halaman tidak ditemukan</h1>
        <p className="page-sub">Periksa kembali tautan yang Anda buka.</p>
        <Link className="btn btn-primary" to="/home">
          Ke beranda
        </Link>
      </div>
    </div>
  )
}