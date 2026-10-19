import type { UnitStatus } from '../../../types/mcu'

const BADGE_CLASS: Record<UnitStatus, string> = {
  'Belum mulai': 'badge badge-idle',
  Menunggu: 'badge badge-wait',
  'Sedang diperiksa': 'badge badge-active',
  Selesai: 'badge badge-done',
  'Tidak diperlukan': 'badge badge-idle',
}

export default function StatusBadge({ status }: { status: UnitStatus }) {
  return <span className={BADGE_CLASS[status] ?? 'badge badge-idle'}>{status}</span>
}