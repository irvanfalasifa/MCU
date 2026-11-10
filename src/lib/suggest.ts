import { UNIT_CODES, type PublicBoard, type UnitCode, type UnitStatus } from '../types/mcu'

export type Suggestion =
  | { kind: 'done' }
  | { kind: 'locked' }
  | { kind: 'in-progress'; unit: UnitCode }
  | { kind: 'go'; unit: UnitCode; reason: string }

type Input = {
  units: Partial<Record<UnitCode, UnitStatus>>
  board: PublicBoard | null
  fasting: boolean
  fullBladder: boolean
}

// Aturan urutan (nilai awal, disesuaikan setelah pilot):
// 1) kandung kemih penuh -> USG dulu; 2) puasa -> ambil darah dulu;
// 3) pos kosong didahulukan; 4) pos kosong: yang paling banyak belum menjalani dulu
//    (mengurangi penumpukan); pos sibuk: yang paling sedikit dulu.
export function suggestUnit({ units, board, fasting, fullBladder }: Input): Suggestion {
  const inProgress = UNIT_CODES.find((code) => units[code] === 'Sedang diperiksa')
  if (inProgress) return { kind: 'in-progress', unit: inProgress }

  const candidates = UNIT_CODES.filter((code) => units[code] === 'Menunggu')
  if (candidates.length === 0) {
    const locked = UNIT_CODES.some((code) => units[code] === 'Belum mulai')
    return locked ? { kind: 'locked' } : { kind: 'done' }
  }

  const isBusy = (code: UnitCode) => (board?.units[code]?.busy ?? 0) > 0
  const pending = (code: UnitCode) => board?.units[code]?.pending ?? 0

  const rank = (code: UnitCode): number[] => [
    code === 'USG' && fullBladder ? 0 : 1,
    code === 'LAB' && fasting ? 0 : 1,
    isBusy(code) ? 1 : 0,
    isBusy(code) ? pending(code) : -pending(code),
    UNIT_CODES.indexOf(code),
  ]

  const sorted = [...candidates].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i]
    }
    return 0
  })

  const unit = sorted[0]
  let reason: string
  if (unit === 'USG' && fullBladder) {
    reason = 'Anda sudah kebelet, sebaiknya USG lebih dulu.'
  } else if (unit === 'LAB' && fasting) {
    reason = 'Anda berpuasa, disarankan ambil darah lebih dulu.'
  } else if (!isBusy(unit)) {
    reason = 'Pos ini sedang kosong.'
  } else {
    reason = 'Semua pos yang Anda butuhkan sedang terisi. Pos ini yang paling lengang.'
  }

  return { kind: 'go', unit, reason }
}