import type { OverallStatus } from '../types/mcu'

export function overallPillClass(status: OverallStatus): string {
  if (status === 'Selesai') return 'pill pill-done'
  if (status === 'Dalam proses') return 'pill pill-active'
  return 'pill pill-idle'
}