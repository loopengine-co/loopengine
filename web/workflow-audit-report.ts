// A workflow's audit report (web/workflow-audit.ts) as a page to read,
// print, or save as a PDF from the browser's print dialog: the summary,
// the numbers, who decided what, every denial and change with its reason,
// how the workflow changed (line by line), other settings changed, every
// case, and whether the log checks out. Rendered here, with no script, so
// the printed copy is exactly what's shown.
import { devUiCss, themeHeadHtml } from './dev-ui-styles.js'
import type { AuditCounts, WorkflowAudit } from './workflow-audit.js'

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const when = (iso: string): string => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
const day = (iso: string): string => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const pct = (part: number, whole: number): string => (whole ? `${Math.round((100 * part) / whole)}%` : '—')
const plural = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`
const dollars = (usd: number): string => `$${usd >= 0.1 ? usd.toFixed(2) : usd >= 0.001 ? usd.toFixed(3) : usd > 0 ? '0.001' : '0'}`

function countsRow(label: string, c: AuditCounts): string {
  return `<tr><td>${label}</td><td>${c.runs}</td><td>${c.done}</td><td>${c.failed} <span class="hint">(${pct(c.failed, c.runs)})</span></td><td>${c.decided}</td><td>${c.approved - c.changed}</td><td>${c.changed}</td><td>${c.denied}</td><td>${c.answered}</td></tr>`
}

const STATUS: Record<string, string> = { done: 'Done', error: 'Failed', awaiting_approval: 'Waiting', running: 'Running' }

export function workflowAuditReportHtml(audit: WorkflowAudit, options: { generatedAt: string; by: string; jsonHref: string; traceHref: (runId: string) => string; pageHref: string }): string {
  const w = audit.workflow
  const v = audit.verification
  const c = audit.counts
  const versions = audit.versions.map((ver) => `
    <div class="ar-version">
      <h3>Version ${ver.number} <span class="hint">${ver.changedInPeriod ? `saved ${esc(when(ver.at))}` : `in use when the period began (saved ${esc(day(ver.at))})`}${ver.by ? ` by ${esc(ver.by)}` : ''}${ver.reason ? ` · ${esc(ver.reason)}` : ''}</span></h3>
      <p class="hint">${ver.counts.runs ? `${plural(ver.counts.runs, 'run')} on it · ${ver.counts.failed} failed · ${plural(ver.counts.decided, 'request')} decided, ${ver.counts.changed + ver.counts.denied} changed or denied` : 'No runs on it in this period.'}</p>
      ${ver.diff ? `<div class="ar-diff">${ver.diff.removed.map((l) => `<div class="del">− ${esc(l)}</div>`).join('')}${ver.diff.added.map((l) => `<div class="ins">+ ${esc(l)}</div>`).join('')}${!ver.diff.added.length && !ver.diff.removed.length ? '<div class="hint">No line changed (spacing only).</div>' : ''}</div>` : ''}
    </div>`).join('')
  const overruled = audit.overruled.map((d) => `<tr>
      <td>${esc(when(d.at))}</td><td>${d.approved ? 'Changed, then approved' : 'Denied'}</td><td><code>${esc(d.tool)}</code></td><td>${esc(d.by ?? '')}</td>
      <td>${d.reason ? `“${esc(d.reason)}”` : ''}${(d.changes ?? []).map((ch) => `<div><code>${esc(ch.field)}</code>: <del>${esc(ch.from)}</del> → <ins>${esc(ch.to)}</ins></div>`).join('')}</td>
      <td><a href="${esc(options.traceHref(d.runId))}">trace</a></td></tr>`).join('')
  const people = audit.people.map((p) => `<tr><td>${esc(p.by)}</td><td>${p.approved}</td><td>${p.changed}</td><td>${p.denied}</td><td>${p.answered}</td></tr>`).join('')
  const cases = audit.cases.slice(0, 500).map((k) => `<tr><td>${esc(when(k.at))}</td><td>${STATUS[k.status] ?? esc(k.status)}</td><td>${esc(k.inputs)}</td><td>${k.workflowVersion ? `v${k.workflowVersion}` : ''}</td><td>${esc(k.decidedBy.join(', '))}</td><td class="ar-outcome">${esc(k.outcome)}</td><td><a href="${esc(options.traceHref(k.runId))}">trace</a></td></tr>`).join('')
  const changes = audit.changes.map((ch) => `<li>${esc(when(ch.at))} · ${esc(ch.label)}${ch.by ? ` · ${esc(ch.by)}` : ''}${(ch.fields ?? []).map((f) => (f.added || f.removed
    ? `<div class="ar-diff"><div class="hint">${esc(f.field)}</div>${(f.removed ?? []).map((l) => `<div class="del">− ${esc(l)}</div>`).join('')}${(f.added ?? []).map((l) => `<div class="ins">+ ${esc(l)}</div>`).join('')}</div>`
    : `<div class="hint">${esc(f.field)}: <del>${esc(f.from)}</del> → <ins>${esc(f.to)}</ins></div>`)).join('')}</li>`).join('')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit report: ${esc(w.title)}</title>
${themeHeadHtml}<style>${devUiCss}
  body { background: var(--bg); }
  .ar { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; display: grid; gap: 28px; font-size: 14px; }
  .ar header { display: grid; gap: 6px; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .ar h1 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
  .ar h2 { margin: 0 0 10px; font-size: 16px; }
  .ar h3 { margin: 0 0 4px; font-size: 14px; }
  .ar-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: var(--ink-muted); font-size: 13px; }
  .ar-tools { display: flex; gap: 8px; flex-wrap: wrap; }
  .ar-tools a, .ar-tools button { font-size: 13px; font-weight: 600; text-decoration: none; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; color: var(--accent-ink); background: var(--bg); }
  .ar-check { padding: 10px 14px; border-radius: 10px; background: var(--good-soft); color: var(--good); font-weight: 600; }
  .ar-check.bad { background: var(--bad-soft); color: var(--bad); }
  .ar-summary { margin: 0; padding-left: 20px; display: grid; gap: 6px; line-height: 1.5; }
  .ar table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .ar th { text-align: left; font-weight: 600; color: var(--ink-muted); border-bottom: 1px solid var(--line); padding: 6px 8px; }
  .ar td { border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
  .ar-outcome { max-width: 280px; }
  .ar-version { border-left: 2px solid var(--line); padding: 2px 0 2px 12px; margin-bottom: 14px; }
  .ar-diff { font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; display: grid; gap: 1px; margin-top: 6px; }
  .ar-diff .del { background: var(--bad-soft); color: var(--bad); padding: 1px 6px; }
  .ar-diff .ins { background: var(--good-soft); color: var(--good); padding: 1px 6px; }
  .ar del { color: var(--bad); }
  .ar ins { color: var(--good); text-decoration: none; }
  .ar ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
  .hint { color: var(--ink-muted); font-weight: 400; }
  @page { margin: 16mm 14mm; }
  @media print {
    .ar-check, .ar-diff .del, .ar-diff .ins { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .ar-tools { display: none; }
    .ar { padding: 0; max-width: none; }
    .ar section { break-inside: avoid-page; }
    .ar table { break-inside: auto; }
    .ar tr { break-inside: avoid; }
    .ar a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<div class="ar">
  <header>
    <div class="ar-tools"><a href="${esc(options.pageHref)}">← Audit</a><button type="button" onclick="window.print()">Print or save as PDF</button><a href="${esc(options.jsonHref)}" download>Download JSON</a></div>
    <h1>Audit report: ${esc(w.title)}</h1>
    <div class="ar-meta"><span>Workflow <code>${esc(w.id)}</code></span><span>Agent ${esc(w.agentLabel)}</span><span>${esc(day(audit.period.since))} to ${esc(day(audit.period.until))}</span></div>
    <div class="ar-meta"><span>Made ${esc(when(options.generatedAt))} by ${esc(options.by)}</span></div>
  </header>

  <section>
    <div class="ar-check${v.ok ? '' : ' bad'}">${v.ok
      ? `Audit log verified: ${v.events.toLocaleString('en-US')} events check out.${v.last ? ` <span class="hint">Latest event #${v.last.id}, hash ${esc(v.last.hash)}</span>` : ''}`
      : `Audit log broken at event #${v.broken?.id}: the record after it can't be relied on.`}</div>
  </section>

  <section>
    <h2>Summary</h2>
    <ul class="ar-summary">${audit.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </section>

  <section>
    <h2>Runs and decisions</h2>
    <table><thead><tr><th></th><th>Runs</th><th>Done</th><th>Failed</th><th>Decided</th><th>Approved as asked</th><th>Changed</th><th>Denied</th><th>Questions answered</th></tr></thead>
    <tbody>${countsRow('All', c)}${audit.versions.filter((ver) => ver.counts.runs).map((ver) => countsRow(`Version ${ver.number}`, ver.counts)).join('')}</tbody></table>
    ${audit.cost ? `<p class="hint">Model cost ${dollars(audit.cost.totalUsd)}, ${dollars(audit.cost.perRunUsd)} a run${audit.cost.pricedRuns < c.runs ? ` (${audit.cost.pricedRuns} of ${c.runs} runs priced)` : ''}.</p>` : ''}
  </section>

  ${people ? `<section><h2>Who decided</h2><table><thead><tr><th>Person</th><th>Approved as asked</th><th>Changed, then approved</th><th>Denied</th><th>Answered</th></tr></thead><tbody>${people}</tbody></table></section>` : ''}

  <section>
    <h2>Denied or changed</h2>
    ${overruled ? `<table><thead><tr><th>When</th><th>Decision</th><th>Action</th><th>By</th><th>Reason or change</th><th></th></tr></thead><tbody>${overruled}</tbody></table>` : '<p class="hint">None: every request was approved as the agent asked.</p>'}
  </section>

  <section>
    <h2>Workflow versions</h2>
    ${versions || '<p class="hint">No versions recorded.</p>'}
  </section>

  <section>
    <h2>Settings changed</h2>
    ${changes ? `<ul>${changes}</ul>` : '<p class="hint">None in this period.</p>'}
  </section>

  <section>
    <h2>Cases (${audit.cases.length})</h2>
    ${cases ? `<table><thead><tr><th>Started</th><th>Outcome</th><th>Inputs</th><th>Version</th><th>Decided by</th><th>Result</th><th></th></tr></thead><tbody>${cases}</tbody></table>${audit.cases.length > 500 ? '<p class="hint">The 500 most recent are listed; the JSON has them all.</p>' : ''}` : '<p class="hint">None.</p>'}
  </section>
</div>
</body>
</html>`
}
