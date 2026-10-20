import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { buildPrompt } from '../lib/buildPrompt'

const TARGETS = {
  claude: { label: 'Claude', url: 'https://claude.ai/new' },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/' },
}

const STARTERS = {
  printer: [
    'What settings have worked best for each filament so far?',
    'Suggest the next print test we haven’t tried yet.',
    'Why might our failed prints have failed?',
  ],
  laser: [
    'What power and speed work best for each material?',
    'Suggest the next engraving test we haven’t tried yet.',
    'Which of our materials are unsafe to laser?',
  ],
  oven: [
    'What temperature and time give our best results?',
    'Suggest the next bake test we haven’t tried yet.',
    'What patterns do you see in our failed runs?',
  ],
}

export default function Assistant({ open, onClose, machines, defs, machine, draft }) {
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState('machine')
  const [useDraft, setUseDraft] = useState(true)
  const [runs, setRuns] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState(null)
  const [manual, setManual] = useState('')
  const inputRef = useRef(null)

  // Load run history when the panel opens, so clicking a button can
  // copy and open the new tab straight away (browsers block both otherwise)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRuns(null)
    supabase
      .from('runs')
      .select('machine_id,material,params,outcome,rating,notes,is_repeat,repeat_reason,created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setLoadError(error.message)
        else { setLoadError(''); setRuns(data) }
      })
    inputRef.current?.focus()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const hasDraft = Boolean(draft?.material?.trim())
  const inScope = scope === 'machine' && machine ? machines.filter((m) => m.id === machine.id) : machines
  const scopedRuns = useMemo(
    () => (runs || []).filter((r) => inScope.some((m) => m.id === r.machine_id)),
    [runs, inScope]
  )

  function makePrompt() {
    return buildPrompt({
      question,
      machines: inScope,
      defs,
      runs: scopedRuns,
      selectedId: machine?.id,
      draft: useDraft && hasDraft ? draft : null,
    })
  }

  function go(targetKey) {
    const prompt = makePrompt()
    const target = TARGETS[targetKey]
    // Start the copy while this page still has focus, then open the tab
    // in the same click so pop-up blockers allow it
    const copying = navigator.clipboard.writeText(prompt)
    if (target) window.open(target.url, '_blank', 'noopener')
    copying.then(
      () => {
        setManual('')
        setStatus(
          target
            ? `Copied. In the ${target.label} tab, paste with Ctrl+V (⌘V on Mac) and send.`
            : 'Copied. Paste it into any AI chat.'
        )
      },
      () => {
        setManual(prompt)
        setStatus('Your browser blocked copying. Select the text below and copy it yourself.')
      }
    )
  }

  if (!open) return null

  const ready = runs !== null && question.trim()
  const starters = STARTERS[machine?.machine_type] ?? STARTERS.printer
  const draftWithStarter = hasDraft ? ['Look at the run I’m about to do. Is it worth testing, and what would you change?'] : []

  return (
    <aside aria-label="Ask Claude or ChatGPT" className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-line bg-surface sm:w-[28rem]">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-bold">Ask Claude or ChatGPT</h2>
          <p className="text-sm text-muted">Writes your question with your logged runs attached, copies it, and opens a new chat on your own account.</p>
        </div>
        <button className="btn-quiet px-3 py-1" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <label className="block">
          <span className="lbl">Your question</span>
          <textarea
            ref={inputRef}
            rows={4}
            className="field resize-y"
            placeholder="e.g. What’s the best setting we’ve found for PETG?"
            value={question}
            onChange={(e) => { setQuestion(e.target.value); setStatus(null) }}
          />
        </label>

        <div>
          <p className="lbl">Or start from one of these</p>
          <ul className="space-y-2">
            {[...draftWithStarter, ...starters].map((s) => (
              <li key={s}>
                <button className="w-full rounded-md border border-line px-3 py-2 text-left text-sm hover:border-accent" onClick={() => { setQuestion(s); setStatus(null) }}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <fieldset className="space-y-2 text-sm">
          <legend className="lbl">Records to include</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" checked={scope === 'machine'} onChange={() => setScope('machine')} />
            {machine?.name ?? 'This machine'} only
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
            All machines
          </label>
          {hasDraft && (
            <label className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={useDraft} onChange={(e) => setUseDraft(e.target.checked)} />
              The run I’m filling in ({draft.material.trim()})
            </label>
          )}
          <p className="text-muted">
            {runs === null ? (loadError ? <span className="text-bad">Couldn’t load runs: {loadError}</span> : 'Loading runs…') : `${scopedRuns.length} run${scopedRuns.length === 1 ? '' : 's'} will be attached.`}
          </p>
        </fieldset>

        {status && <p role="status" className="rounded-md border border-ok p-3 text-sm">{status}</p>}
        {manual && (
          <textarea readOnly className="field h-40 text-xs" value={manual} onFocus={(e) => e.target.select()} />
        )}
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" disabled={!ready} onClick={() => go('claude')}>Copy, open Claude</button>
          <button className="btn-primary" disabled={!ready} onClick={() => go('chatgpt')}>Copy, open ChatGPT</button>
        </div>
        <button className="w-full text-sm text-accent hover:underline disabled:opacity-40" disabled={!ready} onClick={() => go(null)}>
          Just copy it
        </button>
        <p className="text-xs text-muted">Free with your existing Claude or ChatGPT account. Your records and notes are shared with whichever one you open.</p>
      </div>
    </aside>
  )
}
