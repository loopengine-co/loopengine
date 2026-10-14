// A local dev page: a single self-contained HTML page (no build step, no
// framework, no CDN) served by adapters/http.ts at GET /config — the
// account-wide counterpart to web/agents-config-page.ts's per-agent
// Overview/Skills/Tools/ActAuth tabs (served separately at
// /agents/config, deliberately left untouched by this page). A left
// sidebar picks between Models (which providers this deployment can
// call, and which agents use which) and Gateways (whether the composio
// CLI is authenticated on this machine) — see global-config.ts for where
// that data actually comes from. "Agents" is a plain link out to
// /agents/config, not a third client-rendered section here: that page
// already owns the full per-agent picture, duplicating or embedding it
// would just be two places for the same UI to drift apart.
//
// Embedded as a TS string (not a separate .html file), same reasoning as
// web/playground.ts: tsc's ordinary compile emits it straight into
// dist/adapters/ alongside http.js, no asset-copy step needed. Plain
// string concatenation, not a nested template literal, for the same
// backtick/${}-escaping reason playground.ts's own header comment
// explains — see also the memory note on this file's double-escaping
// hazard (template-literal escapes run twice: once when this constant
// is built, once when a browser parses the served <script> as JS).
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const globalConfigPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Settings</title>
<style>${devUiCss}
  section { margin-bottom: 28px; }
  section h3 { font-size: 15px; font-weight: 600; margin: 0 0 10px; }
  section > table { border: 1px solid var(--line); border-radius: var(--radius); border-collapse: separate; border-spacing: 0; overflow: hidden; }
  .source {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .source.unsupported { opacity: 0.6; }
  .source-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .source-head h4 { margin: 0; font-size: 14px; font-family: ui-monospace, monospace; }
  .hint { font-size: 11px; color: var(--ink-muted); }
  pre {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 6px 0;
  }
  /* Same palette as agents-config-page.ts's own .delete-btn — kept in
     sync by hand since each admin page owns its own <style> block (no
     shared component CSS beyond devUiCss's base tokens), not because
     this pink-for-destructive convention is meant to drift between them. */
  .delete-btn {
    font-size: 12px;
    color: var(--bad);
    background: var(--bad-soft);
    border-color: var(--bad);
  }
  .delete-btn:hover { background: var(--bad-soft); }
  form.key-form { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0; }
  form.key-form input[type=password] { width: 240px; max-width: 100%; font-family: ui-monospace, monospace; font-size: 12px; }
  form.key-form button { font-size: 12px; }
  .key-msg { font-size: 11px; margin-top: 4px; }
  .key-msg.bad { color: var(--bad); }
</style>
</head>
<body data-le-page="config">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="section-panel" data-section-panel="models" style="display:contents">
    <div class="le-head plain"><div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
      <div><h1>Models</h1><p>API keys for each model provider, and which agents use each one. A saved key is stored on this server and never shown again.</p></div></div></div>
    <div class="le-scroll"><div class="le-page" style="display:block"><div id="modelsContent"><p class="hint">Loading&hellip;</p></div></div></div>
  </div>
  <div class="section-panel" data-section-panel="gateways" style="display:none">
    <div class="le-head plain"><div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
      <div><h1>Integrations</h1><p>Outside tool sources (such as Composio) that agents can add tools from.</p></div></div></div>
    <div class="le-scroll"><div class="le-page" style="display:block"><div id="gatewaysContent"><p class="hint">Loading&hellip;</p></div></div></div>
  </div>
  <div class="section-panel" data-section-panel="settings" style="display:none">
    <div class="le-head plain"><div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
      <div><h1>Settings</h1><p>How this server is set up. These come from its deployment, not from this page.</p></div></div></div>
    <div class="le-scroll"><div class="le-page" style="display:block"><div id="settingsContent"><p class="hint">Loading&hellip;</p></div></div></div>
  </div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var main = document.querySelector('main');
  var sectionButtons = document.querySelectorAll('.section-btn');
  var currentSection = 'models';
  var loadedSections = {};

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function badge(ok, yesLabel, noLabel) {
    return '<span class="badge ' + (ok ? 'badge-custom' : 'badge-default') + '">' + escapeHtml(ok ? yesLabel : noLabel) + '</span>';
  }

  // ---- Models section ----

  function renderModels(data) {
    var providerRows = data.providers.map(function (p) {
      // Write-only: the field is always empty; the server never sends a
      // key back, only whether one is set.
      var keyCell = data.canSave
        ? '<form class="key-form" data-provider="' + escapeHtml(p.provider) + '">' +
            '<input type="password" name="key" autocomplete="off" spellcheck="false" placeholder="' + (p.configured ? 'Paste a new key to replace it' : 'Paste API key') + '" aria-label="' + escapeHtml(p.provider) + ' API key">' +
            '<button type="submit">Save</button>' +
            (p.configured ? '<button type="button" class="delete-btn" data-remove-key="' + escapeHtml(p.provider) + '">Remove</button>' : '') +
          '</form><div class="key-msg" data-key-msg="' + escapeHtml(p.provider) + '"></div>'
        : '<span class="hint">Set LOOPENGINE_ADMIN_AUTH to manage keys here, or put ' + escapeHtml(p.envVar) + ' in .env.</span>';
      return '<tr><td><code>' + escapeHtml(p.provider) + '</code></td>' +
        '<td><code>' + escapeHtml(p.envVar) + '</code></td>' +
        '<td>' + badge(p.configured, 'configured', 'not set') + '</td>' +
        '<td>' + keyCell + '</td></tr>';
    }).join('');

    var agentRows = data.agents.length
      ? data.agents.map(function (a) {
          return '<tr><td><code>' + escapeHtml(a.agent) + '</code></td>' +
            '<td><code>' + escapeHtml(a.provider) + '</code></td>' +
            '<td><code>' + escapeHtml(a.model) + '</code></td></tr>';
        }).join('')
      : '<tr><td colspan="3"><p class="hint">No agents with a resolved model config (a custom createModelCall has nothing to report here).</p></td></tr>';

    return '<section><h3>Providers</h3>' +
        '<table><thead><tr><th>Provider</th><th>Env var</th><th>Status</th><th>Key</th></tr></thead><tbody>' + providerRows + '</tbody></table>' +
      '</section>' +
      '<section><h3>Agents</h3>' +
        '<table><thead><tr><th>Agent</th><th>Provider</th><th>Model</th></tr></thead><tbody>' + agentRows + '</tbody></table>' +
      '</section>';
  }

  function keyMessage(provider, text, bad) {
    var el = document.querySelector('[data-key-msg="' + provider + '"]');
    if (!el) return;
    el.textContent = text;
    el.className = 'key-msg' + (bad ? ' bad' : '');
  }

  function sendKey(provider, method, body) {
    keyMessage(provider, method === 'PUT' ? 'Saving' + String.fromCharCode(8230) : 'Removing' + String.fromCharCode(8230), false);
    return fetch('/config/models/' + encodeURIComponent(provider) + '/key', {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'request failed');
        loadModels();
      })
      .catch(function (err) { keyMessage(provider, err.message, true); });
  }

  document.getElementById('modelsContent').addEventListener('submit', function (ev) {
    var form = ev.target.closest('form.key-form');
    if (!form) return;
    ev.preventDefault();
    var input = form.querySelector('input[name=key]');
    var key = input.value.trim();
    if (!key) { keyMessage(form.getAttribute('data-provider'), 'Paste a key first.', true); return; }
    // Cleared at once, so the key doesn't sit in the page while saving.
    input.value = '';
    sendKey(form.getAttribute('data-provider'), 'PUT', { key: key });
  });

  document.getElementById('modelsContent').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-remove-key]');
    if (!btn) return;
    var provider = btn.getAttribute('data-remove-key');
    if (btn.getAttribute('data-armed') !== '1') {
      btn.setAttribute('data-armed', '1');
      btn.textContent = 'Remove ' + provider + ' key?';
      return;
    }
    sendKey(provider, 'DELETE');
  });

  function loadModels() {
    var content = document.getElementById('modelsContent');
    fetch('/config/models')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        content.innerHTML = renderModels(data);
        loadedSections.models = true;
      })
      .catch(function (err) {
        content.innerHTML = '<p class="error">Could not load models: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Gateways section ----

  function renderGatewayCard(g) {
    var statusHtml;
    var bodyHtml = '';
    if (!g.supported) {
      statusHtml = '<span class="hint">not yet supported</span>';
    } else if (g.connected) {
      statusHtml = badge(true, 'connected', 'not connected');
      bodyHtml = '<p class="hint">' + escapeHtml(g.email || '') + (g.org ? ' &middot; ' + escapeHtml(g.org) : '') + '</p>' +
        '<button type="button" class="delete-btn disconnect-btn" data-provider="' + escapeHtml(g.provider) + '">Disconnect</button>';
    } else {
      // No Connect button/form here — composio login's only
      // non-interactive path (--user-api-key) doesn't accept the kind of
      // key an operator actually has on hand (Composio hands out a
      // separate x-consumer-api-key credential for MCP clients, which
      // 401s against this flag); composio login itself opens a real
      // browser, which a web request can't drive. These are the same
      // two commands Composio's own docs give for getting started.
      statusHtml = badge(false, 'connected', 'not connected');
      bodyHtml = '<pre><code>curl -fsSL https://composio.dev/install | sh</code></pre>' +
        '<pre><code>composio login</code></pre>' +
        '<p class="hint">Run both on the machine running this server, then reload this page.</p>';
    }
    return '<div class="source' + (g.supported ? '' : ' unsupported') + '">' +
      '<div class="source-head">' +
        '<h4>' + escapeHtml(g.provider) + '</h4>' +
        statusHtml +
      '</div>' +
      bodyHtml +
      '</div>';
  }

  function applyGateways(gateways) {
    var content = document.getElementById('gatewaysContent');
    content.innerHTML = (gateways || []).map(renderGatewayCard).join('');
    wireGatewayCards(content);
    loadedSections.gateways = true;
  }

  // Disconnect is a machine-wide CLI-session action (see
  // disconnectComposioAccount's own doc comment in gateway-tools.ts) —
  // it gets a confirm() for that reason, same as this admin UI's other
  // consequential-but-not-undoable actions (removing a skill, a rule, a
  // gateway tool). No Connect counterpart to wire — see renderGatewayCard's
  // own comment for why that's instructions, not a form.
  function wireGatewayCards(content) {
    var disconnectButtons = content.querySelectorAll('.disconnect-btn');
    for (var j = 0; j < disconnectButtons.length; j++) {
      disconnectButtons[j].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var provider = btn.getAttribute('data-provider');
        if (!confirm('Disconnect ' + provider + '? This logs out the CLI on this machine for every agent’s gateway tools, not just this browser tab.')) return;
        btn.disabled = true;
        fetch('/config/gateways/' + encodeURIComponent(provider) + '/disconnect', { method: 'POST' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            applyGateways(result.body.gateways || []);
          })
          .catch(function (err) {
            alert('Could not disconnect: ' + err.message);
            btn.disabled = false;
          });
      });
    }
  }

  function loadGateways() {
    var content = document.getElementById('gatewaysContent');
    fetch('/config/gateways')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        applyGateways(data.gateways || []);
      })
      .catch(function (err) {
        content.innerHTML = '<p class="error">Could not load gateways: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Settings section ----

  function renderSettings(d) {
    var si = d.signIn || {};
    var signIn = si.mode === 'hosted'
      ? 'Managed by your LoopEngine Cloud account' + (si.email ? ' (' + escapeHtml(si.email) + ')' : '') +
        (si.dashboardUrl ? ' &middot; <a href="' + escapeHtml(si.dashboardUrl) + '">Dashboard</a>' : '')
      : si.mode === 'basic'
        ? 'Basic Auth (<code>LOOPENGINE_ADMIN_AUTH</code>)'
        : '<span class="error">None: anyone who can reach this server can use it. Set <code>LOOPENGINE_ADMIN_AUTH</code>.</span>';
    var rows = [
      ['Admin sign-in', signIn],
      ['LoopEngine version', '<code>' + escapeHtml(d.version) + '</code>'],
      ['Environment name', '<code>' + escapeHtml(d.environment) + '</code> <span class="hint">(LOOPENGINE_ENV)</span>'],
      ['Public address', d.publicUrl ? '<code>' + escapeHtml(d.publicUrl) + '</code>' : '<span class="hint">Not set (LOOPENGINE_PUBLIC_URL); links in notifications use the address saved with each notifier</span>'],
      ['Scheduled tasks', d.scheduler === 'off' ? 'Off on this server (LOOPENGINE_SCHEDULER=off)' : 'Run by this server'],
      ['Theme', 'Follows your system'],
    ];
    return '<section><table><thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</tbody></table></section>';
  }

  function loadSettings() {
    var content = document.getElementById('settingsContent');
    fetch('/config/settings')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        content.innerHTML = renderSettings(d);
        loadedSections.settings = true;
      })
      .catch(function (err) {
        content.innerHTML = '<p class="error">Could not load settings: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Section switching ----

  function switchSection(section) {
    currentSection = section;
    for (var i = 0; i < sectionButtons.length; i++) {
      sectionButtons[i].classList.toggle('active', sectionButtons[i].dataset.section === section);
    }
    var panels = main.querySelectorAll('.section-panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].style.display = panels[j].dataset.sectionPanel === section ? 'contents' : 'none';
    }
    if (section === 'models' && !loadedSections.models) loadModels();
    if (section === 'gateways' && !loadedSections.gateways) loadGateways();
    if (section === 'settings' && !loadedSections.settings) loadSettings();
  }

  for (var i = 0; i < sectionButtons.length; i++) {
    sectionButtons[i].addEventListener('click', function (ev) { switchSection(ev.currentTarget.dataset.section); });
  }

  // Deep-linked from agents-config-page.ts's own Models/Gateways sidebar
  // links (/config?section=gateways, say) — preselect it if it names a
  // real section, same "trust the query param only if it's valid"
  // caution playground.ts's own ?agent= handling already uses.
  var requestedSection = new URLSearchParams(location.search).get('section');
  var initialSection = requestedSection === 'gateways' || requestedSection === 'models' || requestedSection === 'settings' ? requestedSection : currentSection;
  switchSection(initialSection);
})();
</script>
</body>
</html>
`
