import { useState } from 'react'
import { supabase } from '../supabase'
import { TYPE_LABELS } from '../constants'

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export default function Machines({ machines, defs, onChanged }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('printer')
  const [error, setError] = useState('')

  async function addMachine(e) {
    e.preventDefault()
    const { error } = await supabase.from('machines').insert({ name: name.trim(), machine_type: type })
    if (error) return setError(error.message)
    setName('')
    setError('')
    onChanged()
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-bold">Machines</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {machines.map((m) => (
            <li key={m.id} className="rounded-md border border-line bg-surface px-3 py-2">
              {m.name} <span className="text-sm text-muted">{TYPE_LABELS[m.machine_type]}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={addMachine} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-64">
            <span className="lbl">Name</span>
            <input className="field" required placeholder="e.g. Prusa MK4 #2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block w-full sm:w-48">
            <span className="lbl">Type</span>
            <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="btn-primary">Add machine</button>
        </form>
        {error && <p className="mt-2 text-bad">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-bold">Settings and tolerances</h2>
        <p className="mt-1 max-w-prose text-muted">
          Two runs count as the same experiment when the material matches and every setting is within its tolerance.
          A tolerance of 0 means the values must be identical. Machines of the same type share these settings.
        </p>
        <div className="mt-6 grid gap-8 xl:grid-cols-3">
          {Object.entries(TYPE_LABELS).map(([t, label]) => (
            <ParamTable key={t} type={t} label={label} defs={defs.filter((d) => d.machine_type === t)} onChanged={onChanged} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ParamTable({ type, label, defs, onChanged }) {
  const [draft, setDraft] = useState({ label: '', unit: '', kind: 'number', tolerance: '0' })
  const [error, setError] = useState('')

  async function saveTolerance(d, value) {
    const n = Number(value)
    if (Number.isNaN(n) || n < 0 || n === Number(d.tolerance)) return
    const { error } = await supabase.from('parameter_defs').update({ tolerance: n }).eq('id', d.id)
    if (error) setError(error.message)
    else onChanged()
  }

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('parameter_defs').insert({
      machine_type: type,
      key: slug(draft.label),
      label: draft.label.trim(),
      unit: draft.unit.trim() || null,
      kind: draft.kind,
      tolerance: draft.kind === 'number' ? Number(draft.tolerance) || 0 : 0,
      sort: defs.length + 1,
    })
    if (error) return setError(error.message)
    setDraft({ label: '', unit: '', kind: 'number', tolerance: '0' })
    setError('')
    onChanged()
  }

  async function remove(d) {
    if (!confirm(`Remove “${d.label}”? Past runs keep their values, but it won’t be shown or checked.`)) return
    const { error } = await supabase.from('parameter_defs').delete().eq('id', d.id)
    if (error) setError(error.message)
    else onChanged()
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-bold">{label}</h3>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="pb-2 font-normal">Setting</th>
            <th className="w-28 pb-2 font-normal">Tolerance ±</th>
            <th><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => (
            <tr key={d.id} className="border-t border-line">
              <td className="py-2 pr-2">
                {d.label}{d.unit && <span className="text-muted"> ({d.unit})</span>}
              </td>
              <td className="py-2">
                {d.kind === 'number' ? (
                  <input
                    aria-label={`Tolerance for ${d.label}`}
                    className="field px-2 py-1"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={d.tolerance}
                    onBlur={(e) => saveTolerance(d, e.target.value)}
                  />
                ) : (
                  <span className="text-muted">Must match</span>
                )}
              </td>
              <td className="py-2 pl-2 text-right">
                <button className="text-muted hover:text-bad" onClick={() => remove(d)} aria-label={`Remove ${d.label}`}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={add} className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
        <input className="field col-span-2" required placeholder="New setting, e.g. Z offset" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <input className="field" placeholder="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        <select className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} aria-label="Value type">
          <option value="number">Number</option>
          <option value="text">Text</option>
        </select>
        {draft.kind === 'number' && (
          <input className="field" type="number" step="any" min="0" placeholder="Tolerance" aria-label="Tolerance" value={draft.tolerance} onChange={(e) => setDraft({ ...draft, tolerance: e.target.value })} />
        )}
        <button className="btn-quiet">Add setting</button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  )
}
