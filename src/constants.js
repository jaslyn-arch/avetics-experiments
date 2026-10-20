export const OUTCOMES = {
  planned: { label: 'Planned', color: 'bg-plan/15 text-plan' },
  success: { label: 'Worked', color: 'bg-ok/15 text-ok' },
  partial: { label: 'Partly worked', color: 'bg-warn/15 text-warn' },
  fail: { label: 'Failed', color: 'bg-bad/15 text-bad' },
}

export const blank = (v) => v === undefined || v === null || String(v).trim() === ''

// "Default" means "left on the slicer's / machine's own default"
// (e.g. Bambu Studio's default for that filament)
export const DEFAULT = 'Default'
export const isDefault = (v) => !blank(v) && String(v).trim().toLowerCase() === 'default'

export function formatValue(def, value) {
  if (blank(value)) return '—'
  if (isDefault(value)) return DEFAULT
  return def.unit ? `${value} ${def.unit}` : String(value)
}

// Do two values count as the same setting? (numbers compared as numbers)
export function sameValue(def, a, b) {
  if (blank(a) && blank(b)) return true
  if (blank(a) || blank(b)) return false
  if (def.kind === 'number' && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) return Number(a) === Number(b)
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

// Settings that differ from the machine's defaults (or have no default)
export function differsFromDefault(def, value) {
  if (blank(value)) return false
  if (blank(def.default_value)) return true
  return !sameValue(def, value, def.default_value)
}

// Group settings under their headings, keeping their order
export function groupDefs(defs) {
  const groups = []
  const byName = new Map()
  for (const d of defs) {
    const g = d.grp?.trim() || 'Other settings'
    if (!byName.has(g)) {
      byName.set(g, [])
      groups.push([g, byName.get(g)])
    }
    byName.get(g).push(d)
  }
  return groups
}

export function materialHint(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('laser')) return 'e.g. 3 mm birch ply'
  if (t.includes('oven')) return 'e.g. Sourdough loaf'
  if (t.includes('print')) return 'e.g. PLA, Bambu Basic white'
  return 'e.g. the material or part'
}

export const slug = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'setting'
