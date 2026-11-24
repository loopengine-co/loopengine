// The console's Audit page (/audit): the workspace's log of who changed
// what and who decided what (Activity), and every case kept, searched
// (Cases). Its data is web/audit-admin.ts's, behind /audit/events,
// /audit/events.csv, /audit/cases and /audit/filters. Owners, admins and
// editors see it; approvers and viewers use the Inbox only. Like the
// other console pages, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const auditPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit</title>
<style>${devUiCss}
  .au { max-width: 1080px; display: grid; gap: 14px; }
  .au-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
  .au-tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 8px 12px; font-size: 14px; font-weight: 600; color: var(--ink-muted); margin-bottom: -1px; }
  .au-tabs button[aria-selected="true"] { color: var(--accent-ink); border-bottom-color: var(--accent); }
  .au-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .au-bar select, .au-bar input { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); max-width: 220px; }
  .au-bar input[type="search"] { flex: 1; min-width: 160px; max-width: none; }
  .au-bar [hidden] { display: none; }
  .au-export { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--accent-ink); text-decoration: none; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .au-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
  .au-row { display: grid; grid-template-columns: 136px 80px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 10px 16px; border-top: 1px solid var(--line); font-size: 13px; }
  .au-row:first-child { border-top: 0; }
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
  .au-case { grid-template-columns: 80px minmax(0, 1fr) auto; }
  .au-state { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); justify-self: start; }
  .au-state.good { background: var(--good-soft); color: var(--good); }
  .au-state.bad { background: var(--bad-soft); color: var(--bad); }
  .au-state.warn { background: var(--warn-soft); color: var(--warn); }
  .au-state.run { background: var(--accent-soft); color: var(--accent-ink); }
  .au-empty { padding: 28px 16px; text-align: center; color: var(--ink-muted); font-size: 13.5px; }
  .au-more { justify-self: center; }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 720px) {
    .au-row, .au-case { grid-template-columns: minmax(0, 1fr) auto; }
    .au-when { grid-column: 1 / -1; }
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
        <div><h1>Audit</h1><p>Who changed what, and who decided what, across the workspace; and every case kept, to search and open.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="au">
    <div class="au-tabs" role="tablist">
      <button type="button" role="tab" data-tab="activity" aria-selected="true">Activity</button>
      <button type="button" role="tab" data-tab="cases" aria-selected="false">Cases</button>
    </div>
    <div class="au-bar">
      <select id="auAgent" aria-label="Agent"><option value="">All agents</option></select>
      <select id="auWorkflow" aria-label="Workflow"><option value="">All workflows</option></select>
      <select id="auBy" aria-label="Person"><option value="">Anyone</option></select>
      <select id="auKind" aria-label="Kind">
        <option value="">Everything</option><option value="change">Settings changed</option><option value="decision">Approvals</option><option value="answer">Answers</option><option value="feedback">Feedback</option>
      </select>
      <select id="auStatus" aria-label="Status" hidden>
        <option value="">Any outcome</option><option value="done">Done</option><option value="error">Failed</option><option value="awaiting_approval">Waiting for a decision</option><option value="running">Running</option>
      </select>
      <select id="auPeriod" aria-label="Period">
        <option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="">All time</option>
      </select>
      <input type="search" id="auQ" placeholder="Search" aria-label="Search">
      <a class="au-export" id="auExport" href="/audit/events.csv" download>Export CSV</a>
    </div>
    <div id="auList"><p class="hint">Loading&hellip;</p></div>
    <button type="button" class="au-more" id="auMore" hidden>Load older</button>
  </div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var params = new URLSearchParams(location.search);
  var state = {
    tab: params.get('tab') === 'cases' ? 'cases' : 'activity',
    agent: params.get('agent') || '', workflow: params.get('workflow') || '', by: params.get('by') || '',
    kind: params.get('kind') || '', status: params.get('status') || '',
    period: params.has('period') ? params.get('period') : '30', q: params.get('q') || '',
  };
  var filters = { agents: [], workflows: [], people: [] };
  var next = null;
  var list = document.getElementById('auList');
  var more = document.getElementById('auMore');
  var el = {
    agent: document.getElementById('auAgent'), workflow: document.getElementById('auWorkflow'), by: document.getElementById('auBy'),
    kind: document.getElementById('auKind'), status: document.getElementById('auStatus'), period: document.getElementById('auPeriod'),
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
    if (state.tab === 'activity' && state.kind) q.set('kind', state.kind);
    if (state.tab === 'cases' && state.status) q.set('status', state.status);
    if (state.period) q.set('since', new Date(Date.now() - Number(state.period) * 86400000).toISOString());
    if (state.q) q.set('q', state.q);
    Object.keys(extra || {}).forEach(function (k) { q.set(k, extra[k]); });
    return q.toString();
  }
  // The page's own address keeps the filters, so a view can be shared.
  function remember() {
    var q = new URLSearchParams();
    if (state.tab === 'cases') q.set('tab', 'cases');
    ['agent', 'workflow', 'by', 'q'].forEach(function (k) { if (state[k]) q.set(k, state[k]); });
    if (state.tab === 'activity' && state.kind) q.set('kind', state.kind);
    if (state.tab === 'cases' && state.status) q.set('status', state.status);
    if (state.period !== '30') q.set('period', state.period);
    history.replaceState(null, '', '/audit' + (q.toString() ? '?' + q.toString() : ''));
  }

  // Where an event leads: its case, the workflow's version or changes,
  // the agent, or the workspace setting.
  function eventLink(e) {
    var d = e.data || {};
    if (e.run_id) return { href: '/inbox?case=' + encodeURIComponent(e.run_id), text: 'Case' };
    if (e.workflow_id) return { href: workflowHref(e.agent, e.workflow_id, /brief version/i.test(d.label || '') || /Edited the workflow/.test(d.label || '') ? 'brief' : 'changes'), text: 'Workflow' };
    if (e.agent) return { href: '/agents/config?agent=' + encodeURIComponent(e.agent), text: 'Agent' };
    var path = String(d.path || '');
    if (path.indexOf('/config/models') === 0) return { href: '/config?section=models', text: 'Models' };
    if (path.indexOf('/config/apps') === 0) return { href: '/config?section=apps', text: 'Apps' };
    if (path.indexOf('/abilities') === 0) return { href: '/config?section=abilities', text: 'Abilities' };
    return { href: '/config?section=settings', text: 'Settings' };
  }

  function eventWords(e) {
    var d = e.data || {};
    if (e.kind === 'change') return { what: d.label || 'Changed a setting', detail: '' };
    if (e.kind === 'decision') return { what: (d.approved ? (d.edited ? 'Approved as changed ' : 'Approved ') : 'Denied ') + (d.tool || ''), detail: d.reason ? String.fromCharCode(8220) + d.reason + String.fromCharCode(8221) : '' };
    if (e.kind === 'answer') return { what: 'Answered ' + String.fromCharCode(8220) + String(d.answer || '').slice(0, 300) + String.fromCharCode(8221), detail: d.question ? 'to: ' + String(d.question).slice(0, 200) : '' };
    var v = [d.verdict === 'good' ? 'good' : d.verdict === 'bad' ? 'bad' : '', d.edit === 'none' ? 'used unedited' : d.edit ? d.edit + ' edits' : ''].filter(Boolean).join(', ');
    return { what: 'Feedback' + (v ? ': ' + v : ''), detail: d.note || '' };
  }

  function eventRow(e) {
    var words = eventWords(e);
    var link = eventLink(e);
    var kind = e.kind === 'change' ? 'Setting' : e.kind === 'decision' ? 'Approval' : e.kind === 'answer' ? 'Answer' : 'Feedback';
    var denied = e.kind === 'decision' && e.data && !e.data.approved ? ' denied' : '';
    var where = agentLabel(e.agent) + (e.workflow_id ? DOT + workflowTitle(e.agent, e.workflow_id) : '');
    return '<div class="au-row"><span class="au-when">' + esc(when(e.at)) + '</span>' +
      '<span class="au-kind ' + esc(e.kind) + denied + '">' + kind + '</span>' +
      '<span class="au-what"><strong>' + esc(words.what) + '</strong>' + (words.detail ? '<span class="au-detail">' + esc(words.detail) + '</span>' : '') +
        '<span class="au-where">' + (e.by ? esc(e.by) + DOT : '') + esc(where) + '</span></span>' +
      '<a class="au-open" href="' + esc(link.href) + '">' + esc(link.text) + ' ' + String.fromCharCode(8594) + '</a></div>';
  }

  function caseRow(c) {
    var pill = c.status === 'done' ? ['good', 'Done'] : c.status === 'error' ? ['bad', 'Failed'] : c.status === 'awaiting_approval' ? ['warn', 'Waiting'] : ['run', 'Running'];
    return '<div class="au-row au-case"><span class="au-state ' + pill[0] + '">' + pill[1] + '</span>' +
      '<span class="au-what"><strong>' + esc(c.workflowTitle) + (c.inputs ? DOT + esc(c.inputs) : '') + '</strong>' +
        (c.outcome ? '<span class="au-detail">' + esc(c.outcome) + '</span>' : '') +
        '<span class="au-where">' + esc(when(c.startedAt)) + DOT + esc(agentLabel(c.agent)) + (c.briefVersion ? DOT + 'brief v' + c.briefVersion : '') + (c.people.length ? DOT + 'decided by ' + esc(c.people.join(', ')) : '') + '</span></span>' +
      '<a class="au-open" href="/inbox?case=' + encodeURIComponent(c.id) + '">Open ' + String.fromCharCode(8594) + '</a></div>';
  }

  function load(append) {
    var url = state.tab === 'cases' ? '/audit/cases?' : '/audit/events?';
    var extra = append && next != null ? { before: String(next) } : {};
    if (state.tab === 'activity') extra.limit = '100';
    if (!append) list.innerHTML = '<p class="hint">Loading' + String.fromCharCode(8230) + '</p>';
    more.hidden = true;
    return fetch(url + query(extra), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (data) {
        var rows = state.tab === 'cases' ? data.cases.map(caseRow) : data.events.map(eventRow);
        next = data.next;
        if (state.tab === 'activity' && data.events.length < 100) next = null;
        var box = list.querySelector('.au-list');
        if (append && box) box.insertAdjacentHTML('beforeend', rows.join(''));
        else list.innerHTML = rows.length ? '<div class="au-list">' + rows.join('') + '</div>'
          : '<div class="au-list"><p class="au-empty">' + (state.tab === 'cases' ? 'No cases match.' : 'Nothing matches. Changes to settings, and every approval, answer and feedback, are listed here as they happen.') + '</p></div>';
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
    var tabs = document.querySelectorAll('.au-tabs button');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', String(tabs[i].getAttribute('data-tab') === state.tab));
    el.kind.hidden = state.tab !== 'activity';
    el.status.hidden = state.tab !== 'cases';
    el.exportLink.hidden = state.tab !== 'activity';
    el.exportLink.href = '/audit/events.csv?' + query();
    remember();
  }

  function changed() { sync(); load(false); }

  document.querySelector('.au-tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-tab]');
    if (!b || b.getAttribute('data-tab') === state.tab) return;
    state.tab = b.getAttribute('data-tab');
    changed();
  });
  el.agent.addEventListener('change', function () { state.agent = el.agent.value; fillWorkflows(); changed(); });
  ['workflow', 'by', 'kind', 'status', 'period'].forEach(function (k) {
    el[k].addEventListener('change', function () { state[k] = el[k].value; changed(); });
  });
  var typing;
  el.q.addEventListener('input', function () {
    clearTimeout(typing);
    typing = setTimeout(function () { state.q = el.q.value.trim(); changed(); }, 300);
  });
  more.addEventListener('click', function () { load(true); });

  el.q.value = state.q;
  el.kind.value = state.kind;
  el.status.value = state.status;
  el.period.value = state.period;
  fetch('/audit/filters', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : filters; })
    .catch(function () { return filters; })
    .then(function (f) {
      filters = f;
      el.agent.innerHTML = '<option value="">All agents</option>' + f.agents.map(function (a) { return '<option value="' + esc(a.name) + '"' + (a.name === state.agent ? ' selected' : '') + '>' + esc(a.label) + '</option>'; }).join('');
      el.by.innerHTML = '<option value="">Anyone</option>' + f.people.map(function (p) { return '<option value="' + esc(p) + '"' + (p === state.by ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
      fillWorkflows();
      changed();
    });
})();
</script>
</body>
</html>`
