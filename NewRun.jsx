import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { OUTCOMES, blank, differsFromDefault, groupDefs, materialHint } from '../constants'
import { uploadRunPhotos } from '../lib/photos'
import CheckPanel from './CheckPanel'
import SettingField from './SettingField'
import PhotoPicker from './PhotoPicker'

export default function NewRun({ machine, defs, prefill, onDefaultsSaved, onEditSettings }) {
  const defaults = useMemo(
    () => Object.fromEntries(defs.filter((d) => !blank(d.default_value)).map((d) => [d.key, d.default_value])),
    [defs]
  )
  const hasDefaults = Object.keys(defaults).length > 0

  const [material, setMaterial] = useState(prefill?.material ?? '')
  const [params, setParams] = useState(() => (prefill ? { ...defaults, ...prefill.params } : { ...defaults }))
  const [outcome, setOutcome] = useState('planned')
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [isRepeat, setIsRepeat] = useState(false)
  const [repeatReason, setRepeatReason] = useState('')
  const [materials, setMaterials] = useState([])
  const [check, setCheck] = useState({ state: 'idle', matches: [] })
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState(null)
  const [defaultsMsg, setDefaultsMsg] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    supabase
      .from('runs')
      .select('material')
      .eq('machine_id', machine.id)
      .then(({ data }) => setMaterials([...new Set((data || []).map((r) => r.material))].sort()))
  }, [machine.id, refresh])

  const cleaned = useMemo(() => {
    const out = {}
    for (const d of defs) {
      const v = params[d.key]
      if (blank(v)) continue
      out[d.key] = d.kind === 'number' && !Number.isNaN(Number(v)) ? Number(v) : String(v).trim()
    }
    return out
  }, [params, defs])

  const filled = Object.keys(cleaned).length
  const allFilled = defs.length > 0 && filled === defs.length
  const changedCount = defs.filter((d) => hasDefaults && !blank(d.default_value) && differsFromDefault(d, params[d.key])).length

  // Live duplicate check, debounced while typing
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

  function setParam(key, value) {
    setParams((p) => ({ ...p, [key]: value }))
  }

  async function saveAsDefaults() {
    if (!confirm(`Make these the default settings for ${machine.name}? Everyone logging on this machine will start from them.`)) return
    const results = await Promise.all(
      defs.map((d) =>
        supabase.from('parameter_defs').update({ default_value: blank(params[d.key]) ? null : String(params[d.key]).trim() }).eq('id', d.id)
      )
    )
    const err = results.find((r) => r.error)?.error
    setDefaultsMsg(err ? { tone: 'text-bad', text: err.message } : { tone: 'text-ok', text: 'Saved as this machine’s defaults.' })
    if (!err) onDefaultsSaved()
  }

  async function save(e) {
    e.preventDefault()
    setSaving('Saving…')
    setMessage(null)
    const { data: run, error } = await supabase
      .from('runs')
      .insert({
        machine_id: machine.id,
        material: material.trim(),
        params: cleaned,
        outcome,
        rating: rating ? Number(rating) : null,
        notes: notes.trim() || null,
        is_repeat: isRepeat,
        repeat_reason: isRepeat ? repeatReason.trim() : null,
      })
      .select('id')
      .single()
    if (error) {
      setSaving('')
      setMessage({ tone: 'text-bad', text: error.message })
      return
    }

    let failed = []
    if (photos.length) {
      setSaving(`Uploading ${photos.length} photo${photos.length === 1 ? '' : 's'}…`)
      failed = await uploadRunPhotos(run.id, photos.map((p) => p.file))
    }
    setSaving('')

    const base = outcome === 'planned' ? 'Run saved as planned. Record the result and add photos from History once it’s done.' : 'Run saved.'
    setMessage(
      failed.length
        ? { tone: 'text-warn', text: `${base} Some photos didn’t upload — ${failed.join('; ')}` }
        : { tone: 'text-ok', text: base }
    )
    photos.forEach((p) => URL.revokeObjectURL(p.preview))
    setPhotos([])
    setParams({ ...defaults })
    setRating('')
    setNotes('')
    setIsRepeat(false)
    setRepeatReason('')
    setOutcome('planned')
    setRefresh((n) => n + 1)
  }

  const groups = groupDefs(defs)
  const showGroupHeadings = !(groups.length === 1 && groups[0][0] === 'Other settings')

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form onSubmit={save} className="space-y-6">
        <label className="block max-w-md">
          <span className="lbl">Material</span>
          <input
            className="field"
            list="materials"
            required
            placeholder={materialHint(machine.machine_type)}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
          />
          <datalist id="materials">
            {materials.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>

        <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Settings</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-quiet btn-sm" disabled={!hasDefaults} onClick={() => setParams({ ...defaults })}>
                Reset to defaults
              </button>
              <button type="button" className="btn-quiet btn-sm" onClick={() => setParams({})}>Clear all</button>
              <button type="button" className="btn-quiet btn-sm" disabled={filled === 0} onClick={saveAsDefaults}>
                Save as defaults
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted">
            {hasDefaults
              ? changedCount
                ? `${changedCount} setting${changedCount === 1 ? '' : 's'} changed from ${machine.name}’s defaults.`
                : `Using ${machine.name}’s defaults. Change only what you’re testing.`
              : `No defaults yet. Fill in your usual settings and click “Save as defaults” to pre-fill them next time.`}{' '}
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={onEditSettings}>
              Edit this machine’s settings list
            </button>
          </p>
          {defaultsMsg && <p role="status" className={`mt-2 text-sm ${defaultsMsg.tone}`}>{defaultsMsg.text}</p>}

          {defs.length === 0 && <p className="mt-4 text-muted">This machine has no settings yet. Add some from its settings list.</p>}

          <div className="mt-4 space-y-6">
            {groups.map(([name, items]) => (
              <fieldset key={name}>
                {showGroupHeadings && (
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{name}</legend>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((d) => (
                    <SettingField
                      key={d.id}
                      def={d}
                      value={params[d.key]}
                      onChange={(v) => setParam(d.key, v)}
                      changed={hasDefaults && !blank(d.default_value) && differsFromDefault(d, params[d.key])}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

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
            placeholder="What you were testing, what you saw…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div>
          <span className="lbl">Photos (optional)</span>
          <PhotoPicker files={photos} onChange={setPhotos} disabled={Boolean(saving)} />
        </div>

        {exactMatch && (
          <div className="space-y-3 rounded-md border border-warn p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={isRepeat} onChange={(e) => setIsRepeat(e.target.checked)} />
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
          <button className="btn-primary" disabled={Boolean(saving) || !material.trim() || blockedByDuplicate}>
            {saving || (outcome === 'planned' ? 'Save as planned' : 'Save run')}
          </button>
          {message && <p role="status" className={`text-sm ${message.tone}`}>{message.text}</p>}
        </div>
      </form>

      <CheckPanel check={check} material={material} defs={defs} current={cleaned} filled={filled} allFilled={allFilled} />
    </div>
  )
}
