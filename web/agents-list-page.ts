// The HTML face of GET /agents. adapters/http.ts content-negotiates that
// route: a browser navigating there (Accept: text/html, ...) gets this
// page; a client fetching it programmatically (fetch()'s default
// Accept: */*, same as playground.ts and agents-config-page.ts's own
// fetch('/agents') calls) still gets the plain {agents: [...]} JSON body
// that route always returned, unchanged. See web/dev-ui-styles.ts for
// why the look is a shared import rather than a third copy of the same CSS.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'

export const agentsListPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Agents</title>
<style>${devUiCss}${MASCOT_CSS}
  .ag { max-width: 1120px; display: grid; gap: 0; }
  .ag-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 36px 32px 28px; border: 1px solid var(--line); border-bottom: 0; }
  .ag-hero .le-mascot { flex: none; margin-bottom: -6px; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .ag-cols2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ag-cols1 { grid-template-columns: minmax(0, 1fr); }
  .ag-cols1[hidden] { display: none; }
  .ag-card { display: grid; gap: 14px; align-content: start; padding: 20px 22px; background: var(--bg); }
  .ag-filler { background: var(--bg); }
  .ag-card-head { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
  .ag-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); color: var(--ink-muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
  .ag-icon svg { width: 16px; height: 16px; }
  .ag-icon.live { color: var(--good); }
  .ag-card-text { display: grid; gap: 3px; min-width: 0; }
  .ag-card-title { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; color: var(--ink); text-decoration: none; }
  a.ag-card-title:hover { text-decoration: underline; }
  .ag-id { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-faint); font-weight: 400; margin-left: 6px; }
  .ag-card-desc { font-size: 13px; line-height: 1.5; color: var(--ink-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .ag-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .ag-chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); font-size: 12px; color: var(--ink-muted); white-space: nowrap; text-decoration: none; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .ag-chip.strong { background: var(--surface); border-color: transparent; color: var(--ink); font-weight: 500; }
  .ag-chip.good { background: var(--good-soft); border-color: transparent; color: var(--good); font-weight: 600; }
  .ag-chip.warn { background: var(--warn-soft); border-color: transparent; color: var(--warn); font-weight: 600; }
  a.ag-chip:hover { color: var(--ink); border-color: var(--ink-faint); }
  .ag-actions { display: flex; gap: 8px; align-items: center; }
  .ag-actions a { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 13px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); color: var(--ink); background: var(--bg); }
  .ag-actions a:hover { background: var(--surface); }
  .ag-actions a.dark { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .ag-actions a.dark:hover { opacity: .88; }
  .ag-tile { display: grid; gap: 6px; align-content: start; padding: 22px; background: var(--bg); text-decoration: none; color: inherit; transition: background .15s; }
  .ag-tile:hover { background: var(--surface); }
  .ag-tile b { font-size: 15px; font-weight: 600; color: var(--ink); }
  .ag-tile span { font-size: 13px; color: var(--ink-muted); line-height: 1.45; }
  .ag-empty { padding: 40px 32px; text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--bg); grid-column: 1 / -1; margin: 0; }
  .ag-topbar-link { display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); font-size: 13.5px; font-weight: 500; color: var(--ink); text-decoration: none; }
  .ag-topbar-link:hover { background: var(--surface); }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); }
  #newAgentForm { padding: 22px 24px; background: var(--bg); display: grid; gap: 12px; }
  #newAgentForm h2 { font-size: 18px; font-weight: 500; margin: 0; }
  #newAgentForm label { display: grid; gap: 5px; font-size: 13px; font-weight: 500; max-width: 620px; }
  #newAgentForm .row { display: flex; gap: 8px; flex-wrap: wrap; }
  #newAgentForm textarea { min-height: 72px; }
  #newAgentError, #newAgentResult { margin: 12px 2px 0; }
  @media (max-width: 860px) {
    .ag-hero { padding: 24px 18px 20px; }
    .ag-hero .le-mascot { display: none; }
    .ag-cols2 { grid-template-columns: minmax(0, 1fr); }
    .le-search, .ag-topbar-link { display: none; }
  }
