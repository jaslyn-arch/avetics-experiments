// Builds a self-contained question for Claude or ChatGPT, with the
// team's records attached, so it can be pasted into a normal chat.

const OUTCOME = { planned: 'PLANNED (not run yet)', success: 'WORKED', partial: 'PARTLY WORKED', fail: 'FAILED' }

const fmt = (def, v) => `${def.label} ${v}${def.unit ? ' ' + def.unit : ''}`

export function buildPrompt({ question, machines, defs, runs, selectedId, draft }) {
  const defsFor = (type) => defs.filter((d) => d.machine_type === type)

  const sections = machines.map((m) => {
    const md = defsFor(m.machine_type)
    const tol = md
      .map((d) => (d.kind === 'number' ? `${d.label} ±${d.tolerance}${d.unit ? ' ' + d.unit : ''}` : `${d.label} must match`))
      .join('; ')
    const lines = runs
      .filter((r) => r.machine_id === m.id)
      .map((r) => {
        const settings = md.filter((d) => r.params?.[d.key] !== undefined).map((d) => fmt(d, r.params[d.key])).join(', ')
        let line = `- ${r.created_at.slice(0, 10)} | ${r.material} | ${settings || 'no settings'} | ${OUTCOME[r.outcome]}`
        if (r.rating) line += ` ${r.rating}/5`
        if (r.is_repeat) line += ` | repeat: ${r.repeat_reason}`
        if (r.notes) line += ` | notes: ${r.notes.replace(/\s+/g, ' ').slice(0, 300)}`
        return line
      })
    const sel = m.id === selectedId ? ' (the machine I’m asking about)' : ''
    return `## ${m.name}${sel}\nSame-experiment tolerances: ${tol || 'none set'}\nRuns, newest first:\n${lines.join('\n') || '- none yet'}`
  })

  let draftText = ''
  if (draft?.material?.trim()) {
    const m = machines.find((x) => x.id === selectedId)
    const md = m ? defsFor(m.machine_type) : []
    const settings = md.filter((d) => draft.params?.[d.key] !== undefined).map((d) => fmt(d, draft.params[d.key])).join(', ')
    draftText = `\n\n# The run I’m about to do\n${m?.name ?? 'Machine'} | ${draft.material.trim()} | ${settings || 'no settings yet'}`
  }

  return `${question.trim()}

---
Context: below are my team’s logged experiments from our workshop log. Please base your answer on these records first, mention the date and material of any record you use, and say when you’re using general knowledge instead. Two runs count as the same experiment when the material matches and every setting is within the tolerances listed, so if you suggest a next experiment, don’t suggest one within tolerance of a run already on record. Mention any safety concerns that apply.

# Our records
${sections.join('\n\n')}${draftText}`
}
