// The HTML face of GET /agents. adapters/http.ts content-negotiates that
// route: a browser navigating there (Accept: text/html, ...) gets this
// page; a client fetching it programmatically (fetch()'s default
// Accept: */*, same as playground.ts and agents-config-page.ts's own
// fetch('/agents') calls) still gets the plain {agents: [...]} JSON body
// that route always returned, unchanged. See web/dev-ui-styles.ts for
// why the look is a shared import rather than a third copy of the same CSS.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const agentsListPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Agents</title>
<style>${devUiCss}
  #agentUl { list-style: none; margin: 0; padding: 0; }
  #agentUl li { display: contents; }
  .agent-card { display: grid; gap: 10px; align-content: start; }
  .agent-card .name { font-weight: 600; font-size: 15px; }
  .agent-card .prompt { font-size: 13px; color: var(--ink-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .agent-card .links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }
  .agent-card .links a { font-size: 12.5px; font-weight: 500; text-decoration: none; border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; color: var(--ink); }
  .agent-card .links a.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  #empty { color: var(--ink-muted); }
  .hint { font-size: 12px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); }
  #newAgentForm {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px;
    display: grid;
    gap: 12px;
    max-width: 560px;
  }
  #newAgentForm h2 { font-size: 15px; margin: 0; }
  #newAgentForm label { display: grid; gap: 4px; font-size: 13px; }
  #newAgentForm .row { display: flex; gap: 8px; flex-wrap: wrap; }
  #newAgentForm details summary { cursor: pointer; color: var(--ink-muted); font-size: 13px; }
  #newAgentForm details[open] { display: grid; gap: 10px; }
  #newAgentForm textarea { min-height: 72px; }
</style>
</head>
<body data-le-page="agents">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Agents</h1><p>Every agent under agents/ in this project. Open one to chat with it or change its tools, permissions and settings.</p></div>
      </div>
      <button type="button" id="newAgentBtn" class="primary">New agent</button>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page">
    <form id="newAgentForm" style="display:none">
      <h2>New agent</h2>
      <label>Name <span class="hint">(lowercase, hyphens allowed: becomes agents/&lt;name&gt;/)</span>
        <input type="text" name="name" placeholder="weather-agent" pattern="[a-z0-9]+(-[a-z0-9]+)*" required>
      </label>
      <details>
        <summary>Prompt and model (optional)</summary>
        <label>System prompt
          <textarea name="systemPrompt" placeholder="You are ..."></textarea>
        </label>
        <label>Model provider
          <select name="provider">
            <option value="anthropic">anthropic</option>
            <option value="openai">openai</option>
            <option value="deepseek">deepseek</option>
          </select>
        </label>
        <label>Model name <span class="hint">(required for openai/deepseek; defaults to claude-sonnet-5 for anthropic)</span>
          <input type="text" name="modelName" placeholder="claude-sonnet-5">
        </label>
      </details>
      <div class="row">
        <button type="submit">Create agent</button>
        <button type="button" id="cancelNewAgentBtn">Cancel</button>
      </div>
    </form>
    <p class="error" id="newAgentError" style="display:none"></p>
    <p class="hint" id="newAgentResult" style="display:none"></p>
    <ul id="agentUl" class="le-cards"></ul>
    <p id="empty" style="display:none">No agents yet. Create one above, or add a folder under agents/.</p>
  </div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var agentUl = document.getElementById('agentUl');
  var empty = document.getElementById('empty');
  var newAgentBtn = document.getElementById('newAgentBtn');
  var newAgentForm = document.getElementById('newAgentForm');
  var newAgentError = document.getElementById('newAgentError');
  var newAgentResult = document.getElementById('newAgentResult');
  var cancelNewAgentBtn = document.getElementById('cancelNewAgentBtn');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // (Re)loads the list from GET /agents — factored out so a successful
  // create can refresh it directly instead of duplicating this fetch.
  function loadAgents() {
    fetch('/agents')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var agents = data.agents || [];
        agentUl.textContent = '';
        if (!agents.length) {
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        for (var i = 0; i < agents.length; i++) {
          var agent = agents[i];
          var li = document.createElement('li');
          var qs = '?agent=' + encodeURIComponent(agent.name);
          li.innerHTML =
            '<div class="le-card agent-card">' +
            '<div class="name">' + escapeHtml(agent.name) + '</div>' +
            '<div class="prompt">' + escapeHtml(agent.systemPrompt) + '</div>' +
            '<div class="links">' +
            '<a class="primary" href="/playground' + qs + '">Chat</a>' +
            '<a href="/agents/config' + qs + '">Configure</a>' +
            '</div></div>';
          agentUl.appendChild(li);
        }
      })
      .catch(function (err) {
        empty.textContent = 'Could not load agents: ' + err.message;
        empty.style.display = 'block';
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
  newAgentBtn.addEventListener('click', function () {
    newAgentBtn.style.display = 'none';
    newAgentForm.style.display = 'grid';
    newAgentResult.style.display = 'none';
    newAgentForm.querySelector('input[name="name"]').focus();
  });

  cancelNewAgentBtn.addEventListener('click', function () {
    newAgentForm.style.display = 'none';
    newAgentBtn.style.display = '';
    newAgentError.style.display = 'none';
  });

  newAgentForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    newAgentError.style.display = 'none';
    var data = new FormData(newAgentForm);
    var submitBtn = newAgentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    // systemPrompt/model are both optional — see
    // adapters/http.ts's parseAgentTemplateOptions for the defaults
    // scaffoldAgent falls back to when either is left out of the body
    // entirely (blank/untouched Advanced fields are treated the same
    // as not sending them at all).
    var body = { name: data.get('name') };
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
        newAgentForm.style.display = 'none';
        newAgentBtn.style.display = '';
        newAgentForm.reset();
        newAgentResult.style.display = 'block';
        if (result.body.registered) {
          // Straight to the new agent, which also refreshes the sidebar's
          // agent list.
          location.href = '/agents/config?agent=' + encodeURIComponent(body.name);
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