</style>
</head>
<body data-le-page="agents">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <header class="le-topbar">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <h1 class="le-topbar-title">Agents</h1>
    <span class="le-topbar-gap"></span>
    <label class="le-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="agSearch" placeholder="Search agents" aria-label="Search agents"></label>
    <a class="ag-topbar-link" href="/interview">Find your first agent</a>
    <button type="button" id="newAgentBtn" class="le-btn-dark">+ New agent</button>
  </header>
  <div class="le-scroll"><div class="le-page"><div class="ag">
    <div class="ag-hero"><div><h2 class="le-display">Your agents</h2><p class="le-display-sub" id="agSub">Each has its own instructions, tools and permissions. Open one to chat with it, give it workflows, or change how it works.</p></div>${mascotSvg(92)}</div>
    <div class="le-grid ag-cols1" id="newAgentWrap" hidden>
    <form id="newAgentForm">
      <p class="hint" style="margin:0">Not sure what to build? <a href="/interview">Find your first agent</a>: a short interview that suggests one and creates it. Then give it workflows, described in your own words or from an example.</p>
      <h2>New agent</h2>
      <label>Name <span class="hint">(what you'll see in the sidebar; you can change it later)</span>
        <input type="text" name="displayName" placeholder="Weather assistant" maxlength="60" required>
      </label>
      <label>ID <span class="hint">(lowercase and hyphens; its folder agents/&lt;id&gt;/ and API address use it, so it can't be changed later)</span>
        <input type="text" name="name" placeholder="weather-assistant" pattern="[a-z0-9]+(-[a-z0-9]+)*" required>
      </label>
      <label>Instructions <span class="hint">(who it is and the rules it always follows)</span>
        <textarea name="systemPrompt" placeholder="You are ..."></textarea>
      </label>
      <label>Model provider
        <select name="provider">
          <option value="openai" selected>openai</option>
          <option value="anthropic">anthropic</option>
          <option value="gemini">gemini</option>
          <option value="meta">meta</option>
          <option value="xai">xai</option>
          <option value="deepseek">deepseek</option>
          <option value="kimi">kimi</option>
          <option value="glm">glm</option>
        </select>
      </label>
      <label id="modelNameLabel">Model name <span class="hint">(choose Other&hellip; to type a model that isn't listed)</span>
        <input type="text" name="modelName" value="gpt-6-luna" placeholder="model name">
      </label>
      <div class="row">
        <button type="submit" class="le-btn-dark">Create agent</button>
        <button type="button" id="cancelNewAgentBtn">Cancel</button>
      </div>
    </form>
    </div>
    <div class="le-grid ag-cols2" id="agentUl"><p class="ag-empty">Loading&hellip;</p></div>
    <p class="error" id="newAgentError" style="display:none"></p>
    <p class="hint" id="newAgentResult" style="display:none"></p>
  </div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var agentUl = document.getElementById('agentUl');
  var newAgentBtn = document.getElementById('newAgentBtn');
  var newAgentWrap = document.getElementById('newAgentWrap');
  var newAgentForm = document.getElementById('newAgentForm');
  var newAgentError = document.getElementById('newAgentError');
  var newAgentResult = document.getElementById('newAgentResult');
  var cancelNewAgentBtn = document.getElementById('cancelNewAgentBtn');
  var search = document.getElementById('agSearch');
  var ICON_AGENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></svg>';

  var agents = [];
  var workflowsBy = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Each agent as a card: its name, its instructions in a line or two,
  // what it does (its workflows, from /workflows/overview), Chat and Open.
  function cardHtml(agent) {
    var qs = '?agent=' + encodeURIComponent(agent.name);
    var list = workflowsBy ? workflowsBy[agent.name] || [] : null;
    var live = list ? list.filter(function (w) { return w.live; }).length : 0;
    var chips = list === null ? '<span class="ag-chip">' + String.fromCharCode(8230) + '</span>'
      : list.length
        ? '<span class="ag-chip strong">' + list.length + (list.length === 1 ? ' workflow' : ' workflows') + '</span>' + (live ? '<span class="ag-chip good">' + live + ' running</span>' : '') +
          list.slice(0, 3).map(function (w) { return '<a class="ag-chip" href="/agents/config' + qs + '&tab=workflows&workflow=' + encodeURIComponent(w.id) + '" title="' + escapeHtml(w.title) + '">' + escapeHtml(w.title) + '</a>'; }).join('') +
          (list.length > 3 ? '<span class="hint">+' + (list.length - 3) + ' more</span>' : '')
        : '<a class="ag-chip" href="/workflows/new' + qs + '">No workflows yet: give it one</a>';
    return '<div class="ag-card">' +
      '<div class="ag-card-head"><span class="ag-icon' + (live ? ' live' : '') + '">' + ICON_AGENT + '</span>' +
        '<span class="ag-card-text"><a class="ag-card-title" href="/agents/config' + qs + '">' + escapeHtml(agent.displayName || agent.name) + (agent.displayName ? '<span class="ag-id">' + escapeHtml(agent.name) + '</span>' : '') + '</a>' +
          (agent.systemPrompt ? '<span class="ag-card-desc">' + escapeHtml(agent.systemPrompt) + '</span>' : '') + '</span>' +
        '<span class="ag-actions"><a class="dark" href="/playground' + qs + '">Chat</a><a href="/agents/config' + qs + '">Open</a></span></div>' +
      '<div class="ag-chips">' + chips + (agent.toSet ? '<a class="ag-chip warn" href="/agents/config' + qs + '&tab=env">' + agent.toSet + (agent.toSet === 1 ? ' setting' : ' settings') + ' to set</a>' : '') + '</div>' +
    '</div>';
  }

  function render() {
    var q = (search.value || '').trim().toLowerCase();
    var shown = agents.filter(function (a) { return !q || [a.name, a.displayName || '', a.systemPrompt || ''].join(' ').toLowerCase().indexOf(q) !== -1; });
    var total = workflowsBy ? Object.keys(workflowsBy).reduce(function (n, k) { return n + workflowsBy[k].length; }, 0) : 0;
    if (agents.length) document.getElementById('agSub').textContent = agents.length + (agents.length === 1 ? ' agent' : ' agents') + (total ? ', ' + total + (total === 1 ? ' workflow' : ' workflows') : '') + '. Open one to chat with it, give it workflows, or change how it works.';
    var tiles = q ? [] : ['<a class="ag-tile" href="/agents?new=1" data-new-tile><b>+ New agent</b><span>Its own instructions, tools and permissions, for one area of your work.</span></a>',
      '<a class="ag-tile" href="/interview"><b>Find an agent to build</b><span>A short interview suggests one that fits your work, and creates it.</span></a>'];
    var cells = shown.map(cardHtml).concat(tiles);
    agentUl.innerHTML = !agents.length && !q ? tiles.join('')
      : shown.length || tiles.length ? cells.join('') + (cells.length % 2 ? '<div class="ag-filler" aria-hidden="true"></div>' : '')
      : '<p class="ag-empty">No agent matches.</p>';
    var tile = agentUl.querySelector('[data-new-tile]');
    if (tile) tile.addEventListener('click', function (ev) { ev.preventDefault(); newAgentBtn.click(); });
  }
  search.addEventListener('input', render);

  // What each agent does, from its workflows.
  function fillWorkflows() {
    return fetch('/workflows/overview', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        workflowsBy = {};
        ((d && d.workflows) || []).forEach(function (w) { (workflowsBy[w.agent] = workflowsBy[w.agent] || []).push(w); });
        render();
      })
      .catch(function () {});
  }

  // (Re)loads the list from GET /agents.
  function loadAgents() {
    fetch('/agents')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        agents = data.agents || [];
        render();
      })
      .then(fillWorkflows)
      .catch(function (err) {
        agentUl.innerHTML = '<p class="ag-empty">Could not load agents: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // handleCreateAgent (adapters/http.ts) loads and registers the new
  // agent into the *running* server immediately — see its own doc
  // comment for why that's safe (a module that's never been imported
  // before has nothing stale to invalidate, unlike hot-reloading an
  // already-loaded agent's code would). registered: true means it's
  // genuinely live already, so this just re-fetches the list rather than
  // telling the operator to restart anything. registered: false is
  // the rare fallback (the file was scaffolded, but loading it back
  // failed for some reason) — that case still needs a real restart,
  // same as before this existed; loopengine dev picks it up
  // automatically via its own --include 'agents/*/index.ts' (see
  // bin/cli.ts's own comment there).
  // Only providers with a key saved can be chosen (leShell.applyProviderKeys).
  // With no key at all, the agent is created without a model (the
  // scaffold's default), so the provider and model fields are switched off
  // and the note says so. If the keys can't be read, nothing is disabled.
  var providerSelect = newAgentForm.querySelector('select[name="provider"]');
  var modelNameLabel = document.getElementById('modelNameLabel');
  var providerKeys = null;

  function applyProviderKeys() {
    if (!providerKeys) return;
    var any = leShell.applyProviderKeys(newAgentForm, providerKeys);
    providerSelect.disabled = !any;
    modelNameLabel.style.display = any ? '' : 'none';
  }

  // form.reset() after an agent is created goes back to the markup's
  // openai default even without a key; apply the keys again first. The
  // model dropdown's own reset listener is added later, so runs after.
  newAgentForm.addEventListener('reset', function () { setTimeout(applyProviderKeys, 0); });

  newAgentBtn.addEventListener('click', function () {
    newAgentBtn.style.display = 'none';
    newAgentWrap.hidden = false;
    newAgentResult.style.display = 'none';
    newAgentForm.querySelector('input[name="displayName"]').focus();
    // Checks which providers have keys, then loads the chosen provider's
    // models; both when the form opens, not on every visit to this page.
    // Starts on openai / gpt-6-luna (the markup's defaults) when openai
    // has a key.
    leShell.loadProviderKeys().then(function (keys) {
      providerKeys = keys;
      applyProviderKeys();
      if (!providerSelect.disabled) leShell.wireModelPicker(newAgentForm);
    });
  });

  // The id follows the name as it's typed ("Weather assistant" becomes
  // weather-assistant), until the id is typed in itself.
  var displayNameInput = newAgentForm.querySelector('input[name="displayName"]');
  var idInput = newAgentForm.querySelector('input[name="name"]');
  var idTyped = false;
  idInput.addEventListener('input', function () { idTyped = idInput.value !== ''; });
  displayNameInput.addEventListener('input', function () {
    if (idTyped) return;
    idInput.value = displayNameInput.value.toLowerCase().split("'").join('').split(String.fromCharCode(8217)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  });
  newAgentForm.addEventListener('reset', function () { idTyped = false; });

  cancelNewAgentBtn.addEventListener('click', function () {
    newAgentWrap.hidden = true;
    newAgentBtn.style.display = '';
    newAgentError.style.display = 'none';
  });

  newAgentForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    newAgentError.style.display = 'none';
    var data = new FormData(newAgentForm);
    var submitBtn = newAgentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    // A blank system prompt or model name is left out of the body — see
    // adapters/http.ts's parseAgentTemplateOptions for the defaults
    // scaffoldAgent falls back to then.
    var body = { name: data.get('name') };
    var displayName = data.get('displayName');
    if (displayName && displayName.trim()) body.displayName = displayName;
    var systemPrompt = data.get('systemPrompt');
    if (systemPrompt && systemPrompt.trim()) body.systemPrompt = systemPrompt;
    var provider = data.get('provider');
    if (provider) {
      body.model = { provider: provider };
      var modelName = data.get('modelName');
      if (modelName && modelName.trim()) body.model.model = modelName;
    }

    fetch('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        newAgentWrap.hidden = true;
        newAgentBtn.style.display = '';
        newAgentForm.reset();
        newAgentResult.style.display = 'block';
        if (result.body.registered) {
          // Straight to the new agent, which also refreshes the sidebar's
          // agent list; or back to planning a workflow that didn't fit the
          // agent it was first planned for, now in this one.
          var workflow = new URLSearchParams(location.search).get('workflow');
          location.href = workflow !== null
            ? '/workflows/new?agent=' + encodeURIComponent(body.name) + '&description=' + encodeURIComponent(workflow)
            : '/agents/config?agent=' + encodeURIComponent(body.name);
        } else {
          newAgentResult.textContent =
            'Created ' + result.body.path + ', but it could not be loaded into this running server' +
            (result.body.error ? ' (' + result.body.error + ')' : '') +
            '. Restart the server to pick it up — loopengine dev does this automatically.';
        }
      })
      .catch(function (err) {
        newAgentError.style.display = 'block';
        newAgentError.textContent = err.message;
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

  loadAgents();
  // The sidebar's "+ New" links here with ?new=1.
  if (new URLSearchParams(location.search).get('new')) newAgentBtn.click();
})();
</script>
</body>
</html>
`
