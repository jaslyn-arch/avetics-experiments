import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { blank, slug } from '../constants'
import { deletePhotoFilesFor } from '../lib/photos'
import SettingField from './SettingField'

export default function Machines({ machines, defs, selectedId, onSelect, onChanged }) {
  const [counts, setCounts] = useState({})
  const [templates, setTemplates] = useState([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase
      .from('machines')
      .select('id, runs(count)')
      .then(({ data }) => setCounts(Object.fromEntries((data || []).map((m) => [m.id, m.runs?.[0]?.count ?? 0]))))
  }, [machines])

  useEffect(() => {
    supabase
      .from('setting_templates')
      .select('template')
      .then(({ data }) => setTemplates([...new Set((data || []).map((t) => t.template))]))
  }, [])

  const selected = machines.find((m) => m.id === selectedId) ?? machines[0]

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Machines</h2>
          <button className="btn-quiet btn-sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            {adding ? 'Cancel' : '+ Add a machine'}
          </button>
        </div>
        {adding && (
          <AddMachine
            machines={machines}
            templates={templates}
            onAdded={(id) => { setAdding(false); onChanged(); onSelect(id) }}
          />
        )}
        {machines.length === 0 && <p className="mt-3 text-muted">No machines yet. Add one to get started.</p>}
        <ul className="mt-3 flex flex-wrap gap-2">
          {machines.map((m) => {
            const on = m.id === selected?.id
            return (
              <li key={m.id}>
                <button
                  onClick={() => onSelect(m.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`min-w-[11rem] rounded-md border px-3 py-2 text-left ${on ? 'border-accent/60 bg-accent/15' : 'border-line bg-surface hover:border-accent'}`}
                >
                  <span className="block font-semibold">{m.name}</span>
                  <span className="block text-sm text-muted">
                    {[m.machine_type, `${counts[m.id] ?? 0} run${counts[m.id] === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {selected && (
        <div className="border-t border-line pt-6">
          <MachineEditor
            key={selected.id}
            machine={selected}
            defs={defs.filter((d) => d.machine_id === selected.id)}
            runCount={counts[selected.id] ?? 0}
            templates={templates}
            onChanged={onChanged}
            onDeleted={() => {
              onSelect(machines.find((m) => m.id !== selected.id)?.id ?? null)
              onChanged()
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Add a machine ────────────────────────────────────────────────

function AddMachine({ machines, templates, onAdded }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const startValue = start || (templates[0] ? `tpl:${templates[0]}` : 'blank')

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const sep = startValue.indexOf(':')
    const kind = sep < 0 ? startValue : startValue.slice(0, sep)
    const ref = sep < 0 ? '' : startValue.slice(sep + 1)
    const source = kind === 'copy' ? machines.find((m) => m.id === ref) : null
    const type = kind === 'tpl' ? ref : source?.machine_type ?? null

    const { data: machine, error } = await supabase
      .from('machines')
      .insert({ name: name.trim(), machine_type: type })
      .select('id')
      .single()
    if (error) { setBusy(false); setError(error.message); return }

    const res =
      kind === 'tpl' ? await supabase.rpc('apply_template', { p_machine_id: machine.id, p_template: ref })
      : kind === 'copy' ? await supabase.rpc('copy_machine_settings', { p_from: ref, p_to: machine.id })
      : { error: null }
    setBusy(false)
    if (res.error) setError(`Machine added, but its settings couldn’t be set up: ${res.error.message}`)
    setName('')
    onAdded(machine.id)
  }

  return (
    <form onSubmit={add} className="mt-3 grid items-end gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]">
      <label className="block">
        <span className="lbl">Name</span>
        <input className="field" required placeholder="e.g. Bambu P1S #2" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="lbl">Start its settings from</span>
        <select className="field" value={startValue} onChange={(e) => setStart(e.target.value)}>
          {templates.length > 0 && (
            <optgroup label="Starter lists">
              {templates.map((t) => <option key={t} value={`tpl:${t}`}>{t}</option>)}
            </optgroup>
          )}
          {machines.length > 0 && (
            <optgroup label="Copy a machine (with its defaults)">
              {machines.map((m) => <option key={m.id} value={`copy:${m.id}`}>{m.name}</option>)}
            </optgroup>
          )}
          <option value="blank">Nothing — I’ll add my own</option>
        </select>
      </label>
      <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add machine'}</button>
      {error && <p className="text-sm text-bad sm:col-span-3">{error}</p>}
    </form>
  )
}

// ─── Edit one machine ─────────────────────────────────────────────

function MachineEditor({ machine, defs, runCount, templates, onChanged, onDeleted }) {
  const [name, setName] = useState(machine.name)
  const [type, setType] = useState(machine.machine_type ?? '')
  const [template, setTemplate] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => [...new Set(defs.map((d) => d.grp).filter(Boolean))], [defs])
  const templateValue = template || (templates.includes(machine.machine_type) ? machine.machine_type : templates[0] ?? '')

  async function saveMachine(patch) {
    const { error } = await supabase.from('machines').update(patch).eq('id', machine.id)
    if (error) setError(error.message)
    else onChanged()
  }

  async function deleteMachine() {
    const what = runCount ? ` and all ${runCount} of its logged run${runCount === 1 ? '' : 's'} and their photos` : ''
    if (!confirm(`Delete “${machine.name}”${what}? This can’t be undone.`)) return
    setBusy(true)
    try {
      await deletePhotoFilesFor({ machineId: machine.id })
      const { error } = await supabase.from('machines').delete().eq('id', machine.id)
      if (error) throw error
      onDeleted()
    } catch (e) {
      setBusy(false)
      setError(e.message)
    }
  }

  async function updateDef(d, patch) {
    const { error } = await supabase.from('parameter_defs').update(patch).eq('id', d.id)
    if (error) setError(error.message)
    else { setError(''); onChanged() }
  }

  async function move(index, dir) {
    const order = [...defs]
    const [item] = order.splice(index, 1)
    order.splice(index + dir, 0, item)
    const results = await Promise.all(
      order
        .map((d, i) => (d.sort === (i + 1) * 10 ? null : supabase.from('parameter_defs').update({ sort: (i + 1) * 10 }).eq('id', d.id)))
        .filter(Boolean)
    )
    const err = results.find((r) => r.error)?.error
    if (err) setError(err.message)
    onChanged()
  }

  async function removeDef(d) {
    if (!confirm(`Remove “${d.label}” from ${machine.name}? Runs already logged keep their recorded value.`)) return
    const { error } = await supabase.from('parameter_defs').delete().eq('id', d.id)
    if (error) setError(error.message)
    else onChanged()
  }

  async function addFromTemplate() {
    const { data, error } = await supabase.rpc('apply_template', { p_machine_id: machine.id, p_template: templateValue })
    if (error) return setError(error.message)
    setNote(data ? `Added ${data} setting${data === 1 ? '' : 's'} from the ${templateValue} list.` : `${machine.name} already has everything from the ${templateValue} list.`)
    onChanged()
  }

  async function clearDefaults() {
    if (!confirm(`Clear all default values for ${machine.name}? New runs will start blank.`)) return
    const { error } = await supabase.from('parameter_defs').update({ default_value: null }).eq('machine_id', machine.id)
    if (error) setError(error.message)
    else onChanged()
  }

  return (
    <div className="min-w-0 space-y-6">
      <section className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1">
          <span className="lbl">Machine name</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => (name.trim() ? name.trim() !== machine.name && saveMachine({ name: name.trim() }) : setName(machine.name))}
          />
        </label>
        <label className="block min-w-[10rem] flex-1">
          <span className="lbl">Type (optional)</span>
          <input
            className="field"
            placeholder="e.g. 3D printer"
            value={type}
            onChange={(e) => setType(e.target.value)}
            onBlur={() => type.trim() !== (machine.machine_type ?? '') && saveMachine({ machine_type: type.trim() || null })}
          />
        </label>
        <button className="btn-danger" onClick={deleteMachine} disabled={busy}>{busy ? 'Deleting…' : 'Delete machine'}</button>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Settings for {machine.name}</h2>
          <button
            className="text-sm text-muted hover:text-bad disabled:opacity-40"
            onClick={clearDefaults}
            disabled={!defs.some((d) => !blank(d.default_value))}
          >
            Clear all defaults
          </button>
        </div>
        <p className="mt-1 max-w-prose text-sm text-muted">
          <strong className="text-ink">Default</strong> values pre-fill every new run, so you only change what you’re testing.{' '}
          <strong className="text-ink">Tolerance</strong> decides what counts as the same experiment: two runs match when every
          setting is within it (0 means identical). Changes save when you leave each box.
        </p>
        {error && <p className="mt-3 rounded-md border border-bad p-3 text-sm text-bad">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-xs font-medium text-muted">
              <tr>
                <th className="w-20 p-2 font-medium">Order</th>
                <th className="p-2 font-medium">Setting</th>
                <th className="w-24 p-2 font-medium">Unit</th>
                <th className="w-32 p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Tolerance ± or choices</th>
                <th className="w-36 p-2 font-medium">Default</th>
                <th className="w-40 p-2 font-medium">Group</th>
                <th className="w-10 p-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d, i) => (
                <SettingRow
                  key={d.id}
                  def={d}
                  first={i === 0}
                  last={i === defs.length - 1}
                  onMove={(dir) => move(i, dir)}
                  onUpdate={(patch) => updateDef(d, patch)}
                  onRemove={() => removeDef(d)}
                />
              ))}
              {defs.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-muted">No settings yet. Add one below, or add a starter list.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <datalist id="setting-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      </section>

      <AddSetting machine={machine} defs={defs} onAdded={onChanged} onError={setError} />

      {templates.length > 0 && (
        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
          <label className="block">
            <span className="lbl">Add any missing settings from a starter list</span>
            <select className="field" value={templateValue} onChange={(e) => setTemplate(e.target.value)}>
              {templates.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <button className="btn-quiet" onClick={addFromTemplate}>Add missing settings</button>
          {note && <p role="status" className="w-full text-sm text-muted">{note}</p>}
        </section>
      )}
    </div>
  )
}

// ─── One row of the settings table ────────────────────────────────

function SettingRow({ def, first, last, onMove, onUpdate, onRemove }) {
  const [label, setLabel] = useState(def.label)
  const [unit, setUnit] = useState(def.unit ?? '')
  const [tolerance, setTolerance] = useState(String(def.tolerance))
  const [options, setOptions] = useState((def.options || []).join(', '))
  const [dflt, setDflt] = useState(def.default_value ?? '')
  const [grp, setGrp] = useState(def.grp ?? '')

  // Defaults can also be changed from the logging form
  useEffect(() => { setDflt(def.default_value ?? '') }, [def.default_value])

  const commit = (field, value, current) => {
    if (value !== current) onUpdate({ [field]: value })
  }

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="p-2">
        <div className="flex gap-1">
          <button className="btn-quiet !px-2 !py-0.5 text-xs" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${def.label} up`}>↑</button>
          <button className="btn-quiet !px-2 !py-0.5 text-xs" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${def.label} down`}>↓</button>
        </div>
      </td>
      <td className="p-2">
        <input
          className="field field-sm"
          aria-label="Setting name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => (label.trim() ? commit('label', label.trim(), def.label) : setLabel(def.label))}
        />
      </td>
      <td className="p-2">
        <input
          className="field field-sm"
          aria-label={`Unit for ${def.label}`}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => commit('unit', unit.trim() || null, def.unit ?? null)}
        />
      </td>
      <td className="p-2">
        <select className="field field-sm" aria-label={`Type of ${def.label}`} value={def.kind} onChange={(e) => onUpdate({ kind: e.target.value })}>
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="choice">Dropdown</option>
        </select>
      </td>
      <td className="p-2">
        {def.kind === 'number' && (
          <input
            className="field field-sm w-24"
            type="number"
            step="any"
            min="0"
            aria-label={`Tolerance for ${def.label}`}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            onBlur={() => {
              const n = Number(tolerance)
              if (tolerance === '' || Number.isNaN(n) || n < 0) return setTolerance(String(def.tolerance))
              if (n !== Number(def.tolerance)) onUpdate({ tolerance: n })
            }}
          />
        )}
        {def.kind === 'choice' && (
          <input
            className="field field-sm"
            aria-label={`Choices for ${def.label}, separated by commas`}
            placeholder="Choices, separated by commas"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            onBlur={() => {
              const list = options.split(',').map((s) => s.trim()).filter(Boolean)
              if (list.join('|') !== (def.options || []).join('|')) onUpdate({ options: list })
            }}
          />
        )}
        {def.kind === 'text' && <span className="text-muted">Must match exactly</span>}
      </td>
      <td
        className="p-2"
        onBlur={def.kind === 'choice' ? undefined : () => commit('default_value', blank(dflt) ? null : String(dflt).trim(), def.default_value ?? null)}
      >
        <SettingField
          def={def}
          value={dflt}
          compact
          label={false}
          onChange={(v) => {
            setDflt(v)
            if (def.kind === 'choice') commit('default_value', blank(v) ? null : v, def.default_value ?? null)
          }}
        />
      </td>
      <td className="p-2">
        <input
          className="field field-sm"
          list="setting-groups"
          aria-label={`Group for ${def.label}`}
          value={grp}
          onChange={(e) => setGrp(e.target.value)}
          onBlur={() => commit('grp', grp.trim() || null, def.grp ?? null)}
        />
      </td>
      <td className="p-2 text-right">
        <button className="px-2 py-1 text-muted hover:text-bad" onClick={onRemove} aria-label={`Remove ${def.label}`}>✕</button>
      </td>
    </tr>
  )
}

// ─── Add a setting ────────────────────────────────────────────────

const EMPTY = { label: '', unit: '', kind: 'number', tolerance: '0', options: '', grp: '', default_value: '' }

function AddSetting({ machine, defs, onAdded, onError }) {
  const [d, setD] = useState(EMPTY)
  const set = (patch) => setD((x) => ({ ...x, ...patch }))

  async function add(e) {
    e.preventDefault()
    const base = slug(d.label)
    const keys = new Set(defs.map((x) => x.key))
    let key = base
    for (let n = 2; keys.has(key); n++) key = `${base}_${n}`

    const { error } = await supabase.from('parameter_defs').insert({
      machine_id: machine.id,
      key,
      label: d.label.trim(),
      unit: d.unit.trim() || null,
      kind: d.kind,
      tolerance: d.kind === 'number' ? Math.max(0, Number(d.tolerance) || 0) : 0,
      options: d.kind === 'choice' ? d.options.split(',').map((s) => s.trim()).filter(Boolean) : null,
      grp: d.grp.trim() || null,
      default_value: d.default_value.trim() || null,
      sort: defs.reduce((m, x) => Math.max(m, x.sort), 0) + 10,
    })
    if (error) return onError(error.message)
    setD(EMPTY)
    onAdded()
  }

  return (
    <form onSubmit={add} className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-semibold">Add a setting</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block xl:col-span-2">
          <span className="lbl">Name</span>
          <input className="field" required placeholder="e.g. Chamber temperature" value={d.label} onChange={(e) => set({ label: e.target.value })} />
        </label>
        <label className="block">
          <span className="lbl">Type</span>
          <select className="field" value={d.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="number">Number</option>
            <option value="text">Text</option>
            <option value="choice">Dropdown</option>
          </select>
        </label>
        <label className="block">
          <span className="lbl">Unit (optional)</span>
          <input className="field" placeholder="e.g. °C" value={d.unit} onChange={(e) => set({ unit: e.target.value })} />
        </label>
        {d.kind === 'number' && (
          <label className="block">
            <span className="lbl">Tolerance ±</span>
            <input className="field" type="number" step="any" min="0" value={d.tolerance} onChange={(e) => set({ tolerance: e.target.value })} />
          </label>
        )}
        {d.kind === 'choice' && (
          <label className="block xl:col-span-2">
            <span className="lbl">Choices, separated by commas</span>
            <input className="field" required placeholder="e.g. Smooth PEI, Textured PEI, Glass" value={d.options} onChange={(e) => set({ options: e.target.value })} />
          </label>
        )}
        <label className="block">
          <span className="lbl">Group (optional)</span>
          <input className="field" list="setting-groups" placeholder="e.g. Temperature" value={d.grp} onChange={(e) => set({ grp: e.target.value })} />
        </label>
        <label className="block">
          <span className="lbl">Default (optional)</span>
          <input className="field" value={d.default_value} onChange={(e) => set({ default_value: e.target.value })} />
        </label>
      </div>
      <button className="btn-primary mt-4" disabled={!d.label.trim()}>Add setting</button>
    </form>
  )
}
