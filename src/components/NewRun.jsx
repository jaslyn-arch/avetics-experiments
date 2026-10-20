import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { OUTCOMES } from '../constants'
import CheckPanel from './CheckPanel'

export default function NewRun({ machine, defs, prefill, onDraftChange }) {
  const [material, setMaterial] = useState(prefill?.material ?? '')
  const [params, setParams] = useState(() => prefill?.params ?? {})
  const [outcome, setOutcome] = useState('planned')
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [isRepeat, setIsRepeat] = useState(false)
  const [repeatReason, setRepeatReason] = useState('')
  const [materials, setMaterials] = useState([])
  const [check, setCheck] = useState({ state: 'idle', matches: [] })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [refresh, setRefresh] = useState(0)

  // Materials used before on this machine, for the autocomplete list
  useEffect(() => {
    supabase
      .from('runs')
      .select('material')
      .eq('machine_id', machine.id)
      .then(({ data }) => setMaterials([...new Set((data || []).map((r) => r.material))].sort()))
  }, [machine.id, refresh])

  // Only send settings that have a value, as numbers where they should be
  const cleaned = useMemo(() => {
    const out = {}
    for (const d of defs) {
      const v = params[d.key]
      if (v === undefined || v === null || String(v).trim() === '') continue
      out[d.key] = d.kind === 'number' ? Number(v) : String(v).trim()
    }
    return out
  }, [params, defs])

  // Share the in-progress run with the assistant
  useEffect(() => { onDraftChange?.({ material, params: cleaned }) }, [material, cleaned, onDraftChange])

  const filled = Object.keys(cleaned).length
  const allFilled = defs.length > 0 && filled === defs.length

  // Live check, debounced while typing
  useEffect(() => {
    if (!material.trim()) {
      setCheck({ state: 'idle', matches: [] })
      return
    }
    let cancelled = false
    setCheck((c) => ({ ...c, state: 'loading' }))
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('find_similar_runs', {
        p_machine_id: machine.id,
        p_material: material,
        p_params: cleaned,
        p_wildcard_blank: true,
      })
      if (cancelled) return
      if (error) setCheck({ state: 'error', matches: [], error: error.message })
      else setCheck({ state: 'done', matches: data || [] })
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [material, cleaned, machine.id, refresh])

  const exactMatch = allFilled && check.matches.some((m) => m.match_type === 'exact')
  const blockedByDuplicate = exactMatch && (!isRepeat || !repeatReason.trim())

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('runs').insert({
      machine_id: machine.id,
      material: material.trim(),
      params: cleaned,
      outcome,
      rating: rating ? Number(rating) : null,
      notes: notes.trim() || null,
      is_repeat: isRepeat,
      repeat_reason: isRepeat ? repeatReason.trim() : null,
    })
    setSaving(false)
    if (error) {
      setMessage({ tone: 'text-bad', text: error.message })
      return
    }
    setMessage({
      tone: 'text-ok',
      text: outcome === 'planned'
        ? 'Run saved as planned. Record the result in History once it’s done.'
        : 'Run saved.',
    })
    setParams({})
    setRating('')
    setNotes('')
    setIsRepeat(false)
    setRepeatReason('')
    setOutcome('planned')
    setRefresh((n) => n + 1)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <form onSubmit={save} className="space-y-6">
        <label className="block max-w-md">
          <span className="lbl">Material</span>
          <input
            className="field"
            list="materials"
            required
            placeholder={machine.machine_type === 'oven' ? 'e.g. Sourdough loaf' : machine.machine_type === 'laser' ? 'e.g. 3 mm birch ply' : 'e.g. PLA, Bambu Basic white'}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          />
          <datalist id="materials">
            {materials.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>

        <fieldset>
          <legend className="lbl">Settings</legend>
          {defs.length === 0 && (
            <p className="text-muted">This machine type has no settings yet. Add some in “Machines and settings”.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {defs.map((d) => (
              <label key={d.id} className="block">
                <span className="lbl">
                  {d.label}{d.unit && <span className="ml-1">({d.unit})</span>}
                </span>
                <input
                  className="field"
                  type={d.kind === 'number' ? 'number' : 'text'}
                  step="any"
                  inputMode={d.kind === 'number' ? 'decimal' : undefined}
                  value={params[d.key] ?? ''}
                  onChange={(e) => setParams((p) => ({ ...p, [d.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Result</span>
            <select className="field" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {Object.entries(OUTCOMES).map(([k, v]) => (
                <option key={k} value={k}>{k === 'planned' ? 'Not run yet (planned)' : v.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="lbl">Rating, 1 to 5 (optional)</span>
            <select className="field" value={rating} onChange={(e) => setRating(e.target.value)} disabled={outcome === 'planned'}>
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="lbl">Notes</span>
          <textarea
            className="field min-h-24"
            placeholder="What you were testing, what you saw, photos location…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {exactMatch && (
          <div className="space-y-3 rounded-md border border-warn p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--warn)]" checked={isRepeat} onChange={(e) => setIsRepeat(e.target.checked)} />
              <span>This is a deliberate repeat of a setup that’s already on record.</span>
            </label>
            {isRepeat && (
              <label className="block">
                <span className="lbl">Why repeat it?</span>
                <input
                  className="field"
                  required
                  placeholder="e.g. new spool, checking consistency, nozzle replaced"
                  value={repeatReason}
                  onChange={(e) => setRepeatReason(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-primary" disabled={saving || !material.trim() || blockedByDuplicate}>
            {saving ? 'Saving…' : outcome === 'planned' ? 'Save as planned' : 'Save run'}
          </button>
          {message && <p role="status" className={`text-sm ${message.tone}`}>{message.text}</p>}
        </div>
      </form>

      <CheckPanel
        check={check}
        material={material}
        defs={defs}
        current={cleaned}
        filled={filled}
        allFilled={allFilled}
      />
    </div>
  )
}
