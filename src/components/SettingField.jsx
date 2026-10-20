// One setting's input: a number box, a text box, or a dropdown
export default function SettingField({ def, value, onChange, changed = false, compact = false, label = true }) {
  const id = `setting-${def.id}`
  const cls = `field ${compact ? 'field-sm' : ''} ${def.kind === 'number' ? 'font-mono' : ''} ${changed ? '!border-accent' : ''}`
  const options = def.options || []
  const v = value ?? ''

  const input =
    def.kind === 'choice' ? (
      <select id={id} className={cls} value={v} onChange={(e) => onChange(e.target.value)} aria-label={label ? undefined : def.label}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {v !== '' && !options.some((o) => o.toLowerCase() === String(v).toLowerCase()) && <option value={v}>{v}</option>}
      </select>
    ) : (
      <input
        id={id}
        className={cls}
        type={def.kind === 'number' ? 'number' : 'text'}
        step="any"
        inputMode={def.kind === 'number' ? 'decimal' : undefined}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label ? undefined : def.label}
      />
    )

  if (!label) return input

  return (
    <div>
      <label htmlFor={id} className="lbl">
        {def.label}{def.unit && <span> ({def.unit})</span>}
      </label>
      {input}
      {changed && def.default_value && (
        <p className="mt-1 text-xs font-bold text-accent">Changed · default {def.default_value}</p>
      )}
    </div>
  )
}
