// The console's Goals page: /goals lists the goals made so far, /goals?new=1
// (and the workspace's front page, /) starts one, and /goals?goal=<id>
// opens one. A goal breaks into jobs, each with its own measure: recurring
// ones are built into a workflow on an agent, one-off ones are assigned to
// an agent (each try's result shown, accepted or sent back with a note). Type a goal, get suggested jobs
// (each with the agent it would go into), save the ones worth keeping,
// generate more, and build a saved one, which makes its agent first when
// it doesn't exist (web/goals-admin.ts behind /goals/*). Same shell and
// styles as the other console pages; like them, its inline script avoids
// backslashes and template placeholders, since it lives inside a template
// literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const goalsPageHtml: string = `<!doctype html>
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
  .gl-btn { height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); cursor: pointer; }
  .gl-btn:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }
  .gl-btn.soft { background: var(--accent-soft); color: var(--accent-ink); }
  .gl-btn.soft:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); filter: none; }
  .gl-btn.plain { background: none; border-color: var(--line); color: var(--ink); font-weight: 500; }
  .gl-btn.danger { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
  .gl-link { background: none; border: 0; padding: 0; color: var(--accent-ink); font-size: 13px; cursor: pointer; font-weight: 500; }
  .gl-goal-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .gl-focus { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; color: var(--ink-muted); }
  .gl-focus select { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .gl-section { display: grid; gap: 10px; }
  .gl-section h3 { margin: 6px 0 0; font-size: 13px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); display: flex; gap: 8px; align-items: center; }
  .gl-count { font-size: 11px; padding: 0 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); letter-spacing: 0; }
  .gl-wf { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; background: var(--bg); }
  .gl-wf.built { border-color: var(--good); }
  .gl-wf-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; }
  .gl-wf-title { font-size: 15px; font-weight: 650; }
  .gl-agent { font-size: 12.5px; color: var(--ink-muted); }
  .gl-agent strong { color: var(--ink); font-weight: 600; font-family: var(--font-mono); font-size: 12px; }
  .gl-new { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); margin-right: 4px; }
  .gl-why { margin: 0; font-size: 14px; color: var(--ink); }
  .gl-needs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .gl-need { padding: 1px 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line); }
  .gl-need.ok { background: var(--good-soft); color: var(--good); border-color: transparent; }
  .gl-need.missing { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
  .gl-wf details summary { cursor: pointer; font-size: 12.5px; color: var(--ink-muted); }
  .gl-wf details p { margin: 6px 0 0; font-size: 13px; white-space: pre-wrap; background: var(--surface); padding: 8px 10px; border-radius: 6px; }
  .gl-state { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
  .gl-state.saved { background: var(--accent-soft); color: var(--accent-ink); }
  .gl-state.built { background: var(--good-soft); color: var(--good); }
  .gl-job-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 12.5px; color: var(--ink-muted); }
  .gl-kind { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .gl-doer { font-size: 13px; color: var(--ink-muted); }
  .gl-doer strong { color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
  .gl-link-btn { display: inline-flex; align-items: center; text-decoration: none; }
  .gl-how { display: grid; gap: 6px; }
  .gl-how-head { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-muted); }
  .gl-how-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
  .gl-how-main { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; min-width: 0; }
  .gl-how-wf { font-weight: 600; font-size: 13.5px; }
  .gl-how-agent { font-size: 12.5px; color: var(--ink-muted); }
  .gl-how-agent strong { color: var(--ink); font-family: var(--font-mono); font-size: 12px; font-weight: 500; }
  .gl-how-meta { grid-column: 1; font-size: 12.5px; color: var(--ink-muted); }
  .gl-how-open { grid-column: 2; grid-row: 1 / span 2; font-size: 13px; font-weight: 600; color: var(--accent-ink); text-decoration: none; }
  .gl-how-open:hover { text-decoration: underline; }
  .gl-waiting { color: var(--warn); font-weight: 600; }
  [data-attn][hidden] { display: none; }
  .gl-try { display: grid; gap: 6px; padding: 10px 12px; border-radius: 8px; background: var(--surface); }
  .gl-try + .gl-try { margin-top: 6px; }
  .gl-result { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.55; max-height: 360px; overflow: auto; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); }
  .gl-result-wrap summary { cursor: pointer; font-size: 12.5px; color: var(--ink-muted); }
  .gl-again { display: grid; gap: 6px; }
  .gl-again[hidden] { display: none; }
  .gl-setup { margin: 0; padding-left: 18px; font-size: 13.5px; display: grid; gap: 4px; }
  .gl-select { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
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
  .gl-new-btn[hidden] { display: none; }
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
        <div><h1 id="glTitle">Goals</h1><p id="glLead">Say what you want to achieve. LoopEngine breaks it into jobs that move it, each with the agent that would do it. Save the ones worth keeping and generate more. Build the recurring ones into workflows; assign the one-off ones to their agent.</p></div>
      </div>
      <a class="gl-btn gl-new-btn" id="glNewBtn" href="/goals?new=1" hidden>New goal</a>
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
  var FOCUS = [['new-signups', 'Getting new signups or customers'], ['activation', 'Getting new users started'], ['retention', 'Keeping users'], ['faster-support', 'Faster support'], ['revenue-recovery', 'Recovering revenue'], ['ops-hygiene', 'Smoother operations'], ['other', 'Something else']];
  var KINDS = [['', 'Choose one'], ['ecommerce', 'Online store'], ['saas', 'Software or app'], ['agency', 'Agency or services'], ['local', 'Local business'], ['creator', 'Creator or media'], ['nonprofit', 'Nonprofit'], ['other', 'Something else']];
  var REASONS = [['not-relevant', 'Not relevant'], ['too-much-work', 'Too much work'], ['already-doing-it', 'Already doing it']];
  // Which view: the list (/goals), a new goal (?new=1, or the front page)
  // or one goal (?goal=).
  var startNew = location.pathname === '/' || new URLSearchParams(location.search).has('new');
  var state = { goals: [], about: '', settings: {}, current: null, creating: startNew, showDiscarded: false, justDiscarded: null, error: '', poll: null, startedAt: 0 };

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
    if (url.pathname === '/') url.pathname = '/goals';
    history.replaceState(null, '', url);
  }

  function load(selectId) {
    api('GET', '/goals').then(function (r) {
      if (!r.ok) { page.innerHTML = '<p class="error">Could not load goals: ' + esc(r.body.error || 'unknown error') + '</p>'; return; }
      state.goals = r.body.goals || [];
      state.about = r.body.about || '';
      state.settings = r.body.settings || {};
      var id = selectId || new URLSearchParams(location.search).get('goal');
      state.current = state.goals.filter(function (g) { return g.id === id; })[0] || null;
      render();
    });
  }

  // While a goal is planning, check every few seconds.
  // While a goal is planning, or a one-off job's try is going, check again
  // every few seconds (not while a note is being written).
  function lastTry(job) { return job.tries && job.tries.length ? job.tries[job.tries.length - 1] : null; }
  function tryGoing(t) { return t && (t.status === 'running' || t.status === 'awaiting_approval'); }
  function watch() {
    if (state.poll) { clearTimeout(state.poll); state.poll = null; }
    if (!state.current) return;
    var planning = state.current.status === 'planning';
    var going = (state.current.jobs || []).some(function (j) { return j.state === 'active' && tryGoing(lastTry(j)); });
    if (!planning && !going) return;
    state.poll = setTimeout(function () {
      var typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('gl-note');
      if (typing) { watch(); return; }
      api('GET', '/goals/' + encodeURIComponent(state.current.id)).then(function (r) {
        if (!r.ok) return;
        replaceGoal(r.body.goal);
        if (planning && r.body.goal.status !== 'planning') reloadSidebar();
        render();
      });
    }, planning ? 3000 : 4000);
  }
  function reloadSidebar() {
    if (window.leShell && window.leShell.reloadGoals) window.leShell.reloadGoals();
  }
  function replaceGoal(goal) {
    state.goals = state.goals.map(function (g) { return g.id === goal.id ? goal : g; });
    if (!state.goals.some(function (g) { return g.id === goal.id; })) state.goals.unshift(goal);
    state.current = goal;
  }

  function listHtml() {
    var count = function (g, s) { return (g.jobs || []).filter(function (w) { return w.state === s; }).length; };
    return '<ul class="gl-list">' + state.goals.map(function (g) {
      var parts = [];
      if (g.status === 'planning') parts.push('<span class="gl-state planning">Suggesting' + ELLIPSIS + '</span>');
      if (g.status === 'failed') parts.push('<span class="gl-state failed">Failed</span>');
      var suggested = count(g, 'suggested'), saved = count(g, 'saved'), active = count(g, 'active'), done = count(g, 'done');
      if (suggested) parts.push(suggested + ' suggested');
      if (saved) parts.push(saved + ' saved');
      if (active) parts.push('<span class="gl-state built">' + active + ' running</span>');
      if (done) parts.push(done + ' done');
      if (!parts.length) parts.push('No jobs kept yet');
      var date = g.createdAt ? new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return '<li><a href="/goals?goal=' + encodeURIComponent(g.id) + '"><span class="gl-list-goal" title="' + esc(g.goal) + '">' + esc(g.goal) + '</span>' +
        '<span class="gl-list-date">' + esc(date) + '</span>' +
        '<span class="gl-list-meta">' + parts.join(' <span aria-hidden="true">' + String.fromCharCode(183) + '</span> ') + '</span></a></li>';
    }).join('') + '</ul>';
  }

  function newGoalHtml() {
    return '<div class="gl-card">' +
      '<label for="glGoal"><strong>What do you want to achieve?</strong></label>' +
      '<textarea id="glGoal" placeholder="e.g. Grow my LoopEngine Cloud users to 100"></textarea>' +
      '<details' + (state.about ? '' : ' open') + '><summary class="hint">About your business ' + (state.about ? '(saved, used for every goal)' : '(optional, makes suggestions fit you)') + '</summary>' +
        '<textarea id="glAbout" style="margin-top:8px" placeholder="What you sell, to whom, and the tools you use (Gmail, Shopify, Slack' + ELLIPSIS + ')">' + esc(state.about) + '</textarea>' +
        '<div class="gl-row" style="margin-top:8px"><label class="hint" for="glKind">Kind of business</label><select id="glKind" class="gl-select">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + ((state.settings.businessKind || '') === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>' +
        (state.settings.cloud ? '<label class="hint gl-share"><input type="checkbox" id="glShare"' + (state.settings.shareLeverStats ? ' checked' : '') + '> Share anonymous stats about which suggestions you save, build and keep, to improve suggestions for everyone. Never your goals, requests or data.</label>' : '') +
      '</details>' +
      '<div class="gl-row"><button type="button" class="gl-btn" id="glSubmit">Suggest jobs</button><span class="hint" id="glSubmitStatus"></span></div>' +
    '</div>';
  }

  function needsHtml(w) {
    if (!w.needs || !w.needs.length) return '';
    return '<div class="gl-needs">' + w.needs.map(function (n) {
      return '<span class="gl-need ' + (n.connected ? 'ok' : 'missing') + '">' + esc(n.name) + ' ' + (n.connected ? String.fromCharCode(10003) : 'to connect') + '</span>';
    }).join('') + (w.humanMinutesPerWeek ? '<span class="gl-need">about ' + esc(w.humanMinutesPerWeek) + ' min/week to review</span>' : '') + '</div>';
  }

  function agentHtml(w) {
    return '<span class="gl-agent">' + ARROW + ' ' + (w.agent.isNew ? '<span class="gl-new">New agent</span>' : '') + '<strong>' + esc(w.agent.name) + '</strong></span>';
  }

  // A job: one piece of the goal, with its measure, and what does it.
  function jobHtml(w) {
    var once = w.kind === 'once';
    var doer = (w.doers || [])[0];
    var actions = '';
    if (w.state === 'suggested') actions = '<button type="button" class="gl-btn soft" data-act="save">Save</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    else if (w.state === 'saved' && once) actions = '<button type="button" class="gl-btn" data-act="assign">Assign to ' + esc(w.agent.name) + '</button><button type="button" class="gl-btn soft" data-act="build">Open in Chat</button><button type="button" class="gl-btn plain" data-act="done">Mark done</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    else if (w.state === 'active' && once) {
      var t = lastTry(w);
      actions = (t && t.status === 'done' ? '<button type="button" class="gl-btn" data-act="accept">Accept</button><button type="button" class="gl-btn soft" data-act="again">Ask again</button>'
        : t && (t.status === 'error' || t.status === 'gone') ? '<button type="button" class="gl-btn" data-act="again">Try again</button>' : '') +
        '<button type="button" class="gl-btn plain" data-act="done">Mark done</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    }
    else if (w.state === 'saved') actions = '<button type="button" class="gl-btn" data-act="build">Build it</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    else if (w.state === 'done') actions = '<button type="button" class="gl-btn plain" data-act="undone">Reopen</button>';
    else if (w.state === 'discarded') actions = '<button type="button" class="gl-btn plain" data-act="restore">Restore</button>';
    var pill = w.state === 'saved' ? '<span class="gl-state saved">Saved</span>'
      : w.state === 'active' && once ? '<span class="gl-state saved">Assigned</span>'
      : w.state === 'active' ? '<span class="gl-state built">Running</span>'
      : w.state === 'done' ? '<span class="gl-state built">Done</span>' : '';
    var measure = w.measure ? '<span class="gl-measure">' + (once ? '' : 'Measured by: ') + esc(w.measure) + '</span>' : '';
    var doneBy = once && (w.state === 'active' || w.state === 'done') && w.tries && w.tries.length ? triesHtml(w)
      : w.state === 'active' && doer && doer.type === 'workflow' ? howHtml(w)
      : w.state === 'done' && w.doneAt ? '<div class="gl-doer">Done ' + esc(new Date(w.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + '</div>' : '';
    return '<div class="gl-wf' + (w.state === 'active' || w.state === 'done' ? ' built' : '') + '" data-wf="' + esc(w.id) + '">' +
      '<div class="gl-wf-head"><span class="gl-wf-title">' + esc(w.title) + ' ' + pill + ' <span class="gl-state planning" data-attn hidden>Needs you</span></span>' + (w.state === 'active' ? '' : agentHtml(w)) + '</div>' +
      '<div class="gl-job-meta"><span class="gl-kind">' + (once ? 'One-off' : 'Recurring') + '</span>' + measure + '</div>' +
      doneBy +
      (w.why ? '<p class="gl-why">' + esc(w.why) + '</p>' : '') +
      (w.state === 'active' || w.state === 'done' ? '' : needsHtml(w)) +
      (w.state === 'active' && !once ? '' : '<details><summary>' + (once ? 'What the agent is asked to do' : 'What its workflow will do') + '</summary><p>' + esc(w.request) + '</p></details>') +
      '<div class="gl-row">' + actions + '<span class="hint" data-wf-status></span></div>' +
      (once && w.state === 'active' ? '<div class="gl-again" hidden><label class="hint" for="note-' + esc(w.id) + '">What should change this time? (optional)</label><textarea class="gl-note" id="note-' + esc(w.id) + '" rows="2" placeholder="e.g. Add 5 more, and skip the paid ones."></textarea><div class="gl-row"><button type="button" class="gl-btn" data-act="assign">Send it back</button></div></div>' : '') +
    '</div>';
  }

  // A one-off job's tries: the latest with its state and result, earlier
  // ones folded away.
  function tryHtml(t, n) {
    var pill = t.status === 'running' ? '<span class="gl-state saved">Working' + ELLIPSIS + '</span>'
      : t.status === 'awaiting_approval' ? '<span class="gl-state planning">Waiting for your decision</span>'
      : t.status === 'done' ? '<span class="gl-state built">Finished</span>'
      : t.status === 'error' ? '<span class="gl-state failed">Failed</span>' : '<span class="gl-state failed">Its record is gone</span>';
    return '<div class="gl-try"><div class="gl-row"><strong>Try ' + n + '</strong>' + pill + '<span class="hint">' + esc(new Date(t.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</span></div>' +
      (t.note ? '<p class="hint" style="margin:0">You asked: ' + esc(t.note) + '</p>' : '') +
      (t.status === 'awaiting_approval' ? '<p class="hint" style="margin:0">It asked you something: answer in the agent' + String.fromCharCode(8217) + 's messaging app, or on its Approvals.</p>' : '') +
      (t.result ? '<div class="gl-result">' + esc(t.result) + '</div>' : '') +
      (t.error ? '<p class="error">' + esc(t.error) + '</p>' : '') + '</div>';
  }
  function triesHtml(w) {
    var tries = w.tries;
    var latest = tries[tries.length - 1];
    var earlier = tries.slice(0, -1);
    var done = w.state === 'done';
    return '<div class="gl-doer">Assigned to <strong>' + esc(w.agent.name) + '</strong>' + (done && w.doneAt ? ' ' + String.fromCharCode(183) + ' done ' + esc(new Date(w.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : '') + '</div>' +
      (done ? (w.result ? '<details class="gl-result-wrap" open><summary>The accepted result</summary><div class="gl-result">' + esc(w.result) + '</div></details>' : '') : tryHtml(latest, tries.length)) +
      (earlier.length || done ? '<details class="gl-result-wrap"><summary>' + (done ? 'All tries (' + tries.length + ')' : 'Earlier tries (' + earlier.length + ')') + '</summary>' +
        (done ? tries : earlier).map(function (t, i) { return tryHtml(t, i + 1); }).join('') + '</details>' : '');
  }

  // How a recurring job is done: each workflow that does it, on its agent,
  // with how it starts and how it's doing. The detail (its instructions,
  // tools, runs) is on the workflow itself: Open.
  function howHtml(w) {
    var flows = (w.doers || []).filter(function (d) { return d.type === 'workflow'; });
    return '<div class="gl-how"><div class="gl-how-head">How it' + String.fromCharCode(8217) + 's done</div>' + flows.map(function (d) {
      return '<div class="gl-how-row" data-how="' + esc(d.agent) + '|' + esc(d.workflowId) + '">' +
        '<div class="gl-how-main"><span class="gl-how-wf">' + esc(d.title) + '</span><span class="gl-how-agent">on <strong>' + esc(d.agent) + '</strong></span></div>' +
        '<span class="gl-how-meta" data-how-meta>' + ELLIPSIS + '</span>' +
        '<a class="gl-how-open" href="/agents/config?agent=' + encodeURIComponent(d.agent) + '&tab=workflows&workflow=' + encodeURIComponent(d.workflowId) + '">Open</a></div>';
    }).join('') + '</div>';
  }

  function startsText(w) {
    var schedules = (w.schedules || []).filter(function (x) { return x.status !== 'cancelled'; });
    if (schedules.length) return schedules[0].describe.charAt(0).toUpperCase() + schedules[0].describe.slice(1) + (schedules[0].status === 'paused' ? ' (paused)' : '');
    if (w.webhooks || w.webhooksWaiting) return w.webhooksWaiting && !w.webhooks ? 'Webhook, needs its signing secret' : 'On a webhook';
    return 'When started by hand or an app';
  }

  // Fills each workflow row from its agent's workflow list, and marks the
  // job when one is waiting for a decision.
  function fillEvidence() {
    var rows = page.querySelectorAll('[data-how]');
    var agents = {};
    for (var i = 0; i < rows.length; i++) agents[rows[i].getAttribute('data-how').split('|')[0]] = true;
    Object.keys(agents).forEach(function (agent) {
      api('GET', '/agents/' + encodeURIComponent(agent) + '/workflows').then(function (r) {
        if (!r.ok) return;
        var byId = {};
        (r.body.workflows || []).forEach(function (w) { byId[w.id] = w; });
        var mine = page.querySelectorAll('[data-how]');
        for (var j = 0; j < mine.length; j++) {
          var parts = mine[j].getAttribute('data-how').split('|');
          if (parts[0] !== agent) continue;
          var meta = mine[j].querySelector('[data-how-meta]');
          var w = byId[parts[1]];
          if (!w) { meta.textContent = 'Its workflow is gone from this agent'; continue; }
          var sc = w.scores || { runs: 0, failed: 0 };
          var waiting = (w.recentRuns || []).filter(function (x) { return x.status === 'awaiting_approval'; }).length + (w.schedules || []).filter(function (x) { return x.waiting; }).length;
          var bits = [startsText(w), sc.runs ? sc.runs + ' run' + (sc.runs === 1 ? '' : 's') + (sc.failed ? ', ' + sc.failed + ' failed' : '') : 'no runs yet'];
          var round = w.evals && w.evals.rounds && w.evals.rounds[0];
          if (round && typeof round.average === 'number') bits.push('evals ' + round.average.toFixed(1) + ' / 5');
          meta.innerHTML = esc(bits.join(' ' + String.fromCharCode(183) + ' ')) + (waiting ? ' <span class="gl-waiting">' + waiting + ' waiting for your decision</span>' : '');
          if (waiting) {
            var card = mine[j].closest('[data-wf]');
            var attn = card && card.querySelector('[data-attn]');
            if (attn) attn.hidden = false;
          }
        }
      });
    });
  }

  function goalHtml(g) {
    var jobs = g.jobs || [];
    var by = function (s) { return jobs.filter(function (w) { return w.state === s; }); };
    var suggested = by('suggested');
    // Yours: running first, then saved, then done.
    var kept = by('active').concat(by('saved'), by('done'));
    var discarded = by('discarded');
    var planning = g.status === 'planning';
    var focus = g.focus || (g.brief && g.brief.focus) || '';
    var secs = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
    return '<div class="gl-card">' +
      '<h2 class="gl-goal-title">' + esc(g.goal) + '</h2>' +
      (focus ? '<div class="gl-focus">Planning for <select id="glFocus"' + (planning ? ' disabled' : '') + '>' + FOCUS.map(function (f) { return '<option value="' + f[0] + '"' + (f[0] === focus ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select>' +
        (g.brief && g.brief.measure ? '<span>' + String.fromCharCode(183) + ' measured by ' + esc(g.brief.measure) + '</span>' : '') + '</div>' : '') +
      (g.message ? '<p class="gl-why">' + esc(g.message) + '</p>' : '') +
      (planning ? '<p class="gl-status">Suggesting jobs' + ELLIPSIS + (secs ? ' ' + secs + 's' : '') + ' It reads your workspace first; this takes about a minute.</p>' : '') +
      (g.status === 'failed' ? '<p class="error">' + esc(g.error || 'Planning failed.') + '</p>' : '') +
      (g.setup && g.setup.length ? '<div><strong style="font-size:13.5px">Before you start</strong><ol class="gl-setup">' + g.setup.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>' : '') +
    '</div>' +
    (state.justDiscarded ? '<div class="gl-discarded-note" data-discarded="' + esc(state.justDiscarded.id) + '"><span>Discarded <strong>' + esc(state.justDiscarded.title) + '</strong>. Why?</span>' +
      REASONS.map(function (r) { return '<button type="button" class="gl-btn plain" data-reason="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '<button type="button" class="gl-link" data-undo="1">Undo</button></div>' : '') +
    '<div class="gl-section"><h3>Suggested jobs <span class="gl-count">' + suggested.length + '</span></h3>' +
      (suggested.length ? suggested.map(jobHtml).join('') : '<p class="gl-empty">' + (planning ? 'On their way' + ELLIPSIS : 'No suggestions waiting. Generate more for new ideas.') + '</p>') +
      '<div class="gl-row"><button type="button" class="gl-btn soft" id="glMore"' + (planning ? ' disabled' : '') + '>Generate more</button><span class="hint">New ideas only: nothing you’ve saved, built or discarded comes back.</span></div>' +
    '</div>' +
    '<div class="gl-section"><h3>Your jobs <span class="gl-count">' + kept.length + '</span></h3>' +
      (kept.length ? kept.map(jobHtml).join('') : '<p class="gl-empty">Save a suggestion to keep it here. Build a recurring job into a workflow on its agent; assign a one-off job to its agent.</p>') +
    '</div>' +
    (discarded.length ? '<div class="gl-section"><button type="button" class="gl-link" id="glShowDiscarded">' + (state.showDiscarded ? 'Hide' : 'Show') + ' discarded (' + discarded.length + ')</button>' +
      (state.showDiscarded ? discarded.map(jobHtml).join('') : '') + '</div>' : '') +
    '<div><button type="button" class="gl-link" id="glDelete" style="color:var(--bad)">Delete this goal</button></div>';
  }

  function render() {
    var title = document.getElementById('glTitle');
    var lead = document.getElementById('glLead');
    var newBtn = document.getElementById('glNewBtn');
    // The list, unless there are no goals yet: then the new-goal form.
    var listing = !state.current && !state.creating && state.goals.length > 0;
    if (title) title.textContent = state.current ? 'Goal' : listing ? 'Goals' : 'New goal';
    if (lead) lead.style.display = state.current || listing ? 'none' : '';
    if (newBtn) newBtn.hidden = !listing;
    page.innerHTML = (state.current ? goalHtml(state.current) : listing ? listHtml() : newGoalHtml()) + (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '');
    state.error = '';
    wire();
    watch();
    if (state.current) fillEvidence();
  }

  function wire() {
    var submit = document.getElementById('glSubmit');
    if (submit) submit.addEventListener('click', function () {
      var goal = document.getElementById('glGoal').value.trim();
      var aboutBox = document.getElementById('glAbout');
      var status = document.getElementById('glSubmitStatus');
      if (goal.length < 5) { status.textContent = 'Say what you want to achieve first.'; return; }
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
    var shown = document.getElementById('glShowDiscarded');
    if (shown) shown.addEventListener('click', function () { state.showDiscarded = !state.showDiscarded; render(); });
    var del = document.getElementById('glDelete');
    if (del) del.addEventListener('click', function () {
      if (del.dataset.confirming !== '1') { del.dataset.confirming = '1'; del.textContent = 'Click again to delete this goal (the workflows that do its jobs stay in their agents)'; return; }
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

  function wireCard(card, base) {
    var id = card.getAttribute('data-wf');
    var status = card.querySelector('[data-wf-status]');
    var buttons = card.querySelectorAll('[data-act]');
    for (var b = 0; b < buttons.length; b++) buttons[b].addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var act = btn.getAttribute('data-act');
      if (act === 'again') {
        var box = card.querySelector('.gl-again');
        if (box) { box.hidden = false; box.querySelector('textarea').focus(); }
        return;
      }
      btn.disabled = true;
      if (act === 'assign' || act === 'accept') {
        var noteBox = card.querySelector('.gl-note');
        status.textContent = act === 'assign' ? 'Assigning' + ELLIPSIS : '';
        api('POST', base + '/jobs/' + encodeURIComponent(id) + '/' + act, act === 'assign' ? { note: noteBox ? noteBox.value : '' } : {}).then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'Could not do that.'; btn.disabled = false; return; }
          replaceGoal(r.body.goal);
          render();
        });
        return;
      }
      if (act === 'build') {
        status.textContent = 'Getting the agent ready' + ELLIPSIS;
        api('POST', base + '/jobs/' + encodeURIComponent(id) + '/build').then(function (r) {
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
