// The console's "Describe a workflow" page (/workflows/new): a person
// describes a workflow they already have in mind, sees the plan the
// planner makes of it (web/workflow-admin.ts behind /workflows/*): each
// step matched to a tool, the checkpoints where it asks them, the
// permissions, the abilities it needs and the agent it goes into, and
// creates it with one click. Same shell and styles as the other console
// pages; like them, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const workflowPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Describe a workflow</title>
<style>${devUiCss}
  .wf { max-width: 860px; display: grid; gap: 18px; }
  .wf textarea { width: 100%; min-height: 130px; box-sizing: border-box; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
  .wf-examples { display: flex; flex-wrap: wrap; gap: 6px; }
  .wf-examples button { font-size: 12.5px; }
  .wf-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 10px; background: var(--bg); }
  .wf-card h2 { margin: 0; font-size: 18px; }
  .wf-card h3 { margin: 6px 0 0; font-size: 14px; }
  .wf-steps { width: 100%; border-collapse: collapse; }
  .wf-steps td, .wf-steps th { text-align: left; padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; font-size: 13px; }
  .wf-steps th { font-size: 12px; color: var(--ink-muted); font-weight: 600; border-top: 0; }
  .wf-num { width: 24px; color: var(--ink-muted); }
  .wf-target { display: grid; gap: 8px; }
  .wf-target label { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
  .wf-gaps { border: 1px solid var(--warn); background: var(--warn-soft); border-radius: var(--radius); padding: 10px 14px; }
  .wf-gaps ul, .wf-list { margin: 4px 0 0; padding-left: 18px; }
  .wf-gaps li, .wf-list li { margin: 3px 0; font-size: 13px; }
  .wf-skill { white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; max-height: 280px; overflow: auto; }
  .wf-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .wf-btn { display: inline-block; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; background: var(--accent); color: var(--on-accent); border: 0; cursor: pointer; }
  .wf-btn.plain { background: none; color: var(--ink); border: 1px solid var(--line); font-weight: 500; }
  .wf-btn:disabled { opacity: 0.6; cursor: progress; }
  .hint { font-size: 12px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); }
