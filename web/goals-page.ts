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

const goalsPageTemplate: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Goals</title>
<style>${devUiCss}
  .gl { max-width: 880px; display: grid; gap: 18px; }
  .gl-card { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); padding: 16px 18px; display: grid; gap: 10px; }
  .gl textarea { width: 100%; box-sizing: border-box; min-height: 64px; font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); resize: vertical; }
  .gl textarea:focus, .gl select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .gl-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .gl-btn { height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--primary); background: var(--primary); color: var(--on-primary); cursor: pointer; }
  .gl-btn:hover:not(:disabled) { filter: brightness(1.08); background: var(--primary); }
  .gl-btn.soft { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
  .gl-btn.soft:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); filter: none; }
  .gl-btn.plain { background: none; border-color: var(--line); color: var(--ink); font-weight: 500; }
  .gl-btn.danger { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
  .gl-link { background: none; border: 0; padding: 0; color: var(--accent-ink); font-size: 13px; cursor: pointer; font-weight: 500; }
  .gl-btn.small { height: 30px; font-size: 13px; padding: 0 12px; }
  .gl-section { display: grid; gap: 12px; }
  .gl-section-head { display: grid; gap: 2px; margin-top: 8px; }
  .gl-section h3 { margin: 0; font-size: 16px; font-weight: 650; color: var(--ink); display: flex; gap: 8px; align-items: center; }
  .gl-count { font-size: 11.5px; font-weight: 600; padding: 0 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  /* The goal at a glance. */
  .gl-hero { gap: 16px; padding: 18px 20px; }
  .gl-hero-meta { display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: center; font-size: 13.5px; color: var(--ink); }
  .gl-field { display: inline-flex; gap: 8px; align-items: center; }
  .gl-fact-k { font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-faint); }
  .gl-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .gl-stat { display: grid; gap: 2px; padding: 12px 14px; border-radius: 10px; background: var(--surface); }
  .gl-stat b { font-size: 22px; font-weight: 700; line-height: 1.1; }
  .gl-stat span { font-size: 12.5px; color: var(--ink-muted); }
  .gl-stat.attn { background: var(--warn-soft); }
  .gl-stat.attn b { color: var(--warn); }
  @media (max-width: 560px) { .gl-stats { grid-template-columns: minmax(0, 1fr); } }
  .gl-callout { margin: 0; padding: 12px 14px; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 10px 10px 0; font-size: 14px; line-height: 1.5; color: var(--ink); }
  .gl-card-title { margin: 0; font-size: 14.5px; font-weight: 650; }
  .gl-setup { margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.5; display: grid; gap: 6px; }
  .gl-setup-more summary { cursor: pointer; color: var(--accent-ink); font-weight: 600; font-size: 13px; }
  .gl-setup-more .gl-setup { margin-top: 6px; }
  .gl-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: gl-spin 0.8s linear infinite; vertical-align: -1px; margin-right: 4px; }
  @keyframes gl-spin { to { transform: rotate(360deg); } }
  /* A workflow built for the goal, or a suggestion. */
  .gl-item { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); padding: 16px 18px; display: grid; gap: 12px; }
  .gl-item.discarded { opacity: .75; }
  .gl-item-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: start; }
  .gl-item-head { display: grid; gap: 6px; justify-items: start; min-width: 0; }
  .gl-item-title { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.35; }
  .gl-item-side { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
  .gl-item-why { margin: -4px 0 0; font-size: 14px; line-height: 1.5; color: var(--ink-muted); max-width: 75ch; }
  @media (max-width: 560px) { .gl-item-top { grid-template-columns: minmax(0, 1fr); } .gl-item-side { justify-content: flex-start; } }
  .gl-kind { font-size: 11px; font-weight: 700; letter-spacing: .03em; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .gl-kind.group { background: var(--accent-soft); color: var(--accent-ink); }
  .gl-facts { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: center; font-size: 13px; color: var(--ink); }
  .gl-facts > span { display: inline-flex; gap: 8px; align-items: center; }
  .gl-agent-chip { font-weight: 600; }
  .gl-new { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); margin-left: 4px; }
  .gl-needs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .gl-need { padding: 2px 9px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); }
  .gl-need.ok { background: var(--good-soft); color: var(--good); border-color: transparent; }
  .gl-need.missing { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
  .gl-what summary { cursor: pointer; font-size: 13px; color: var(--accent-ink); font-weight: 600; }
  .gl-what p { margin: 8px 0 0; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; background: var(--surface); padding: 10px 12px; border-radius: 8px; }
  .gl-state { font-size: 12px; font-weight: 650; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
  .gl-state[hidden] { display: none; }
  .gl-state.saved { background: var(--accent-soft); color: var(--accent-ink); }
  .gl-state.built { background: var(--good-soft); color: var(--good); }
  .gl-state.paused { background: var(--surface-2); color: var(--ink-muted); }
  /* Its workflows, in the order they run. */
  .gl-flows { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .gl-flow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; background: var(--bg); }
  .gl-flow + .gl-flow { border-top: 1px solid var(--line); }
  .gl-flow-n { width: 24px; height: 24px; border-radius: 50%; background: var(--surface-2); color: var(--ink-muted); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; align-self: start; margin-top: 1px; }
  .gl-flow.built .gl-flow-n { background: var(--good-soft); color: var(--good); }
  .gl-flow-main { display: grid; gap: 4px; min-width: 0; justify-items: start; }
  .gl-flow-title { font-size: 14px; font-weight: 600; color: var(--ink); text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a.gl-flow-title:hover { text-decoration: underline; }
  .gl-flow-meta { font-size: 12.5px; color: var(--ink-muted); line-height: 1.45; }
  .gl-flow-actions { display: flex; gap: 12px; align-items: center; }
  .gl-flow-actions .gl-unlink { color: var(--ink-faint); font-size: 12.5px; }
  .gl-flow-actions .gl-unlink:hover { color: var(--bad); }
  #glShowDiscarded { justify-self: start; }
  .gl-flow-then { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 6px 14px 6px 50px; font-size: 12.5px; color: var(--ink-muted); background: var(--surface); border-top: 1px solid var(--line); }
  .gl-flow-then .gl-link { font-size: 12px; color: var(--ink-faint); }
  .gl-paused { font-size: 11px; font-weight: 700; padding: 0 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .gl-waiting { color: var(--warn); font-weight: 600; }
  .gl-item-foot { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; }
  .gl-more { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .gl-danger { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding-top: 14px; border-top: 1px solid var(--line); }
  .gl-danger .gl-link { color: var(--bad); }
  .gl-link-btn { display: inline-flex; align-items: center; text-decoration: none; }
  .gl-panel { display: grid; gap: 8px; padding: 12px 14px; border: 1px dashed var(--line); border-radius: 10px; }
  .gl-panel[hidden] { display: none; }
  .gl-input { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .gl-input[hidden] { display: none; }
  .gl-step-inputs { display: grid; gap: 6px; }
  [data-attn][hidden] { display: none; }
  .gl-job-status-line:empty { display: none; }
  .gl-new-btn[hidden], #glAddToggle[hidden] { display: none; }
  .gl-add { display: grid; gap: 8px; }
  .gl-add-form[hidden] { display: none; }
  .gl-add-form { display: grid; gap: 6px; padding: 12px 14px; border: 1px dashed var(--line); border-radius: 10px; }
  .gl-notice { display: grid; gap: 4px; padding: 10px 14px; border-radius: 10px; font-size: 13.5px; }
  .gl-notice.good { background: var(--good-soft); }
  .gl-notice.warn { background: var(--warn-soft); }
  .gl-notice.bad { background: var(--bad-soft); }
  .gl-try { display: grid; gap: 6px; padding: 10px 12px; border-radius: 8px; background: var(--surface); }
  .gl-try + .gl-try { margin-top: 6px; }
  .gl-result { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.55; max-height: 360px; overflow: auto; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); }
  .gl-result-wrap summary { cursor: pointer; font-size: 12.5px; color: var(--ink-muted); }
  .gl-again { display: grid; gap: 6px; }
  .gl-again[hidden] { display: none; }
  .gl-select { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .gl-examples { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
  .gl-example { font: inherit; font-size: 12.5px; color: var(--accent-ink); background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .gl-example:hover { border-color: var(--accent-ink); }
  .gl-share { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; line-height: 1.45; }
  .gl-share input { margin-top: 2px; }
  .gl-discarded-note { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px; border-radius: 10px; background: var(--surface); font-size: 13.5px; }
  .gl-discarded-note .gl-btn { height: 28px; font-size: 12.5px; }
  .gl-empty { font-size: 13.5px; color: var(--ink-muted); margin: 0; }
  .gl-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); overflow: hidden; }
  .gl-list li + li { border-top: 1px solid var(--line); }
  .gl-list a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 12px 16px; text-decoration: none; color: var(--ink); }
  .gl-list a:hover { background: var(--surface); }
  .gl-list a:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .gl-list-goal { font-size: 14.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gl-list-meta { grid-column: 1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; color: var(--ink-muted); }
  .gl-list-date { grid-row: 1 / span 2; grid-column: 2; font-size: 12px; color: var(--ink-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .gl-new-btn { display: inline-flex; align-items: center; text-decoration: none; }
  .gl-state.planning { background: var(--warn-soft); color: var(--warn); }
  .gl-state.failed { background: var(--bad-soft); color: var(--bad); }
  @media (max-width: 520px) { .gl-list a { grid-template-columns: minmax(0, 1fr); } .gl-list-date { grid-row: auto; grid-column: 1; } }
  .gl-status { font-size: 13.5px; color: var(--ink-muted); }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
</style>
</head>
<body data-le-page="goals">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div>__GL_HEAD__</div>
      </div>
      <a class="gl-btn gl-new-btn" id="glNewBtn" href="__GL_NEW_HREF__"__GL_NEW_HIDDEN__>__GL_NEW_LABEL__</a>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="gl" id="glPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
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
      render();
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

  function listHtml() {
    var count = function (g, s) { return (g.jobs || []).filter(function (w) { return w.state === s; }).length; };
    return '<ul class="gl-list">' + state.goals.map(function (g) {
      var parts = [];
      if (g.status === 'planning') parts.push('<span class="gl-state planning">Suggesting' + ELLIPSIS + '</span>');
      if (g.status === 'failed') parts.push('<span class="gl-state failed">Failed</span>');
      var suggested = count(g, 'suggested'), active = count(g, 'active');
      if (suggested) parts.push(suggested + ' suggested');
      if (active) parts.push('<span class="gl-state built">' + active + ' running</span>');
      if (!parts.length) parts.push('Nothing kept yet');
      var date = g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return '<li><a href="/goals?goal=' + encodeURIComponent(g.id) + '"><span class="gl-list-goal" title="' + esc(g.goal) + '">' + esc(g.goal) + '</span>' +
        '<span class="gl-list-date">' + esc(date) + '</span>' +
        '<span class="gl-list-meta">' + parts.join(' <span aria-hidden="true">' + String.fromCharCode(183) + '</span> ') + '</span></a></li>';
    }).join('') + '</ul>';
  }

  function newGoalHtml() {
    return '<div class="gl-card">' +
      '<label for="glGoal"><strong>What should your agents take care of?</strong></label>' +
      '<p class="hint" style="margin:2px 0 8px">Big or small: work to hand off, or a result to reach.</p>' +
      '<textarea id="glGoal" placeholder="e.g. Help me research AI industry trends and publish a weekly report">' + esc(startText) + '</textarea>' +
      '<div class="gl-examples hint">Or try: ' + GOAL_EXAMPLES.map(function (x) { return '<button type="button" class="gl-example" data-example="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<details' + (state.about ? '' : ' open') + '><summary class="hint">About you or your business ' + (state.about ? '(saved, used for every goal)' : '(optional, makes suggestions fit you)') + '</summary>' +
        '<textarea id="glAbout" style="margin-top:8px" placeholder="What you do, for whom, and the tools you use (Gmail, Shopify, Slack' + ELLIPSIS + ')">' + esc(state.about) + '</textarea>' +
        '<div class="gl-row" style="margin-top:8px"><label class="hint" for="glKind">Kind of business</label><select id="glKind" class="gl-select">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + ((state.settings.businessKind || '') === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>' +
        (state.settings.cloud ? '<label class="hint gl-share"><input type="checkbox" id="glShare"' + (state.settings.shareLeverStats ? ' checked' : '') + '> Share anonymous stats about which suggestions you save, build and keep, to improve suggestions for everyone. Never your goals, requests or data.</label>' : '') +
      '</details>' +
      '<div class="gl-row"><button type="button" class="gl-btn" id="glSubmit">Suggest workflows</button><span class="hint" id="glSubmitStatus"></span></div>' +
    '</div>';
  }

  var DOT = ' ' + String.fromCharCode(183) + ' ';
  // An agent by the name it was given, when the sidebar knows it.
  function agentLabel(name) {
    return window.leShell && window.leShell.displayNameOf ? window.leShell.displayNameOf(name) : name;
  }
  function wfHref(agent, id) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id);
  }

  // What a suggestion needs: apps connected or to connect.
  function needsHtml(list) {
    if (!list || !list.length) return '';
    return '<div class="gl-needs">' + list.map(function (n) {
      return '<span class="gl-need ' + (n.connected ? 'ok' : 'missing') + '">' + esc(n.name) + (n.connected ? ' ' + String.fromCharCode(10003) : ' ' + String.fromCharCode(183) + ' connect') + '</span>';
    }).join('') + '</div>';
  }
  function agentChip(a) {
    return '<span class="gl-agent-chip">' + esc(a.isNew ? a.name : agentLabel(a.name)) + (a.isNew ? ' <span class="gl-new">New agent</span>' : '') + '</span>';
  }
  // The facts that say what a suggestion or workflow is worth.
  function factsHtml(w, withAgent) {
    var facts = [];
    if (w.measure) facts.push('<span><span class="gl-fact-k">Measured by</span> ' + esc(w.measure) + '</span>');
    if (w.humanMinutesPerWeek) facts.push('<span><span class="gl-fact-k">Your time</span> about ' + esc(w.humanMinutesPerWeek) + ' min a week</span>');
    if (withAgent && w.agent) facts.push('<span><span class="gl-fact-k">Runs on</span> ' + agentChip(w.agent) + '</span>');
    return facts.length ? '<div class="gl-facts">' + facts.join('') + '</div>' : '';
  }
  function itemTop(w, side) {
    var group = w.group && w.group.steps && w.group.steps.length ? w.group : null;
    var kind = group ? 'Group ' + String.fromCharCode(183) + ' ' + group.steps.length + ' workflows that run in order' : 'Workflow';
    return '<div class="gl-item-top"><div class="gl-item-head"><span class="gl-kind' + (group ? ' group' : '') + '">' + kind + '</span>' +
      '<h4 class="gl-item-title gl-wf-title">' + esc(w.title) + '</h4></div>' +
      '<div class="gl-item-side">' + side + '</div></div>' +
      (w.why ? '<p class="gl-item-why">' + esc(w.why) + '</p>' : '');
  }
  function btn(act, label, cls, step) {
    return '<button type="button" class="gl-btn ' + (cls || '') + '" data-act="' + act + '"' + (step ? ' data-step="' + esc(step) + '"' : '') + '>' + label + '</button>';
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
            '<span class="gl-flow-meta">Runs on ' + agentChip(st.agent) + '</span>' + needsHtml(st.needs) + '</div>' +
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
      return then + '<div class="gl-flow built" data-how="' + esc(d.agent) + '|' + esc(d.workflowId) + '"><span class="gl-flow-n">' + (i + 1) + '</span>' +
        '<div class="gl-flow-main"><a class="gl-flow-title" data-how-title href="' + wfHref(d.agent, d.workflowId) + '">' + esc(d.title || d.workflowId) + '</a>' +
        '<span class="gl-flow-meta">' + esc(agentLabel(d.agent)) + DOT + '<span data-how-meta>' + ELLIPSIS + '</span></span></div>' +
        '<div class="gl-flow-actions">' + (flows.length > 1 ? '<button type="button" class="gl-link gl-unlink" data-unlink="' + esc(d.agent) + '|' + esc(d.workflowId) + '">Remove</button>' : '') +
          '<a class="gl-btn plain small gl-link-btn" href="' + wfHref(d.agent, d.workflowId) + '">Open</a></div></div>';
    }).join('') + '</div>';
  }

  // Add another workflow to a built one, or a step that runs one after another.
  function manageHtml(w) {
    var flows = (w.doers || []).filter(function (d) { return d.type === 'workflow'; });
    var opt = function (d, sel) { return '<option value="' + esc(d.agent) + '|' + esc(d.workflowId) + '"' + (sel ? ' selected' : '') + '>' + esc(d.title || d.workflowId) + '</option>'; };
    return '<div class="gl-item-foot"><button type="button" class="gl-link" data-act="addwf">+ Add a workflow</button>' + (flows.length > 1 ? '<button type="button" class="gl-link" data-act="addstep">+ Run one after another</button>' : '') + '</div>' +
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
    var pill = group && builtSteps < steps.length ? '<span class="gl-state saved">' + builtSteps + ' of ' + steps.length + ' built</span>' : '<span class="gl-state" data-card-pill hidden></span>';
    return '<div class="gl-item built" data-wf="' + esc(w.id) + '">' +
      itemTop(w, '<span class="gl-state planning" data-attn hidden>Needs you</span>' + pill) +
      factsHtml(w, false) +
      (group ? stepsHtml(w, steps) : flowsHtml(w) + manageHtml(w)) +
      '<span class="hint gl-job-status-line" data-wf-status></span>' +
    '</div>';
  }

  // A suggestion: what it is and why, what it's worth, where it runs and
  // what it needs; Build or Discard.
  function suggestionHtml(w) {
    var group = w.group && w.group.steps && w.group.steps.length ? w.group : null;
    var steps = group ? group.steps : [];
    var discarded = w.state === 'discarded';
    var actions = discarded ? btn('restore', 'Restore', 'plain small')
      : (group ? '' : btn('build', 'Build it', 'small')) + btn('discard', 'Discard', 'plain small');
    return '<div class="gl-item' + (discarded ? ' discarded' : '') + '" data-wf="' + esc(w.id) + '">' +
      itemTop(w, actions) +
      (w.added ? '<p class="hint" style="margin:0">You added this: ' + String.fromCharCode(8220) + esc(w.added.idea) + String.fromCharCode(8221) + (w.added.note ? DOT + esc(w.added.note) : '') + '</p>' : '') +
      factsHtml(w, !group) +
      (group ? stepsHtml(w, steps)
        : needsHtml(w.needs) + (w.request ? '<details class="gl-what"><summary>What it will do</summary><p>' + esc(w.request) + '</p></details>' : '')) +
      '<span class="hint gl-job-status-line" data-wf-status></span>' +
    '</div>';
  }

  // A workflow of the person's own: typed in their words, shaped and judged by
  // the planner (added, changed, warned or refused), with what it said.
  function addJobHtml(planning) {
    var n = state.addNotice;
    var notice = !n ? '' : '<div class="gl-notice ' + (n.verdict === 'refused' ? 'bad' : n.verdict === 'added' ? 'good' : 'warn') + '">' +
      '<strong>' + (n.verdict === 'refused' ? 'Not added' : n.verdict === 'changed' ? 'Added, with changes' : n.verdict === 'warned' ? 'Added, with a caution' : 'Added') + '</strong>' +
      (n.note ? '<span>' + esc(n.note) + '</span>' : '') +
      (n.alternative ? '<span class="hint">Instead, you could: ' + esc(n.alternative) + '</span>' : '') + '</div>';
    return '<div class="gl-add">' +
      '<div class="gl-add-form"' + (state.addOpen ? '' : ' hidden') + '>' +
        '<label for="glAddIdea"><strong>A workflow you have in mind</strong> <span class="hint">in your own words; LoopEngine shapes it into a workflow (or a group, when it has stages) and says if anything looks off</span></label>' +
        '<textarea id="glAddIdea" rows="2" placeholder="e.g. Thank every new customer by email within a day">' + esc(state.addDraft || '') + '</textarea>' +
        '<label class="hint gl-share"><input type="checkbox" id="glAddShare"' + (state.addShare ? ' checked' : '') + '> Share the approach behind it to improve suggestions for everyone</label>' +
        '<p class="hint" style="margin:0">Your idea stays in your workspace unless you tick that. If you do, only a generic description of the approach is shared, never your words, and only once many workspaces use something similar.</p>' +
        '<div class="gl-row"><button type="button" class="gl-btn soft" id="glAddJob"' + (planning ? ' disabled' : '') + '>Add it</button><button type="button" class="gl-btn plain" id="glAddCancel">Cancel</button><span class="hint" id="glAddStatus"></span></div>' +
      '</div>' + notice + '</div>';
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
  // A built card's pill, from its workflows: Running when any is started
  // by a schedule or webhook, Paused when all are paused, else Ready.
  function refreshPill(card) {
    var pill = card && card.querySelector('[data-card-pill]');
    if (!pill) return;
    var states = Array.prototype.map.call(card.querySelectorAll('[data-flow-state]'), function (el) { return el.getAttribute('data-flow-state'); });
    if (!states.length) return;
    var s = states.indexOf('live') >= 0 ? ['built', 'Running'] : states.every(function (x) { return x === 'paused'; }) ? ['paused', 'Paused'] : ['saved', 'Ready to run'];
    pill.className = 'gl-state ' + s[0];
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
          meta.innerHTML = (st === 'paused' ? '<span class="gl-paused">Paused</span> ' : '') + esc(bits.join(DOT)) + (waiting ? ' <span class="gl-waiting">' + waiting + ' waiting for you</span>' : '');
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
    var focusSelect = focus ? '<label class="gl-field"><span class="gl-fact-k">Focus</span><select id="glFocus" class="gl-select"' + (planning ? ' disabled' : '') + '>' + (FOCUS.some(function (f) { return f[0] === focus; }) ? FOCUS : FOCUS.concat([[focus, (g.brief && g.brief.newFocus && g.brief.newFocus.label) || focus]])).map(function (f) { return '<option value="' + esc(f[0]) + '"' + (f[0] === focus ? ' selected' : '') + '>' + esc(f[1]) + '</option>'; }).join('') + '</select></label>' : '';
    var stat = function (n, label, id) { return '<div class="gl-stat"><b' + (id ? ' id="' + id + '"' : '') + '>' + n + '</b><span>' + label + '</span></div>'; };
    var setup = g.setup || [];
    return '<div class="gl-card gl-hero">' +
      '<div class="gl-hero-meta">' + focusSelect +
        (g.brief && g.brief.measure ? '<span class="gl-field"><span class="gl-fact-k">Measured by</span> ' + esc(g.brief.measure) + '</span>' : '') +
        (focus.indexOf('x-') === 0 ? '<span class="hint" title="No focus in the playbook fit this goal, so its planner named one and wrote the approaches it needed. They stay in this workspace for next time.">written for your goals</span>' : '') + '</div>' +
      '<div class="gl-stats">' + stat(kept.length, kept.length === 1 ? 'workflow built' : 'workflows built') + stat(suggested.length, suggested.length === 1 ? 'suggestion to review' : 'suggestions to review') + stat(0, 'waiting for you', 'glWaiting') + '</div>' +
      (g.message ? '<p class="gl-callout">' + esc(g.message) + '</p>' : '') +
      (planning ? '<p class="gl-status"><span class="gl-spinner" aria-hidden="true"></span> Suggesting workflows' + ELLIPSIS + (secs ? ' ' + secs + 's' : '') + ' It reads your workspace first; this takes about a minute.</p>' : '') +
      (g.status === 'failed' ? '<p class="error">' + esc(g.error || 'Planning failed.') + '</p>' : '') +
    '</div>' +
    (setup.length ? '<div class="gl-card gl-setup-card"><h3 class="gl-card-title">Before you start</h3><ol class="gl-setup">' + setup.slice(0, 4).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      (setup.length > 4 ? '<details class="gl-setup-more"><summary>Show ' + (setup.length - 4) + ' more</summary><ol class="gl-setup" start="5">' + setup.slice(4).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></details>' : '') + '</div>' : '') +
    (state.justDiscarded ? '<div class="gl-discarded-note" data-discarded="' + esc(state.justDiscarded.id) + '"><span>Discarded <strong>' + esc(state.justDiscarded.title) + '</strong>. Why?</span>' +
      REASONS.map(function (r) { return '<button type="button" class="gl-btn plain small" data-reason="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '<button type="button" class="gl-link" data-undo="1">Undo</button></div>' : '') +
    (kept.length ? '<div class="gl-section"><div class="gl-section-head"><h3>Your workflows <span class="gl-count">' + kept.length + '</span></h3><span class="hint">Built for this goal and working on it</span></div>' +
      kept.map(builtHtml).join('') + '</div>' : '') +
    '<div class="gl-section"><div class="gl-section-head"><h3>Suggested <span class="gl-count">' + suggested.length + '</span></h3><span class="hint">Workflows that would move this goal. Build the ones you want.</span></div>' +
      (suggested.length ? suggested.map(suggestionHtml).join('') : '<p class="gl-empty">' + (planning ? 'On their way' + ELLIPSIS : 'No suggestions waiting.') + '</p>') +
      '<div class="gl-more"><button type="button" class="gl-btn plain" id="glMore"' + (planning ? ' disabled' : '') + '>Suggest more</button>' +
        '<button type="button" class="gl-btn plain" id="glAddToggle"' + (state.addOpen ? ' hidden' : '') + '>Add your own</button>' +
        '<span class="hint">New ideas only: nothing already here, built or discarded comes back.</span></div>' +
      addJobHtml(planning) +
    '</div>' +
    (discarded.length ? '<div class="gl-section"><button type="button" class="gl-link" id="glShowDiscarded">' + (state.showDiscarded ? 'Hide' : 'Show') + ' discarded (' + discarded.length + ')</button>' +
      (state.showDiscarded ? discarded.map(suggestionHtml).join('') : '') + '</div>' : '') +
    '<div class="gl-danger"><button type="button" class="gl-link" id="glDelete">Delete this goal</button><span class="hint">The workflows built for it stay on their agents.</span></div>';
  }

  function render() {
    var title = document.getElementById('glTitle');
    var lead = document.getElementById('glLead');
    var newBtn = document.getElementById('glNewBtn');
    // The list, unless there are no goals yet: then the new-goal form.
    var listing = !state.current && !state.creating && state.goals.length > 0;
    if (title) title.textContent = state.current ? state.current.goal : listing ? 'Goals' : 'New goal';
    if (lead) lead.style.display = state.current || listing ? 'none' : '';
    if (newBtn) newBtn.hidden = !listing;
    page.innerHTML = (state.current ? goalHtml(state.current) : listing ? listHtml() : newGoalHtml()) + (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '');
    state.error = '';
    wire();
    watch();
    if (state.current) fillEvidence();
  }

  function wire() {
    page.querySelectorAll('[data-example]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = document.getElementById('glGoal');
        box.value = b.dataset.example;
        box.focus();
      });
    });
    var submit = document.getElementById('glSubmit');
    if (submit) submit.addEventListener('click', function () {
      var goal = document.getElementById('glGoal').value.trim();
      startText = '';
      var aboutBox = document.getElementById('glAbout');
      var status = document.getElementById('glSubmitStatus');
      if (goal.length < 5) { status.textContent = 'Say what your agents should take care of first.'; return; }
      this.disabled = true;
      status.textContent = 'Starting' + ELLIPSIS;
      api('POST', '/goals', { goal: goal, about: aboutBox ? aboutBox.value : state.about }).then(function (r) {
        if (!r.ok) { state.error = r.body.error || 'Could not start.'; render(); return; }
        state.about = aboutBox ? aboutBox.value.trim() : state.about;
        state.startedAt = Date.now();
        state.creating = false;
        replaceGoal(r.body.goal);
        setUrl(r.body.goal.id);
        reloadSidebar();
        render();
      });
    });
    if (submit && autoStart) { autoStart = false; submit.click(); }
    var kind = document.getElementById('glKind');
    if (kind) kind.addEventListener('change', function () { saveSettings({ businessKind: kind.value || null }); });
    var share = document.getElementById('glShare');
    if (share) share.addEventListener('change', function () { saveSettings({ shareLeverStats: share.checked }); });
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
const GOALS_LEAD = 'LoopEngine suggests the workflows a goal needs: one for a small goal; more, or groups that run in order, for a big one. Build the ones you want.'
function goalsPageFor(view: GoalsPageView): string {
  const title = view === 'goal' ? 'Goal' : view === 'goals' ? 'Goals' : 'New goal'
  // A list or one goal shows no lead; a new goal explains itself.
  const hideLead = view === 'goal' || view === 'goals'
  return goalsPageTemplate
    .replace('__GL_HEAD__', `<h1 id="glTitle">${title}</h1><p id="glLead"${hideLead ? ' style="display:none"' : ''}>${GOALS_LEAD}</p>`)
    .replace('__GL_NEW_HREF__', '/goals?new=1')
    .replace('__GL_NEW_HIDDEN__', view === 'goals' ? '' : ' hidden')
    .replace('__GL_NEW_LABEL__', 'New goal')
}
const goalsPages: Record<GoalsPageView, string> = { goals: goalsPageFor('goals'), goal: goalsPageFor('goal'), new: goalsPageFor('new') }
export function goalsPageAs(view: GoalsPageView): string {
  return goalsPages[view]
}
/** The Goals page as the list shows it. */
export const goalsPageHtml: string = goalsPages.goals
