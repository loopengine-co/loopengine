// The console's "Build a workflow" page (/workflows/new): a person starts
// from a ready-made example (core/system-agents/workflow-examples.ts,
// which replace the old templates) or describes a workflow they already
// have in mind, and sees the plan (web/workflow-admin.ts behind /workflows/*): each
// step matched to a tool, the checkpoints where it asks them, the
// permissions, the abilities it needs and the agent it goes into, and
// creates it with one click. Same shell and styles as the other console
// pages; like them, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { WORKFLOW_SECTIONS_CSS, WORKFLOW_SECTIONS_SCRIPT } from './workflow-sections.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const workflowPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Build a workflow</title>
<style>${devUiCss}
  .wf { max-width: 860px; display: grid; gap: 18px; }
  .wf textarea { width: 100%; min-height: 130px; box-sizing: border-box; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
  .wf-ex-search { width: 100%; box-sizing: border-box; font: inherit; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
  .wf-ex-cats { display: flex; flex-wrap: wrap; gap: 6px; }
  .wf-ex-cats button { font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  .wf-ex-cats button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--bg); }
  .wf-ex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .wf-ex { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; background: var(--bg); }
  .wf-ex:hover { border-color: var(--accent); }
  .wf-ex-head { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .wf-ex-cat { font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); }
  .wf-ex strong { font-size: 14px; }
  .wf-ex p { margin: 0; font-size: 13px; color: var(--ink-muted); }
  .wf-ex-apps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; padding-top: 4px; }
  .wf-ex-apps span { font-size: 11.5px; padding: 1px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); color: var(--ink); }
  .wf-ex-asks strong { font-size: 12px; color: var(--warn); }
  .wf-ex .wf-btn { align-self: flex-start; margin-top: 4px; }
  .wf-ex-pager { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; }
  .wf-ex-pager button { font: inherit; font-size: 13px; font-weight: 600; min-width: 34px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
  .wf-ex-pager button:not(:disabled):not([aria-current]):hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-ex-pager button[aria-current] { background: var(--ink); border-color: var(--ink); color: var(--bg); }
  .wf-ex-pager button:disabled { opacity: 0.4; cursor: default; }
  .wf-instructions textarea { min-height: 180px; font-family: var(--font-mono); font-size: 12px; }
  .wf-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 10px; background: var(--bg); }
  .wf-card h2 { margin: 0; font-size: 18px; }
  .wf-card h3 { margin: 6px 0 0; font-size: 14px; }
  .wf-steps { width: 100%; border-collapse: collapse; }
  .wf-steps td, .wf-steps th { text-align: left; padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; font-size: 13px; }
  .wf-steps th { font-size: 12px; color: var(--ink-muted); font-weight: 600; border-top: 0; }
  .wf-num { width: 24px; color: var(--ink-muted); }
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
  .wf textarea.wf-skill-edit { min-height: min(50vh, 420px); font-family: var(--font-mono); font-size: 12.5px; }
  ${WORKFLOW_SECTIONS_CSS}
  .wf-skill { white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; max-height: 280px; overflow: auto; }
  .wf-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .wf-btn { display: inline-block; padding: 7px 14px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; background: var(--accent); color: var(--on-accent); border: 0; cursor: pointer; }
  .wf-btn.plain { background: none; color: var(--ink); border: 1px solid var(--line); font-weight: 500; }
  .wf-btn:disabled { opacity: 0.6; cursor: progress; }
  /* The console's own button hover turns any button grey; these keep their
     colours and just brighten (or, plain ones, get a soft fill). */
  .wf-btn:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); filter: brightness(1.08); }
  .wf-btn.plain:hover:not(:disabled) { background: var(--surface); color: var(--ink); filter: none; }
  .wf-agent { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13.5px; }
  .wf-agent select { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); max-width: 100%; }
  .wf-needs { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .wf-needs li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13.5px; }
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
        <div><h1>Build a workflow</h1><p>Describe what you want done, or start from an example. You get a draft to check before anything is created.</p></div>
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
  // ?description= comes back from making a new agent for a workflow that
  // didn't fit the agent it was planned for.
  var state = { description: new URLSearchParams(location.search).get('description') || '', planned: null, agent: new URLSearchParams(location.search).get('agent') || '', agents: [], examples: [], messages: [], ready: false, canInstall: false, exQuery: '', exCat: 'All', exPage: 1 };
  var EX_PAGE = 6;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function agentLabel(name) {
    var a = state.agents.filter(function (x) { return x.name === name; })[0];
    return a && a.displayName ? a.displayName : name;
  }
  // The agent picker: a workflow always goes into an agent.
  function agentPickerHtml() {
    if (!state.agents.length) return '<p class="error" style="margin:0">A workflow goes into an agent, and there are none yet. <a href="/agents">Create an agent</a> first, or <a href="/interview">find your first agent</a>.</p>';
    return '<label class="wf-agent" for="wfAgent"><strong>Agent</strong> <select id="wfAgent">' +
      (state.agent ? '' : '<option value="">Choose the agent it goes into' + ELLIPSIS + '</option>') +
      state.agents.map(function (a) { return '<option value="' + esc(a.name) + '"' + (a.name === state.agent ? ' selected' : '') + '>' + esc(a.displayName || a.name) + (a.displayName ? ' (' + esc(a.name) + ')' : '') + '</option>'; }).join('') +
      '</select> <span class="hint">It uses this agent' + String.fromCharCode(8217) + 's apps and messaging.</span></label>';
  }
  function pill(decision) {
    return '<span class="le-pill ' + esc(decision) + '">' + esc(LABELS[decision] || decision) + '</span>';
  }

  // ---- 1. Describe it ----
  function renderDescribe(error) {
    page.innerHTML =
      (state.ready ? '' : '<p class="error">Building needs a model: set one on an agent (Overview ' + String.fromCharCode(8594) + ' Model) and add its key under <a href="/config?section=models">Models</a>.</p>') +
      '<div class="wf-card">' + agentPickerHtml() + '<label for="wfText"><strong>Your workflow</strong> <span class="hint">what starts it, the steps in order, and where you want to choose or approve</span></label>' +
      '<textarea id="wfText" placeholder="Every Monday, find blog ideas on the web, ask me on Slack to pick one, draft it, and let me review it before it goes up.">' + esc(state.description) + '</textarea>' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfPlan"' + (state.ready ? '' : ' disabled') + '>Build</button>' +
        '<span class="hint" id="wfStatus">It looks at the agent and your abilities first; this can take a few minutes.</span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '') +
      '</div>' +
      '<p class="hint">Rather start from something ready-made? <a href="#examples">Choose a workflow example</a>, or <a href="/interview">find your first agent</a>.</p>' +
      examplesHtml();
    var text = document.getElementById('wfText');
    var picker = document.getElementById('wfAgent');
    if (picker) picker.addEventListener('change', function () { state.agent = picker.value; });
    if (!state.agents.length) document.getElementById('wfPlan').disabled = true;
    wireExamples();
    if (location.hash === '#examples') {
      var box = document.getElementById('examples');
      if (box) box.scrollIntoView();
    }
    document.getElementById('wfPlan').addEventListener('click', function () {
      state.description = text.value.trim();
      if (!state.agent) { document.getElementById('wfStatus').textContent = 'Choose the agent it goes into first.'; return; }
      var btn = document.getElementById('wfPlan');
      btn.disabled = true;
      document.getElementById('wfStatus').textContent = 'Building' + ELLIPSIS + ' looking at ' + agentLabel(state.agent) + ' and your abilities. This can take a few minutes; keep this page open.';
      var started = Date.now();
      post('/workflows/plan', { description: state.description, agent: state.agent }).then(function (r) {
        if (!r.ok) { renderDescribe(r.body.error || 'Could not build it.'); return; }
        waitForPlan(r.body.id, started);
      }).catch(function (err) { renderDescribe(err.message); });
    });
  }

  // Examples: the ready-made ones (a plan, no model call) and the rest as
  // messages (they fill in the description, for the planner), searched,
  // filtered by area and paged.
  function allExamples() {
    return state.examples.map(function (e) {
      return { id: e.id, category: e.category, title: e.plan.name, message: e.message, apps: e.apps || [], asksFirst: e.asksFirst || [], ready: true };
    }).concat(state.messages.map(function (m) {
      return { id: m.id, category: m.category, title: m.title, message: m.message, apps: m.apps || [], asksFirst: m.asksFirst || [], ready: false };
    }));
  }

  function examplesHtml() {
    if (!state.examples.length && !state.messages.length) return '';
    return '<div class="wf-card" id="examples"><h2>Start from an example</h2>' +
      '<p class="hint" style="margin:0">Ready-made ones open the draft straight away. The rest fill in the description above, for you to change and build.</p>' +
      '<input type="search" class="wf-ex-search" id="wfExSearch" placeholder="Search examples, e.g. invoices, GitHub, Shopify" aria-label="Search examples" value="' + esc(state.exQuery) + '">' +
      '<div class="wf-ex-cats" id="wfExCats" role="group" aria-label="Filter examples"></div>' +
      '<div class="wf-ex-grid" id="wfExList"></div>' +
      '<nav class="wf-ex-pager" id="wfExPager" aria-label="Example pages"></nav>' +
      '</div>';
  }

  function exampleMatches(e) {
    if (state.exCat !== 'All' && e.category !== state.exCat) return false;
    var q = state.exQuery.trim().toLowerCase();
    if (!q) return true;
    var text = (e.title + ' ' + e.message + ' ' + e.category + ' ' + e.apps.join(' ')).toLowerCase();
    return q.split(' ').every(function (word) { return !word || text.indexOf(word) !== -1; });
  }

  // The page numbers to show: first, last and around the current one.
  function pageNumbers(current, count) {
    var out = [];
    for (var n = 1; n <= count; n++) {
      if (n === 1 || n === count || Math.abs(n - current) <= 1) out.push(n);
      else if (out[out.length - 1] !== null) out.push(null);
    }
    return out;
  }

  function renderExampleList() {
    var list = document.getElementById('wfExList');
    if (!list) return;
    var all = allExamples();
    var cats = ['All'];
    all.forEach(function (e) { if (cats.indexOf(e.category) === -1) cats.push(e.category); });
    document.getElementById('wfExCats').innerHTML = cats.map(function (c) {
      return '<button type="button" data-ex-cat="' + esc(c) + '" aria-pressed="' + (c === state.exCat) + '">' + esc(c) + '</button>';
    }).join('');
    var matching = all.filter(exampleMatches);
    var pages = Math.max(1, Math.ceil(matching.length / EX_PAGE));
    if (state.exPage > pages) state.exPage = pages;
    var shown = matching.slice((state.exPage - 1) * EX_PAGE, state.exPage * EX_PAGE);
    list.innerHTML = shown.length ? shown.map(function (e) {
      return '<div class="wf-ex">' +
        '<div class="wf-ex-head"><span class="wf-ex-cat">' + esc(e.category) + '</span>' + (e.ready ? '<span class="le-pill good">Ready-made</span>' : '') + '</div>' +
        '<strong>' + esc(e.title) + '</strong>' +
        '<p>' + String.fromCharCode(8220) + esc(e.message) + String.fromCharCode(8221) + '</p>' +
        (e.apps.length ? '<div class="wf-ex-apps">' + e.apps.map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
        (e.asksFirst.length ? '<p class="wf-ex-asks"><strong>Asks you before:</strong> ' + esc(e.asksFirst.join('; ')) + '</p>' : '') +
        '<button type="button" class="wf-btn plain" data-example="' + esc(e.id) + '">' + (e.ready ? 'Use this draft' : 'Use this') + '</button>' +
        '</div>';
    }).join('') : '<p class="hint">No examples match ' + String.fromCharCode(8220) + esc(state.exQuery.trim()) + String.fromCharCode(8221) + (state.exCat === 'All' ? '' : ' in ' + esc(state.exCat)) + '. Describe it in your own words above instead.</p>';
    var pager = document.getElementById('wfExPager');
    pager.innerHTML = pages > 1
      ? '<button type="button" data-ex-page="' + (state.exPage - 1) + '"' + (state.exPage === 1 ? ' disabled' : '') + '>' + String.fromCharCode(8249) + ' Previous</button>' +
        pageNumbers(state.exPage, pages).map(function (n) {
          return n === null ? '<span class="hint" aria-hidden="true">' + ELLIPSIS + '</span>'
            : '<button type="button" data-ex-page="' + n + '" aria-label="Page ' + n + '"' + (n === state.exPage ? ' aria-current="page"' : '') + '>' + n + '</button>';
        }).join('') +
        '<button type="button" data-ex-page="' + (state.exPage + 1) + '"' + (state.exPage === pages ? ' disabled' : '') + '>Next ' + String.fromCharCode(8250) + '</button>'
      : '';
  }

  function wireExamples() {
    var box = document.getElementById('examples');
    if (!box) return;
    renderExampleList();
    document.getElementById('wfExSearch').addEventListener('input', function (ev) {
      state.exQuery = ev.target.value;
      state.exPage = 1;
      renderExampleList();
    });
    box.addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.exCat) { state.exCat = t.dataset.exCat; state.exPage = 1; renderExampleList(); return; }
      if (t.dataset.exPage) { state.exPage = Number(t.dataset.exPage); renderExampleList(); box.scrollIntoView({ block: 'start' }); return; }
      if (t.dataset.example) useExample(t.dataset.example);
    });
  }

  // A ready-made example opens its plan; any other fills in the
  // description, to change and plan.
  function useExample(id) {
    if (state.examples.some(function (e) { return e.id === id; })) { openExample(id); return; }
    var m = state.messages.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    state.description = m.message;
    renderDescribe();
    window.scrollTo(0, 0);
    var text = document.getElementById('wfText');
    text.focus();
    var status = document.getElementById('wfStatus');
    if (status) status.textContent = 'Change it to fit what you need, then build it.';
  }

  function openExample(id) {
    var e = state.examples.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    if (!state.agent) {
      window.scrollTo(0, 0);
      var picker = document.getElementById('wfAgent');
      if (picker) picker.focus();
      var status = document.getElementById('wfStatus');
      if (status) status.textContent = 'Choose the agent it goes into first, then use the example.';
      return;
    }
    // A copy: the review screen edits the plan it shows. Its message is
    // the workflow's original message, as a typed one would be.
    var plan = JSON.parse(JSON.stringify(e.plan));
    post('/workflows/check', { plan: plan, agent: state.agent }).then(function (r) {
      if (!r.ok) { renderDescribe(r.body.error || 'Could not open the example.'); return; }
      state.description = e.message;
      state.planned = { plan: plan, example: e.id, agent: r.body.agent, check: r.body.check, requirements: r.body.requirements };
      renderPlan();
      window.scrollTo(0, 0);
    }).catch(function (err) { renderDescribe(err.message); });
  }

  // Planning runs on the server as a job; check on it every few seconds.
  function waitForPlan(id, started) {
    setTimeout(function () {
      fetch('/workflows/plan/' + encodeURIComponent(id), { cache: 'no-store' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (r) {
          if (!r.ok) { renderDescribe(r.body.error || 'Could not build it.'); return; }
          if (r.body.status === 'planning') {
            var status = document.getElementById('wfStatus');
            if (status) status.textContent = 'Building' + ELLIPSIS + ' ' + Math.round((Date.now() - started) / 1000) + 's so far. It looks at the agent and your abilities first; keep this page open.';
            waitForPlan(id, started);
            return;
          }
          if (r.body.status === 'failed') { renderDescribe(r.body.error || 'Could not build it.'); return; }
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

  // What the agent still needs: each app the steps use, and messaging
  // when runs reach the person outside Chat. Create waits for all of it.
  function needsHtml(reqs) {
    if (!reqs || !reqs.length) return '';
    var missing = reqs.filter(function (r) { return !r.ready; }).length;
    return '<div class="wf-card" id="wfNeeds"><h3 style="margin:0">' + (missing ? 'Before you create it' : 'What it uses') + '</h3>' +
      '<ul class="wf-needs">' + reqs.map(function (r) {
        return '<li>' + (r.ready ? '<span class="le-pill allow">Ready</span>' : '<span class="le-pill bad">Missing</span>') + ' <strong>' + esc(r.title) + '</strong>' +
          (r.ready ? (r.note ? ' <span class="hint">' + esc(r.note) + '</span>' : '') : ' <span class="hint">' + esc(r.todo) + '</span>' + (r.href ? ' <a href="' + esc(r.href) + '" target="_blank" rel="noopener">Open</a>' : '')) + '</li>';
      }).join('') + '</ul>' +
      (missing ? '<div class="wf-actions"><button type="button" class="wf-btn plain" id="wfRecheck">Check again</button><span class="hint" id="wfRecheckStatus">Add ' + (missing === 1 ? 'it' : 'them') + ' (it opens in a new tab), then check again.</span></div>' : '') +
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
    // One turned off on this screen is still shown, to turn back on.
    var w = p.webhook || (state.planned && state.planned.webhookOff);
    if (!w) return '';
    var who = SENDERS[w.sender] || w.sender;
    var lines = [];
    if (w.filter) lines.push('Runs for ' + esc(w.filter.path) + ' ' + esc(w.filter.values.join(' or ')));
    Object.keys(w.mapping || {}).forEach(function (param) { lines.push('<code>' + esc(param) + '</code> ' + String.fromCharCode(8592) + ' <code>' + esc(w.mapping[param]) + '</code> in the payload'); });
    return '<div class="wf-hook">' +
      '<label class="wf-notify"><input type="checkbox" id="wfWebhook"' + (p.webhook ? ' checked' : '') + '> <strong>' + (p.trigger.kind === 'schedule' ? 'Also start it from a webhook: ' : 'Webhook: ') + esc(w.name) + '</strong></label>' +
      '<span class="hint">' + esc(who) + ' calls a private URL and each event starts a run. It' + String.fromCharCode(8217) + 's made turned off; after Create you paste the URL into ' + esc(w.sender === 'custom' ? 'your app' : who) + ' and add the signing secret.</span>' +
      (lines.length ? '<ul class="hint">' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>' : '') +
      (w.setup ? '<span class="hint">' + esc(w.setup) + '</span>' : '') +
      '</div>';
  }

  function renderPlan(error) {
    var p = state.planned.plan;
    var agent = state.planned.agent || state.agent;
    var reqs = state.planned.requirements || [];
    // The planner thinks the job isn't this agent's kind of work: the
    // person makes a new agent for it, or adds it here anyway.
    var misfit = p.fit && p.fit.matches === false && !state.planned.example;
    var fitPending = misfit && !state.planned.fitOk;
    var blocked = fitPending || reqs.some(function (r) { return !r.ready; });
    var conflicts = (state.planned.check && state.planned.check.conflicts) || [];
    var context = typeof p.context === 'string' ? p.context : workflowContextFrom(p.newAgent && p.newAgent.systemPrompt);
    page.innerHTML =
      (fitPending
        ? '<div class="wf-gaps wf-fit"><strong>This doesn' + String.fromCharCode(8217) + 't look like ' + esc(agentLabel(agent)) + String.fromCharCode(8217) + 's work</strong>' +
            '<p style="margin:0">' + esc(p.fit.reason) + ' A new agent keeps its instructions, apps and permissions separate.</p>' +
            '<div class="wf-actions"><a class="wf-btn" href="/agents?new=1&workflow=' + encodeURIComponent(state.description) + '">Create a new agent for it</a>' +
            '<button type="button" class="wf-btn plain" id="wfFitOk">Add it to ' + esc(agentLabel(agent)) + ' anyway</button></div></div>'
        : '') +
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
        (p.skills && p.skills.length ? '<h3>Skills it comes with</h3><ul class="wf-list">' + p.skills.map(function (sk) { return '<li><code>' + esc(sk.id) + '</code> <span class="hint">' + esc(sk.description) + '</span></li>'; }).join('') + '</ul><p class="hint" style="margin:0">An agent that already has one keeps its own.</p>' : '') +
        (p.keys.length ? '<h3>Keys it needs</h3><p class="hint" style="margin:0">' + p.keys.map(esc).join(', ') + ' ' + DASH + ' you add them after, from the checklist.</p>' : '') +
        (p.needsApprovals ? '<p class="hint" style="margin:0">When it needs your approval or an answer, it asks you in Chat if you' + String.fromCharCode(8217) + 're running it there. Otherwise it sends the request to the app on its Messaging tab: Slack, Telegram, email or another you choose.</p>' : '') +
      '</div>' +
      (p.gaps.length ? '<div class="wf-gaps"><strong>Worth knowing</strong><ul>' + p.gaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' : '') +
      (p.notes && p.notes.length ? '<div class="wf-card"><strong>After it' + String.fromCharCode(8217) + 's created, you also</strong><ul class="wf-list">' + p.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<div class="wf-card"><h3 style="margin:0">Goes into ' + esc(agentLabel(agent)) + '</h3>' +
        '<div class="wf-instructions"><label for="wfContext"><strong>Rules and facts for this workflow</strong> <span class="hint">Short facts the job needs that the agent' + String.fromCharCode(8217) + 's own instructions don' + String.fromCharCode(8217) + 't say, like your company' + String.fromCharCode(8217) + 's name or who signs messages. They go at the top of this workflow' + String.fromCharCode(8217) + 's instructions. It' + String.fromCharCode(8217) + 's left empty when the agent already knows enough. Longer rules, special cases and examples go with the steps, below.</span></label>' +
          '<textarea id="wfContext" placeholder="Nothing extra needed. Add facts the agent must know for this job, one per line, e.g. your company name, who signs messages, or a limit it must keep to.">' + esc(context) + '</textarea></div>' +
        (conflicts.length ? '<p class="hint" style="margin:0"><strong>Kept as they are:</strong> ' + conflicts.map(function (c) { return '<code>' + esc(c.tool) + '</code> stays ' + esc(LABELS[c.has]) + ' (the workflow wants ' + esc(LABELS[c.wants]) + ')'; }).join('; ') + '. Change them in Permissions if you want.</p>' : '') +
        '<p class="hint" style="margin:0">It keeps every decision the agent already has.</p>' +
        (misfit && !fitPending ? '<p class="hint" style="margin:0">You chose to add it here, though it' + String.fromCharCode(8217) + 's not this agent' + String.fromCharCode(8217) + 's usual work.</p>' : '') +
      '</div>' +
      needsHtml(reqs) +
      '<div class="wf-card"><label for="wfSkill"><strong>The steps the agent follows</strong> <span class="hint">(saved as its skill <code>' + esc(p.id) + '</code>; edit them here, or later from the workflow' + String.fromCharCode(8217) + 's Edit)</span></label>' +
        '<textarea id="wfSkill" class="wf-skill-edit">' + esc(p.skill.body) + '</textarea>' +
        '<div class="wp-sections"><span class="hint">Add a section:</span>' + workflowSectionButtonsHtml() + '</div>' +
        '<p class="hint" style="margin:0">Long inputs, like an email or a thread, aren' + String.fromCharCode(8217) + 't written here: each run adds them at the end, under their descriptions.</p></div>' +
      '<div class="wf-actions"><button type="button" class="wf-btn" id="wfCreate"' + (blocked ? ' disabled' : '') + '>Create it</button><button type="button" class="wf-btn plain" id="wfBack">' + (state.planned.example ? 'Back to the examples' : 'Change the description') + '</button>' +
        '<span class="hint" id="wfStatus">' + (fitPending ? 'Choose where it goes, above, first.' : '') + '</span></div>' +
      (error ? '<p class="error">' + esc(error) + '</p>' : '');
    document.querySelector('.wp-sections').addEventListener('click', function (ev) {
      addWorkflowSection(document.getElementById('wfSkill'), ev.target.dataset && ev.target.dataset.section);
    });
    var fitOk = document.getElementById('wfFitOk');
    if (fitOk) fitOk.addEventListener('click', function () {
      p.context = document.getElementById('wfContext').value;
      p.skill.body = document.getElementById('wfSkill').value;
      state.planned.fitOk = true;
      renderPlan();
    });
    document.getElementById('wfBack').addEventListener('click', function () {
      var fromExample = state.planned.example;
      renderDescribe();
      if (fromExample) document.getElementById('examples').scrollIntoView();
    });
    // Checks what the agent needs again, with the plan as edited so far
    // (sending results, or a webhook, can need messaging).
    function checkAgain() {
      var recheck = document.getElementById('wfRecheck');
      if (recheck) recheck.disabled = true;
      var status = document.getElementById('wfRecheckStatus');
      if (status) status.textContent = 'Checking' + ELLIPSIS;
      // Kept as edited while it re-renders.
      p.context = document.getElementById('wfContext').value;
      p.skill.body = document.getElementById('wfSkill').value;
      var notifyBox = document.getElementById('wfNotify');
      if (notifyBox) p.notify = { on: notifyBox.checked, reason: (p.notify && p.notify.reason) || '' };
      var hookBox = document.getElementById('wfWebhook');
      if (hookBox && !hookBox.checked) { state.planned.webhookOff = p.webhook; delete p.webhook; if (p.trigger.kind === 'webhook') { p.trigger.kind = 'on_request'; state.planned.wasWebhook = true; } }
      if (hookBox && hookBox.checked && state.planned.webhookOff) { p.webhook = state.planned.webhookOff; delete state.planned.webhookOff; if (state.planned.wasWebhook) { p.trigger.kind = 'webhook'; delete state.planned.wasWebhook; } }
      post('/workflows/check', { plan: p, agent: agent }).then(function (r) {
        if (!r.ok) { renderPlan(r.body.error || 'Could not check.'); return; }
        state.planned.requirements = r.body.requirements;
        state.planned.check = r.body.check;
        renderPlan();
      }).catch(function (err) { renderPlan(err.message); });
    }
    var recheck = document.getElementById('wfRecheck');
    if (recheck) recheck.addEventListener('click', checkAgain);
    var notifyToggle = document.getElementById('wfNotify');
    if (notifyToggle) notifyToggle.addEventListener('change', checkAgain);
    var hookToggle = document.getElementById('wfWebhook');
    if (hookToggle) hookToggle.addEventListener('change', checkAgain);
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
      p.context = document.getElementById('wfContext').value;
      p.skill.body = document.getElementById('wfSkill').value;
      var btn = document.getElementById('wfCreate');
      btn.disabled = true;
      document.getElementById('wfStatus').textContent = 'Creating' + ELLIPSIS + ' installing abilities can take a minute.';
      var body = { plan: p, agent: agent, description: state.description, workflowContext: p.context };
      post('/workflows/create', body).then(function (r) {
        if (!r.ok) { renderPlan(r.body.error || 'Could not create it.'); return; }
        renderDone(r.body);
      }).catch(function (err) { renderPlan(err.message); });
    });
  }

  ${WORKFLOW_SECTIONS_SCRIPT}

  // A ready-made example's standing instructions, for the workflow: its
  // rules and facts, without the opening paragraph that says who the
  // agent is ("You help ..."), since the agent has its own.
  function workflowContextFrom(systemPrompt) {
    var NL = String.fromCharCode(10);
    var parts = String(systemPrompt || '').trim().split(NL + NL);
    if (parts.length && /^You /.test(parts[0])) parts.shift();
    return parts.join(NL + NL).trim();
  }

  // ---- 3. Done ----
  function renderDone(c) {
    var agentHref = '/agents/config?agent=' + encodeURIComponent(c.agent) + '&tab=workflows';
    var items = c.checklist || [];
    page.innerHTML = '<div class="wf-card">' +
      '<h2>' + esc(c.workflow) + ' is ready</h2>' +
      '<p style="margin:0">Added to ' + esc(agentLabel(c.agent)) + '.</p>' +
      (c.schedule ? '<p class="hint" style="margin:0">Its schedule (' + esc(c.schedule.description) + ') is paused: turn it on in the agent' + String.fromCharCode(8217) + 's Schedules tab when you' + String.fromCharCode(8217) + 're ready.</p>' : '') +
      (c.scheduleError ? '<p class="error">The schedule could not be created: ' + esc(c.scheduleError) + '</p>' : '') +
      webhookDoneHtml(c) +
      (c.loadError ? '<p class="error">The agent did not load: ' + esc(c.loadError) + '</p>' : '') +
      (c.abilities.failed.length ? '<p class="error">Not installed: ' + c.abilities.failed.map(function (f) { return esc(f.name) + ' (' + esc(f.error) + ')'; }).join('; ') + '</p>' : '') +
      (c.keptDecisions.length ? '<p class="hint" style="margin:0"><strong>Kept as they were:</strong> ' + c.keptDecisions.map(function (k) { return '<code>' + esc(k.tool) + '</code> stays ' + esc(LABELS[k.has]) + ' (the workflow wanted ' + esc(LABELS[k.wants]) + ')'; }).join('; ') + '. Change them in Permissions if you want.</p>' : '') +
      (items.length ? '<h3>Left to do</h3><ul class="wf-list">' + items.map(function (it) { return '<li>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:0">Nothing left to set up.</p>') +
      '<div class="wf-actions"><a class="wf-btn" href="' + agentHref + '">Open ' + esc(agentLabel(c.agent)) + '</a><a class="wf-btn plain" href="/playground?agent=' + encodeURIComponent(c.agent) + '">Try it in Chat</a>' +
        '<button type="button" class="wf-btn plain" id="wfAnother">Build another</button></div>' +
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
      // Names from an older server, objects from this one.
      state.agents = (d.agents || []).map(function (a) { return typeof a === 'string' ? { name: a } : a; });
      if (state.agent && !state.agents.some(function (a) { return a.name === state.agent; })) state.agent = '';
      if (!state.agent && state.agents.length === 1) state.agent = state.agents[0].name;
      state.examples = d.examples || [];
      state.messages = d.messages || [];
      renderDescribe();
    })
    .catch(function (err) { page.innerHTML = '<p class="error">Could not load: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
