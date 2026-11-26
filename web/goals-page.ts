// The console's Goals page: /goals lists the goals made so far, /goals?new=1
// (and the workspace's front page, /) starts one, and /goals?goal=<id>
// opens one. Type a goal, get suggested workflows, each with its own
// measure and the agent it would go into: one workflow, or for a bigger
// piece of the goal a group of workflows that run in order. Generate more,
// and build one (or a group's step) straight from the suggestions, which
// makes its agent first when it doesn't exist (web/goals-admin.ts
// behind /goals/*). Same shell and
// styles as the other console pages; like them, its inline script avoids
// backslashes and template placeholders, since it lives inside a template
// literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'

const goalsPageTemplate: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Goals</title>
<style>${devUiCss}${MASCOT_CSS}
  .gl { max-width: 1120px; display: grid; gap: 0; }
  .gl textarea { width: 100%; box-sizing: border-box; min-height: 64px; font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); resize: vertical; }
  .gl textarea:focus, .gl select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .gl-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .gl-btn { height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--primary); background: var(--primary); color: var(--on-primary); cursor: pointer; }
  .gl-btn:hover:not(:disabled) { opacity: .88; background: var(--primary); }
  .gl-btn.small { height: 30px; font-size: 13px; padding: 0 12px; }
  .gl-btn.soft { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
  .gl-btn.soft:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); opacity: 1; }
  .gl-btn.plain { background: var(--bg); border-color: var(--line); color: var(--ink); font-weight: 500; }
  .gl-btn.plain:hover:not(:disabled) { background: var(--surface); opacity: 1; }
  .gl-link { background: none; border: 0; padding: 0; height: auto; color: var(--accent-ink); font-size: 13px; cursor: pointer; font-weight: 500; }
  .gl-link-btn { display: inline-flex; align-items: center; text-decoration: none; }
  .gl-select { font: inherit; font-size: 13px; height: 30px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
  .gl-input { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .gl-input[hidden] { display: none; }
  .gl-crumb { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; }
  .gl-crumb a { color: var(--ink-muted); text-decoration: none; font-weight: 600; }
  .gl-crumb a:hover { color: var(--ink); }
  .gl-crumb span { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gl-new-btn { text-decoration: none; }
  .gl-new-btn[hidden], .le-search[hidden] { display: none; }
  /* The top of each view: a big, light title, a line under it, the mascot. */
  .gl-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 36px 22px 28px; border: 1px solid var(--line); border-bottom: 0; }
  .gl-hero .le-mascot { flex: none; margin-bottom: -6px; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .gl-hero-text { display: grid; gap: 10px; min-width: 0; }
  .gl-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .gl-display { margin: 0; font-size: 32px; line-height: 1.18; font-weight: 400; letter-spacing: -0.025em; color: var(--ink); overflow-wrap: anywhere; }
  .gl-hero-sub { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink-muted); max-width: 70ch; }
  .gl-section-title { margin: 0; padding: 30px 22px 16px; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; border-left: 1px solid var(--line); border-right: 1px solid var(--line); display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .gl-section-title .hint { font-size: 13px; letter-spacing: 0; }
  .gl-cols2 { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: row dense; }
  .gl-cols3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gl-cols1 { grid-template-columns: minmax(0, 1fr); }
  .gl-wide { grid-column: 1 / -1; }
  .gl-cell { padding: 20px 22px; background: var(--bg); display: grid; gap: 14px; align-content: start; }
  .gl-filler { background: var(--bg); }
  /* Chips, as on Schedules. */
  .gl-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .gl-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); font-size: 12px; color: var(--ink-muted); white-space: nowrap; text-decoration: none; background: var(--bg); }
  .gl-chip.strong { background: var(--surface); border-color: transparent; color: var(--ink); font-weight: 500; }
  .gl-chip.good { background: var(--good-soft); border-color: transparent; color: var(--good); font-weight: 600; }
  .gl-chip.warn { background: var(--warn-soft); border-color: transparent; color: var(--warn); font-weight: 600; }
  .gl-chip.bad { background: var(--bad-soft); border-color: transparent; color: var(--bad); }
  .gl-chip.accent { background: var(--accent-soft); border-color: transparent; color: var(--accent-ink); font-weight: 600; }
  .gl-chip[hidden] { display: none; }
  .gl-chip .gl-select { height: 22px; border: 0; padding: 0 2px; background: none; font-weight: 500; }
  .gl-chip-k { color: var(--ink-faint); font-weight: 400; }
  .gl-next { font-size: 12px; color: var(--ink-faint); margin-left: 4px; white-space: nowrap; }
  /* A card: an icon, its title and a line or two, and what to do. */
  .gl-card-head { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
  .gl-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); color: var(--ink-muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); background: var(--bg); }
  .gl-icon svg { width: 16px; height: 16px; }
  .gl-icon.good { color: var(--good); }
  .gl-card-text { display: grid; gap: 3px; min-width: 0; }
  .gl-card-kind { font-size: 11.5px; font-weight: 600; color: var(--ink-faint); }
  .gl-card-title { font-size: 15px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; line-height: 1.35; }
  .gl-card-desc { font-size: 13px; line-height: 1.5; color: var(--ink-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .gl-card-side { display: flex; gap: 8px; align-items: center; }
  a.gl-cell { text-decoration: none; color: inherit; transition: background .15s; }
  a.gl-cell:hover { background: var(--surface); }
  .gl-cell.discarded .gl-card-text { opacity: .6; }
  .gl-menu { position: relative; }
  .gl-menu summary { list-style: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; cursor: pointer; color: var(--ink-muted); }
  .gl-menu summary::-webkit-details-marker { display: none; }
  .gl-menu summary:hover { background: var(--surface); color: var(--ink); }
  .gl-menu[open] .gl-menu-list { display: grid; }
  .gl-menu-list { display: none; position: absolute; right: 0; top: 32px; z-index: 20; min-width: 170px; padding: 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); box-shadow: 0 8px 24px rgba(0, 0, 0, .12); }
  .gl-menu-list a, .gl-menu-list button { display: block; width: 100%; text-align: left; height: auto; padding: 7px 10px; border: 0; border-radius: 7px; background: none; font-size: 13px; font-weight: 400; color: var(--ink); text-decoration: none; cursor: pointer; }
  .gl-menu-list a:hover, .gl-menu-list button:hover:not(:disabled) { background: var(--surface); }
  .gl-what summary { cursor: pointer; font-size: 13px; color: var(--accent-ink); font-weight: 600; }
  .gl-what p { margin: 8px 0 0; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; background: var(--surface); padding: 10px 12px; border-radius: 8px; }
  .gl-card-foot { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
  /* The goal's numbers. */
  .gl-stat { padding: 20px 22px; background: var(--bg); display: grid; gap: 2px; }
  .gl-stat b { font-size: 34px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.1; color: var(--ink); }
  .gl-stat span { font-size: 13px; color: var(--ink-muted); }
  .gl-stat.attn b { color: var(--warn); }
  /* Before you start: one step a cell. */
  .gl-setup-step { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 12px; align-items: start; padding: 16px 22px; background: var(--bg); font-size: 13.5px; line-height: 1.5; }
  .gl-setup-n { width: 24px; height: 24px; border-radius: 50%; background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 600; display: grid; place-items: center; }
  /* A built workflow's workflows, in the order they run. */
  .gl-flows { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .gl-flow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; background: var(--bg); }
  .gl-flow + .gl-flow { border-top: 1px solid var(--line); }
  .gl-flow-n { width: 24px; height: 24px; border-radius: 50%; background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; align-self: start; margin-top: 1px; }
  .gl-flow.built .gl-flow-n { background: var(--good-soft); color: var(--good); }
  .gl-flow.single .gl-flow-n svg { width: 13px; height: 13px; }
  .gl-flow-k { font-size: 11.5px; color: var(--ink-faint); }
  .gl-flow-main { display: grid; gap: 4px; min-width: 0; justify-items: start; }
  .gl-flow-title { font-size: 14px; font-weight: 600; color: var(--ink); text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a.gl-flow-title:hover { text-decoration: underline; }
  .gl-flow-meta { font-size: 12.5px; color: var(--ink-muted); line-height: 1.45; }
  .gl-flow-actions { display: flex; gap: 12px; align-items: center; }
  .gl-flow-actions .gl-unlink { color: var(--ink-faint); font-size: 12.5px; }
  .gl-flow-actions .gl-unlink:hover { color: var(--bad); }
  .gl-flow-then { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 6px 14px 6px 50px; font-size: 12.5px; color: var(--ink-muted); background: var(--surface); border-top: 1px solid var(--line); }
  .gl-flow-then .gl-link { font-size: 12px; color: var(--ink-faint); }
  .gl-paused { font-size: 11px; font-weight: 700; padding: 0 7px; border-radius: 999px; background: var(--surface); color: var(--ink-muted); }
  .gl-waiting { color: var(--warn); font-weight: 600; }
  .gl-needs { display: contents; }
  .gl-new { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); }
  .gl-panel { display: grid; gap: 8px; padding: 12px 14px; border: 1px dashed var(--line); border-radius: 10px; }
  .gl-panel[hidden] { display: none; }
  .gl-step-inputs { display: grid; gap: 6px; }
  [data-attn][hidden] { display: none; }
  .gl-job-status-line:empty { display: none; }
  /* Tiles that do something: suggest more, add your own. */
  .gl-tile { display: grid; gap: 6px; align-content: start; padding: 22px; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; background: var(--bg); text-align: left; height: auto; cursor: pointer; transition: background .15s; font: inherit; color: inherit; text-decoration: none; }
  .gl-tile:hover:not(:disabled) { background: var(--surface); }
  .gl-tile:disabled { cursor: default; opacity: .6; }
  .gl-tile b { font-size: 15px; font-weight: 600; color: var(--ink); }
  .gl-tile span { font-size: 13px; color: var(--ink-muted); line-height: 1.45; }
  .gl-add-form { display: grid; gap: 8px; padding: 20px 22px; background: var(--bg); }
  .gl-add-form[hidden] { display: none; }
  .gl-notice { display: grid; gap: 4px; padding: 12px 22px; font-size: 13.5px; }
  .gl-notice.good { background: var(--good-soft); }
  .gl-notice.warn { background: var(--warn-soft); }
  .gl-notice.bad { background: var(--bad-soft); }
  .gl-discarded-note { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 22px; background: var(--surface); font-size: 13.5px; border: 1px solid var(--line); border-bottom: 0; }
  .gl-empty { padding: 36px 32px; text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--bg); margin: 0; }
  .gl-foot { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 22px 2px 0; }
  .gl-foot .gl-danger { color: var(--bad); }
  .gl-status { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; color: var(--ink-muted); }
  .gl-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: gl-spin .8s linear infinite; }
  @keyframes gl-spin { to { transform: rotate(360deg); } }
  /* A new goal, in a dialog like Create schedule. */
  .gl-dialog { width: min(920px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--bg); color: var(--ink); box-shadow: 0 24px 60px rgba(0, 0, 0, .22); overflow: hidden; }
  .gl-dialog::backdrop { background: rgba(20, 24, 25, .35); backdrop-filter: blur(3px); }
  .gl-dialog form { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 50px); }
  .gl-dlg-head { display: flex; align-items: center; gap: 8px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
  .gl-dlg-head h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 500; }
  .gl-dlg-head button { height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; }
  .gl-dlg-body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); overflow: auto; }
  .gl-dlg-col { display: grid; align-content: start; }
  .gl-dlg-col + .gl-dlg-col { border-left: 1px solid var(--line); background: var(--surface); }
  .gl-field { display: grid; gap: 10px; padding: 18px 22px; }
  .gl-field-k { font-size: 14px; font-weight: 500; color: var(--ink); }
  .gl-dialog textarea { min-height: 110px; background: var(--bg); }
  .gl-dlg-foot { padding: 12px 22px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); min-height: 46px; display: flex; align-items: center; }
  .gl-dlg-foot:has(span:empty) { display: none; }
  .gl-about { display: grid; gap: 8px; margin-top: 8px; }
  @media (max-width: 860px) { .gl-dlg-body { grid-template-columns: minmax(0, 1fr); } .gl-dlg-col + .gl-dlg-col { border-left: 0; border-top: 1px solid var(--line); } }
  /* A new goal. */
  .gl-form { padding: 24px 26px; background: var(--bg); display: grid; gap: 12px; }
  .gl-examples { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .gl-example { font: inherit; font-size: 12.5px; height: 28px; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 7px; padding: 0 10px; cursor: pointer; }
  .gl-example:hover { border-color: var(--ink-faint); background: var(--surface); }
  .gl-share { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; line-height: 1.45; }
  .gl-share input { margin-top: 2px; }
  .gl-form details summary { cursor: pointer; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 860px) {
    .gl-hero { padding: 24px 22px 20px; }
    .gl-hero .le-mascot { display: none; }
    .gl-cols2, .gl-cols3 { grid-template-columns: minmax(0, 1fr); }
    .gl-section-title { padding: 24px 22px 14px; }
    .le-search { display: none; }
  }
</style>
</head>
<body data-le-page="goals">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <header class="le-topbar">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <h1 class="le-topbar-title gl-crumb" id="glTitle">__GL_HEAD__</h1>
    <span class="le-topbar-gap"></span>
    <label class="le-search" id="glSearchWrap"__GL_SEARCH_HIDDEN__><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="glSearch" placeholder="Search goals" aria-label="Search goals"></label>
    <a class="le-btn-dark gl-new-btn" id="glNewBtn" href="/goals?new=1"__GL_NEW_HIDDEN__>+ New goal</a>
  </header>
  <div class="le-scroll"><div class="le-page"><div class="gl" id="glPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
<template id="glMascot">${mascotSvg(92)}</template>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('glPage');
  var ELLIPSIS = String.fromCharCode(8230);
  var ARROW = String.fromCharCode(8594);
  // The focuses in use (the playbook's, and the workspace's own the
  // planner named), from the server; these until it answers.
  var FOCUS = [['new-signups', 'Getting new signups or customers'], ['activation', 'Getting new users started'], ['retention', 'Keeping users'], ['faster-support', 'Faster support'], ['revenue-recovery', 'Recovering revenue'], ['ops-hygiene', 'Smoother operations'], ['other', 'Something else']];
  // Goals of every size, to show what can go in the box.
  var GOAL_EXAMPLES = ['Answer every customer email within a day', 'Get 100 paying customers by March', 'Post on LinkedIn three times a week'];
  var KINDS = [['', 'Choose one'], ['ecommerce', 'Online store'], ['saas', 'Software or app'], ['agency', 'Agency or services'], ['local', 'Local business'], ['creator', 'Creator or media'], ['nonprofit', 'Nonprofit'], ['other', 'Something else']];
  var REASONS = [['not-relevant', 'Not relevant'], ['too-much-work', 'Too much work'], ['already-doing-it', 'Already doing it']];
  // Which view: the list (/goals), a new goal (?new=1, or the front page)
  // or one goal (?goal=).
  var startNew = location.pathname === '/' || new URLSearchParams(location.search).has('new');
  // A goal to start from (?new=1&text=...): one typed on the website's
  // goal box before signing up, carried in by "Open workspace".
  var startText = (new URLSearchParams(location.search).get('text') || '').slice(0, 500);
  // From Home's box (&go=1): suggest at once, without a second click.
  var autoStart = Boolean(startText) && new URLSearchParams(location.search).get('go') === '1';
  var state = { addOpen: false, addDraft: '', addShare: false, addNotice: null, flows: {}, openJobs: {}, goals: [], about: '', settings: {}, current: null, creating: startNew, showDiscarded: false, justDiscarded: null, error: '', poll: null, startedAt: 0 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function focusLabel(f) {
    var hit = FOCUS.filter(function (x) { return x[0] === f; })[0];
    return hit ? hit[1] : f;
  }
  function setUrl(id) {
    var url = new URL(location.href);
    if (id) url.searchParams.set('goal', id); else url.searchParams.delete('goal');
    url.searchParams.delete('new');
    url.searchParams.delete('text');
    url.searchParams.delete('go');
    if (url.pathname === '/') url.pathname = '/goals';
    history.replaceState(null, '', url);
  }

  function load(selectId) {
    api('GET', '/goals').then(function (r) {
      if (!r.ok) { page.innerHTML = '<p class="error">Could not load goals: ' + esc(r.body.error || 'unknown error') + '</p>'; return; }
      state.goals = r.body.goals || [];
      state.about = r.body.about || '';
      state.settings = r.body.settings || {};
      if (Array.isArray(r.body.focuses) && r.body.focuses.length) FOCUS = r.body.focuses.map(function (f) { return [f.id, f.label]; }).concat([['other', 'Something else']]);
      var id = selectId || new URLSearchParams(location.search).get('goal');
      state.current = state.goals.filter(function (g) { return g.id === id; })[0] || null;
      // With goals already, a new one is a dialog over the list; the whole
      // page is for the first goal, or one handed over from Home.
      var dialog = state.creating && state.goals.length && !startText && location.pathname !== '/';
      if (dialog) { state.creating = false; setUrl(''); }
      render();
      if (dialog) openNewGoal();
    });
  }

  // While a goal is planning, check every few seconds.
  function watch() {
    if (state.poll) { clearTimeout(state.poll); state.poll = null; }
    if (!state.current) return;
    var planning = state.current.status === 'planning';
    if (!planning) return;
    state.poll = setTimeout(function () {
      var typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('gl-note');
      if (typing) { watch(); return; }
      api('GET', '/goals/' + encodeURIComponent(state.current.id)).then(function (r) {
        if (!r.ok) return;
        replaceGoal(r.body.goal);
        if (planning && r.body.goal.status !== 'planning') reloadSidebar();
        render();
      });
    }, 3000);
  }
  function reloadSidebar() {
    if (window.leShell && window.leShell.reloadGoals) window.leShell.reloadGoals();
  }
  function replaceGoal(goal) {
    state.goals = state.goals.map(function (g) { return g.id === goal.id ? goal : g; });
    if (!state.goals.some(function (g) { return g.id === goal.id; })) state.goals.unshift(goal);
    state.current = goal;
  }
  // A workflow or group under the current goal.
  function findJob(id) {
    return state.current ? (state.current.jobs || []).filter(function (j) { return j.id === id; })[0] : undefined;
  }

  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var ICON_GOAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>';
  var ICON_FLOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M7 11v3a3 3 0 0 0 3 3h3"/></svg>';
  var ICON_GROUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>';
  var ICON_DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
  var mascotTpl = document.getElementById('glMascot');
  var mascot = mascotTpl ? mascotTpl.innerHTML : '';
  // An agent by the name it was given, when the sidebar knows it.
  function agentLabel(name) {
    return window.leShell && window.leShell.displayNameOf ? window.leShell.displayNameOf(name) : name;
  }
  function wfHref(agent, id) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id);
  }
  // Empty cells to fill a grid's last row.
  function fillers(count, cols) {
    var n = count % cols ? cols - (count % cols) : 0;
    return new Array(n + 1).join('<div class="gl-filler" aria-hidden="true"></div>');
  }

  function listHtml() {
    var q = ((document.getElementById('glSearch') || {}).value || '').trim().toLowerCase();
    var count = function (g, s) { return (g.jobs || []).filter(function (w) { return w.state === s; }).length; };
    var running = state.goals.reduce(function (n, g) { return n + count(g, 'active'); }, 0);
    var shown = state.goals.filter(function (g) { return !q || g.goal.toLowerCase().indexOf(q) !== -1; });
    var cards = shown.map(function (g) {
      var chips = [];
      if (g.status === 'planning') chips.push('<span class="gl-chip warn">Suggesting' + ELLIPSIS + '</span>');
      if (g.status === 'failed') chips.push('<span class="gl-chip bad">Planning failed</span>');
      var suggested = count(g, 'suggested'), active = count(g, 'active');
      if (active) chips.push('<span class="gl-chip good">' + active + ' built</span>');
      if (suggested) chips.push('<span class="gl-chip strong">' + suggested + ' to review</span>');
      if (!active && !suggested && g.status === 'ready') chips.push('<span class="gl-chip">Nothing kept yet</span>');
      var focus = g.focus || (g.brief && g.brief.focus) || '';
      if (focus && focus !== 'other') chips.push('<span class="gl-chip">' + esc(focusLabel(focus)) + '</span>');
      var date = g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return '<a class="gl-cell" href="/goals?goal=' + encodeURIComponent(g.id) + '">' +
        '<div class="gl-card-head"><span class="gl-icon' + (active ? ' good' : '') + '">' + ICON_GOAL + '</span>' +
          '<span class="gl-card-text"><span class="gl-card-title">' + esc(g.goal) + '</span>' + (g.message ? '<span class="gl-card-desc">' + esc(g.message) + '</span>' : '') + '</span><span></span></div>' +
        '<div class="gl-chips">' + chips.join('') + (date ? '<span class="gl-next">Set ' + esc(date) + '</span>' : '') + '</div></a>';
    });
    var newTile = '<a class="gl-tile" href="/goals?new=1" data-new-goal><b>+ New goal</b><span>Say what your agents should take care of, and get workflows suggested for it.</span></a>';
    return '<div class="gl-hero"><div class="gl-hero-text"><h2 class="le-display">Your goals</h2><p class="le-display-sub">' +
        state.goals.length + (state.goals.length === 1 ? ' goal' : ' goals') + (running ? ', ' + running + (running === 1 ? ' workflow' : ' workflows') + ' built for them' : '') + '. Open one to see its workflows and suggestions.</p></div>' + mascot + '</div>' +
      '<div class="le-grid gl-cols2">' + (cards.length ? cards.join('') + (q ? fillers(cards.length, 2) : newTile + fillers(cards.length + 1, 2)) : '<p class="gl-empty gl-wide">No goal matches.</p>') + '</div>';
  }

  // The goal box and its examples; and what LoopEngine knows about you.
  function goalFieldHtml() {
    return '<label for="glGoal" class="gl-field-k">Your goal</label>' +
      '<textarea id="glGoal" placeholder="e.g. Help me research AI industry trends and publish a weekly report">' + esc(startText) + '</textarea>' +
      '<div class="gl-examples"><span class="hint">Or try:</span>' + GOAL_EXAMPLES.map(function (x) { return '<button type="button" class="gl-example" data-example="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>';
  }
  function aboutFieldsHtml() {
    return '<textarea id="glAbout" placeholder="What you do, for whom, and the tools you use (Gmail, Shopify, Slack' + ELLIPSIS + ')">' + esc(state.about) + '</textarea>' +
      '<div class="gl-row"><label class="hint" for="glKind">Kind of business</label><select id="glKind" class="gl-select">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + ((state.settings.businessKind || '') === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>' +
      (state.settings.cloud ? '<label class="hint gl-share"><input type="checkbox" id="glShare"' + (state.settings.shareLeverStats ? ' checked' : '') + '> Share anonymous stats about which suggestions you save, build and keep, to improve suggestions for everyone. Never your goals, requests or data.</label>' : '');
  }
  function aboutLabel() {
    return 'About you or your business ' + (state.about ? '(saved, used for every goal)' : '(optional, makes suggestions fit you)');
  }

  // The first goal, or one handed over from Home: the whole page.
  function newGoalHtml() {
    return '<div class="gl-hero"><div class="gl-hero-text"><h2 class="le-display">What should your agents <span class="soft">take care of?</span></h2><p class="le-display-sub">Big or small: work to hand off, or a result to reach. LoopEngine suggests the workflows it needs.</p></div>' + mascot + '</div>' +
      '<div class="le-grid gl-cols1"><div class="gl-form">' + goalFieldHtml() +
      '<details' + (state.about ? '' : ' open') + '><summary class="hint">' + aboutLabel() + '</summary><div class="gl-about">' + aboutFieldsHtml() + '</div></details>' +
      '<div class="gl-row"><button type="button" class="le-btn-dark" id="glSubmit">Suggest workflows</button><span class="hint" id="glSubmitStatus"></span></div>' +
    '</div></div>';
  }

  // Another goal, in a dialog like Create schedule, over the list or a goal.
  function openNewGoal() {
    var old = document.getElementById('glDialog');
    if (old) old.remove();
    var dlg = document.createElement('dialog');
    dlg.className = 'gl-dialog';
    dlg.id = 'glDialog';
    dlg.setAttribute('aria-labelledby', 'glDlgTitle');
    dlg.innerHTML = '<form method="dialog">' +
      '<div class="gl-dlg-head"><h2 id="glDlgTitle">New goal</h2><button type="button" data-dlg-cancel>Cancel</button><button type="submit" class="primary" id="glSubmit">Suggest workflows</button></div>' +
      '<div class="gl-dlg-body">' +
        '<div class="gl-dlg-col"><div class="gl-field">' + goalFieldHtml() + '<p class="hint" style="margin:0">Big or small: work to hand off, or a result to reach. LoopEngine reads your workspace and suggests the workflows it needs, in about a minute.</p></div></div>' +
        '<div class="gl-dlg-col"><div class="gl-field"><span class="gl-field-k">' + aboutLabel() + '</span>' + aboutFieldsHtml() + '</div></div>' +
      '</div>' +
      '<div class="gl-dlg-foot"><span id="glSubmitStatus"></span></div>' +
    '</form>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
    dlg.querySelector('[data-dlg-cancel]').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); });
    wireNewGoal(dlg, function () { dlg.close(); });
    dlg.showModal();
    dlg.querySelector('#glGoal').focus();
  }

  // The new-goal fields, in the page or the dialog: examples fill the box;
  // Suggest workflows starts the goal and opens it.
  function wireNewGoal(root, done) {
    root.querySelectorAll('[data-example]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = root.querySelector('#glGoal');
        box.value = b.dataset.example;
        box.focus();
      });
    });
    var submit = root.querySelector('#glSubmit');
    if (submit) submit.addEventListener('click', function () {
      var goal = root.querySelector('#glGoal').value.trim();
      startText = '';
      var aboutBox = root.querySelector('#glAbout');
      var status = root.querySelector('#glSubmitStatus');
      if (goal.length < 5) { status.textContent = 'Say what your agents should take care of first.'; return; }
      submit.disabled = true;
      status.textContent = 'Starting' + ELLIPSIS;
      api('POST', '/goals', { goal: goal, about: aboutBox ? aboutBox.value : state.about }).then(function (r) {
        if (!r.ok) { submit.disabled = false; status.innerHTML = '<span class="error">' + esc(r.body.error || 'Could not start.') + '</span>'; return; }
        state.about = aboutBox ? aboutBox.value.trim() : state.about;
        state.startedAt = Date.now();
        state.creating = false;
        replaceGoal(r.body.goal);
        setUrl(r.body.goal.id);
        reloadSidebar();
        if (done) done();
        render();
      });
    });
    if (submit && autoStart && !done) { autoStart = false; submit.click(); }
    var kind = root.querySelector('#glKind');
    if (kind) kind.addEventListener('change', function () { saveSettings({ businessKind: kind.value || null }); });
    var share = root.querySelector('#glShare');
    if (share) share.addEventListener('change', function () { saveSettings({ shareLeverStats: share.checked }); });
  }

  // What a suggestion needs: apps connected or to connect, as chips.
  function needChips(list) {
    return (list || []).map(function (n) {
      return '<span class="gl-chip ' + (n.connected ? 'good' : 'warn') + '">' + esc(n.name) + (n.connected ? ' ' + String.fromCharCode(10003) : DOT + 'connect') + '</span>';
    }).join('');
  }
  function agentChip(a) {
    return '<span class="gl-chip"><span class="gl-chip-k">Runs on</span> ' + esc(a.isNew ? a.name : agentLabel(a.name)) + (a.isNew ? ' <span class="gl-new">New agent</span>' : '') + '</span>';
  }
  function factChips(w, withAgent) {
    return (w.measure ? '<span class="gl-chip strong"><span class="gl-chip-k">Measured by</span> ' + esc(w.measure) + '</span>' : '') +
      (w.humanMinutesPerWeek ? '<span class="gl-chip"><span class="gl-chip-k">Your time</span> ~' + esc(w.humanMinutesPerWeek) + ' min a week</span>' : '') +
      (withAgent && w.agent ? agentChip(w.agent) : '');
  }
  function btn(act, label, cls, step) {
    return '<button type="button" class="gl-btn ' + (cls || '') + '" data-act="' + act + '"' + (step ? ' data-step="' + esc(step) + '"' : '') + '>' + label + '</button>';
  }
  // kind: what the card is, above its title; empty for none.
  function cardHead(w, icon, iconCls, side, kindText) {
    var group = w.group && w.group.steps && w.group.steps.length ? w.group : null;
    var kind = kindText != null ? kindText : group ? 'Group of ' + group.steps.length + ' workflows that run in order' : 'Workflow';
    return '<div class="gl-card-head"><span class="gl-icon' + (iconCls ? ' ' + iconCls : '') + '">' + icon + '</span>' +
      '<span class="gl-card-text">' + (kind ? '<span class="gl-card-kind">' + kind + '</span>' : '') + '<span class="gl-card-title gl-wf-title">' + esc(w.title) + '</span>' +
        (w.why ? '<span class="gl-card-desc">' + esc(w.why) + '</span>' : '') + '</span>' +
      '<span class="gl-card-side">' + side + '</span></div>';
  }

  // A group's workflows, in the order they run: a built one with how it's
  // doing (filled by fillEvidence) and Open; one to build with its agent,
  // what it needs, what it will do and Build.
  function stepsHtml(w, steps) {
    var next = steps.filter(function (st) { return !st.built; })[0];
    return '<div class="gl-flows">' + steps.map(function (st, i) {
      var row = st.built
        ? '<div class="gl-flow built" data-how="' + esc(st.built.agent) + '|' + esc(st.built.workflowId) + '"><span class="gl-flow-n">' + (i + 1) + '</span>' +
            '<div class="gl-flow-main"><a class="gl-flow-title" data-how-title href="' + wfHref(st.built.agent, st.built.workflowId) + '">' + esc(st.name) + '</a>' +
            '<span class="gl-flow-meta">' + esc(agentLabel(st.built.agent)) + DOT + '<span data-how-meta>' + ELLIPSIS + '</span></span></div>' +
            '<div class="gl-flow-actions"><a class="gl-btn plain small gl-link-btn" href="' + wfHref(st.built.agent, st.built.workflowId) + '">Open</a></div></div>'
        : '<div class="gl-flow"><span class="gl-flow-n">' + (i + 1) + '</span>' +
            '<div class="gl-flow-main"><span class="gl-flow-title">' + esc(st.name) + '</span>' +
            '<span class="gl-flow-meta">' + esc(st.request) + '</span>' +
            '<div class="gl-chips">' + agentChip(st.agent) + needChips(st.needs) + '</div></div>' +
            '<div class="gl-flow-actions">' + (w.state !== 'discarded' ? btn('buildstep', 'Build', st === next ? 'small' : 'plain small', st.id) : '') + '</div></div>';
      return row + (i < steps.length - 1 ? '<div class="gl-flow-then">then ' + ARROW + ' starts when step ' + (i + 1) + ' finishes, with its result</div>' : '');
    }).join('') + '</div>';
  }

  // A built workflow's workflows in the order they run: one that another
  // starts follows it, with "then".
  function orderedFlows(w) {
    var flows = (w.doers || []).filter(function (d) { return d.type === 'workflow'; });
    var after = {};
    (w.chain || []).forEach(function (st) { after[st.run.agent + '|' + st.run.workflowId] = st.after.agent + '|' + st.after.workflowId; });
    var keyOf = function (d) { return d.agent + '|' + d.workflowId; };
    var ordered = flows.filter(function (d) { return !after[keyOf(d)]; });
    for (var i = 0; i < ordered.length; i++) {
      flows.forEach(function (d) { if (after[keyOf(d)] === keyOf(ordered[i]) && ordered.indexOf(d) < 0) ordered.splice(i + 1, 0, d); });
    }
    flows.forEach(function (d) { if (ordered.indexOf(d) < 0) ordered.push(d); });
    return ordered;
  }

  function flowsHtml(w) {
    var flows = orderedFlows(w);
    var stepFor = function (d) { return (w.chain || []).filter(function (st) { return st.run.agent === d.agent && st.run.workflowId === d.workflowId; })[0]; };
    var whenText = function (wh) { return wh.kind === 'always' ? 'when it finishes' : wh.kind === 'contains' ? 'when its result contains ' + String.fromCharCode(8220) + esc(wh.text) + String.fromCharCode(8221) : 'when its result has a line starting ' + String.fromCharCode(8220) + esc(wh.text) + String.fromCharCode(8221); };
    return '<div class="gl-flows">' + flows.map(function (d, i) {
      var st = stepFor(d);
      var then = st ? '<div class="gl-flow-then">then ' + ARROW + ' ' + whenText(st.when) + '<button type="button" class="gl-link" data-chain-remove="' + esc(st.id) + '">Remove this step</button></div>' : '';
      // One workflow: what the suggestion runs as, with the workflow icon;
      // several: numbered steps in the order they run.
      var single = flows.length === 1;
      return then + '<div class="gl-flow built' + (single ? ' single' : '') + '" data-how="' + esc(d.agent) + '|' + esc(d.workflowId) + '"><span class="gl-flow-n">' + (single ? ICON_FLOW : i + 1) + '</span>' +
        '<div class="gl-flow-main">' + (single ? '<span class="gl-flow-k">Runs as</span>' : '') + '<a class="gl-flow-title" data-how-title href="' + wfHref(d.agent, d.workflowId) + '">' + esc(d.title || d.workflowId) + '</a>' +
        '<span class="gl-flow-meta">' + esc(agentLabel(d.agent)) + DOT + '<span data-how-meta>' + ELLIPSIS + '</span></span></div>' +
        '<div class="gl-flow-actions">' + (flows.length > 1 ? '<button type="button" class="gl-link gl-unlink" data-unlink="' + esc(d.agent) + '|' + esc(d.workflowId) + '">Remove</button>' : '') +
          '<a class="gl-btn plain small gl-link-btn" href="' + wfHref(d.agent, d.workflowId) + '">Open</a></div></div>';
    }).join('') + '</div>';
  }

  // Add another workflow to a built one, or a step that runs one after another.
  function manageHtml(w) {
    var flows = (w.doers || []).filter(function (d) { return d.type === 'workflow'; });
    var opt = function (d, sel) { return '<option value="' + esc(d.agent) + '|' + esc(d.workflowId) + '"' + (sel ? ' selected' : '') + '>' + esc(d.title || d.workflowId) + '</option>'; };
    return '<div class="gl-card-foot"><button type="button" class="gl-link" data-act="addwf">+ Add another workflow</button>' + (flows.length > 1 ? '<button type="button" class="gl-link" data-act="addstep">+ Run one after another</button>' : '') + '</div>' +
    '<div class="gl-panel" data-panel="addwf" hidden><label class="hint" for="addwf-' + esc(w.id) + '">A workflow already on one of your agents</label>' +
      '<div class="gl-row"><select class="gl-select" id="addwf-' + esc(w.id) + '" data-pick-workflow><option value="">Loading' + ELLIPSIS + '</option></select><button type="button" class="gl-btn soft small" data-act="link">Add it</button></div>' +
      '<div class="gl-row"><span class="hint">or</span><button type="button" class="gl-link" data-act="another">build a new one for it</button></div></div>' +
    '<div class="gl-panel" data-panel="addstep" hidden>' +
      '<div class="gl-row"><span class="hint">After</span><select class="gl-select" data-step-after>' + flows.map(function (d) { return opt(d, false); }).join('') + '</select>' +
        '<span class="hint">finishes</span><select class="gl-select" data-step-when><option value="always">every time</option><option value="contains">when its result contains</option><option value="line_starts">when its result has a line starting</option></select><input class="gl-input" data-step-text placeholder="e.g. Lead:" hidden></div>' +
      '<div class="gl-row"><span class="hint">run</span><select class="gl-select" data-step-run>' + flows.map(function (d, i) { return opt(d, i === 1); }).join('') + '</select></div>' +
      '<div class="gl-step-inputs" data-step-inputs></div>' +
      '<div class="gl-row"><button type="button" class="gl-btn soft small" data-act="savestep">Save the step</button></div></div>';
  }

  // A workflow (or group) built for the goal: what it's for, then each of
  // its workflows once, with how it's going.
  function builtHtml(w) {
    var group = w.group && w.group.steps && w.group.steps.length ? w.group : null;
    var steps = group ? group.steps : [];
    var builtSteps = steps.filter(function (st) { return st.built; }).length;
    var pill = group && builtSteps < steps.length ? '<span class="gl-chip accent">' + builtSteps + ' of ' + steps.length + ' built</span>' : '<span class="gl-chip" data-card-pill hidden></span>';
    return '<div class="gl-cell" data-wf="' + esc(w.id) + '">' +
      // A part of the goal, with the goal's icon; the workflows doing it,
      // inside, have the workflow icon.
      cardHead(w, group ? ICON_GROUP : ICON_GOAL, 'good', '<span class="gl-chip warn" data-attn hidden>Needs you</span>' + pill, group ? null : '') +
      '<div class="gl-chips">' + factChips(w, false) + '</div>' +
      (group ? stepsHtml(w, steps) : flowsHtml(w) + manageHtml(w)) +
      '<span class="hint gl-job-status-line" data-wf-status></span>' +
    '</div>';
  }

  // A suggestion: what it is and why, what it's worth, where it runs and
  // what it needs; Build, or Discard from its menu.
  function suggestionHtml(w) {
    var group = w.group && w.group.steps && w.group.steps.length ? w.group : null;
    var steps = group ? group.steps : [];
    var discarded = w.state === 'discarded';
    var side = discarded ? btn('restore', 'Restore', 'plain small')
      : '<details class="gl-menu"><summary aria-label="More">' + ICON_DOTS + '</summary><div class="gl-menu-list"><button type="button" data-act="discard">Discard</button></div></details>';
    return '<div class="gl-cell' + (group ? ' gl-wide' : '') + (discarded ? ' discarded' : '') + '" data-wf="' + esc(w.id) + '">' +
      cardHead(w, group ? ICON_GROUP : ICON_FLOW, '', side) +
      (w.added ? '<p class="hint" style="margin:0">You added this: ' + String.fromCharCode(8220) + esc(w.added.idea) + String.fromCharCode(8221) + (w.added.note ? DOT + esc(w.added.note) : '') + '</p>' : '') +
      '<div class="gl-chips">' + factChips(w, !group) + (group ? '' : needChips(w.needs)) + '</div>' +
      (group ? stepsHtml(w, steps)
        : (w.request ? '<details class="gl-what"><summary>What it will do</summary><p>' + esc(w.request) + '</p></details>' : '') +
          (discarded ? '' : '<div class="gl-card-foot">' + btn('build', 'Build it', 'small') + '</div>')) +
      '<span class="hint gl-job-status-line" data-wf-status></span>' +
    '</div>';
  }

  // A workflow of the person's own: typed in their words, shaped and judged by
  // the planner (added, changed, warned or refused), with what it said.
  function addJobHtml(planning) {
    var n = state.addNotice;
    var notice = !n ? '' : '<div class="gl-notice gl-wide ' + (n.verdict === 'refused' ? 'bad' : n.verdict === 'added' ? 'good' : 'warn') + '">' +
      '<strong>' + (n.verdict === 'refused' ? 'Not added' : n.verdict === 'changed' ? 'Added, with changes' : n.verdict === 'warned' ? 'Added, with a caution' : 'Added') + '</strong>' +
      (n.note ? '<span>' + esc(n.note) + '</span>' : '') +
      (n.alternative ? '<span class="hint">Instead, you could: ' + esc(n.alternative) + '</span>' : '') + '</div>';
    return '<div class="gl-add-form gl-wide"' + (state.addOpen ? '' : ' hidden') + '>' +
        '<label for="glAddIdea"><strong>A workflow you have in mind</strong> <span class="hint">in your own words; LoopEngine shapes it into a workflow (or a group, when it has stages) and says if anything looks off</span></label>' +
        '<textarea id="glAddIdea" rows="2" placeholder="e.g. Thank every new customer by email within a day">' + esc(state.addDraft || '') + '</textarea>' +
        '<label class="hint gl-share"><input type="checkbox" id="glAddShare"' + (state.addShare ? ' checked' : '') + '> Share the approach behind it to improve suggestions for everyone</label>' +
        '<p class="hint" style="margin:0">Your idea stays in your workspace unless you tick that. If you do, only a generic description of the approach is shared, never your words, and only once many workspaces use something similar.</p>' +
        '<div class="gl-row"><button type="button" class="gl-btn small" id="glAddJob"' + (planning ? ' disabled' : '') + '>Add it</button><button type="button" class="gl-btn plain small" id="glAddCancel">Cancel</button><span class="hint" id="glAddStatus"></span></div>' +
      '</div>' + notice;
  }

  function startsText(w) {
    var schedules = (w.schedules || []).filter(function (x) { return x.status !== 'cancelled'; });
    if (schedules.length) return schedules[0].describe.charAt(0).toUpperCase() + schedules[0].describe.slice(1);
    if (w.webhooks || w.webhooksWaiting) return w.webhooksWaiting && !w.webhooks ? 'Webhook, needs its signing secret' : 'On a webhook';
    return 'Runs when started';
  }
  // live: a schedule or webhook starts it; paused: its schedules are all
  // paused; manual: it runs when someone starts it.
  function flowState(w) {
    var schedules = (w.schedules || []).filter(function (x) { return x.status !== 'cancelled'; });
    if (w.webhooks || schedules.some(function (x) { return x.status !== 'paused'; })) return 'live';
    return schedules.length ? 'paused' : 'manual';
  }
  // A built card's chip, from its workflows: Running when any is started
  // by a schedule or webhook, Paused when all are paused, else Ready to run.
  function refreshPill(card) {
    var pill = card && card.querySelector('[data-card-pill]');
    if (!pill) return;
    var states = Array.prototype.map.call(card.querySelectorAll('[data-flow-state]'), function (el) { return el.getAttribute('data-flow-state'); });
    if (!states.length) return;
    var s = states.indexOf('live') >= 0 ? ['good', 'Running'] : states.every(function (x) { return x === 'paused'; }) ? ['', 'Paused'] : ['accent', 'Ready to run'];
    pill.className = 'gl-chip ' + s[0];
    pill.textContent = s[1];
    pill.hidden = false;
  }

  // Fills each workflow row from its agent's workflow list, and marks the
  // card when one is waiting for a decision.
  function fillEvidence() {
    var rows = page.querySelectorAll('[data-how]');
    var agents = {};
    for (var i = 0; i < rows.length; i++) agents[rows[i].getAttribute('data-how').split('|')[0]] = true;
    var waitingTotal = 0;
    Object.keys(agents).forEach(function (agent) {
      api('GET', '/agents/' + encodeURIComponent(agent) + '/workflows').then(function (r) {
        if (!r.ok) return;
        var byId = {};
        (r.body.workflows || []).forEach(function (w) { byId[w.id] = w; });
        state.flows[agent] = r.body.workflows || [];
        var mine = page.querySelectorAll('[data-how]');
        for (var j = 0; j < mine.length; j++) {
          var parts = mine[j].getAttribute('data-how').split('|');
          if (parts[0] !== agent) continue;
          var meta = mine[j].querySelector('[data-how-meta]');
          var w = byId[parts[1]];
          var card = mine[j].closest('[data-wf]');
          if (!w) { meta.textContent = 'This workflow is gone from its agent'; continue; }
          var title = mine[j].querySelector('[data-how-title]');
          if (title && w.title) title.textContent = w.title;
          var sc = w.scores || { runs: 0, failed: 0 };
          var waiting = (w.recentRuns || []).filter(function (x) { return x.status === 'awaiting_approval'; }).length + (w.schedules || []).filter(function (x) { return x.waiting; }).length;
          var st = flowState(w);
          mine[j].setAttribute('data-flow-state', st);
          var bits = [startsText(w), sc.runs ? sc.runs + ' run' + (sc.runs === 1 ? '' : 's') + (sc.failed ? ', ' + sc.failed + ' failed' : '') : 'No runs yet'];
          var round = w.evals && w.evals.rounds && w.evals.rounds[0];
          if (round && round.passRates) bits.push('evals: ' + round.allPassed + ' of ' + round.cases.length + ' passed');
          // Paused on the row only among several: with one, the card says it.
          var several = card && card.querySelectorAll('[data-how]').length > 1;
          meta.innerHTML = (st === 'paused' && several ? '<span class="gl-paused">Paused</span> ' : '') + esc(bits.join(DOT)) + (waiting ? ' <span class="gl-waiting">' + waiting + ' waiting for you</span>' : '');
          if (waiting) {
            waitingTotal += waiting;
            var attn = card && card.querySelector('[data-attn]');
            if (attn) attn.hidden = false;
            var stat = document.getElementById('glWaiting');
            if (stat) { stat.textContent = String(waitingTotal); stat.closest('.gl-stat').classList.add('attn'); }
          }
          refreshPill(card);
        }
      });
    });
  }

  function goalHtml(g) {
    var jobs = g.jobs || [];
    var by = function (s) { return jobs.filter(function (w) { return w.state === s; }); };
    var suggested = by('suggested');
    var kept = by('active');
    var discarded = by('discarded');
    var planning = g.status === 'planning';
    var focus = g.focus || (g.brief && g.brief.focus) || '';
    var secs = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
    var focusChip = focus ? '<label class="gl-chip strong"><span class="gl-chip-k">Focus</span><select id="glFocus" class="gl-select"' + (planning ? ' disabled' : '') + '>' + (FOCUS.some(function (f) { return f[0] === focus; }) ? FOCUS : FOCUS.concat([[focus, (g.brief && g.brief.newFocus && g.brief.newFocus.label) || focus]])).map(function (f) { return '<option value="' + esc(f[0]) + '"' + (f[0] === focus ? ' selected' : '') + '>' + esc(f[1]) + '</option>'; }).join('') + '</select></label>' : '';
    var stat = function (n, label, id) { return '<div class="gl-stat"><b' + (id ? ' id="' + id + '"' : '') + '>' + n + '</b><span>' + label + '</span></div>'; };
    var setup = g.setup || [];
    var date = g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    var section = function (title, hint) { return '<h3 class="gl-section-title">' + title + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</h3>'; };
    return '<div class="gl-hero"><div class="gl-hero-text"><span class="gl-eyebrow">Goal' + (date ? DOT + 'set ' + esc(date) : '') + '</span>' +
        '<h2 class="gl-display">' + esc(g.goal) + '</h2>' +
        (g.message ? '<p class="gl-hero-sub">' + esc(g.message) + '</p>' : '') +
        '<div class="gl-chips">' + focusChip + (g.brief && g.brief.measure ? '<span class="gl-chip"><span class="gl-chip-k">Measured by</span> ' + esc(g.brief.measure) + '</span>' : '') +
          (focus.indexOf('x-') === 0 ? '<span class="gl-chip" title="No focus in the playbook fit this goal, so its planner named one and wrote the approaches it needed. They stay in this workspace for next time.">Written for your goals</span>' : '') + '</div>' +
        (planning ? '<p class="gl-status"><span class="gl-spinner" aria-hidden="true"></span>Suggesting workflows' + ELLIPSIS + (secs ? ' ' + secs + 's.' : '') + ' It reads your workspace first; this takes about a minute.</p>' : '') +
        (g.status === 'failed' ? '<p class="error">' + esc(g.error || 'Planning failed.') + '</p>' : '') +
      '</div>' + mascot + '</div>' +
    '<div class="le-grid gl-cols3">' + stat(kept.length, kept.length === 1 ? 'workflow built' : 'workflows built') + stat(suggested.length, suggested.length === 1 ? 'suggestion to review' : 'suggestions to review') + stat(0, 'runs waiting for you', 'glWaiting') + '</div>' +
    (setup.length ? section('Before you start', 'Do these first, so its workflows can run') +
      '<div class="le-grid gl-cols2">' + setup.map(function (s, i) { return '<div class="gl-setup-step"><span class="gl-setup-n">' + (i + 1) + '</span><span>' + esc(s) + '</span></div>'; }).join('') + fillers(setup.length, 2) + '</div>' : '') +
    (kept.length ? section('Your workflows', 'Built for this goal') + '<div class="le-grid gl-cols1">' + kept.map(builtHtml).join('') + '</div>' : '') +
    section('Suggested', 'Workflows that would move this goal: build the ones you want') +
    (state.justDiscarded ? '<div class="gl-discarded-note" data-discarded="' + esc(state.justDiscarded.id) + '"><span>Discarded <strong>' + esc(state.justDiscarded.title) + '</strong>. Why?</span>' +
      REASONS.map(function (r) { return '<button type="button" class="gl-btn plain small" data-reason="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '<button type="button" class="gl-link" data-undo="1">Undo</button></div>' : '') +
    '<div class="le-grid gl-cols2">' +
      (suggested.length ? suggested.map(suggestionHtml).join('') + fillers(suggested.filter(function (w) { return !(w.group && w.group.steps && w.group.steps.length); }).length, 2)
        : '<p class="gl-empty gl-wide">' + (planning ? 'On their way' + ELLIPSIS : 'No suggestions waiting. Ask for more below.') + '</p>') +
    '</div>' +
    '<div class="le-grid gl-cols3" style="border-top:0">' +
      '<button type="button" class="gl-tile" id="glMore"' + (planning ? ' disabled' : '') + '><b>Suggest more</b><span>New ideas only: nothing already here, built or discarded comes back.</span></button>' +
      '<button type="button" class="gl-tile" id="glAddToggle"><b>Add your own</b><span>Describe a workflow in your words, and LoopEngine shapes it for this goal.</span></button>' +
      (discarded.length ? '<button type="button" class="gl-tile" id="glShowDiscarded"><b>' + (state.showDiscarded ? 'Hide' : 'Show') + ' discarded</b><span>' + discarded.length + (discarded.length === 1 ? ' suggestion' : ' suggestions') + ' you set aside. Restore any of them.</span></button>' : '<div class="gl-filler" aria-hidden="true"></div>') +
      addJobHtml(planning) +
    '</div>' +
    (discarded.length && state.showDiscarded ? section('Discarded') + '<div class="le-grid gl-cols2">' + discarded.map(suggestionHtml).join('') + fillers(discarded.filter(function (w) { return !(w.group && w.group.steps && w.group.steps.length); }).length, 2) + '</div>' : '') +
    '<div class="gl-foot"><button type="button" class="gl-link gl-danger" id="glDelete">Delete this goal</button><span class="hint">The workflows built for it stay on their agents.</span></div>';
  }

  function render() {
    var title = document.getElementById('glTitle');
    var newBtn = document.getElementById('glNewBtn');
    var search = document.getElementById('glSearchWrap');
    // The list, unless there are no goals yet: then the new-goal form.
    var listing = !state.current && !state.creating && state.goals.length > 0;
    if (title) title.innerHTML = state.current ? '<a href="/goals">Goals</a><span aria-hidden="true" style="color:var(--ink-faint);font-weight:400">/</span><span>' + esc(state.current.goal) + '</span>' : listing ? 'Goals' : 'New goal';
    if (newBtn) newBtn.hidden = !listing && !state.current;
    if (search) search.hidden = !listing;
    page.innerHTML = (state.current ? goalHtml(state.current) : listing ? listHtml() : newGoalHtml()) + (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '');
    state.error = '';
    wire();
    watch();
    if (state.current) fillEvidence();
  }

  function wire() {
    wireNewGoal(page, null);
    var tile = page.querySelector('[data-new-goal]');
    if (tile) tile.addEventListener('click', function (ev) { ev.preventDefault(); openNewGoal(); });
    if (!state.current) return;
    var g = state.current;
    var base = '/goals/' + encodeURIComponent(g.id);
    var more = document.getElementById('glMore');
    if (more) more.addEventListener('click', function () {
      more.disabled = true;
      api('POST', base + '/generate', {}).then(function (r) {
        if (!r.ok) { state.error = r.body.error || 'Could not generate more.'; render(); return; }
        state.startedAt = Date.now();
        replaceGoal(r.body.goal);
        render();
      });
    });
    var focus = document.getElementById('glFocus');
    if (focus) focus.addEventListener('change', function () {
      api('POST', base + '/generate', { focus: focus.value }).then(function (r) {
        if (!r.ok) { state.error = r.body.error || 'Could not plan for that.'; render(); return; }
        state.startedAt = Date.now();
        replaceGoal(r.body.goal);
        render();
      });
    });
    var addToggle = document.getElementById('glAddToggle');
    if (addToggle) addToggle.addEventListener('click', function () { state.addOpen = true; state.addNotice = null; render(); var box = document.getElementById('glAddIdea'); if (box) box.focus(); });
    var addCancel = document.getElementById('glAddCancel');
    if (addCancel) addCancel.addEventListener('click', function () { state.addOpen = false; state.addDraft = ''; render(); });
    var addIdea = document.getElementById('glAddIdea');
    if (addIdea) addIdea.addEventListener('input', function () { state.addDraft = addIdea.value; });
    var addShare = document.getElementById('glAddShare');
    if (addShare) addShare.addEventListener('change', function () { state.addShare = addShare.checked; });
    var addJob = document.getElementById('glAddJob');
    if (addJob) addJob.addEventListener('click', function () {
      var idea = document.getElementById('glAddIdea').value.trim();
      var status = document.getElementById('glAddStatus');
      if (idea.length < 5) { status.textContent = 'Say what the workflow should do first.'; return; }
      addJob.disabled = true;
      status.textContent = 'Shaping it into a workflow' + ELLIPSIS;
      var shareBox = document.getElementById('glAddShare');
      api('POST', base + '/jobs', { idea: idea, share: !!(shareBox && shareBox.checked) }).then(function (r) {
        if (!r.ok) { addJob.disabled = false; status.textContent = r.body.error || 'Could not add it.'; return; }
        state.addNotice = { verdict: r.body.verdict, note: r.body.note, alternative: r.body.alternative };
        if (r.body.verdict !== 'refused') { state.addOpen = false; state.addDraft = ''; state.addShare = false; if (r.body.jobId) state.openJobs[r.body.jobId] = true; }
        replaceGoal(r.body.goal);
        render();
      });
    });
    var shown = document.getElementById('glShowDiscarded');
    if (shown) shown.addEventListener('click', function () { state.showDiscarded = !state.showDiscarded; render(); });
    var del = document.getElementById('glDelete');
    if (del) del.addEventListener('click', function () {
      if (del.dataset.confirming !== '1') { del.dataset.confirming = '1'; del.textContent = 'Click again to delete this goal (the workflows built for it stay in their agents)'; return; }
      api('DELETE', base).then(function () { state.current = null; setUrl(''); reloadSidebar(); load(); });
    });
    var cards = page.querySelectorAll('[data-wf]');
    for (var c = 0; c < cards.length; c++) wireCard(cards[c], base);
    var note = page.querySelector('[data-discarded]');
    if (note) {
      var wid = note.getAttribute('data-discarded');
      var send = function (body) {
        state.justDiscarded = null;
        api('PATCH', base + '/jobs/' + encodeURIComponent(wid), body).then(function (r) {
          if (r.ok) replaceGoal(r.body.goal);
          render();
        });
      };
      var reasons = note.querySelectorAll('[data-reason]');
      for (var q = 0; q < reasons.length; q++) reasons[q].addEventListener('click', function (ev) { send({ action: 'reason', reason: ev.currentTarget.getAttribute('data-reason') }); });
      note.querySelector('[data-undo]').addEventListener('click', function () { send({ action: 'restore' }); });
    }
  }

  function saveSettings(body) {
    api('PUT', '/goals/about', body).then(function (r) {
      if (r.ok && r.body.settings) { state.settings.businessKind = r.body.settings.businessKind; state.settings.shareLeverStats = r.body.settings.shareLeverStats; }
    });
  }

  // Every workflow on every agent, for adding one to a job.
  function loadWorkflowChoices(card) {
    var select = card.querySelector('[data-pick-workflow]');
    api('GET', '/agents').then(function (r) {
      var names = r.ok ? (r.body.agents || []).map(function (a) { return a.name; }) : [];
      return Promise.all(names.map(function (n) { return api('GET', '/agents/' + encodeURIComponent(n) + '/workflows').then(function (x) { if (x.ok) state.flows[n] = x.body.workflows || []; return { agent: n, flows: x.ok ? x.body.workflows || [] : [] }; }); }));
    }).then(function (all) {
      var have = {};
      var rows = card.querySelectorAll('[data-how]');
      for (var i = 0; i < rows.length; i++) have[rows[i].getAttribute('data-how')] = true;
      var options = [];
      all.forEach(function (a) { a.flows.forEach(function (w) { if (!have[a.agent + '|' + w.id]) options.push('<option value="' + esc(a.agent) + '|' + esc(w.id) + '">' + esc(w.title) + ' (' + esc(a.agent) + ')</option>'); }); });
      select.innerHTML = options.length ? '<option value="">Choose a workflow</option>' + options.join('') : '<option value="">No other workflows yet: build a new one</option>';
    });
  }

  // The next run's inputs: each from the result, one field of it (when the
  // first run's workflow has an output schema), or one of the first run's
  // inputs (shown when the step's "run" changes).
  function stepInputs(card) {
    var box = card.querySelector('[data-step-inputs]');
    var flow = function (v) { var p = v.split('|'); return (state.flows[p[0]] || []).filter(function (w) { return w.id === p[1]; })[0]; };
    var target = flow(card.querySelector('[data-step-run]').value);
    var source = flow(card.querySelector('[data-step-after]').value);
    var text = card.querySelector('[data-step-text]');
    text.hidden = card.querySelector('[data-step-when]').value === 'always';
    if (!target) { box.innerHTML = '<p class="hint" style="margin:0">Loading its inputs' + ELLIPSIS + '</p>'; return; }
    var params = Object.keys(target.parameters || {});
    if (!params.length) { box.innerHTML = '<p class="hint" style="margin:0">' + esc(target.title) + ' takes no inputs.</p>'; return; }
    // With an output schema, each of its result's top-level fields too.
    var schema = source && source.outputSchema;
    var fields = schema && schema.type === 'object' && schema.properties ? Object.keys(schema.properties) : [];
    var choices = function (p) {
      var srcParams = source ? Object.keys(source.parameters || {}) : [];
      var same = fields.indexOf(p) !== -1;
      return '<option value=""' + (target.parameters[p].required ? ' disabled' : '') + '>(leave empty)</option><option value="result"' + (target.parameters[p].required && !same ? ' selected' : '') + '>the result of the run before</option>' +
        fields.map(function (f) { return '<option value="result.' + esc(f) + '"' + (f === p ? ' selected' : '') + '>its result' + String.fromCharCode(8217) + 's ' + esc(f) + '</option>'; }).join('') +
        srcParams.map(function (sp) { return '<option value="input:' + esc(sp) + '"' + (sp === p && !target.parameters[p].required ? ' selected' : '') + '>its input ' + esc(sp) + '</option>'; }).join('');
    };
    box.innerHTML = params.map(function (p) { return '<div class="gl-row"><span class="hint"><code>' + esc(p) + '</code>' + (target.parameters[p].required ? '' : ' (optional)') + ' from</span><select class="gl-select" data-input="' + esc(p) + '">' + choices(p) + '</select></div>'; }).join('');
  }

  function wireCard(card, base) {
    var id = card.getAttribute('data-wf');
    var status = card.querySelector('[data-wf-status]');
    // A suggestion's chain: change the step being written, remove a step or a workflow.
    ['[data-step-run]', '[data-step-after]', '[data-step-when]'].forEach(function (sel) {
      var el = card.querySelector(sel);
      if (el) el.addEventListener('change', function () { stepInputs(card); });
    });
    var patch = function (body, btn) {
      btn.disabled = true;
      api('PATCH', base + '/jobs/' + encodeURIComponent(id), body).then(function (r) {
        if (!r.ok) { status.textContent = r.body.error || 'Could not do that.'; btn.disabled = false; return; }
        replaceGoal(r.body.goal);
        render();
      });
    };
    var removes = card.querySelectorAll('[data-chain-remove]');
    for (var cr = 0; cr < removes.length; cr++) removes[cr].addEventListener('click', function (ev) {
      var stepId = ev.currentTarget.getAttribute('data-chain-remove');
      var job = findJob(id);
      patch({ action: 'chain', chain: (job.chain || []).filter(function (st) { return st.id !== stepId; }) }, ev.currentTarget);
    });
    var unlinks = card.querySelectorAll('[data-unlink]');
    for (var ul = 0; ul < unlinks.length; ul++) unlinks[ul].addEventListener('click', function (ev) {
      var b = ev.currentTarget;
      if (b.dataset.confirming !== '1') { b.dataset.confirming = '1'; b.textContent = 'Click again to remove it from this goal (it stays on its agent)'; return; }
      var parts = b.getAttribute('data-unlink').split('|');
      patch({ action: 'unlink', agent: parts[0], workflowId: parts[1] }, b);
    });
    var buttons = card.querySelectorAll('[data-act]');
    for (var b = 0; b < buttons.length; b++) buttons[b].addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var act = btn.getAttribute('data-act');
      if (act === 'addwf' || act === 'addstep') {
        var panel = card.querySelector('[data-panel="' + act + '"]');
        panel.hidden = !panel.hidden;
        if (!panel.hidden && act === 'addwf') loadWorkflowChoices(card);
        if (!panel.hidden && act === 'addstep') stepInputs(card);
        return;
      }
      if (act === 'link' || act === 'savestep') {
        var job = findJob(id);
        var body;
        if (act === 'link') {
          var pick = card.querySelector('[data-pick-workflow]').value;
          if (!pick) { status.textContent = 'Choose a workflow first.'; return; }
          body = { action: 'link', agent: pick.split('|')[0], workflowId: pick.split('|')[1] };
        } else {
          var ref = function (v) { return { agent: v.split('|')[0], workflowId: v.split('|')[1] }; };
          var kind = card.querySelector('[data-step-when]').value;
          var mapping = {};
          var picks = card.querySelectorAll('[data-input]');
          for (var m = 0; m < picks.length; m++) if (picks[m].value) mapping[picks[m].getAttribute('data-input')] = picks[m].value;
          var step = { after: ref(card.querySelector('[data-step-after]').value), when: kind === 'always' ? { kind: 'always' } : { kind: kind, text: card.querySelector('[data-step-text]').value }, run: ref(card.querySelector('[data-step-run]').value), with: mapping };
          body = { action: 'chain', chain: (job.chain || []).concat([step]) };
        }
        btn.disabled = true;
        api('PATCH', base + '/jobs/' + encodeURIComponent(id), body).then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'Could not do that.'; btn.disabled = false; return; }
          replaceGoal(r.body.goal);
          render();
        });
        return;
      }
      if (act === 'another') {
        status.textContent = 'Getting the agent ready' + ELLIPSIS;
        api('POST', base + '/jobs/' + encodeURIComponent(id) + '/build', { another: true }).then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'Could not build it.'; return; }
          location.href = r.body.url;
        });
        return;
      }
      btn.disabled = true;
      if (act === 'build' || act === 'buildstep') {
        status.textContent = 'Getting the agent ready' + ELLIPSIS;
        api('POST', base + '/jobs/' + encodeURIComponent(id) + '/build', act === 'buildstep' ? { step: btn.getAttribute('data-step') } : undefined).then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'Could not build it.'; btn.disabled = false; return; }
          location.href = r.body.url;
        });
        return;
      }
      api('PATCH', base + '/jobs/' + encodeURIComponent(id), { action: act }).then(function (r) {
        if (!r.ok) { status.textContent = r.body.error || 'Could not do that.'; btn.disabled = false; return; }
        replaceGoal(r.body.goal);
        // Ask why, once, right after a discard.
        var title = card.querySelector('.gl-wf-title');
        state.justDiscarded = act === 'discard' ? { id: id, title: title ? title.textContent.trim() : '' } : null;
        render();
      });
    });
  }

  // + New goal (the top bar's, the sidebar's) opens the dialog over the
  // page, once there are goals to go back to.
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('#glNewBtn, [data-le-goal-new]');
    if (!a || !state.goals.length || ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    openNewGoal();
  });
  // Search narrows the list as you type.
  var searchBox = document.getElementById('glSearch');
  if (searchBox) searchBox.addEventListener('input', function () { if (!state.current && !state.creating) render(); });
  load();
})();
</script>
</body>
</html>`

// What the page's header says as it arrives, so it never shows the Goals
// heading first and then changes it: the server picks the view from the
// address (and whether there are goals yet); the page's script keeps it
// in step after that.
export type GoalsPageView = 'goals' | 'goal' | 'new'
function goalsPageFor(view: GoalsPageView): string {
  const title = view === 'goal' ? 'Goals' : view === 'goals' ? 'Goals' : 'New goal'
  return goalsPageTemplate
    .replace('__GL_HEAD__', title)
    .replace('__GL_SEARCH_HIDDEN__', view === 'goals' ? '' : ' hidden')
    .replace('__GL_NEW_HIDDEN__', view === 'new' ? ' hidden' : '')
}
const goalsPages: Record<GoalsPageView, string> = { goals: goalsPageFor('goals'), goal: goalsPageFor('goal'), new: goalsPageFor('new') }
export function goalsPageAs(view: GoalsPageView): string {
  return goalsPages[view]
}
/** The Goals page as the list shows it. */
export const goalsPageHtml: string = goalsPages.goals
