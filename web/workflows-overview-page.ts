// The console's front page: / and /workflows list every workflow in the
// workspace with how it starts, how it's been running and what's waiting
// in the Inbox (web/workflows-overview.ts behind /workflows/overview).
// Like the other console pages, its inline script avoids backslashes and
// template placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'
import { newWorkflowDialogCss, newWorkflowDialogHtml, newWorkflowDialogScript } from './new-workflow-dialog.js'

export const workflowsOverviewPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workflows</title>
<style>${devUiCss}${MASCOT_CSS}${newWorkflowDialogCss}
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
  .wo-cols3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .wo-cats { display: flex; flex-wrap: wrap; gap: 6px; padding: 16px 22px; border: 1px solid var(--line); border-bottom: 0; }
  .wo-cats button { height: 28px; padding: 0 11px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg); font-size: 12.5px; font-weight: 500; color: var(--ink-muted); }
  .wo-cats button:hover { color: var(--ink); background: var(--surface); }
  .wo-cats button[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  button.wo-card { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; height: auto; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: background .15s; }
  button.wo-card:hover { background: var(--surface); }
  .wo-ex { gap: 8px; }
  .wo-ex-cat { font-size: 11.5px; font-weight: 600; color: var(--ink-faint); }
  .wo-ex-msg { font-size: 13px; line-height: 1.5; color: var(--ink-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  button.wo-tile { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: left; font: inherit; cursor: pointer; height: auto; }
  .wo-chip-k { color: var(--ink-faint); font-weight: 400; margin-right: 6px; }
  a.wo-chip:hover { color: var(--ink); border-color: var(--ink-faint); }
  .wo-next { font-size: 12px; color: var(--ink-faint); margin-left: 4px; white-space: nowrap; }
  .wo-tile { display: grid; gap: 6px; align-content: start; padding: 22px; background: var(--bg); text-decoration: none; color: inherit; transition: background .15s; }
  .wo-tile:hover { background: var(--surface); }
  .wo-tile b { font-size: 15px; font-weight: 600; color: var(--ink); }
  .wo-tile span { font-size: 13px; color: var(--ink-muted); line-height: 1.45; }
  .wo-filler { background: var(--bg); }
  .wo-empty { padding: 40px 32px; text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--bg); grid-column: 1 / -1; margin: 0; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 860px) {
    .wo-hero { padding: 24px 22px 20px; }
    .wo-hero .le-mascot { display: none; }
    .wo-cols4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wo-cols2, .wo-cols3 { grid-template-columns: minmax(0, 1fr); }
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
    <span class="le-seg" role="tablist" aria-label="View" id="woViews"><button type="button" role="tab" data-view="list" aria-selected="true">Your workflows</button><button type="button" role="tab" data-view="examples" aria-selected="false">Examples</button></span>
    <span class="le-topbar-gap"></span>
    <label class="le-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="woSearch" placeholder="Search workflows" aria-label="Search workflows"></label>
    <a class="le-btn-dark" href="/workflows?new=1" id="woNewBtn">+ New workflow</a>
  </header>
  <div class="le-scroll"><div class="le-page"><div class="wo" id="woPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
<template id="woMascot">${mascotSvg(92)}</template>
${newWorkflowDialogHtml}
${consoleShellScript}
${newWorkflowDialogScript}
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
  function hero(sub, title) {
    return '<div class="wo-hero"><div><h2 class="le-display">' + (title || 'Your workflows') + '</h2><p class="le-display-sub">' + sub + '</p></div>' + mascot + '</div>';
  }
  var TILES = '<a class="wo-tile" href="/workflows?new=1" data-new-workflow><b>Describe a workflow</b><span>Say what the agent should do in a sentence or two, and it' + String.fromCharCode(8217) + 's built for you.</span></a>' +
    '<a class="wo-tile" href="/workflows?view=examples" data-to-view="examples"><b>Start from an example</b><span>A workflow for a common task, to change to fit and build.</span></a>';

  // ---- Examples: ready-to-adapt workflows (GET /workflows); opening one
  // fills in the New workflow dialog, to change to fit and build. ----
  var params = new URLSearchParams(location.search);
  var view = params.get('view') === 'examples' ? 'examples' : 'list';
  var examples = null;
  var exCategory = '';
  var exShown = 30;
  function loadExamples() {
    fetch('/workflows', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      examples = (d.examples || []).map(function (e) { return { id: e.id, category: e.category, title: (e.plan && e.plan.name) || e.id, message: e.message, apps: e.apps || [], asksFirst: e.asksFirst || [] }; })
        .concat((d.messages || []).map(function (m) { return { id: m.id, category: m.category, title: m.title, message: m.message, apps: m.apps || [], asksFirst: m.asksFirst || [] }; }));
      if (view === 'examples') render();
    }).catch(function (err) { page.innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load the examples: ' + esc(err.message) + '</p>'; });
  }
  function renderExamples() {
    if (!examples) { page.innerHTML = '<p class="hint">Loading the examples' + String.fromCharCode(8230) + '</p>'; loadExamples(); return; }
    var q = (search.value || '').trim().toLowerCase();
    var cats = [];
    examples.forEach(function (e) { if (e.category && cats.indexOf(e.category) === -1) cats.push(e.category); });
    cats.sort();
    var shown = examples.filter(function (e) {
      return (!exCategory || e.category === exCategory) && (!q || [e.title, e.message, e.category, e.apps.join(' ')].join(' ').toLowerCase().indexOf(q) !== -1);
    });
    var cells = shown.slice(0, exShown).map(function (e, i) {
      return '<button type="button" class="wo-card wo-ex" data-ex="' + esc(e.id) + '">' +
        '<span class="wo-ex-cat">' + esc(e.category || '') + '</span>' +
        '<span class="wo-card-title">' + esc(e.title) + '</span>' +
        '<span class="wo-ex-msg">' + esc(e.message) + '</span>' +
        '<span class="wo-chips">' + e.apps.map(function (a) { return '<span class="wo-chip">' + esc(a) + '</span>'; }).join('') +
          (e.asksFirst.length ? '<span class="wo-chip strong"><span class="wo-chip-k">Asks you</span>' + esc(e.asksFirst.join(', ')) + '</span>' : '') + '</span>' +
      '</button>';
    });
    var more = shown.length > exShown ? '<button type="button" class="wo-tile wo-more" data-ex-more><b>Show more</b><span>' + (shown.length - exShown) + ' more examples</span></button>' : '';
    if (more) cells.push(more);
    page.innerHTML = hero(examples.length + ' examples to start from. Pick one, change it to fit, and it' + String.fromCharCode(8217) + 's built for you.', 'Workflow examples') +
      '<div class="wo-cats"><button type="button" data-cat=""' + (exCategory ? '' : ' aria-pressed="true"') + '>All</button>' + cats.map(function (c) { return '<button type="button" data-cat="' + esc(c) + '"' + (c === exCategory ? ' aria-pressed="true"' : '') + '>' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="le-grid wo-cols3">' + (cells.length ? cells.join('') + (cells.length % 3 ? new Array(3 - (cells.length % 3) + 1).join('<div class="wo-filler" aria-hidden="true"></div>') : '') : '<p class="wo-empty">No example matches.</p>') + '</div>';
  }
  page.addEventListener('click', function (ev) {
    var ex = ev.target.closest('[data-ex]');
    if (ex) {
      var e = (examples || []).filter(function (x) { return x.id === ex.getAttribute('data-ex'); })[0];
      if (e) window.leNewWorkflow.open({ description: e.message });
      return;
    }
    var cat = ev.target.closest('[data-cat]');
    if (cat) { exCategory = cat.getAttribute('data-cat'); exShown = 30; render(); return; }
    if (ev.target.closest('[data-ex-more]')) { exShown += 30; render(); return; }
    var to = ev.target.closest('[data-to-view]');
    if (to && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); setView(to.getAttribute('data-to-view')); }
  });
  var views = document.getElementById('woViews');
  function setView(v) {
    view = v;
    var bs = views.querySelectorAll('[data-view]');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-selected', String(bs[i].getAttribute('data-view') === v));
    search.placeholder = v === 'examples' ? 'Search examples, e.g. invoices, Shopify' : 'Search workflows';
    search.value = '';
    history.replaceState(null, '', v === 'examples' ? '/workflows?view=examples' : '/workflows');
    if (v === 'examples' || data) render();
    document.querySelector('.le-scroll').scrollTop = 0;
  }
  views.addEventListener('click', function (ev) { var b = ev.target.closest('[data-view]'); if (b) setView(b.getAttribute('data-view')); });

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
    if (view === 'examples') return renderExamples();
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
  search.addEventListener('input', function () { if (data || view === 'examples') render(); });

  // + New workflow (the top bar's, the tile, the sidebar's + New) opens
  // the New workflow dialog (web/new-workflow-dialog.ts); a workflow built
  // there joins the list.
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#woNewBtn, [data-new-workflow], .le-pane[data-le-pane="workflows"] .le-pane-new');
    if (!a || ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    window.leNewWorkflow.open({});
  });
  if (view === 'examples') setView('examples');
  // /workflows?new=1: the dialog, filled in from the address (an agent, a
  // description, a goal's suggestion), and a goal's built at once.
  if (params.get('new') === '1') {
    window.leNewWorkflow.open({
      agent: params.get('agent') || '', description: params.get('description') || '',
      goal: params.get('goal') || '', goalJob: params.get('goalJob') || params.get('goalWorkflow') || '', goalStep: params.get('goalStep') || '',
      go: params.get('go') === '1' || Boolean(params.get('goal') && params.get('description')),
    });
    history.replaceState(null, '', view === 'examples' ? '/workflows?view=examples' : '/workflows');
  }
  document.addEventListener('le-workflow-built', function () {
    fetch('/workflows/overview', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { data = d; render(); }).catch(function () {});
  });

  // The sidebar asks for the same list as the page opens: one request.
  (window.leShell && window.leShell.getJson
    ? window.leShell.getJson('/workflows/overview').then(function (d) { if (!d) throw new Error('could not reach the server'); return d; })
    : fetch('/workflows/overview', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
    .then(function (d) { data = d; if (view === 'list') render(); })
    .catch(function (err) { page.innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your workflows: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
