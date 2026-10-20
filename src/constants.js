export const TYPE_LABELS = { printer: '3D printer', laser: 'Laser engraver', oven: 'Oven' }

export const OUTCOMES = {
  planned: { label: 'Planned', color: 'text-plan border-plan' },
  success: { label: 'Worked', color: 'text-ok border-ok' },
  partial: { label: 'Partly worked', color: 'text-warn border-warn' },
  fail: { label: 'Failed', color: 'text-bad border-bad' },
}

export function formatValue(def, value) {
  if (value === undefined || value === null || value === '') return '—'
  return def.unit ? `${value} ${def.unit}` : String(value)
}
