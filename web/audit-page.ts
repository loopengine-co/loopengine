// The console's Audit page (/audit): the workspace's audit log, a record
// of who did what, when, and to which resource: workflows created, edited,
// published and deleted, schedules, webhooks, permissions and settings
// changed, and (filtered for) approvals, answers and feedback in runs.
// Runs themselves are on each workflow's Activity tab. Its data is
// web/audit-admin.ts's, behind /audit/events, /audit/events.csv and
// /audit/filters. Owners, admins and
// editors see it; approvers and viewers use the Inbox only. Like the
// other console pages, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

/** The page with its filters' choices in it (agents, workflows, people),
 * so they show at once instead of after another request. */
export function auditPageFor(filters: { agents: { name: string; label: string }[]; workflows: { agent: string; id: string; title: string }[]; people: string[] }): string {
  // In a script element: no "</" may end it early.
  return auditPageHtml.replace('null/*AUDIT_FILTERS*/', JSON.stringify(filters).replace(/</g, '\\u003c'))
}

export const auditPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit</title>
<style>${devUiCss}
  .au { max-width: 1080px; display: grid; gap: 14px; }
  .au-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .au-bar select, .au-bar input { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); max-width: 180px; }
  .au-bar input[type="search"] { flex: 1; min-width: 160px; max-width: none; }
  .au-bar [hidden] { display: none; }
  .au-actions { display: inline-flex; gap: 8px; margin-left: auto; }
  .au-verify { font-size: 13px; }
  .au-check { padding: 10px 14px; border-radius: 10px; font-size: 13px; background: var(--good-soft); color: var(--good); }
  .au-check.bad { background: var(--bad-soft); color: var(--bad); font-weight: 600; }
  .au-check .hint { display: block; margin-top: 2px; font-weight: 400; }
  .au-summary { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: grid; gap: 10px; background: var(--bg); }
  .au-summary[hidden], .au-check[hidden] { display: none; }
  .au-summary h2 { margin: 0; font-size: 15px; }
  .au-summary ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 13.5px; line-height: 1.5; }
  .au-summary-tools { display: flex; gap: 8px; flex-wrap: wrap; }
  .au-summary-tools a { font-size: 13px; font-weight: 600; color: var(--accent-ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; }
  .au-summary-tools a.primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .au-export { font-size: 13px; font-weight: 600; color: var(--accent-ink); text-decoration: none; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .au-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
  .au-row, .au-head { display: grid; grid-template-columns: 136px minmax(0, 170px) minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 13px; }
  .au-head { border-top: 0; padding-top: 8px; padding-bottom: 8px; background: var(--surface); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .au-who { overflow-wrap: anywhere; }
  .au-who.system { color: var(--ink-muted); font-style: italic; }
  .au-res { display: grid; gap: 1px; min-width: 0; }
  .au-res-type { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .au-res a { color: var(--accent-ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
  .au-res a:hover { text-decoration: underline; }
  .au-res .hint { font-size: 12px; }
  .au-what details summary { cursor: pointer; color: var(--accent-ink); font-size: 12px; }
  .au-when { color: var(--ink-muted); white-space: nowrap; font-size: 12.5px; }
  .au-kind { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .au-kind.change { color: var(--accent-ink); }
  .au-kind.decision.denied { color: var(--bad); }
  .au-what { display: grid; gap: 2px; min-width: 0; }
  .au-what strong { font-weight: 600; }
  .au-detail { color: var(--ink-muted); overflow-wrap: anywhere; }
  .au-where { font-size: 12.5px; color: var(--ink-muted); }
  .au-open { color: var(--accent-ink); font-weight: 600; text-decoration: none; white-space: nowrap; font-size: 12.5px; }
  .au-open:hover { text-decoration: underline; }
  .au-action.denied { color: var(--bad); }
  .chg { display: grid; gap: 6px; margin-top: 4px; font-size: 12.5px; flex-basis: 100%; }
  .chg-field del { color: var(--bad); }
  .chg-field ins { color: var(--good); text-decoration: none; }
  .chg-lines { display: grid; gap: 1px; margin-top: 3px; font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chg-del { background: var(--bad-soft); color: var(--bad); padding: 1px 6px; }
  .chg-ins { background: var(--good-soft); color: var(--good); padding: 1px 6px; }
  .chg-note { color: var(--ink-muted); font-family: inherit; font-weight: 400; }
  .chg details summary { cursor: pointer; color: var(--accent-ink); font-family: var(--font-sans, inherit); font-size: 12px; margin-top: 2px; }
  .au-empty { padding: 28px 16px; text-align: center; color: var(--ink-muted); font-size: 13.5px; }
  .au-more { justify-self: center; }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 720px) {
    .au-head { display: none; }
    .au-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  }
</style>
</head>
<body data-le-page="audit">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Audit</h1><p>Who did what, when, and to which resource, across the workspace: workflows created, edited, published and deleted, and every other setting changed. Runs are on each workflow's Activity tab.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="au">
    <div class="au-bar">
      <select id="auAgent" aria-label="Agent"><option value="">All agents</option></select>
      <select id="auWorkflow" aria-label="Workflow"><option value="">All workflows</option></select>
      <select id="auBy" aria-label="Person"><option value="">Anyone</option></select>
      <select id="auKind" aria-label="Kind">
        <option value="change">Changes to workflows and settings</option><option value="decision">Approvals in runs</option><option value="answer">Answers in runs</option><option value="feedback">Feedback on runs</option><option value="all">Everything</option>
      </select>
      <select id="auPeriod" aria-label="Period">
        <option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="">All time</option>
      </select>
      <input type="search" id="auQ" placeholder="Search" aria-label="Search">
      <span class="au-actions"><button type="button" class="au-verify" id="auVerify">Verify log</button>
      <a class="au-export" id="auExport" href="/audit/events.csv" download>Export CSV</a></span>
    </div>
    <div class="au-check" id="auCheck" role="status" hidden></div>
    <section class="au-summary" id="auSummary" hidden></section>
    <div id="auList"><p class="hint">Loading&hellip;</p></div>
    <button type="button" class="au-more" id="auMore" hidden>Load older</button>
  </div></div></div>
</main>
</div>
${consoleShellScript}
<script>window.AUDIT_FILTERS = null/*AUDIT_FILTERS*/;</script>
<script>
(function () {
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var params = new URLSearchParams(location.search);
  // Changes by default: who did what to which workflow or setting.
  var KINDS = ['change', 'decision', 'answer', 'feedback', 'all'];
  var state = {
    agent: params.get('agent') || '', workflow: params.get('workflow') || '', by: params.get('by') || '',
    kind: KINDS.indexOf(params.get('kind')) >= 0 ? params.get('kind') : 'change',
    period: params.has('period') ? params.get('period') : '30', q: params.get('q') || '',
  };
  // The filters' choices come with the page (auditPageFor), so they show
  // at once; a page served without them fetches them.
  var embedded = window.AUDIT_FILTERS || null;
  var filters = embedded || { agents: [], workflows: [], people: [] };
  var next = null;
  var list = document.getElementById('auList');
  var more = document.getElementById('auMore');
  var el = {
    agent: document.getElementById('auAgent'), workflow: document.getElementById('auWorkflow'), by: document.getElementById('auBy'),
    kind: document.getElementById('auKind'), period: document.getElementById('auPeriod'),
    q: document.getElementById('auQ'), exportLink: document.getElementById('auExport'),
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // The year only when it isn't this one.
  function when(iso) {
    var d = new Date(iso);
    var opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleString(undefined, opts);
  }
  function agentLabel(name) {
    if (!name) return 'Workspace';
    var a = filters.agents.filter(function (x) { return x.name === name; })[0];
    return a ? a.label : name;
  }
  function workflowTitle(agent, id) {
    var w = filters.workflows.filter(function (x) { return x.agent === agent && x.id === id; })[0];
    return w ? w.title : id;
  }
  function workflowHref(agent, id, tab) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id) + (tab ? '&wtab=' + tab : '');
  }

  // The query both lists and the CSV file share.
  function query(extra) {
    var q = new URLSearchParams();
    if (state.agent) q.set('agent', state.agent);
    if (state.workflow) q.set('workflow', state.workflow);
    if (state.by) q.set('by', state.by);
    if (state.kind !== 'all') q.set('kind', state.kind);
    if (state.period) q.set('since', new Date(Date.now() - Number(state.period) * 86400000).toISOString());
    if (state.q) q.set('q', state.q);
    Object.keys(extra || {}).forEach(function (k) { q.set(k, extra[k]); });
    return q.toString();
  }
  // The page's own address keeps the filters, so a view can be shared.
  function remember() {
    var q = new URLSearchParams();
    ['agent', 'workflow', 'by', 'q'].forEach(function (k) { if (state[k]) q.set(k, state[k]); });
    if (state.kind !== 'change') q.set('kind', state.kind);
    if (state.period !== '30') q.set('period', state.period);
    history.replaceState(null, '', '/audit' + (q.toString() ? '?' + q.toString() : ''));
  }

  // The resource an event acted on (e.resource, from the server), as a
  // link where it still exists: a run's trace, a workflow, an agent, or
  // the workspace setting.
  function resourceHtml(e) {
    var r = e.resource || { type: 'Workspace', name: 'Settings' };
    var d = e.data || {};
    var href = '';
    if (r.runId && r.workflowId) href = workflowHref(r.agent, r.workflowId, 'activity') + '&run=' + encodeURIComponent(r.runId);
    else if (r.runId) href = '/inbox?item=' + encodeURIComponent(r.runId);
    else if (r.workflowId && /deleted$/.test(e.action || '')) href = '';
    else if (r.workflowId) href = workflowHref(r.agent, r.workflowId, /published|restored|edited/.test(e.action || '') ? 'versions' : '');
    else if (r.agent && !/deleted$/.test(e.action || '')) href = '/agents/config?agent=' + encodeURIComponent(r.agent);
    else if (r.type === 'Workspace') {
      var path = String(d.path || '');
      href = path.indexOf('/config/models') === 0 ? '/config?section=models' : path.indexOf('/config/apps') === 0 ? '/config?section=apps' : path.indexOf('/abilities') === 0 ? '/config?section=abilities' : '/config?section=settings';
    }
    var name = esc(r.name) + (r.type === 'Run' && r.runId ? ' <span class="hint">run ' + esc(String(r.runId).slice(0, 8)) + '</span>' : '');
    var where = r.agent && r.type !== 'Agent' && r.type !== 'Workspace' ? '<span class="hint">' + esc(agentLabel(r.agent)) + '</span>' : '';
    return '<span class="au-res"><span class="au-res-type">' + esc(r.type) + '</span>' + (href ? '<a href="' + esc(href) + '">' + name + '</a>' : '<span>' + name + '</span>') + where + '</span>';
  }

  function eventWords(e) {
    var d = e.data || {};
    if (e.kind === 'change') return { what: d.label || 'Changed a setting', detail: '' };
    if (e.kind === 'decision') return { what: (d.approved ? (d.edited ? 'Approved as changed ' : 'Approved ') : 'Denied ') + (d.tool || ''), detail: d.reason ? String.fromCharCode(8220) + d.reason + String.fromCharCode(8221) : '' };
    if (e.kind === 'answer') return { what: 'Answered ' + String.fromCharCode(8220) + String(d.answer || '').slice(0, 300) + String.fromCharCode(8221), detail: d.question ? 'to: ' + String(d.question).slice(0, 200) : '' };
    var v = [d.verdict === 'good' ? 'good' : d.verdict === 'bad' ? 'bad' : '', d.edit === 'none' ? 'used unedited' : d.edit ? d.edit + ' edits' : ''].filter(Boolean).join(', ');
    return { what: 'Feedback' + (v ? ': ' + v : ''), detail: d.note || '' };
  }

  // A change's details: each setting from and to, and for long texts the
  // lines added (+) and removed (−), a few shown and the rest folded.
  function changeDetailsHtml(d) {
    var list = d.changes || [];
    var version = d.version || d.brief;
    if (!list.length && !version) return '';
    var MINUS = String.fromCharCode(8722);
    var lineHtml = function (sign, cls, l) { return '<div class="' + cls + '">' + sign + ' ' + esc(l) + '</div>'; };
    var rows = list.map(function (c) {
      if (c.added || c.removed) {
        var lines = (c.removed || []).map(function (l) { return lineHtml(MINUS, 'chg-del', l); }).concat((c.added || []).map(function (l) { return lineHtml('+', 'chg-ins', l); }));
        var head = '<strong>' + esc(c.field) + '</strong>';
        var shown = lines.slice(0, 6).join('');
        var more = lines.length > 6 ? '<details><summary>' + (lines.length - 6) + ' more line' + (lines.length - 6 === 1 ? '' : 's') + '</summary>' + lines.slice(6).join('') + '</details>' : '';
        return '<div class="chg-field">' + head + '<div class="chg-lines">' + (shown || '<div class="chg-note">Only spacing changed.</div>') + more + '</div></div>';
      }
      return '<div class="chg-field"><strong>' + esc(c.field) + '</strong>: <del>' + esc(c.from) + '</del> ' + String.fromCharCode(8594) + ' <ins>' + esc(c.to) + '</ins></div>';
    }).join('');
    // The workflow's version before and after ("brief" on older changes).
    if (version) rows = '<div class="chg-note">Workflow v' + version.from + ' ' + String.fromCharCode(8594) + ' v' + version.to + '</div>' + rows;
    return '<div class="chg">' + rows + '</div>';
  }

  // A row: when, who, what they did (with its detail and, for a change,
  // what it changed), and the resource.
  function eventRow(e) {
    var words = eventWords(e);
    var detail = e.kind === 'change' ? '' : words.detail;
    var changes = e.kind === 'change' ? changeDetailsHtml(e.data || {}) : '';
    var denied = e.kind === 'decision' && e.data && !e.data.approved ? ' denied' : '';
    return '<div class="au-row"><span class="au-when">' + esc(when(e.at)) + '</span>' +
      '<span class="au-who' + (e.by ? '' : ' system') + '">' + esc(e.by || 'System') + '</span>' +
      '<span class="au-what"><strong class="au-action' + denied + '">' + esc(e.action || words.what) + '</strong>' +
        (e.kind === 'decision' && e.data && e.data.tool ? '<span class="au-detail"><code>' + esc(e.data.tool) + '</code></span>' : '') +
        (detail ? '<span class="au-detail">' + esc(detail) + '</span>' : '') +
        (changes ? '<details><summary>What changed</summary>' + changes + '</details>' : '') + '</span>' +
      resourceHtml(e) + '</div>';
  }

  var HEAD = '<div class="au-head"><span>When</span><span>Who</span><span>Action</span><span>Resource</span></div>';
  function load(append) {
    var url = '/audit/events?';
    var extra = append && next != null ? { before: String(next) } : {};
    extra.limit = '100';
    if (!append) list.innerHTML = '<p class="hint">Loading' + String.fromCharCode(8230) + '</p>';
    more.hidden = true;
    return fetch(url + query(extra), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (data) {
        var rows = data.events.map(eventRow);
        next = data.next;
        if (data.events.length < 100) next = null;
        var box = list.querySelector('.au-list');
        if (append && box) box.insertAdjacentHTML('beforeend', rows.join(''));
        else list.innerHTML = rows.length ? '<div class="au-list">' + HEAD + rows.join('') + '</div>'
          : '<div class="au-list"><p class="au-empty">Nothing matches. Workflows created, edited, published and deleted, and every other change to settings, are recorded here with who made them.</p></div>';
        more.hidden = next == null;
      })
      .catch(function (err) { list.innerHTML = '<p class="error">Could not load it: ' + esc(err.message) + '</p>'; });
  }

  function fillWorkflows() {
    var shown = filters.workflows.filter(function (w) { return !state.agent || w.agent === state.agent; });
    el.workflow.innerHTML = '<option value="">All workflows</option>' + shown.map(function (w) {
      return '<option value="' + esc(w.id) + '"' + (w.id === state.workflow ? ' selected' : '') + '>' + esc(w.title) + (state.agent ? '' : ' (' + esc(agentLabel(w.agent)) + ')') + '</option>';
    }).join('');
    if (state.workflow && !shown.some(function (w) { return w.id === state.workflow; })) state.workflow = '';
  }

  function sync() {
    el.exportLink.href = '/audit/events.csv?' + query();
    remember();
  }

  // With a workflow chosen: its audit for the period, in sentences, and
  // its report.
  var summaryBox = document.getElementById('auSummary');
  function loadSummary() {
    var wf = state.workflow && filters.workflows.filter(function (w) { return w.id === state.workflow && (!state.agent || w.agent === state.agent); })[0];
    if (!wf) { summaryBox.hidden = true; return; }
    var q = new URLSearchParams();
    q.set('since', state.period ? new Date(Date.now() - Number(state.period) * 86400000).toISOString() : '2000-01-01T00:00:00.000Z');
    var base = '/agents/' + encodeURIComponent(wf.agent) + '/workflows/' + encodeURIComponent(wf.id) + '/audit';
    summaryBox.hidden = false;
    summaryBox.innerHTML = '<h2>' + esc(wf.title) + '</h2><p class="hint">Loading its audit' + String.fromCharCode(8230) + '</p>';
    fetch(base + '?' + q.toString(), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (a) {
        if (state.workflow !== wf.id) return;
        var period = el.period.options[el.period.selectedIndex].text.toLowerCase();
        summaryBox.innerHTML = '<h2>' + esc(wf.title) + ' <span class="hint">' + esc(period) + '</span></h2>' +
          '<ul>' + a.summary.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul>' +
          '<div class="au-summary-tools"><a class="primary" href="' + base + '/report?' + q.toString() + '">Open the report</a>' +
          '<a href="' + base + '/report?' + q.toString() + '&format=json" download>Download JSON</a>' +
          '<a href="' + workflowHref(wf.agent, wf.id, '') + '">Open the workflow</a></div>';
      })
      .catch(function (err) { summaryBox.innerHTML = '<p class="error">Could not load its audit: ' + esc(err.message) + '</p>'; });
  }

  function changed() { sync(); load(false); loadSummary(); }

  el.agent.addEventListener('change', function () { state.agent = el.agent.value; fillWorkflows(); changed(); });
  ['workflow', 'by', 'kind', 'period'].forEach(function (k) {
    el[k].addEventListener('change', function () { state[k] = el[k].value; changed(); });
  });
  var typing;
  el.q.addEventListener('input', function () {
    clearTimeout(typing);
    typing = setTimeout(function () { state.q = el.q.value.trim(); changed(); }, 300);
  });
  more.addEventListener('click', function () { load(true); });

  // Checks every event's hash, in order.
  var verifyBtn = document.getElementById('auVerify');
  var check = document.getElementById('auCheck');
  var PROBLEMS = {
    'changed': 'it was changed after it was recorded',
    'missing-before': 'an event before it was removed, or the order changed',
  };
  verifyBtn.addEventListener('click', function () {
    verifyBtn.disabled = true;
    check.hidden = false;
    check.className = 'au-check';
    check.textContent = 'Checking every event' + String.fromCharCode(8230);
    fetch('/audit/verify', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (v) {
        if (v.ok) {
          check.innerHTML = 'Intact: all ' + v.events.toLocaleString() + ' events check out.' +
            (v.last ? '<span class="hint">Latest event #' + v.last.id + ', ' + esc(when(v.last.at)) + DOT + 'hash ' + esc(v.last.hash) + '</span>' : '');
        } else {
          check.className = 'au-check bad';
          check.innerHTML = 'Broken at event #' + v.broken.id + (v.broken.at ? ' (' + esc(when(v.broken.at)) + ')' : '') + ': ' + esc(PROBLEMS[v.broken.problem] || v.broken.problem) + '.' +
            '<span class="hint">' + v.events.toLocaleString() + ' events before it check out.</span>';
        }
      })
      .catch(function (err) { check.className = 'au-check bad'; check.textContent = 'Could not check: ' + err.message; })
      .then(function () { verifyBtn.disabled = false; });
  });

  el.q.value = state.q;
  el.kind.value = state.kind;
  el.period.value = state.period;
  function fillFilters(f) {
    filters = f;
    el.agent.innerHTML = '<option value="">All agents</option>' + f.agents.map(function (a) { return '<option value="' + esc(a.name) + '"' + (a.name === state.agent ? ' selected' : '') + '>' + esc(a.label) + '</option>'; }).join('');
    el.by.innerHTML = '<option value="">Anyone</option>' + f.people.map(function (p) { return '<option value="' + esc(p) + '"' + (p === state.by ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    fillWorkflows();
  }
  if (embedded) {
    fillFilters(embedded);
    changed();
  } else {
    // The list doesn't wait for the choices; its rows are named again once
    // they come.
    changed();
    fetch('/audit/filters', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (f) { if (f) { fillFilters(f); load(false); } });
  }
})();
</script>
</body>
</html>`
