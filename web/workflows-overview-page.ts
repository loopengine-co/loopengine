// The console's front page: / and /workflows list every workflow in the
// workspace with how it starts, how it's been running and what's waiting
// in the Inbox (web/workflows-overview.ts behind /workflows/overview).
// Like the other console pages, its inline script avoids backslashes and
// template placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'

export const workflowsOverviewPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workflows</title>
<style>${devUiCss}${MASCOT_CSS}
  .wo { max-width: 1120px; display: grid; gap: 0; }
  .wo-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 36px 22px 28px; border: 1px solid var(--line); border-bottom: 0; }
  .wo-hero .le-mascot { flex: none; margin-bottom: -6px; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .wo-cols4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .wo-cols2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wo-stat { padding: 20px 22px; background: var(--bg); display: grid; gap: 2px; color: var(--ink); text-decoration: none; }
  a.wo-stat:hover { background: var(--surface); }
  .wo-stat b { font-size: 34px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .wo-stat span { font-size: 13px; color: var(--ink-muted); }
  .wo-stat.warn b { color: var(--warn); }
  .wo-stat.bad b { color: var(--bad); }
  .wo-section-title { margin: 0; padding: 30px 22px 16px; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .wo-card { display: grid; gap: 14px; align-content: start; padding: 20px 22px; background: var(--bg); }
  .wo-card-head { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
  .wo-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); color: var(--ink-muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
  .wo-icon svg { width: 16px; height: 16px; }
  .wo-icon.live { color: var(--good); }
  .wo-card-text { display: grid; gap: 3px; min-width: 0; }
  .wo-card-title { font-size: 15px; font-weight: 600; color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
  a.wo-card-title:hover { text-decoration: underline; }
  .wo-card-desc { font-size: 13px; color: var(--ink-muted); }
  .wo-open { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 13px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); color: var(--ink); background: var(--bg); }
  .wo-open:hover { background: var(--surface); }
  .wo-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .wo-chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); font-size: 12px; color: var(--ink-muted); white-space: nowrap; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .wo-chip.strong { background: var(--surface); border-color: transparent; color: var(--ink); font-weight: 500; }
  .wo-chip.good { background: var(--good-soft); border-color: transparent; color: var(--good); font-weight: 600; }
  .wo-chip.warn { background: var(--warn-soft); border-color: transparent; color: var(--warn); font-weight: 600; }
  .wo-chip.bad { background: var(--bad-soft); border-color: transparent; color: var(--bad); font-weight: 600; }
  .wo-chip.run { background: var(--accent-soft); border-color: transparent; color: var(--accent-ink); font-weight: 600; }
  .wo-chip-k { color: var(--ink-faint); font-weight: 400; margin-right: 6px; }
  a.wo-chip:hover { color: var(--ink); border-color: var(--ink-faint); }
  .wo-next { font-size: 12px; color: var(--ink-faint); margin-left: 4px; white-space: nowrap; }
  .wo-tile { display: grid; gap: 6px; align-content: start; padding: 22px; background: var(--bg); text-decoration: none; color: inherit; transition: background .15s; }
  .wo-tile:hover { background: var(--surface); }
  .wo-tile b { font-size: 15px; font-weight: 600; color: var(--ink); }
  .wo-tile span { font-size: 13px; color: var(--ink-muted); line-height: 1.45; }
  .wo-filler { background: var(--bg); }
  .wo-empty { padding: 40px 32px; text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--bg); grid-column: 1 / -1; margin: 0; }
  /* New workflow, in a dialog like New agent and Create schedule. */
  .wo-dialog { width: min(920px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--bg); color: var(--ink); box-shadow: 0 24px 60px rgba(0, 0, 0, .22); overflow: hidden; }
  .wo-dialog::backdrop { background: rgba(20, 24, 25, .35); backdrop-filter: blur(3px); }
  .wo-dialog form { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 50px); margin: 0; }
  .wo-dlg-head { display: flex; align-items: center; gap: 8px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
  .wo-dlg-head h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 500; }
  .wo-dlg-head button { height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; }
  .wo-dlg-body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); overflow: auto; }
  .wo-dlg-col { display: grid; align-content: start; }
  .wo-dlg-col + .wo-dlg-col { border-left: 1px solid var(--line); background: var(--surface); }
  .wo-field { display: grid; gap: 9px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
  .wo-field > label, .wo-field-k { font-size: 14px; font-weight: 500; }
  .wo-field .hint { margin: 0; line-height: 1.45; }
  .wo-field .hint a { color: var(--accent-ink); }
  .wo-field select { height: 38px; border-radius: 9px; font-size: 13.5px; width: 100%; }
  .wo-field textarea { min-height: 150px; border-radius: 9px; font-size: 14px; width: 100%; box-sizing: border-box; }
  .wo-dlg-foot { padding: 12px 22px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); min-height: 46px; display: flex; align-items: center; }
  .wo-dlg-foot:has(#woFoot:empty) { display: none; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 860px) {
    .wo-dlg-body { grid-template-columns: minmax(0, 1fr); }
    .wo-dlg-col + .wo-dlg-col { border-left: 0; border-top: 1px solid var(--line); }
    .wo-hero { padding: 24px 22px 20px; }
    .wo-hero .le-mascot { display: none; }
    .wo-cols4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wo-cols2 { grid-template-columns: minmax(0, 1fr); }
    .wo-section-title { padding: 24px 22px 14px; }
    .le-search { display: none; }
  }
