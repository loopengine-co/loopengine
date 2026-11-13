// The console's Goals page (/goals): type a goal, get suggested workflows
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
  .gl-setup { margin: 0; padding-left: 18px; font-size: 13.5px; display: grid; gap: 4px; }
  .gl-select { font: inherit; font-size: 13px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
  .gl-share { display: flex; gap: 8px; align-items: flex-start; margin-top: 8px; line-height: 1.45; }
  .gl-share input { margin-top: 2px; }
  .gl-discarded-note { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 14px; border-radius: 10px; background: var(--surface); font-size: 13.5px; }
  .gl-discarded-note .gl-btn { height: 28px; font-size: 12.5px; }
  .gl-empty { font-size: 13.5px; color: var(--ink-muted); margin: 0; }
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
        <div><h1 id="glTitle">New goal</h1><p id="glLead">Say what you want to achieve. LoopEngine suggests workflows that move it, each with the agent it would go into. Save the ones worth keeping, generate more, and build them when you’re ready.</p></div>
      </div>
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
  var state = { goals: [], about: '', settings: {}, current: null, showDiscarded: false, justDiscarded: null, error: '', poll: null, startedAt: 0 };

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
    history.replaceState(null, '', url);
  }

  function load(selectId) {
    api('GET', '/goals').then(function (r) {
      if (!r.ok) { page.innerHTML = '<p class="error">Could not load goals: ' + esc(r.body.error || 'unknown error') + '</p>'; return; }
      state.goals = r.body.goals || [];
      state.about = r.body.about || '';
      state.settings = r.body.settings || {};
      // A goal from the sidebar (?goal=), else a new one (+ New, or the
      // workspace's front page).
      var id = selectId || new URLSearchParams(location.search).get('goal');
      state.current = state.goals.filter(function (g) { return g.id === id; })[0] || null;
      render();
    });
  }

  // While a goal is planning, check every few seconds.
  function watch() {
    if (state.poll) { clearTimeout(state.poll); state.poll = null; }
    if (!state.current || state.current.status !== 'planning') return;
    state.poll = setTimeout(function () {
      api('GET', '/goals/' + encodeURIComponent(state.current.id)).then(function (r) {
        if (!r.ok) return;
        replaceGoal(r.body.goal);
        if (r.body.goal.status !== 'planning') reloadSidebar();
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

  function newGoalHtml() {
    return '<div class="gl-card">' +
      '<label for="glGoal"><strong>What do you want to achieve?</strong></label>' +
      '<textarea id="glGoal" placeholder="e.g. Grow my LoopEngine Cloud users to 100"></textarea>' +
      '<details' + (state.about ? '' : ' open') + '><summary class="hint">About your business ' + (state.about ? '(saved, used for every goal)' : '(optional, makes suggestions fit you)') + '</summary>' +
        '<textarea id="glAbout" style="margin-top:8px" placeholder="What you sell, to whom, and the tools you use (Gmail, Shopify, Slack' + ELLIPSIS + ')">' + esc(state.about) + '</textarea>' +
        '<div class="gl-row" style="margin-top:8px"><label class="hint" for="glKind">Kind of business</label><select id="glKind" class="gl-select">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + ((state.settings.businessKind || '') === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>' +
        (state.settings.cloud ? '<label class="hint gl-share"><input type="checkbox" id="glShare"' + (state.settings.shareLeverStats ? ' checked' : '') + '> Share anonymous stats about which suggestions you save, build and keep, to improve suggestions for everyone. Never your goals, requests or data.</label>' : '') +
      '</details>' +
      '<div class="gl-row"><button type="button" class="gl-btn" id="glSubmit">Suggest workflows</button><span class="hint" id="glSubmitStatus"></span></div>' +
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

  function workflowHtml(w) {
    var actions = '';
    if (w.state === 'suggested') actions = '<button type="button" class="gl-btn soft" data-act="save">Save</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    else if (w.state === 'saved') actions = '<button type="button" class="gl-btn" data-act="build">Build workflow</button><button type="button" class="gl-btn plain" data-act="discard">Discard</button>';
    else if (w.state === 'built') actions = '<a class="gl-btn soft" style="display:inline-flex;align-items:center;text-decoration:none" href="/agents/config?agent=' + encodeURIComponent(w.built.agent) + '&tab=workflows&workflow=' + encodeURIComponent(w.built.workflowId) + '">Open</a>';
    else if (w.state === 'discarded') actions = '<button type="button" class="gl-btn plain" data-act="restore">Restore</button>';
    var pill = w.state === 'saved' ? '<span class="gl-state saved">Saved</span>' : w.state === 'built' ? '<span class="gl-state built">Built</span>' : '';
    return '<div class="gl-wf' + (w.state === 'built' ? ' built' : '') + '" data-wf="' + esc(w.id) + '">' +
      '<div class="gl-wf-head"><span class="gl-wf-title">' + esc(w.title) + ' ' + pill + '</span>' + agentHtml(w) + '</div>' +
      (w.why ? '<p class="gl-why">' + esc(w.why) + '</p>' : '') +
      needsHtml(w) +
      '<details><summary>What it will do</summary><p>' + esc(w.request) + '</p></details>' +
      '<div class="gl-row">' + actions + '<span class="hint" data-wf-status></span></div>' +
    '</div>';
  }

  function goalHtml(g) {
    var by = function (s) { return g.workflows.filter(function (w) { return w.state === s; }); };
    var suggested = by('suggested');
    var kept = g.workflows.filter(function (w) { return w.state === 'saved' || w.state === 'built'; });
    var discarded = by('discarded');
    var planning = g.status === 'planning';
    var focus = g.focus || (g.brief && g.brief.focus) || '';
    var secs = state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0;
    return '<div class="gl-card">' +
      '<h2 class="gl-goal-title">' + esc(g.goal) + '</h2>' +
      (focus ? '<div class="gl-focus">Planning for <select id="glFocus"' + (planning ? ' disabled' : '') + '>' + FOCUS.map(function (f) { return '<option value="' + f[0] + '"' + (f[0] === focus ? ' selected' : '') + '>' + f[1] + '</option>'; }).join('') + '</select>' +
        (g.brief && g.brief.measure ? '<span>' + String.fromCharCode(183) + ' measured by ' + esc(g.brief.measure) + '</span>' : '') + '</div>' : '') +
      (g.message ? '<p class="gl-why">' + esc(g.message) + '</p>' : '') +
      (planning ? '<p class="gl-status">Suggesting workflows' + ELLIPSIS + (secs ? ' ' + secs + 's' : '') + ' It reads your workspace first; this takes about a minute.</p>' : '') +
      (g.status === 'failed' ? '<p class="error">' + esc(g.error || 'Planning failed.') + '</p>' : '') +
      (g.setup && g.setup.length ? '<div><strong style="font-size:13.5px">Before you start</strong><ol class="gl-setup">' + g.setup.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>' : '') +
    '</div>' +
    (state.justDiscarded ? '<div class="gl-discarded-note" data-discarded="' + esc(state.justDiscarded.id) + '"><span>Discarded <strong>' + esc(state.justDiscarded.title) + '</strong>. Why?</span>' +
      REASONS.map(function (r) { return '<button type="button" class="gl-btn plain" data-reason="' + r[0] + '">' + r[1] + '</button>'; }).join('') +
      '<button type="button" class="gl-link" data-undo="1">Undo</button></div>' : '') +
    '<div class="gl-section"><h3>Suggestions <span class="gl-count">' + suggested.length + '</span></h3>' +
      (suggested.length ? suggested.map(workflowHtml).join('') : '<p class="gl-empty">' + (planning ? 'On their way' + ELLIPSIS : 'No suggestions waiting. Generate more for new ideas.') + '</p>') +
      '<div class="gl-row"><button type="button" class="gl-btn soft" id="glMore"' + (planning ? ' disabled' : '') + '>Generate more</button><span class="hint">New ideas only: nothing you’ve saved, built or discarded comes back.</span></div>' +
    '</div>' +
    '<div class="gl-section"><h3>Saved workflows <span class="gl-count">' + kept.length + '</span></h3>' +
      (kept.length ? kept.map(workflowHtml).join('') : '<p class="gl-empty">Save a suggestion to keep it here, then build it into its agent.</p>') +
    '</div>' +
    (discarded.length ? '<div class="gl-section"><button type="button" class="gl-link" id="glShowDiscarded">' + (state.showDiscarded ? 'Hide' : 'Show') + ' discarded (' + discarded.length + ')</button>' +
      (state.showDiscarded ? discarded.map(workflowHtml).join('') : '') + '</div>' : '') +
    '<div><button type="button" class="gl-link" id="glDelete" style="color:var(--bad)">Delete this goal</button></div>';
  }

  function render() {
    var title = document.getElementById('glTitle');
    var lead = document.getElementById('glLead');
    if (title) title.textContent = state.current ? 'Goal' : 'New goal';
    if (lead) lead.style.display = state.current ? 'none' : '';
    page.innerHTML = (state.current ? goalHtml(state.current) : newGoalHtml()) + (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '');
    state.error = '';
    wire();
    watch();
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
      if (del.dataset.confirming !== '1') { del.dataset.confirming = '1'; del.textContent = 'Click again to delete this goal (built workflows stay in their agents)'; return; }
      api('DELETE', base).then(function () { state.current = null; setUrl(''); reloadSidebar(); load(); });
    });
    var cards = page.querySelectorAll('[data-wf]');
    for (var c = 0; c < cards.length; c++) wireCard(cards[c], base);
    var note = page.querySelector('[data-discarded]');
    if (note) {
      var wid = note.getAttribute('data-discarded');
      var send = function (body) {
        state.justDiscarded = null;
        api('PATCH', base + '/workflows/' + encodeURIComponent(wid), body).then(function (r) {
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
      btn.disabled = true;
      if (act === 'build') {
        status.textContent = 'Getting the agent ready' + ELLIPSIS;
        api('POST', base + '/workflows/' + encodeURIComponent(id) + '/build').then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'Could not build it.'; btn.disabled = false; return; }
          location.href = r.body.url;
        });
        return;
      }
      api('PATCH', base + '/workflows/' + encodeURIComponent(id), { action: act }).then(function (r) {
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
