// The console's "New workflow" page (/workflows/new): a person starts
// from a ready-made example (core/system-agents/workflow-examples.ts,
// which replace the old templates) or describes a workflow they already
// have in mind, and sees the plan (web/workflow-admin.ts behind /workflows/*): each
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
<title>New workflow</title>
<style>${devUiCss}
  .wf { max-width: 860px; display: grid; gap: 18px; }
  .wf textarea { width: 100%; min-height: 130px; box-sizing: border-box; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
  .wf-ex-group { display: grid; gap: 8px; }
  .wf-ex-group h3 { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .wf-ex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .wf-ex { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; display: grid; gap: 6px; align-content: start; background: var(--bg); }
  .wf-ex strong { font-size: 14px; }
  .wf-ex p { margin: 0; font-size: 13px; color: var(--ink-muted); }
  .wf-ex .wf-btn { justify-self: start; }
  .wf-instructions textarea { min-height: 180px; font-family: var(--font-mono); font-size: 12px; }
  .wf-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 10px; background: var(--bg); }
  .wf-card h2 { margin: 0; font-size: 18px; }
  .wf-card h3 { margin: 6px 0 0; font-size: 14px; }
  .wf-steps { width: 100%; border-collapse: collapse; }
  .wf-steps td, .wf-steps th { text-align: left; padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; font-size: 13px; }
  .wf-steps th { font-size: 12px; color: var(--ink-muted); font-weight: 600; border-top: 0; }
  .wf-num { width: 24px; color: var(--ink-muted); }
  .wf-target { display: grid; gap: 8px; }
  .wf-target label { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
  .wf-notify { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
  .wf-notify input { margin: 0; }
  .wf-hook { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; display: grid; gap: 4px; background: var(--surface); font-size: 13px; }
  .wf-hook ul { margin: 2px 0 0; padding-left: 18px; }
  .wf-hook input[type="text"], .wf-hook input:not([type]) { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); width: 100%; box-sizing: border-box; }
  .wf-hook-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .wf-hook-row input { flex: 1; min-width: 220px; }
  .wf-params { display: grid; gap: 6px; }
  .wf-param { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; }
  .wf-param .wf-param-name { width: 160px; font-family: var(--mono, monospace); }
  .wf-param .wf-param-desc { flex: 1; min-width: 200px; }
  .wf-gaps { border: 1px solid var(--warn); background: var(--warn-soft); border-radius: var(--radius); padding: 10px 14px; }
  .wf-gaps ul, .wf-list { margin: 4px 0 0; padding-left: 18px; }
  .wf-gaps li, .wf-list li { margin: 3px 0; font-size: 13px; }
  .wf-skill { white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; max-height: 280px; overflow: auto; }
  .wf-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .wf-btn { display: inline-block; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; background: var(--accent); color: var(--on-accent); border: 0; cursor: pointer; }
  .wf-btn.plain { background: none; color: var(--ink); border: 1px solid var(--line); font-weight: 500; }
  .wf-btn:disabled { opacity: 0.6; cursor: progress; }
  .wf-mcp { display: grid; gap: 10px; }
  .wf-mcp-row { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; display: grid; gap: 6px; background: var(--surface); }
  .wf-mcp-row input { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); width: 100%; max-width: 360px; box-sizing: border-box; }
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
        <div><h1>New workflow</h1><p>Describe what you want done, or start from an example. You get a plan to check before anything is created.</p></div>
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
  var SENDERS = { stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', standard: 'Standard Webhooks', custom: 'your app' };
  var state = { description: '', planned: null, agents: [], examples: [], ready: false, canInstall: false };

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
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfPlan"' + (state.ready ? '' : ' disabled') + '>Plan it</button>' +
        '<span class="hint" id="wfStatus">It looks at your agents and abilities first; this can take a few minutes.</span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '') +
      '</div>' +
      examplesHtml() +
      '<p class="hint">Not sure what you need? <a href="/interview">Find your first agent</a>: a short interview that suggests one.</p>';
    var text = document.getElementById('wfText');
    var examples = page.querySelectorAll('[data-example]');
    for (var i = 0; i < examples.length; i++) {
      examples[i].addEventListener('click', function (ev) { openExample(ev.currentTarget.dataset.example); });
    }
    if (location.hash === '#examples') {
      var box = document.getElementById('examples');
      if (box) box.scrollIntoView();
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

  // Ready-made plans, by category: opening one goes straight to the
  // review, with nothing planned by a model.
  function examplesHtml() {
    if (!state.examples.length) return '';
    var groups = [];
    state.examples.forEach(function (e) {
      var g = groups.filter(function (x) { return x.name === e.category; })[0];
      if (!g) { g = { name: e.category, items: [] }; groups.push(g); }
      g.items.push(e);
    });
    return '<div class="wf-card" id="examples"><h2>Start from an example</h2>' +
      '<p class="hint" style="margin:0">Ready-made and tested. You see the whole plan, and can change it, before anything is created.</p>' +
      groups.map(function (g) {
        return '<div class="wf-ex-group"><h3>' + esc(g.name) + '</h3><div class="wf-ex-grid">' + g.items.map(function (e) {
          return '<div class="wf-ex"><strong>' + esc(e.plan.name) + '</strong><p>' + esc(e.plan.summary) + '</p>' +
            '<p><strong>Starts:</strong> ' + esc(e.plan.trigger.description) + '</p>' +
            '<button type="button" class="wf-btn plain" data-example="' + esc(e.id) + '">Use this</button></div>';
        }).join('') + '</div></div>';
      }).join('') +
      '</div>';
  }

  function openExample(id) {
    var e = state.examples.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    // A copy: the review screen edits the plan it shows.
    state.planned = { plan: JSON.parse(JSON.stringify(e.plan)), example: e.id };
    renderPlan();
    window.scrollTo(0, 0);
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
  function mcpTitle(id) {
    var servers = (state.planned && state.planned.plan.mcpServers) || [];
    for (var i = 0; i < servers.length; i++) if (servers[i].id === id) return servers[i].title;
    return id;
  }

  function stepRow(step, i) {
    var becomes = step.mcp
      ? (step.tool ? '<code>' + esc(step.tool) + '</code> ' : '') + '<span class="hint">from ' + esc(mcpTitle(step.mcp)) + ' (MCP server)' + (step.tool ? '' : ', tool picked on Create') + '</span>'
      : step.tool
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

  function mcpRow(s) {
    var badge = s.verified ? '<span class="le-pill allow">' + (s.source === 'saved' ? 'Saved server' : 'Verified') + '</span>' : '<span class="le-pill ask">Unverified</span>';
    var what = s.existing
      ? 'Uses <code>' + esc(s.ability) + '</code>, already in your workspace.'
      : 'Connected to the workspace when you create this, as <code>' + esc(s.ability) + '</code>; the agent gets just the tools its steps use (anything that changes data asks you first).';
    var key = s.existing ? '' :
      '<label class="hint" for="wfKey-' + esc(s.ability) + '">API key' + (s.keySet ? ' (one is saved; leave blank to use it)' : ' (if it needs one)') + '</label>' +
      '<input type="password" autocomplete="off" id="wfKey-' + esc(s.ability) + '" data-mcp-key="' + esc(s.id) + '" placeholder="' + esc(s.keyEnv) + '">';
    return '<div class="wf-mcp-row"><div><strong>' + esc(s.title) + '</strong> ' + badge + '</div>' +
      '<div class="hint">' + esc(s.url) + (s.description ? ' ' + DASH + ' ' + esc(s.description) : '') + '</div>' +
      '<div class="hint">' + what + '</div>' + key +
      (s.verified ? '' : '<div class="hint">Not published on the app' + String.fromCharCode(8217) + 's own domain: only add a key if you trust who runs it.</div>') +
      '</div>';
  }

  // The $names a plan's start message and steps use: those parameters
  // can't be removed here (the text needs them), only described.
  function usedParamNames(p) {
    var used = {};
    var pattern = new RegExp('[$]([a-z_][a-z0-9_]*)', 'g');
    var text = (p.startMessage || '') + ' ' + ((p.skill && p.skill.body) || '');
    var m;
    while ((m = pattern.exec(text))) used[m[1]] = true;
    return used;
  }

  function paramRowHtml(name, spec, used) {
    var fixed = name !== null;
    return '<div class="wf-param"' + (fixed ? ' data-name="' + esc(name) + '"' : '') + '>' +
      (fixed ? '<code class="wf-param-name">' + esc(name) + '</code>' : '<input class="wf-param-name" aria-label="Parameter name" placeholder="order_number">') +
      '<input class="wf-param-desc" aria-label="What it is" placeholder="What it is" value="' + esc((spec && spec.description) || '') + '">' +
      '<label><input type="checkbox" class="wf-param-required"' + (spec && spec.required ? ' checked' : '') + '> Required</label>' +
      (fixed && used[name] ? '<span class="hint">used in the steps</span>' : '<button type="button" class="wf-btn plain wf-param-remove">Remove</button>') +
      '</div>';
  }

  function paramsSectionHtml(p) {
    var used = usedParamNames(p);
    var names = Object.keys(p.parameters || {});
    return '<h3>What each run is given</h3>' +
      '<p class="hint" style="margin:0"><strong>Each run starts with:</strong> ' + esc(p.startMessage) + '</p>' +
      '<p class="hint" style="margin:0">' + (names.length
        ? 'Apps and people fill these in when they start a run; each $name in the start message and steps becomes its value.'
        : 'Every run is the same. Add a parameter if something changes from run to run, such as an order number.') + '</p>' +
      '<div class="wf-params" id="wfParams">' + names.map(function (n) { return paramRowHtml(n, p.parameters[n], used); }).join('') + '</div>' +
      '<div><button type="button" class="wf-btn plain" id="wfAddParam">Add a parameter</button></div>';
  }

  // The parameters as edited on the plan; an error message for a bad name.
  function readParams() {
    var parameters = {};
    var rows = page.querySelectorAll('#wfParams .wf-param');
    for (var i = 0; i < rows.length; i++) {
      var input = rows[i].querySelector('input.wf-param-name');
      var name = rows[i].dataset.name || (input ? input.value.trim() : '');
      if (!name) continue;
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) return { error: 'Parameter "' + name + '": use lowercase letters, digits and _, starting with a letter, e.g. order_number.' };
      if (parameters[name]) return { error: 'Parameter "' + name + '" is listed twice.' };
      parameters[name] = { description: rows[i].querySelector('.wf-param-desc').value.trim(), required: rows[i].querySelector('.wf-param-required').checked };
    }
    return { parameters: parameters };
  }

  // The webhook the plan makes: whose events, which ones, and what each
  // parameter is filled from. Made turned off; its signing secret comes
  // from the sender, after Create.
  function webhookPlanHtml(p) {
    var w = p.webhook;
    if (!w) return '';
    var who = SENDERS[w.sender] || w.sender;
    var lines = [];
    if (w.filter) lines.push('Runs for ' + esc(w.filter.path) + ' ' + esc(w.filter.values.join(' or ')));
    Object.keys(w.mapping || {}).forEach(function (param) { lines.push('<code>' + esc(param) + '</code> ' + String.fromCharCode(8592) + ' <code>' + esc(w.mapping[param]) + '</code> in the payload'); });
    return '<div class="wf-hook">' +
      '<label class="wf-notify"><input type="checkbox" id="wfWebhook" checked> <strong>' + (p.trigger.kind === 'schedule' ? 'Also start it from a webhook: ' : 'Webhook: ') + esc(w.name) + '</strong></label>' +
      '<span class="hint">' + esc(who) + ' calls a private URL and each event starts a run. It' + String.fromCharCode(8217) + 's made turned off; after Create you paste the URL into ' + esc(w.sender === 'custom' ? 'your app' : who) + ' and add the signing secret.</span>' +
      (lines.length ? '<ul class="hint">' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') +
      (w.setup ? '<span class="hint">' + esc(w.setup) + '</span>' : '') +
      '</div>';
  }

  function renderPlan(error) {
    var p = state.planned.plan;
    var suggested = p.target.kind === 'existing' && p.target.agent ? p.target.agent : '';
    var others = state.agents.filter(function (a) { return a !== suggested; });
    page.innerHTML =
      '<div class="wf-card">' +
        '<h2>' + esc(p.name) + '</h2><p style="margin:0">' + esc(p.summary) + '</p>' +
        '<p class="hint" style="margin:0"><strong>Starts:</strong> ' + esc(p.trigger.description) + (p.trigger.kind === 'schedule' ? ' (created paused; you turn it on)' : '') + '</p>' +
        webhookPlanHtml(p) +
        (p.trigger.kind === 'schedule' || p.trigger.kind === 'webhook'
          ? '<label class="wf-notify"><input type="checkbox" id="wfNotify"' + (p.notify && p.notify.on ? ' checked' : '') + '> Message me the result when it finishes <span class="hint">(through its Messaging tab: Slack, email, Lark or a webhook)</span></label>' +
            (p.notify && p.notify.reason ? '<p class="hint" style="margin:0 0 0 24px">' + esc(p.notify.reason) + '</p>' : '')
          : '') +
        paramsSectionHtml(p) +
        '<h3>Steps</h3>' +
        '<div class="le-table-wrap"><table class="wf-steps"><thead><tr><th></th><th>Step</th><th>Becomes</th><th>Checkpoint</th></tr></thead><tbody>' + p.steps.map(stepRow).join('') + '</tbody></table></div>' +
        (p.rules.length ? '<h3>Permissions it sets</h3><ul class="wf-list">' + p.rules.map(function (r) { return '<li><code>' + esc(r.tool) + '</code> ' + pill(r.decision) + '</li>'; }).join('') + '</ul>' : '') +
        (p.abilities.length ? '<h3>Abilities it uses</h3><ul class="wf-list">' + p.abilities.map(function (a) { return '<li><code>' + esc(a) + '</code></li>'; }).join('') + '</ul>' + (state.canInstall ? '' : '<p class="hint">Installing abilities needs LOOPENGINE_ADMIN_AUTH set; otherwise they head the checklist.</p>') : '') +
        (p.mcpServers && p.mcpServers.length ? '<h3>Apps it connects to</h3><div class="wf-mcp">' + p.mcpServers.map(mcpRow).join('') + '</div>' : '') +
        (p.apps && p.apps.length ? '<h3>Apps it uses</h3><ul class="wf-list">' + p.apps.map(function (a) { return '<li>' + esc(a.title) + ' <span class="hint">' + a.tools.length + ' tool' + (a.tools.length === 1 ? '' : 's') + '</span></li>'; }).join('') + '</ul><p class="hint" style="margin:0">Connected on the <a href="/config?section=apps">Apps</a> page; one that isn' + String.fromCharCode(8217) + 't connected yet heads the checklist.</p>' : '') +
        (p.skills && p.skills.length ? '<h3>Skills it comes with</h3><ul class="wf-list">' + p.skills.map(function (sk) { return '<li><code>' + esc(sk.id) + '</code> <span class="hint">' + esc(sk.description) + '</span></li>'; }).join('') + '</ul><p class="hint" style="margin:0">An agent that already has one keeps its own.</p>' : '') +
        (p.keys.length ? '<h3>Keys it needs</h3><p class="hint" style="margin:0">' + p.keys.map(esc).join(', ') + ' ' + DASH + ' you add them after, from the checklist.</p>' : '') +
        (p.needsApprovals ? '<p class="hint" style="margin:0">It asks you through the agent' + String.fromCharCode(8217) + 's primary messaging app (Messaging tab) when nobody is in Chat.</p>' : '') +
      '</div>' +
      (p.gaps.length ? '<div class="wf-gaps"><strong>Worth knowing</strong><ul>' + p.gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' : '') +
      (p.notes && p.notes.length ? '<div class="wf-card"><strong>After it' + String.fromCharCode(8217) + 's created, you also</strong><ul class="wf-list">' + p.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="wf-card"><h3 style="margin:0">Where it goes</h3>' +
        '<div class="wf-target">' +
          '<label><input type="radio" name="wfTarget" value="new"' + (suggested ? '' : ' checked') + '> A new agent, <code>' + esc(p.newAgent.name) + '</code></label>' +
          (suggested ? '<label><input type="radio" name="wfTarget" value="existing" data-agent="' + esc(suggested) + '" checked> Add to <code>' + esc(suggested) + '</code></label>' : '') +
          (others.length ? '<label><input type="radio" name="wfTarget" value="other"> Add to <select id="wfOther">' + others.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select></label>' : '') +
        '</div>' +
        (p.target.reason ? '<p class="hint" style="margin:0">' + esc(p.target.reason) + '</p>' : '') +
        '<div class="wf-instructions" id="wfNewAgentBox"' + (suggested ? ' hidden' : '') + '><label for="wfInstructions"><strong>Its instructions</strong> <span class="hint">read on every run of every workflow it has: who it is, rules it always follows, and anything marked (edit this). The steps are the workflow' + String.fromCharCode(8217) + 's.</span></label>' +
          '<textarea id="wfInstructions">' + esc(p.newAgent.systemPrompt) + '</textarea></div>' +
        '<p class="hint" style="margin:0" id="wfExistingNote"' + (suggested ? '' : ' hidden') + '>An agent you have keeps its own instructions; only the workflow, its abilities and permissions are added.</p>' +
        (state.planned.note ? '<p class="hint" style="margin:0"><strong>Note:</strong> ' + esc(state.planned.note) + '</p>' : '') +
        '<p class="hint" style="margin:0">Added to an existing agent, it keeps every decision that agent already has; any it would change are listed afterwards.</p>' +
      '</div>' +
      '<details class="wf-card"><summary><strong>The steps the agent follows</strong> <span class="hint">(saved as its skill <code>' + esc(p.id) + '</code>)</span></summary><div class="wf-skill">' + esc(p.skill.body) + '</div></details>' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfCreate">Create it</button><button type="button" class="wf-btn plain" id="wfBack">' + (state.planned.example ? 'Back to the examples' : 'Change the description') + '</button>' +
        '<span class="hint" id="wfStatus"></span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '');
    document.getElementById('wfBack').addEventListener('click', function () {
      var fromExample = state.planned.example;
      renderDescribe();
      if (fromExample) document.getElementById('examples').scrollIntoView();
    });
    var targets = page.querySelectorAll('input[name="wfTarget"]');
    for (var t = 0; t < targets.length; t++) {
      targets[t].addEventListener('change', function () {
        var isNew = page.querySelector('input[name="wfTarget"]:checked').value === 'new';
        document.getElementById('wfNewAgentBox').hidden = !isNew;
        document.getElementById('wfExistingNote').hidden = isNew;
      });
    }
    var paramsBox = document.getElementById('wfParams');
    paramsBox.addEventListener('click', function (ev) {
      if (ev.target.classList.contains('wf-param-remove')) ev.target.closest('.wf-param').remove();
    });
    document.getElementById('wfAddParam').addEventListener('click', function () {
      paramsBox.insertAdjacentHTML('beforeend', paramRowHtml(null, null, {}));
      paramsBox.lastElementChild.querySelector('input.wf-param-name').focus();
    });
    document.getElementById('wfCreate').addEventListener('click', function () {
      var edited = readParams();
      if (edited.error) { document.getElementById('wfStatus').textContent = edited.error; return; }
      p.parameters = edited.parameters;
      var notifyBox = document.getElementById('wfNotify');
      if (notifyBox) p.notify = { on: notifyBox.checked, reason: (p.notify && p.notify.reason) || '' };
      var webhookBox = document.getElementById('wfWebhook');
      if (webhookBox && !webhookBox.checked) {
        delete p.webhook;
        if (p.trigger.kind === 'webhook') p.trigger.kind = 'on_request';
      }
      p.newAgent.systemPrompt = document.getElementById('wfInstructions').value.trim() || p.newAgent.systemPrompt;
      var chosen = page.querySelector('input[name="wfTarget"]:checked');
      var target = chosen.value === 'new' ? { kind: 'new' } : { kind: 'existing', agent: chosen.value === 'other' ? document.getElementById('wfOther').value : chosen.dataset.agent };
      var btn = document.getElementById('wfCreate');
      btn.disabled = true;
      var mcpKeys = {};
      var keyInputs = page.querySelectorAll('[data-mcp-key]');
      for (var k = 0; k < keyInputs.length; k++) if (keyInputs[k].value.trim()) mcpKeys[keyInputs[k].dataset.mcpKey] = keyInputs[k].value.trim();
      document.getElementById('wfStatus').textContent = 'Creating' + ELLIPSIS + (p.mcpServers && p.mcpServers.length ? ' connecting to its apps and installing abilities can take a minute or two.' : ' installing abilities can take a minute.');
      post('/workflows/create', { plan: p, target: target, description: state.description, mcpKeys: mcpKeys }).then(function (r) {
        if (!r.ok) { renderPlan(r.body.error || 'Could not create it.'); return; }
        renderDone(r.body);
      }).catch(function (err) { renderPlan(err.message); });
    });
  }

  // ---- 3. Done ----
  function renderDone(c) {
    var agentHref = '/agents/config?agent=' + encodeURIComponent(c.agent) + '&tab=workflows';
    var items = c.checklist || [];
    page.innerHTML = '<div class="wf-card">' +
      '<h2>' + esc(c.workflow) + ' is ready</h2>' +
      '<p style="margin:0">' + (c.newAgent ? 'Created as a new agent, <code>' + esc(c.agent) + '</code>.' : 'Added to <code>' + esc(c.agent) + '</code>.') + '</p>' +
      (c.schedule ? '<p class="hint" style="margin:0">Its schedule (' + esc(c.schedule.description) + ') is paused: turn it on in the agent' + String.fromCharCode(8217) + 's Schedules tab when you' + String.fromCharCode(8217) + 're ready.</p>' : '') +
      (c.scheduleError ? '<p class="error">The schedule could not be created: ' + esc(c.scheduleError) + '</p>' : '') +
      webhookDoneHtml(c) +
      (c.loadError ? '<p class="error">The agent did not load: ' + esc(c.loadError) + '</p>' : '') +
      (c.abilities.failed.length ? '<p class="error">Not installed: ' + c.abilities.failed.map(function (f) { return esc(f.name) + ' (' + esc(f.error) + ')'; }).join('; ') + '</p>' : '') +
      (c.keptDecisions.length ? '<p class="hint" style="margin:0"><strong>Kept as they were:</strong> ' + c.keptDecisions.map(function (k) { return '<code>' + esc(k.tool) + '</code> stays ' + esc(LABELS[k.has]) + ' (the workflow wanted ' + esc(LABELS[k.wants]) + ')'; }).join('; ') + '. Change them in Permissions if you want.</p>' : '') +
      (items.length ? '<h3>Left to do</h3><ul class="wf-list">' + items.map(function (it) { return '<li>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:0">Nothing left to set up.</p>') +
      '<div class="wf-actions"><a class="wf-btn" href="' + agentHref + '">Open ' + esc(c.agent) + '</a><a class="wf-btn plain" href="/playground?agent=' + encodeURIComponent(c.agent) + '">Try it in Chat</a>' +
        '<button type="button" class="wf-btn plain" id="wfAnother">New workflow</button></div>' +
      '</div>';
    document.getElementById('wfAnother').addEventListener('click', function () { state.description = ''; state.planned = null; renderDescribe(); });
    wireWebhookDone(c);
  }

  // The webhook made with the workflow: its URL (shown this once), where
  // to paste it, and the signing secret that turns it on.
  function webhookDoneHtml(c) {
    if (c.webhookError) return '<p class="error">The webhook could not be made: ' + esc(c.webhookError) + '</p>';
    if (!c.webhook) return '';
    var t = c.webhook.trigger;
    var who = SENDERS[t.verify.sender] || t.verify.sender;
    var custom = t.verify.sender === 'custom';
    return '<div class="wf-hook" id="wfHookDone">' +
      '<strong>Turn on the webhook: ' + esc(t.name) + '</strong>' +
      '<span>1. Copy this URL into ' + esc(custom ? 'your app' : who + String.fromCharCode(8217) + 's webhook settings') + '. It' + String.fromCharCode(8217) + 's shown only this once; make a new one on the workflow if it' + String.fromCharCode(8217) + 's lost.</span>' +
      '<div class="wf-hook-row"><input id="wfHookUrl" readonly value="' + esc(c.webhook.url) + '"><button type="button" class="wf-btn plain" id="wfHookCopy">Copy</button></div>' +
      (c.webhook.setup ? '<span class="hint">' + esc(c.webhook.setup) + '</span>' : '') +
      '<span>2. ' + (custom
        ? 'Choose a signing secret. Your app signs each request body with it (HMAC-SHA256, hex) in the <code>' + esc(t.verify.header || 'X-Signature') + '</code> header.'
        : 'Paste the signing secret ' + esc(who) + ' shows for this webhook.') + '</span>' +
      (custom && !t.verify.header ? '<div class="wf-hook-row"><input id="wfHookHeader" placeholder="Signature header, e.g. X-Signature" value="X-Signature"></div>' : '') +
      '<div class="wf-hook-row"><input id="wfHookSecret" type="password" autocomplete="off" placeholder="Signing secret"><button type="button" class="wf-btn" id="wfHookOn">Turn it on</button></div>' +
      '<span class="hint" id="wfHookStatus">Until then it' + String.fromCharCode(8217) + 's off: nothing that reaches the URL starts a run.</span>' +
      '</div>';
  }

  function wireWebhookDone(c) {
    if (!c.webhook) return;
    var t = c.webhook.trigger;
    var status = document.getElementById('wfHookStatus');
    document.getElementById('wfHookCopy').addEventListener('click', function () {
      var input = document.getElementById('wfHookUrl');
      input.select();
      if (navigator.clipboard) navigator.clipboard.writeText(input.value);
      status.textContent = 'Copied.';
    });
    document.getElementById('wfHookOn').addEventListener('click', function () {
      var secret = document.getElementById('wfHookSecret').value.trim();
      if (!secret) { status.textContent = 'Paste the signing secret first.'; return; }
      var verify = { sender: t.verify.sender, secret: secret };
      if (t.verify.sender === 'custom') {
        var headerInput = document.getElementById('wfHookHeader');
        verify.header = headerInput ? headerInput.value.trim() : t.verify.header;
        verify.algorithm = t.verify.algorithm || 'sha256';
        verify.encoding = t.verify.encoding || 'hex';
        if (t.verify.prefix) verify.prefix = t.verify.prefix;
      }
      var btn = document.getElementById('wfHookOn');
      btn.disabled = true;
      status.textContent = 'Turning it on' + ELLIPSIS;
      fetch('/agents/' + encodeURIComponent(c.agent) + '/workflows/' + encodeURIComponent(t.workflow_id) + '/triggers/' + encodeURIComponent(t.trigger_id), {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verify: verify, enabled: true }),
      }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { status.textContent = r.body.error || 'Could not turn it on.'; return; }
        document.getElementById('wfHookSecret').value = '';
        status.textContent = 'On. ' + (t.filter ? 'Each ' + t.filter.values.join(' or ') + ' event' : 'Each event') + ' that reaches the URL now starts a run; deliveries show on the workflow' + String.fromCharCode(8217) + 's Webhooks.';
        btn.textContent = 'Update the secret';
      }).catch(function (err) { btn.disabled = false; status.textContent = err.message; });
    });
  }

  fetch('/workflows', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      state.ready = Boolean(d.ready);
      state.canInstall = Boolean(d.canInstallAbilities);
      state.agents = d.agents || [];
      state.examples = d.examples || [];
      renderDescribe();
    })
    .catch(function (err) { page.innerHTML = '<p class="error">Could not load: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