</style>
</head>
<body data-le-page="workflows">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Describe a workflow</h1><p>Say what you want done, step by step, and where you want to decide. You get a plan to check before anything is created.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="wf" id="wfPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('wfPage');
  var ELLIPSIS = String.fromCharCode(8230);
  var DASH = String.fromCharCode(8212);
  var LABELS = { allow: 'Allow', ask: 'Ask me', deny: 'Never' };
  var EXAMPLES = [
    ['Blog post', 'Every Monday morning, browse the web for timely blog post ideas about our product area. Ask me on Slack to pick one of the ideas. Then draft the post and let me review it before it is created.'],
    ['Weekly digest', 'Every Friday afternoon, search the web for news about our competitors and summarise the important changes. Send me the summary for review before it goes to the team channel.'],
    ['Refund requests', 'When asked, look up the customer' + String.fromCharCode(8217) + 's order and check our refund policy. If a refund fits the policy, prepare it and ask me to approve it before it is issued.']
  ];
  var state = { description: '', planned: null, agents: [], ready: false, canInstall: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function pill(decision) {
    return '<span class="le-pill ' + esc(decision) + '">' + esc(LABELS[decision] || decision) + '</span>';
  }

  // ---- 1. Describe it ----
  function renderDescribe(error) {
    page.innerHTML =
      (state.ready ? '' : '<p class="error">Planning needs a model: set one on an agent (Overview ' + String.fromCharCode(8594) + ' Model) and add its key under <a href="/config?section=models">Models</a>.</p>') +
      '<div class="wf-card"><label for="wfText"><strong>Your workflow</strong> <span class="hint">what starts it, the steps in order, and where you want to choose or approve</span></label>' +
      '<textarea id="wfText" placeholder="Every Monday, find blog ideas on the web, ask me on Slack to pick one, draft it, and let me review it before it goes up.">' + esc(state.description) + '</textarea>' +
      '<div class="wf-examples"><span class="hint">Examples:</span>' + EXAMPLES.map(function (e, i) { return '<button type="button" class="wf-btn plain" data-example="' + i + '">' + esc(e[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfPlan"' + (state.ready ? '' : ' disabled') + '>Plan it</button>' +
        '<span class="hint" id="wfStatus">It looks at your agents and abilities first; this can take a few minutes.</span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '') +
      '</div>' +
      '<p class="hint">Rather start from something ready-made? <a href="/templates">Start from a template</a>, or <a href="/interview">find your first agent</a>.</p>';
    var text = document.getElementById('wfText');
    var examples = page.querySelectorAll('[data-example]');
    for (var i = 0; i < examples.length; i++) {
      examples[i].addEventListener('click', function (ev) { text.value = EXAMPLES[Number(ev.currentTarget.dataset.example)][1]; text.focus(); });
    }
    document.getElementById('wfPlan').addEventListener('click', function () {
      state.description = text.value.trim();
      var btn = document.getElementById('wfPlan');
      btn.disabled = true;
      document.getElementById('wfStatus').textContent = 'Planning' + ELLIPSIS + ' looking at your agents and abilities. This can take a few minutes; keep this page open.';
      var started = Date.now();
      post('/workflows/plan', { description: state.description }).then(function (r) {
        if (!r.ok) { renderDescribe(r.body.error || 'Could not plan it.'); return; }
        waitForPlan(r.body.id, started);
      }).catch(function (err) { renderDescribe(err.message); });
    });
  }

  // Planning runs on the server as a job; check on it every few seconds.
  function waitForPlan(id, started) {
    setTimeout(function () {
      fetch('/workflows/plan/' + encodeURIComponent(id), { cache: 'no-store' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (r) {
          if (!r.ok) { renderDescribe(r.body.error || 'Could not plan it.'); return; }
          if (r.body.status === 'planning') {
            var status = document.getElementById('wfStatus');
            if (status) status.textContent = 'Planning' + ELLIPSIS + ' ' + Math.round((Date.now() - started) / 1000) + 's so far. It looks at your agents and abilities first; keep this page open.';
            waitForPlan(id, started);
            return;
          }
          if (r.body.status === 'failed') { renderDescribe(r.body.error || 'Could not plan it.'); return; }
          state.planned = r.body.result;
          renderPlan();
        })
        // A dropped check (a restart, the network): try again.
        .catch(function () { waitForPlan(id, started); });
    }, 3000);
  }

  // ---- 2. Check the plan ----
  function stepRow(step, i) {
    var becomes = step.tool
      ? '<code>' + esc(step.tool) + '</code>' + (step.ability ? ' <span class="hint">from ' + esc(step.ability) + '</span>' : step.connection ? ' <span class="hint">connected service: ' + esc(step.connection) + '</span>' : (step.tool === 'system_ask_user' ? ' <span class="hint">built in</span>' : ''))
      : '<span class="hint">the agent' + String.fromCharCode(8217) + 's own work</span>';
    var badge = step.missing
      ? '<span class="le-pill bad">Missing</span> <span class="hint">' + esc(step.missing) + '</span>'
      : step.kind === 'ask'
        ? '<span class="le-pill accent">Asks you</span>'
        : step.kind === 'approval'
          ? '<span class="le-pill ask">You approve</span>'
          : '';
    return '<tr><td class="wf-num">' + (i + 1) + '</td><td><strong>' + esc(step.title) + '</strong>' + (step.detail ? '<div class="hint">' + esc(step.detail) + '</div>' : '') + '</td><td>' + becomes + '</td><td>' + badge + '</td></tr>';
  }

  function renderPlan(error) {
    var p = state.planned.plan;
    var suggested = p.target.kind === 'existing' && p.target.agent ? p.target.agent : '';
    var others = state.agents.filter(function (a) { return a !== suggested; });
    page.innerHTML =
      '<div class="wf-card">' +
        '<h2>' + esc(p.name) + '</h2><p style="margin:0">' + esc(p.summary) + '</p>' +
        '<p class="hint" style="margin:0"><strong>Starts:</strong> ' + esc(p.trigger.description) + (p.trigger.kind === 'schedule' ? ' (created paused; you turn it on)' : '') + '</p>' +
        '<h3>Steps</h3>' +
        '<div class="le-table-wrap"><table class="wf-steps"><thead><tr><th></th><th>Step</th><th>Becomes</th><th>Checkpoint</th></tr></thead><tbody>' + p.steps.map(stepRow).join('') + '</tbody></table></div>' +
        (p.rules.length ? '<h3>Permissions it sets</h3><ul class="wf-list">' + p.rules.map(function (r) { return '<li><code>' + esc(r.tool) + '</code> ' + pill(r.decision) + '</li>'; }).join('') + '</ul>' : '') +
        (p.abilities.length ? '<h3>Abilities it uses</h3><ul class="wf-list">' + p.abilities.map(function (a) { return '<li><code>' + esc(a) + '</code></li>'; }).join('') + '</ul>' + (state.canInstall ? '' : '<p class="hint">Installing abilities needs LOOPENGINE_ADMIN_AUTH set; otherwise they head the checklist.</p>') : '') +
        (p.keys.length ? '<h3>Keys it needs</h3><p class="hint" style="margin:0">' + p.keys.map(esc).join(', ') + ' ' + DASH + ' you add them after, from the checklist.</p>' : '') +
        (p.needsApprovals ? '<p class="hint" style="margin:0">It asks you through the agent' + String.fromCharCode(8217) + 's primary messaging app (Messaging tab) when nobody is in Chat.</p>' : '') +
      '</div>' +
      (p.gaps.length ? '<div class="wf-gaps"><strong>Worth knowing</strong><ul>' + p.gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="wf-card"><h3 style="margin:0">Where it goes</h3>' +
        '<div class="wf-target">' +
          '<label><input type="radio" name="wfTarget" value="new"' + (suggested ? '' : ' checked') + '> A new agent, <code>' + esc(p.newAgent.name) + '</code></label>' +
          (suggested ? '<label><input type="radio" name="wfTarget" value="existing" data-agent="' + esc(suggested) + '" checked> Add to <code>' + esc(suggested) + '</code></label>' : '') +
          (others.length ? '<label><input type="radio" name="wfTarget" value="other"> Add to <select id="wfOther">' + others.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select></label>' : '') +
        '</div>' +
        (p.target.reason ? '<p class="hint" style="margin:0">' + esc(p.target.reason) + '</p>' : '') +
        (state.planned.note ? '<p class="hint" style="margin:0"><strong>Note:</strong> ' + esc(state.planned.note) + '</p>' : '') +
        '<p class="hint" style="margin:0">Added to an existing agent, it keeps every decision that agent already has; any it would change are listed afterwards.</p>' +
      '</div>' +
      '<details class="wf-card"><summary><strong>The steps the agent follows</strong> <span class="hint">(saved as its skill <code>' + esc(p.id) + '</code>)</span></summary><div class="wf-skill">' + esc(p.skill.body) + '</div></details>' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfCreate">Create it</button><button type="button" class="wf-btn plain" id="wfBack">Change the description</button>' +
        '<span class="hint" id="wfStatus"></span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '');
    document.getElementById('wfBack').addEventListener('click', function () { renderDescribe(); });
    document.getElementById('wfCreate').addEventListener('click', function () {
      var chosen = page.querySelector('input[name="wfTarget"]:checked');
      var target = chosen.value === 'new' ? { kind: 'new' } : { kind: 'existing', agent: chosen.value === 'other' ? document.getElementById('wfOther').value : chosen.dataset.agent };
      var btn = document.getElementById('wfCreate');
      btn.disabled = true;
      document.getElementById('wfStatus').textContent = 'Creating' + ELLIPSIS + ' installing abilities can take a minute.';
      post('/workflows/create', { plan: p, target: target, description: state.description }).then(function (r) {
        if (!r.ok) { renderPlan(r.body.error || 'Could not create it.'); return; }
        renderDone(r.body);
      }).catch(function (err) { renderPlan(err.message); });
    });
  }

  // ---- 3. Done ----
  function renderDone(c) {
    var agentHref = '/agents/config?agent=' + encodeURIComponent(c.agent);
    var items = c.checklist || [];
    page.innerHTML = '<div class="wf-card">' +
      '<h2>' + esc(c.workflow) + ' is ready</h2>' +
      '<p style="margin:0">' + (c.newAgent ? 'Created as a new agent, <code>' + esc(c.agent) + '</code>.' : 'Added to <code>' + esc(c.agent) + '</code>.') + '</p>' +
      (c.schedule ? '<p class="hint" style="margin:0">Its schedule (' + esc(c.schedule.description) + ') is paused: turn it on in the agent' + String.fromCharCode(8217) + 's Schedules tab when you' + String.fromCharCode(8217) + 're ready.</p>' : '') +
      (c.scheduleError ? '<p class="error">The schedule could not be created: ' + esc(c.scheduleError) + '</p>' : '') +
      (c.loadError ? '<p class="error">The agent did not load: ' + esc(c.loadError) + '</p>' : '') +
      (c.abilities.failed.length ? '<p class="error">Not installed: ' + c.abilities.failed.map(function (f) { return esc(f.name) + ' (' + esc(f.error) + ')'; }).join('; ') + '</p>' : '') +
      (c.keptDecisions.length ? '<p class="hint" style="margin:0"><strong>Kept as they were:</strong> ' + c.keptDecisions.map(function (k) { return '<code>' + esc(k.tool) + '</code> stays ' + esc(LABELS[k.has]) + ' (the workflow wanted ' + esc(LABELS[k.wants]) + ')'; }).join('; ') + '. Change them in Permissions if you want.</p>' : '') +
      (items.length ? '<h3>Left to do</h3><ul class="wf-list">' + items.map(function (it) { return '<li>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:0">Nothing left to set up.</p>') +
      '<div class="wf-actions"><a class="wf-btn" href="' + agentHref + '">Open ' + esc(c.agent) + '</a><a class="wf-btn plain" href="/playground?agent=' + encodeURIComponent(c.agent) + '">Try it in Chat</a>' +
        '<button type="button" class="wf-btn plain" id="wfAnother">Describe another</button></div>' +
      '</div>';
    document.getElementById('wfAnother').addEventListener('click', function () { state.description = ''; state.planned = null; renderDescribe(); });
  }

  fetch('/workflows', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      state.ready = Boolean(d.ready);
      state.canInstall = Boolean(d.canInstallAbilities);
      state.agents = d.agents || [];
      renderDescribe();
    })
    .catch(function (err) { page.innerHTML = '<p class="error">Could not load: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