</style>
</head>
<body data-le-page="workflows-overview">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <header class="le-topbar">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <h1 class="le-topbar-title">Workflows</h1>
    <span class="le-topbar-gap"></span>
    <label class="le-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="woSearch" placeholder="Search workflows" aria-label="Search workflows"></label>
    <a class="le-btn-dark" href="/workflows/new" id="woNewBtn">+ New workflow</a>
  </header>
  <div class="le-scroll"><div class="le-page"><div class="wo" id="woPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
<template id="woMascot">${mascotSvg(92)}</template>
<dialog class="wo-dialog" id="woDialog" aria-labelledby="woDlgTitle">
  <form id="woForm">
    <div class="wo-dlg-head"><h2 id="woDlgTitle">New workflow</h2><button type="button" id="woCancel">Cancel</button><button type="submit" class="primary" id="woBuild">Build</button></div>
    <div class="wo-dlg-body">
      <div class="wo-dlg-col">
        <div class="wo-field"><label for="woAgent">Agent</label><select id="woAgent"><option value="">Loading&hellip;</option></select><p class="hint">The agent that runs it, with its tools and permissions.</p></div>
        <div class="wo-field"><label for="woText">Your workflow</label><textarea id="woText" placeholder="Every Monday, find blog ideas on the web, ask me on Slack to pick one, draft it, and let me review it before it goes up."></textarea><p class="hint">What starts it, the steps in order, and where you want to choose or approve.</p></div>
      </div>
      <div class="wo-dlg-col">
        <div class="wo-field"><span class="wo-field-k">What happens next</span><p class="hint">LoopEngine plans it: each step matched to a tool, where it asks you, the permissions and the apps it needs. You review the plan before anything is created. Planning can take a few minutes.</p></div>
        <div class="wo-field"><span class="wo-field-k">Rather start from something ready-made?</span><p class="hint"><a href="/workflows/new#examples">Choose a workflow example</a>, or <a href="/interview">find your first agent</a>.</p></div>
      </div>
    </div>
    <div class="wo-dlg-foot"><span id="woFoot"></span></div>
  </form>
