import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const BENEFITS = [
  {
    icon: '🔍',
    title: 'Deteksi dini',
    text: 'Sebagian kondisi kesehatan baru terasa gejalanya setelah berkembang. Pemeriksaan berkala membantu menemukannya lebih awal, saat penanganan umumnya lebih mudah.',
  },
  {
    icon: '📈',
    title: 'Pantau dari waktu ke waktu',
    text: 'Hasil dari tahun ke tahun dapat dibandingkan, sehingga perubahan pada tubuh Anda lebih mudah terlihat.',
  },
  {
    icon: '🥗',
    title: 'Dasar gaya hidup sehat',
    text: 'Hasil pemeriksaan membantu menentukan langkah pencegahan, seperti pola makan, aktivitas fisik, dan istirahat.',
  },
  {
    icon: '🩺',
    title: 'Konsultasi dengan dokter',
    text: 'Temuan dapat dibahas langsung agar Anda tahu artinya dan apa yang perlu dilakukan selanjutnya.',
  },
  {
    icon: '🧘',
    title: 'Ketenangan pikiran',
    text: 'Mengetahui kondisi tubuh yang sebenarnya membuat Anda lebih tenang dan lebih siap menjaga kesehatan.',
  },
  {
    icon: '📋',
    title: 'Kebutuhan administrasi',
    text: 'Hasil MCU sering diperlukan untuk keperluan kerja, sekolah, atau perjalanan tertentu.',
  },
]

const EXAMINATIONS = [
  { icon: '📝', name: 'Registrasi', text: 'Pencatatan data peserta dan pemberian nomor antrean.' },
  { icon: '🩺', name: 'Fisik dokter', text: 'Pemeriksaan fisik oleh dokter, seperti tekanan darah dan kondisi umum tubuh.' },
  { icon: '🧪', name: 'Laboratorium', text: 'Pemeriksaan sampel darah untuk melihat indikator kesehatan, misalnya gula darah dan kolesterol.' },
  { icon: '🩻', name: 'Radiologi', text: 'Pemeriksaan pencitraan, seperti rontgen, untuk melihat kondisi organ bagian dalam.' },
  { icon: '🌊', name: 'USG', text: 'Pemeriksaan dengan gelombang suara untuk melihat kondisi organ di area perut.' },
  { icon: '💧', name: 'Urine', text: 'Pemeriksaan sampel urine untuk membantu menilai kondisi ginjal dan saluran kemih.' },
]

const STEPS = [
  {
    title: 'Daftar dan terima label QR',
    text: 'Petugas mendaftarkan Anda dan memberikan label berisi nomor antrean dan kode QR.',
  },
  {
    title: 'Jalani pemeriksaan',
    text: 'Datangi unit pemeriksaan sesuai antrean. Petugas memperbarui status Anda di setiap unit.',
  },
  {
    title: 'Pantau lewat ponsel',
    text: 'Pindai QR kapan saja untuk melihat unit mana yang sudah selesai, tanpa perlu login.',
  },
]

const TIPS = [
  'Ikuti instruksi puasa dan persiapan lain yang diberikan petugas.',
  'Istirahat cukup pada malam sebelum pemeriksaan.',
  'Siapkan identitas dan catatan obat yang sedang Anda konsumsi.',
  'Kenakan pakaian yang nyaman dan mudah dilepas.',
]

export default function HomePage() {
  const { user, role } = useAuth()
  const dashboard = role === 'admin' || role === 'coordinator' ? '/admin' : '/staff'
  const entryPath = user ? dashboard : '/login'
  const entryLabel = user ? 'Buka dashboard' : 'Masuk petugas'

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-container home-nav-inner">
          <span className="brand">🩺 MCU Tracker</span>
          <nav className="home-links">
            <a href="#manfaat">Manfaat</a>
            <a href="#pemeriksaan">Pemeriksaan</a>
            <a href="#cara-kerja">Cara kerja</a>
            <a href="#persiapan">Persiapan</a>
          </nav>
          <Link className="btn btn-primary btn-sm" to={entryPath}>
            {entryLabel}
          </Link>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-container">
          <span className="home-chip">Medical Check-Up</span>
          <h1>Kenali kondisi tubuh Anda, sebelum keluhan datang.</h1>
          <p className="home-lead">
            Medical Check-Up (MCU) adalah pemeriksaan kesehatan menyeluruh untuk mengetahui
            kondisi tubuh Anda saat ini, bahkan ketika Anda merasa sehat.
          </p>
          <div className="home-cta">
            <a className="btn btn-light" href="#manfaat">
              Lihat manfaat MCU
            </a>
            <Link className="btn btn-outline-light" to={entryPath}>
              {entryLabel}
            </Link>
          </div>
          <ul className="home-stats">
            <li>
              <strong>6 unit</strong>
              <span>pemeriksaan terpadu</span>
            </li>
            <li>
              <strong>QR Code</strong>
              <span>untuk memantau progres</span>
            </li>
            <li>
              <strong>Real-time</strong>
              <span>status selalu terbaru</span>
            </li>
          </ul>
        </div>
      </section>

      <section id="manfaat" className="home-section">
        <div className="home-container">
          <h2>Mengapa MCU penting?</h2>
          <p className="lead">
            Pemeriksaan rutin bukan hanya untuk orang yang sakit. Inilah beberapa manfaatnya.
          </p>
          <div className="home-grid">
            {BENEFITS.map((item) => (
              <article key={item.title} className="home-card">
                <div className="home-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pemeriksaan" className="home-section alt">
        <div className="home-container">
          <h2>Pemeriksaan yang Anda jalani</h2>
          <p className="lead">
            Setiap peserta melewati unit pemeriksaan sesuai kebutuhan. Jenis dan jumlah unit
            dapat berbeda untuk setiap paket MCU.
          </p>
          <div className="home-grid">
            {EXAMINATIONS.map((item) => (
              <article key={item.name} className="home-card">
                <div className="home-icon">{item.icon}</div>
                <h3>{item.name}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="home-section">
        <div className="home-container">
          <h2>Pantau progres dengan mudah</h2>
          <p className="lead">
            Tidak perlu menanyakan satu per satu. Cukup pindai QR pada label Anda.
          </p>
          <ol className="home-steps">
            {STEPS.map((step) => (
              <li key={step.title} className="home-card">
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="persiapan" className="home-section alt">
        <div className="home-container">
          <h2>Persiapan sebelum MCU</h2>
          <ul className="home-tips">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="home-note">
            Informasi di halaman ini bersifat umum dan tidak menggantikan konsultasi medis.
            Ikuti selalu arahan dokter dan petugas di lokasi pemeriksaan.
          </p>
        </div>
      </section>

      <footer className="home-footer">
        MCU Tracker · Sistem pemantauan progres Medical Check-Up
      </footer>
    </div>
  )
}