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
  .wo-dlg-status { padding: 22px 24px; display: grid; gap: 14px; overflow: auto; font-size: 14px; line-height: 1.5; }
  .wo-dlg-status[hidden], .wo-dlg-body[hidden] { display: none; }
  .wo-dlg-status h3 { margin: 0; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; }
  .wo-dlg-status p { margin: 0; }
  .wo-progress { display: flex; align-items: center; gap: 10px; color: var(--ink-muted); }
  .wo-spinner { width: 14px; height: 14px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: wo-spin .8s linear infinite; flex: none; }
  @keyframes wo-spin { to { transform: rotate(360deg); } }
  .wo-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); }
  .wo-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 10px 14px; font-size: 13.5px; }
  .wo-list li + li { border-top: 1px solid var(--line); }
  .wo-list a { color: var(--accent-ink); font-weight: 600; }
  .wo-tag { font-size: 11.5px; font-weight: 600; padding: 1px 8px; border-radius: 6px; }
  .wo-tag.bad { background: var(--bad-soft); color: var(--bad); }
  .wo-tag.warn { background: var(--warn-soft); color: var(--warn); }
  .wo-tag.good { background: var(--good-soft); color: var(--good); }
  .wo-k { font-size: 12.5px; color: var(--ink-muted); }
  .wo-row-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .wo-row-actions .le-btn-dark, .wo-row-actions .wo-plain { height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; }
  .wo-plain { border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  .wo-plain:hover { background: var(--surface); }
  .wo-hook { display: flex; gap: 8px; }
  .wo-hook input { flex: 1; min-width: 0; height: 34px; border-radius: 9px; font-family: var(--font-mono); font-size: 12px; }
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
    <div class="wo-dlg-status" id="woStatus" hidden></div>
    <div class="wo-dlg-body" id="woFormBody">
      <div class="wo-dlg-col">
        <div class="wo-field"><label for="woAgent">Agent</label><select id="woAgent"><option value="">Loading&hellip;</option></select><p class="hint">The agent that runs it, with its tools and permissions.</p></div>
        <div class="wo-field"><label for="woText">Your workflow</label><textarea id="woText" placeholder="Every Monday, find blog ideas on the web, ask me on Slack to pick one, draft it, and let me review it before it goes up."></textarea><p class="hint">What starts it, the steps in order, and where you want to choose or approve.</p></div>
      </div>
      <div class="wo-dlg-col">
        <div class="wo-field"><span class="wo-field-k">What happens next</span><p class="hint">LoopEngine builds it on the agent: each step matched to a tool, where it asks you, its permissions and its success criteria. It stops to tell you if something it needs is missing, and when it's done, what's left to set up. This can take a few minutes.</p></div>
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
  var ELLIPSIS = String.fromCharCode(8230);
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
  // Build, here: plan it, stop only for what's missing (or if it isn't
  // this agent's kind of work), draft its success criteria, create it,
  // and show what's left to set up. The same steps as the build page,
  // without its review screen.
  var statusBox = document.getElementById('woStatus');
  var formBody = document.getElementById('woFormBody');
  var buildBtn = document.getElementById('woBuild');
  var cancelBtn = document.getElementById('woCancel');
  var KEPT = { allow: 'runs on its own', ask: 'asks you first', deny: 'never runs' };
  var WANTED = { allow: 'run on its own', ask: 'ask you first', deny: 'never run' };
  var building = null;
  function show(html) { formBody.hidden = true; statusBox.hidden = false; buildBtn.hidden = true; statusBox.innerHTML = html; foot.textContent = ''; }
  function backToForm(error) {
    building = null;
    statusBox.hidden = true; formBody.hidden = false; buildBtn.hidden = false; buildBtn.disabled = false; cancelBtn.textContent = 'Cancel';
    foot.innerHTML = error ? '<span class="error">' + esc(error) + '</span>' : '';
  }
  function progress(text) { show('<h3>Building it</h3><p class="wo-progress"><span class="wo-spinner" aria-hidden="true"></span><span>' + esc(text) + '</span></p><p class="wo-k">It looks at the agent and your apps and abilities first. Keep this open; closing it stops the build.</p>'); }
  function api(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function agentName(name) {
    var opt = agentSelect.querySelector('option[value="' + CSS.escape(name) + '"]');
    return opt ? opt.textContent : name;
  }
  function plan(job) {
    progress('Planning' + ELLIPSIS);
    api('/workflows/plan', { description: job.description, agent: job.agent }).then(function (r) {
      if (!r.ok) return backToForm(r.body.error || 'Could not build it.');
      wait(job, r.body.id);
    }).catch(function (err) { backToForm(err.message); });
  }
  function wait(job, id) {
    setTimeout(function () {
      if (building !== job) return;
      fetch('/workflows/plan/' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); }).then(function (r) {
        if (building !== job) return;
        if (!r.ok || r.body.status === 'failed') return backToForm((r.body && r.body.error) || 'Could not build it.');
        if (r.body.status === 'planning') { progress('Planning' + ELLIPSIS + ' ' + Math.round((Date.now() - job.started) / 1000) + 's so far'); return wait(job, id); }
        job.planned = r.body.result;
        next(job);
      }).catch(function () { wait(job, id); });
    }, 3000);
  }
  // What's needed before it can be created, or on to create it.
  function next(job) {
    var p = job.planned.plan;
    if (p.fit && p.fit.matches === false && !job.fitOk) {
      show('<h3>This doesn' + String.fromCharCode(8217) + 't look like ' + esc(agentName(job.agent)) + String.fromCharCode(8217) + 's work</h3><p>' + esc(p.fit.reason) + ' A new agent keeps its instructions, apps and permissions separate.</p>' +
        '<div class="wo-row-actions"><a class="le-btn-dark" href="/agents?new=1&workflow=' + encodeURIComponent(job.description) + '">Create a new agent for it</a><button type="button" class="wo-plain" data-wo="fit-ok">Add it to ' + esc(agentName(job.agent)) + ' anyway</button></div>');
      statusBox.querySelector('[data-wo="fit-ok"]').addEventListener('click', function () { job.fitOk = true; next(job); });
      return;
    }
    var missing = (job.planned.requirements || []).filter(function (r) { return !r.ready; });
    if (missing.length) {
      show('<h3>Before it can be created</h3><p>' + esc(p.name) + ' needs ' + (missing.length === 1 ? 'this' : 'these') + ' first. Add ' + (missing.length === 1 ? 'it' : 'them') + ' (it opens in a new tab), then check again.</p>' +
        '<ul class="wo-list">' + missing.map(function (r) { return '<li><span class="wo-tag bad">Missing</span><strong>' + esc(r.title) + '</strong><span class="wo-k">' + esc(r.todo || '') + '</span>' + (r.href ? '<a href="' + esc(r.href) + '" target="_blank" rel="noopener">Open</a>' : '') + '</li>'; }).join('') + '</ul>' +
        '<div class="wo-row-actions"><button type="button" class="le-btn-dark" data-wo="recheck">Check again</button><span class="wo-k" data-wo="recheck-status"></span></div>');
      statusBox.querySelector('[data-wo="recheck"]').addEventListener('click', function (ev) {
        ev.currentTarget.disabled = true;
        statusBox.querySelector('[data-wo="recheck-status"]').textContent = 'Checking' + ELLIPSIS;
        api('/workflows/check', { plan: p, agent: job.planned.agent || job.agent }).then(function (r) {
          if (!r.ok) return backToForm(r.body.error || 'Could not check.');
          job.planned.requirements = r.body.requirements;
          job.planned.check = r.body.check;
          next(job);
        }).catch(function (err) { backToForm(err.message); });
      });
      return;
    }
    create(job);
  }
  function create(job) {
    var p = job.planned.plan;
    var agent = job.planned.agent || job.agent;
    var go = function () {
      progress('Creating ' + p.name + ELLIPSIS + ' installing apps and abilities can take a minute');
      api('/workflows/create', { plan: p, agent: agent, description: job.description, workflowContext: typeof p.context === 'string' ? p.context : undefined }).then(function (r) {
        if (building !== job) return;
        if (!r.ok) return backToForm(r.body.error || 'Could not create it.');
        done(r.body);
      }).catch(function (err) { backToForm(err.message); });
    };
    // Its success criteria, written as the build page would, unless it has some.
    if ((p.successCriteria || []).length) return go();
    progress('Writing its success criteria' + ELLIPSIS);
    api('/workflows/criteria', { plan: p, agent: agent }).then(function (r) { if (r.ok) p.successCriteria = r.body.criteria || []; go(); }, go);
  }
  // Done: what was made, and what's left to set up.
  function done(c) {
    building = null;
    document.getElementById('woText').value = '';
    var href = '/agents/config?agent=' + encodeURIComponent(c.agent) + '&tab=workflows&workflow=' + encodeURIComponent(c.workflowId || '');
    var left = [];
    if (c.schedule) left.push('<li><span class="wo-tag warn">Paused</span>Its schedule, ' + esc(c.schedule.description) + ', is off until you turn it on in its Triggers tab.</li>');
    if (c.scheduleError) left.push('<li><span class="wo-tag bad">Not made</span>The schedule: ' + esc(c.scheduleError) + '</li>');
    if (c.webhook) left.push('<li style="display:grid"><span><span class="wo-tag warn">Off</span> Its webhook, ' + esc(c.webhook.trigger.name) + ': copy this URL into ' + esc(c.webhook.trigger.verify.sender === 'custom' ? 'your app' : c.webhook.trigger.verify.sender) + ' (it' + String.fromCharCode(8217) + 's shown only now), then add the signing secret on its Triggers tab to turn it on.</span>' +
      '<span class="wo-hook"><input readonly value="' + esc(c.webhook.url) + '" data-wo="hook-url"><button type="button" class="wo-plain" data-wo="hook-copy">Copy</button></span></li>');
    if (c.webhookError) left.push('<li><span class="wo-tag bad">Not made</span>The webhook: ' + esc(c.webhookError) + '</li>');
    if (c.loadError) left.push('<li><span class="wo-tag bad">Error</span>The agent didn' + String.fromCharCode(8217) + 't load: ' + esc(c.loadError) + '</li>');
    ((c.abilities && c.abilities.failed) || []).forEach(function (f) { left.push('<li><span class="wo-tag bad">Not installed</span><strong>' + esc(f.name) + '</strong><span class="wo-k">' + esc(f.error) + '</span></li>'); });
    (c.keptDecisions || []).forEach(function (k) { left.push('<li><span class="wo-tag warn">Kept</span><code>' + esc(k.tool) + '</code> still ' + esc(KEPT[k.has] || k.has) + '; the workflow wanted it to ' + esc(WANTED[k.wants] || k.wants) + '. Change it on the agent' + String.fromCharCode(8217) + 's Permissions tab.</li>'); });
    (c.checklist || []).forEach(function (it) { left.push('<li><span class="wo-tag warn">To do</span>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>'); });
    show('<h3>' + esc(c.workflow) + ' is ready</h3><p>Added to ' + esc(agentName(c.agent)) + '.</p>' +
      (left.length ? '<div class="wo-k">Left to set up</div><ul class="wo-list">' + left.join('') + '</ul>' : '<p class="wo-k"><span class="wo-tag good">Ready</span> Nothing left to set up.</p>') +
      '<div class="wo-row-actions"><a class="le-btn-dark" href="' + href + '">Open the workflow</a><a class="wo-plain" href="/playground?agent=' + encodeURIComponent(c.agent) + '">Try it in Chat</a></div>');
    cancelBtn.textContent = 'Close';
    var copy = statusBox.querySelector('[data-wo="hook-copy"]');
    if (copy) copy.addEventListener('click', function () { var input = statusBox.querySelector('[data-wo="hook-url"]'); input.select(); if (navigator.clipboard) navigator.clipboard.writeText(input.value); copy.textContent = 'Copied'; });
    // The list behind, with it.
    fetch('/workflows/overview', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { data = d; render(); }).catch(function () {});
    if (window.leShell && window.leShell.reloadWorkflows) window.leShell.reloadWorkflows();
  }
  dlg.addEventListener('close', function () { if (building) building = null; backToForm(''); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (building) return;
    var agent = agentSelect.value;
    var text = document.getElementById('woText').value.trim();
    if (!agent) { foot.innerHTML = '<span class="error">Choose the agent it goes into.</span>'; return; }
    if (text.length < 10) { foot.innerHTML = '<span class="error">Say what the workflow should do: what starts it and its steps.</span>'; return; }
    if (built && !built.ready) { foot.innerHTML = '<span class="error">Building needs a model: set one on an agent and add its key under <a href="/config?section=models">Models</a>.</span>'; return; }
    building = { agent: agent, description: text, started: Date.now() };
    cancelBtn.textContent = 'Cancel';
    plan(building);
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