</dialog>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('woPage');
  var search = document.getElementById('woSearch');
  var mascot = document.getElementById('woMascot').innerHTML;
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var esc = window.leShell.esc;
  var ICON_FLOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M7 11v3a3 3 0 0 0 3 3h3"/></svg>';
  var data = null;

  function ago(iso) {
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function lastRunChip(w) {
    if (w.waiting) return '<a class="wo-chip warn" href="/inbox?view=needs">' + w.waiting + ' waiting for you</a>';
    if (!w.lastRun) return '<span class="wo-chip">Not run yet</span>';
    var st = w.lastRun.status;
    if (st === 'running') return '<span class="wo-chip run">Running now</span>';
    if (st === 'error') return '<span class="wo-chip bad">Last run failed</span>';
    if (st === 'awaiting_approval') return '<span class="wo-chip warn">Waiting</span>';
    return '<span class="wo-chip good">Last run done</span>';
  }
  function href(w) {
    return '/agents/config?agent=' + encodeURIComponent(w.agent) + '&tab=workflows&workflow=' + encodeURIComponent(w.id);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function hero(sub) {
    return '<div class="wo-hero"><div><h2 class="le-display">Your workflows</h2><p class="le-display-sub">' + sub + '</p></div>' + mascot + '</div>';
  }
  var TILES = '<a class="wo-tile" href="/workflows/new" data-new-workflow><b>Describe a workflow</b><span>Say what the agent should do in a sentence or two, and review the plan.</span></a>' +
    '<a class="wo-tile" href="/workflows/new#examples"><b>Start from an example</b><span>A ready-made workflow for a common task.</span></a>';

  function cardHtml(w) {
    var decided = w.approved + w.refused;
    return '<div class="wo-card">' +
      '<div class="wo-card-head"><span class="wo-icon' + (w.live ? ' live' : '') + '">' + ICON_FLOW + '</span>' +
        '<span class="wo-card-text"><a class="wo-card-title" href="' + href(w) + '">' + esc(w.title) + '</a>' +
          '<span class="wo-card-desc">' + plural(w.runsThisWeek, 'run', 'runs') + ' this week' + (w.failedThisWeek ? ', <span style="color:var(--bad)">' + w.failedThisWeek + ' failed</span>' : '') + (decided ? DOT + w.approved + ' of ' + decided + ' approved' : '') + '</span></span>' +
        '<a class="wo-open" href="' + href(w) + '">Open</a></div>' +
      '<div class="wo-chips">' + w.starts.map(function (x, i) { var t = x === 'Run now' ? 'when someone runs it' : x; return '<span class="wo-chip' + (i === 0 ? ' strong' : '') + '" title="' + esc(t) + '">' + (i === 0 ? '<span class="wo-chip-k">Starts</span>' : '') + esc(t) + '</span>'; }).join('') +
        '<a class="wo-chip" href="/agents/config?agent=' + encodeURIComponent(w.agent) + '">' + esc(w.agentLabel) + '</a>' +
        lastRunChip(w) + (w.lastRun ? '<span class="wo-next">Last run ' + esc(ago(w.lastRun.at)) + '</span>' : '') + '</div>' +
    '</div>';
  }

  function render() {
    var d = data;
    if (!d.workflows.length) {
      page.innerHTML = hero('A workflow is how an agent does something again and again: on a schedule, from a webhook or your app. It asks you when it needs to, and every run is kept to check and improve.') +
        '<div class="le-grid wo-cols2">' + TILES + '</div>';
      return;
    }
    var s = d.summary;
    var q = (search.value || '').trim().toLowerCase();
    var shown = d.workflows.filter(function (w) { return !q || [w.title, w.agentLabel, w.starts.join(' ')].join(' ').toLowerCase().indexOf(q) !== -1; });
    var stats = '<div class="le-grid wo-cols4">' +
        '<a class="wo-stat' + (s.waiting ? ' warn' : '') + '" href="/inbox"><b>' + s.waiting + '</b><span>Waiting for you</span></a>' +
        '<div class="wo-stat"><b>' + s.runsThisWeek + '</b><span>Runs in the last 7 days</span></div>' +
        '<div class="wo-stat' + (s.failedThisWeek ? ' bad' : '') + '"><b>' + s.failedThisWeek + '</b><span>Failed in the last 7 days</span></div>' +
        '<div class="wo-stat"><b>' + s.workflows + '</b><span>' + (s.workflows === 1 ? 'Workflow' : 'Workflows') + '</span></div>' +
      '</div>';
    var cells = shown.map(cardHtml);
    page.innerHTML = hero(plural(s.workflows, 'workflow', 'workflows') + ': how each one starts, how it' + String.fromCharCode(8217) + 's been going, and what' + String.fromCharCode(8217) + 's waiting for you.') + stats +
      '<h3 class="wo-section-title">All workflows</h3>' +
      '<div class="le-grid wo-cols2">' + (cells.length ? cells.join('') + (cells.length % 2 ? '<div class="wo-filler" aria-hidden="true"></div>' : '') : '<p class="wo-empty">No workflow matches.</p>') + '</div>' +
      (q ? '' : '<h3 class="wo-section-title">Add a workflow</h3><div class="le-grid wo-cols2">' + TILES + '</div>');
  }
  search.addEventListener('input', function () { if (data) render(); });

  // + New workflow (the top bar's, the tile, the sidebar's + New) opens a
  // dialog: the agent and the workflow in words; Build goes on to plan it
  // on the build page (/workflows/new), which starts at once (&go=1).
  var dlg = document.getElementById('woDialog');
  var form = document.getElementById('woForm');
  var foot = document.getElementById('woFoot');
  var agentSelect = document.getElementById('woAgent');
  var built = null;
  function openNew() {
    foot.textContent = '';
    if (!dlg.open) dlg.showModal();
    document.getElementById('woText').focus();
    if (built) return;
    fetch('/workflows', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      built = d;
      var agents = (d.agents || []).map(function (a) { return typeof a === 'string' ? { name: a } : a; });
      agentSelect.innerHTML = (agents.length === 1 ? '' : '<option value="">Choose an agent</option>') + agents.map(function (a) {
        return '<option value="' + esc(a.name) + '">' + esc(a.displayName || a.name) + '</option>';
      }).join('');
      if (!agents.length) foot.innerHTML = '<span class="error">There are no agents yet. <a href="/agents?new=1">Create one</a> first.</span>';
      else if (!d.ready) foot.innerHTML = '<span class="error">Building needs a model: set one on an agent and add its key under <a href="/config?section=models">Models</a>.</span>';
    }).catch(function (err) { foot.innerHTML = '<span class="error">' + esc(err.message) + '</span>'; });
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#woNewBtn, [data-new-workflow], .le-pane[data-le-pane="workflows"] .le-pane-new');
    if (!a || ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    openNew();
  });
  document.getElementById('woCancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var agent = agentSelect.value;
    var text = document.getElementById('woText').value.trim();
    if (!agent) { foot.innerHTML = '<span class="error">Choose the agent it goes into.</span>'; return; }
    if (text.length < 10) { foot.innerHTML = '<span class="error">Say what the workflow should do: what starts it and its steps.</span>'; return; }
    if (built && !built.ready) { foot.innerHTML = '<span class="error">Building needs a model: set one on an agent and add its key under <a href="/config?section=models">Models</a>.</span>'; return; }
    location.href = '/workflows/new?agent=' + encodeURIComponent(agent) + '&description=' + encodeURIComponent(text) + '&go=1';
  });

  // The sidebar asks for the same list as the page opens: one request.
  (window.leShell && window.leShell.getJson
    ? window.leShell.getJson('/workflows/overview').then(function (d) { if (!d) throw new Error('could not reach the server'); return d; })
    : fetch('/workflows/overview', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
    .then(function (d) { data = d; render(); })
    .catch(function (err) { page.innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your workflows: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
