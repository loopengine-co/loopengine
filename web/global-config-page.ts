// A local dev page: a single self-contained HTML page (no build step, no
// framework, no CDN) served by adapters/http.ts at GET /config — the
// account-wide counterpart to web/agents-config-page.ts's per-agent
// Overview/Skills/Tools/ActAuth tabs (served separately at
// /agents/config, deliberately left untouched by this page). A left
// sidebar picks between Models (which providers this deployment can
// call, and which agents use which), Abilities (what each agent has
// installed, and adding more) and Settings — see global-config.ts for
// where most of that data comes from. "Agents" is a plain link out to
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
import { PROVIDER_ICONS } from './provider-icons.js'

export const globalConfigPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Settings</title>
<style>${devUiCss}
  section { margin-bottom: 28px; }
  .provider-name { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
  .le-provider-icon { width: 18px; height: 18px; flex: none; }
  section h3 { font-size: 15px; font-weight: 600; margin: 0 0 10px; }
  section > table { border: 1px solid var(--line); border-radius: var(--radius); border-collapse: separate; border-spacing: 0; overflow: hidden; }
  section h4 { font-size: 13px; font-weight: 600; margin: 18px 0 8px; }
  section h4 .hint { font-weight: 400; margin-left: 4px; }
  .source {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .source.unsupported { opacity: 0.6; }
  /* Settings → Private ability sources: one field per row, label above. */
  .source-form { display: grid; gap: 12px; max-width: 520px; margin-top: 12px; }
  .source-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; }
  .source-form label .hint { font-weight: 400; }
  .source-form input, .source-form select { width: 100%; box-sizing: border-box; }
  .source-form button[type="submit"] { justify-self: start; }
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
  <div class="section-panel" data-section-panel="abilities" style="display:none">
    <div class="le-head plain"><div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
      <div><h1>Abilities</h1><p>How agents reach your apps, such as Gmail, Shopify or GitHub. An ability installed into an agent adds its tools, skills and permission rules.</p></div></div></div>
    <div class="le-scroll"><div class="le-page" style="display:block"><div id="abilitiesContent"><p class="hint">Loading&hellip;</p></div></div></div>
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

  // Each provider's logo (web/provider-icons.ts), shown beside its name.
  var PROVIDER_ICONS = ${JSON.stringify(PROVIDER_ICONS)};
  function providerName(provider) {
    return '<span class="provider-name">' + (PROVIDER_ICONS[provider] || '') + '<code>' + escapeHtml(provider) + '</code></span>';
  }

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
      return '<tr><td>' + providerName(p.provider) + '</td>' +
        '<td><code>' + escapeHtml(p.envVar) + '</code></td>' +
        '<td>' + badge(p.configured, 'configured', 'not set') + '</td>' +
        '<td>' + keyCell + '</td></tr>';
    }).join('');

    var agentRows = data.agents.length
      ? data.agents.map(function (a) {
          return '<tr><td><code>' + escapeHtml(a.agent) + '</code></td>' +
            '<td>' + providerName(a.provider) + '</td>' +
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

  // ---- Abilities section ----
  // How agents reach outside apps. Public abilities (npm) are browsed
  // here and installed from an agent's own Abilities tab. A private one
  // (from the sources in Settings) is installed here into the workspace
  // (core/workspace-abilities.ts), then added to any agent from its tab.

  // An ability's details (tools with their permissions, skills, settings)
  // come from the console shell, shared with each agent's Abilities tab.
  var toggleAbilityDetails = leShell.toggleAbilityDetails;

  function detailsButton(spec) {
    return '<button type="button" class="ability-details-btn" data-spec="' + escapeHtml(spec) + '">Details</button>';
  }

  var lastSearch = { q: null, results: [] };
  var lastPrivate = null;
  var workspaceAbilities = null;

  function renderAbilities() {
    var content = document.getElementById('abilitiesContent');
    content.innerHTML = '<section>' +
      '<h4>Public <span class="hint">npm packages tagged loopengine-ability; add one to an agent from its Abilities tab</span></h4>' +
      '<form id="abilitySearchForm" style="display:flex;gap:6px;margin:0 0 10px;max-width:560px">' +
        '<input type="search" name="q" placeholder="Search abilities, e.g. gmail" aria-label="Search public abilities" style="flex:1">' +
        '<button type="submit">Search</button>' +
      '</form>' +
      '<div id="abilitySearchResults"><p class="hint">Loading&hellip;</p></div>' +
      '<h4 id="private-abilities">Private <span class="hint">your own, from the sources in <a href="/config?section=settings">Settings</a>; install one into the workspace, then add it to agents from their Abilities tab</span></h4>' +
      '<p id="abilityInstallStatus" class="hint"></p>' +
      '<div id="workspaceAbilities"></div>' +
      '<div id="privateAbilities"><p class="hint">Loading&hellip;</p></div>' +
      '<form id="abilitySpecForm" style="display:flex;gap:6px;margin:10px 0 0;max-width:560px">' +
        '<input name="spec" placeholder="Or install by name or spec: @company/lp-x, github:org/repo" aria-label="Ability name or spec" style="flex:1">' +
        '<button type="submit">Install</button>' +
      '</form>' +
      '<div class="source" style="margin-top:12px;max-width:560px;box-sizing:border-box">' +
        '<p style="margin:0 0 8px"><strong>Upload an ability</strong> <span class="hint">from your computer: a .zip or .tgz, or its folder (up to 25 MB)</span></p>' +
        '<input type="file" id="abilityUploadFile" accept=".zip,.tgz,.gz" hidden>' +
        '<input type="file" id="abilityUploadFolder" webkitdirectory hidden>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" id="abilityUploadFileBtn">Choose a file' + String.fromCharCode(8230) + '</button>' +
        '<button type="button" id="abilityUploadFolderBtn">Choose a folder' + String.fromCharCode(8230) + '</button></div>' +
      '</div></section>';
    var form = document.getElementById('abilitySearchForm');
    form.addEventListener('submit', function (ev) { ev.preventDefault(); searchAbilities(form.q.value.trim()); });
    var specForm = document.getElementById('abilitySpecForm');
    specForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var spec = specForm.spec.value.trim();
      if (spec) installIntoWorkspace(spec, specForm.querySelector('button'));
    });
    wireAbilityUpload();
    searchAbilities('');
    loadWorkspaceAbilities();
    loadPrivateAbilities();
  }

  // ---- Uploading an ability from your computer ----

  // A file's contents as base64 (the part after a data: URL's comma).
  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function uploadAbility(body, label, buttons) {
    var status = document.getElementById('abilityInstallStatus');
    buttons.forEach(function (b) { b.disabled = true; });
    status.className = 'hint';
    status.textContent = 'Uploading ' + label + String.fromCharCode(8230);
    return fetch('/abilities/workspace/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'upload failed');
        status.textContent = 'Uploaded ' + label + ' into the workspace. Add it to an agent from the agent' + String.fromCharCode(8217) + 's Abilities tab.';
        workspaceAbilities = r.body.abilities || [];
        renderWorkspaceAbilities();
        renderPrivateAbilities();
      })
      .catch(function (err) {
        status.className = 'error';
        status.textContent = 'Could not upload ' + label + ': ' + err.message;
      })
      .then(function () { buttons.forEach(function (b) { b.disabled = false; }); });
  }

  function wireAbilityUpload() {
    var fileInput = document.getElementById('abilityUploadFile');
    var folderInput = document.getElementById('abilityUploadFolder');
    var fileBtn = document.getElementById('abilityUploadFileBtn');
    var folderBtn = document.getElementById('abilityUploadFolderBtn');
    var buttons = [fileBtn, folderBtn];
    var MAX = 25 * 1024 * 1024;
    fileBtn.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    folderBtn.addEventListener('click', function () { folderInput.value = ''; folderInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > MAX) { document.getElementById('abilityInstallStatus').textContent = file.name + ' is larger than 25 MB.'; return; }
      readBase64(file).then(function (data) { return uploadAbility({ kind: 'archive', fileName: file.name, data: data }, file.name, buttons); });
    });
    folderInput.addEventListener('change', function () {
      // Leaves out what an ability never needs: installed packages, git
      // data and hidden files.
      var files = Array.prototype.filter.call(folderInput.files, function (f) {
        return !f.webkitRelativePath.split('/').some(function (part) { return part === 'node_modules' || part.charAt(0) === '.'; });
      });
      if (!files.length) return;
      var folderName = files[0].webkitRelativePath.split('/')[0];
      var total = files.reduce(function (sum, f) { return sum + f.size; }, 0);
      if (total > MAX) { document.getElementById('abilityInstallStatus').textContent = folderName + ' is larger than 25 MB.'; return; }
      Promise.all(files.map(function (f) { return readBase64(f).then(function (data) { return { path: f.webkitRelativePath, data: data }; }); }))
        .then(function (list) { return uploadAbility({ kind: 'files', folderName: folderName, files: list }, folderName, buttons); });
    });
  }

  // Details, Install and Remove buttons anywhere in the section.
  document.getElementById('abilitiesContent').addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('ability-details-btn')) toggleAbilityDetails(btn);
    else if (btn.classList.contains('workspace-install-btn')) installIntoWorkspace(btn.dataset.spec, btn);
    else if (btn.classList.contains('workspace-remove-btn')) removeFromWorkspace(btn);
  });

  function renderSearchResults() {
    var resultsEl = document.getElementById('abilitySearchResults');
    var results = lastSearch.results;
    resultsEl.innerHTML = results.length
      ? '<table><thead><tr><th>Ability</th><th>What it does</th><th></th></tr></thead><tbody>' + results.map(function (pkg) {
          return '<tr><td><code>' + escapeHtml(pkg.name) + '</code> <span class="hint">' + escapeHtml(pkg.version) + '</span></td>' +
            '<td>' + escapeHtml(pkg.description || '') + '</td>' +
            '<td style="white-space:nowrap">' + detailsButton(pkg.name + '@' + pkg.version) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="hint">No published abilities match.</p>';
  }

  function workspaceCopy(name) {
    return (workspaceAbilities || []).filter(function (a) { return a.name === name; })[0];
  }

  // What's already in the workspace, ready to add to agents.
  function renderWorkspaceAbilities() {
    var el = document.getElementById('workspaceAbilities');
    if (!el || !workspaceAbilities) return;
    el.innerHTML = workspaceAbilities.length
      ? '<div class="source"><p style="margin:0 0 8px"><strong>In this workspace</strong> <span class="hint">add these to an agent from its Abilities tab</span></p>' +
          '<table><thead><tr><th>Ability</th><th>From</th><th></th></tr></thead><tbody>' + workspaceAbilities.map(function (a) {
            return '<tr><td><code>' + escapeHtml(a.name) + '</code>' + (a.version ? ' <span class="hint">' + escapeHtml(a.version) + '</span>' : '') + '</td>' +
              '<td><span class="hint">' + escapeHtml(a.source.indexOf('upload:') === 0 ? 'Uploaded ' + a.source.slice(7) : a.source) + '</span></td>' +
              '<td style="white-space:nowrap">' + detailsButton(a.spec) + ' <button type="button" class="delete-btn workspace-remove-btn" data-name="' + escapeHtml(a.name) + '">Remove</button></td></tr>';
          }).join('') + '</tbody></table></div>'
      : '';
  }

  // Each source's abilities: Install puts one into the workspace; one
  // already there shows so, with Update when the source has another version.
  function renderPrivateAbilities() {
    var el = document.getElementById('privateAbilities');
    if (!el || !lastPrivate) return;
    var sources = lastPrivate.sources || [];
    if (lastPrivate.error) { el.innerHTML = '<p class="error">' + escapeHtml(lastPrivate.error) + '</p>'; return; }
    if (!sources.length) {
      el.innerHTML = '<p class="hint">No private sources yet. <a href="/config?section=settings">Add one in Settings</a> (a GitHub org or user, or a private npm registry), or upload an ability below.</p>';
      return;
    }
    el.innerHTML = sources.map(function (s) {
      var body = s.error
        ? '<p class="error" style="margin:0">' + escapeHtml(s.error) + '</p>'
        : s.abilities.length
          ? '<table><thead><tr><th>Ability</th><th>What it does</th><th></th></tr></thead><tbody>' + s.abilities.map(function (a) {
              var copy = workspaceCopy(a.name);
              var action = !copy
                ? '<button type="button" class="workspace-install-btn" data-spec="' + escapeHtml(a.spec) + '">Install</button>'
                : copy.version && a.version && copy.version !== a.version
                  ? '<span class="hint">In workspace (' + escapeHtml(copy.version) + ')</span> <button type="button" class="workspace-install-btn" data-spec="' + escapeHtml(a.spec) + '">Update to ' + escapeHtml(a.version) + '</button>'
                  : '<span class="hint">In workspace</span>';
              return '<tr><td><code>' + escapeHtml(a.name) + '</code>' + (a.version ? ' <span class="hint">' + escapeHtml(a.version) + '</span>' : '') + '</td>' +
                '<td>' + escapeHtml(a.description || '') + '</td>' +
                '<td style="white-space:nowrap">' + detailsButton(a.spec) + ' ' + action + '</td></tr>';
            }).join('') + '</tbody></table>'
          : '<p class="hint" style="margin:0">No abilities found here.</p>';
      return '<div class="source"><p style="margin:0 0 8px"><strong>' + escapeHtml(s.label) + '</strong></p>' + body + '</div>';
    }).join('');
  }

  // Linked from an agent's Abilities tab (/config?section=abilities#private-abilities):
  // once every list has loaded, so the public results don't push it down.
  var scrolledToPrivate = false;
  function scrollToPrivateIfLinked() {
    if (scrolledToPrivate || location.hash !== '#private-abilities' || !lastPrivate || !workspaceAbilities || lastSearch.q === null) return;
    var heading = document.getElementById('private-abilities');
    if (!heading) return;
    scrolledToPrivate = true;
    heading.scrollIntoView({ block: 'start' });
  }

  function loadWorkspaceAbilities() {
    return fetch('/abilities/workspace')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        workspaceAbilities = d.abilities || [];
        renderWorkspaceAbilities();
        renderPrivateAbilities();
        scrollToPrivateIfLinked();
      })
      .catch(function (err) {
        var el = document.getElementById('workspaceAbilities');
        if (el) el.innerHTML = '<p class="error">Could not list the workspace' + String.fromCharCode(8217) + 's abilities: ' + escapeHtml(err.message) + '</p>';
      });
  }

  function loadPrivateAbilities() {
    fetch('/abilities/private')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        lastPrivate = d;
        renderPrivateAbilities();
        scrollToPrivateIfLinked();
      })
      .catch(function (err) {
        var el = document.getElementById('privateAbilities');
        if (el) el.innerHTML = '<p class="error">Could not list private abilities: ' + escapeHtml(err.message) + '</p>';
      });
  }

  function searchAbilities(q) {
    var resultsEl = document.getElementById('abilitySearchResults');
    if (lastSearch.q === q) { renderSearchResults(); return; }
    resultsEl.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/abilities/search' + (q ? '?q=' + encodeURIComponent(q) : ''))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'search failed');
        lastSearch = { q: q, results: r.body.results || [] };
        renderSearchResults();
        scrollToPrivateIfLinked();
      })
      .catch(function (err) { resultsEl.innerHTML = '<p class="error">Could not search abilities: ' + escapeHtml(err.message) + '</p>'; });
  }

  function installIntoWorkspace(spec, btn) {
    var status = document.getElementById('abilityInstallStatus');
    btn.disabled = true;
    status.className = 'hint';
    status.textContent = 'Installing ' + spec + ' into the workspace' + String.fromCharCode(8230);
    fetch('/abilities/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: spec }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'request failed');
        status.textContent = 'Installed ' + spec + ' into the workspace. Add it to an agent from the agent' + String.fromCharCode(8217) + 's Abilities tab.';
        workspaceAbilities = r.body.abilities || [];
        renderWorkspaceAbilities();
        renderPrivateAbilities();
        btn.disabled = false;
      })
      .catch(function (err) {
        btn.disabled = false;
        status.className = 'error';
        status.textContent = 'Could not install: ' + err.message;
      });
  }

  // A second click confirms. Agents that added it keep their own copies.
  function removeFromWorkspace(btn) {
    if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
    btn.disabled = true;
    fetch('/abilities/workspace?name=' + encodeURIComponent(btn.dataset.name), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        workspaceAbilities = d.abilities || [];
        renderWorkspaceAbilities();
        renderPrivateAbilities();
      });
  }

  function loadAbilities() {
    renderAbilities();
    loadedSections.abilities = true;
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
      ['Time zone', d.timeZone ? '<code>' + escapeHtml(d.timeZone) + '</code>' : '<span class="hint">The server' + String.fromCharCode(8217) + 's own. Update the template below to choose one here.</span>'],
      ['Theme', 'Follows your system'],
    ];
    return '<section><table><thead><tr><th>Setting</th><th>Value</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</tbody></table></section>' +
      (d.timeZone ? '<section><h3>Time zone</h3><div class="source" id="timeZoneBox"><p class="hint">Loading' + String.fromCharCode(8230) + '</p></div></section>' : '') +
      '<section><h3>Private ability sources</h3><p class="muted" style="margin:0 0 10px">Where your own abilities come from, listed under Private on the Abilities page next to the public ones on npm.</p><div class="source" id="abilitySourcesBox"><p class="hint">Loading' + String.fromCharCode(8230) + '</p></div></section>' +
      '<section><h3>Updates</h3><div class="source" id="upgradeBox"><p class="hint">Checking for a newer LoopEngine' + String.fromCharCode(8230) + '</p></div></section>';
  }

  // ---- Private ability sources (Settings) ----
  // Where this project's own abilities come from, next to the public ones
  // on npm: a GitHub org or user, or a private npm registry
  // (core/ability-sources.ts). There's no folder kind here: this server
  // may run in the cloud, so local files are uploaded on the Abilities
  // page instead. A token is write-only, like a model key.

  var SOURCE_TYPES = [
    ['github', 'GitHub org or user', 'Each ability is a repo with loopengine.ability.json at its root.'],
    ['npm', 'Private npm registry', 'Packages in one scope, tagged loopengine-ability.']
  ];

  function renderAbilitySources(d) {
    var box = document.getElementById('abilitySourcesBox');
    if (!box) return;
    var rows = (d.sources || []).map(function (s) {
      var token = s.tokenVar
        ? (s.tokenSet ? '<span class="le-pill good">Token saved</span>' : '<span class="le-pill warn">No token</span>') + ' <span class="hint">' + escapeHtml(s.tokenVar) + '</span>'
        : '<span class="hint">No token needed</span>';
      return '<tr><td>' + escapeHtml(s.label) + '</td><td>' + token + '</td>' +
        '<td><button type="button" class="delete-btn source-remove" data-id="' + escapeHtml(s.source.id) + '"' + (d.canSave ? '' : ' disabled') + '>Remove</button></td></tr>';
    }).join('');
    box.innerHTML =
      (d.error ? '<p class="error">' + escapeHtml(d.error) + '</p>' : '') +
      (rows
        ? '<table><thead><tr><th>Source</th><th>Token</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="hint" style="margin-top:0">No private sources yet. Abilities from npm are always listed; add a source to also list your own.</p>') +
      (d.canSave
        ? '<form id="sourceForm" class="source-form">' +
            '<label>Kind<select name="type" id="sourceType">' + SOURCE_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select></label>' +
            '<p class="hint" id="sourceTypeHint" style="margin:0"></p>' +
            '<label data-source-field="github">Org or user<input name="owner" placeholder="loopengine-co"></label>' +
            '<label data-source-field="npm">Registry URL<input name="registry" placeholder="https://npm.pkg.github.com"></label>' +
            '<label data-source-field="npm">Scope<input name="scope" placeholder="@your-company"></label>' +
            '<label data-source-field="github npm">Token <span class="hint" id="sourceTokenHint"></span><input type="password" name="token" autocomplete="off" spellcheck="false"></label>' +
            '<button type="submit">Add source</button>' +
            '<div class="error" id="sourceError"></div>' +
          '</form>'
        : '<p class="hint">Adding a source needs <code>LOOPENGINE_ADMIN_AUTH</code> set, because it stores a token. Or edit <code>ability-sources.yml</code> and <code>.env</code>.</p>');
    var form = document.getElementById('sourceForm');
    if (!form) return;
    var TOKEN_HINTS = {
      github: '(needed for private repos: a token that can read their contents)',
      npm: '(the registry' + String.fromCharCode(8217) + 's auth token, if it needs one)'
    };
    function showFields() {
      var type = form.type.value;
      var fields = form.querySelectorAll('[data-source-field]');
      for (var i = 0; i < fields.length; i++) fields[i].style.display = fields[i].dataset.sourceField.split(' ').indexOf(type) !== -1 ? '' : 'none';
      SOURCE_TYPES.forEach(function (t) { if (t[0] === type) document.getElementById('sourceTypeHint').textContent = t[2]; });
      document.getElementById('sourceTokenHint').textContent = TOKEN_HINTS[type] || '';
    }
    form.type.addEventListener('change', showFields);
    showFields();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var type = form.type.value;
      var body = { type: type };
      if (type === 'github') body.owner = form.owner.value;
      if (type === 'npm') { body.registry = form.registry.value; body.scope = form.scope.value; }
      if (form.token.value) body.token = form.token.value;
      sendAbilitySources('PUT', '/config/ability-sources', body, document.getElementById('sourceError'));
    });
  }

  function sendAbilitySources(method, url, body, errorEl) {
    if (errorEl) errorEl.textContent = '';
    return fetch(url, { method: method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'request failed');
        renderAbilitySources(r.body);
        // The Abilities page lists what the sources offer; reload it next time.
        loadedSections.abilities = false;
      })
      .catch(function (err) { if (errorEl) errorEl.textContent = err.message; });
  }

  function loadAbilitySources() {
    fetch('/config/ability-sources')
      .then(function (r) { return r.json(); })
      .then(renderAbilitySources)
      .catch(function (err) {
        var box = document.getElementById('abilitySourcesBox');
        if (box) box.innerHTML = '<p class="error">Could not load the sources: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // Remove a source: a second click confirms. Installed abilities stay.
  document.getElementById('settingsContent').addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('.source-remove');
    if (!btn) return;
    if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
    btn.disabled = true;
    sendAbilitySources('DELETE', '/config/ability-sources/' + encodeURIComponent(btn.dataset.id), null, null);
  });

  // ---- Time zone ----

  function renderTimeZone(t) {
    var box = document.getElementById('timeZoneBox');
    if (!box) return;
    var intro = '<p>Schedules and templates use this for times of day: &ldquo;daily at 09:00&rdquo; runs at 9:00 here, and daily and weekly schedules keep that time when the clocks change. ' +
      (t.chosen ? '' : 'Not chosen yet, so it' + String.fromCharCode(8217) + 's the server' + String.fromCharCode(8217) + 's (<code>' + escapeHtml(t.server) + '</code>).') + '</p>';
    if (!t.canSave) {
      box.innerHTML = intro + '<p>In use: <code>' + escapeHtml(t.timeZone) + '</code></p><p class="hint">Set LOOPENGINE_ADMIN_AUTH to change it here, or put <code>LOOPENGINE_TIME_ZONE</code> in .env.</p>';
      return;
    }
    var browserZone = '';
    try { browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var options = t.zones.map(function (z) {
      return '<option value="' + escapeHtml(z) + '"' + (z === t.timeZone ? ' selected' : '') + '>' + escapeHtml(z.replace(/_/g, ' ')) + '</option>';
    }).join('');
    box.innerHTML = intro +
      '<form id="timeZoneForm" style="display:flex;flex-direction:column;gap:10px;max-width:480px">' +
        '<label for="timeZoneSelect">Time zone</label>' +
        '<select id="timeZoneSelect" name="timeZone">' + options + '</select>' +
        (browserZone && browserZone !== t.timeZone && t.zones.indexOf(browserZone) >= 0
          ? '<p class="hint" style="margin:0"><a href="#" id="timeZoneUseBrowser">Use this browser' + String.fromCharCode(8217) + 's, ' + escapeHtml(browserZone) + '</a></p>' : '') +
        '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="moveSchedules" checked> Move existing daily and weekly schedules too, keeping their time of day</label>' +
        '<div><button type="submit" class="primary">Save</button></div>' +
        '<div id="timeZoneMsg" class="hint"></div>' +
      '</form>';
    var form = document.getElementById('timeZoneForm');
    var useBrowser = document.getElementById('timeZoneUseBrowser');
    if (useBrowser) useBrowser.addEventListener('click', function (ev) { ev.preventDefault(); form.timeZone.value = browserZone; });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = document.getElementById('timeZoneMsg');
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      msg.textContent = 'Saving' + String.fromCharCode(8230);
      fetch('/config/time-zone', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeZone: form.timeZone.value, moveSchedules: form.moveSchedules.checked }),
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (r) {
          btn.disabled = false;
          if (!r.ok) { msg.innerHTML = '<span class="error">' + escapeHtml(r.body.error || 'Could not save') + '</span>'; return; }
          msg.textContent = 'Saved: ' + r.body.timeZone.replace(/_/g, ' ') + '.' +
            (r.body.moved ? ' Moved ' + r.body.moved + ' schedule' + (r.body.moved === 1 ? '' : 's') + '.' : '');
        })
        .catch(function (err) { btn.disabled = false; msg.innerHTML = '<span class="error">' + escapeHtml(err.message) + '</span>'; });
    });
  }

  function loadTimeZone() {
    if (!document.getElementById('timeZoneBox')) return;
    fetch('/config/time-zone', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(renderTimeZone)
      .catch(function (err) {
        var box = document.getElementById('timeZoneBox');
        if (box) box.innerHTML = '<p class="error">Could not load the time zone: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Upgrade ----

  var UPGRADE_NOTE = 'Updates this server' + String.fromCharCode(8217) + 's LoopEngine code and restarts it, which takes a minute or two. ' +
    'Your agents, abilities, conversations, approvals, schedules and settings are kept. ' +
    'A template file you edited (such as adapters/http.ts) is left exactly as it is.';

  function upgradeBox() { return document.getElementById('upgradeBox'); }

  // When npm was last asked, and a link to ask again now.
  function upgradeCheckedLine(u) {
    var when = u.checkedAt ? 'Checked at ' + escapeHtml(new Date(u.checkedAt).toLocaleTimeString()) + '. ' : '';
    return '<p class="hint" style="margin:6px 0 0">' + when + '<a href="#" id="upgradeRecheck">Check again</a></p>';
  }

  function renderUpgrade(u) {
    var box = upgradeBox();
    if (!box) return;
    if (u.unavailableReason && !u.updateAvailable) {
      box.innerHTML = '<p class="hint">' + escapeHtml(u.unavailableReason) + '</p>' + (u.templateVersion ? upgradeCheckedLine(u) : '');
    } else if (!u.updateAvailable) {
      box.innerHTML = '<p>You' + String.fromCharCode(8217) + 're on the latest version, <code>' + escapeHtml(u.current) + '</code>.</p>' + upgradeCheckedLine(u);
    } else {
      // Only the template behind (a fix in adapters/http.ts and the like,
      // with loopengine already current) is offered too.
      var headline = u.templateUpdateAvailable
        ? '<p>A template update is available: <code>' + escapeHtml(u.latestTemplate) + '</code> (this project' + String.fromCharCode(8217) + 's template is <code>' + escapeHtml(u.templateVersion) + '</code>). LoopEngine stays at <code>' + escapeHtml(u.current) + '</code>.</p>'
        : '<p>LoopEngine <code>' + escapeHtml(u.latest) + '</code> is available (this server runs <code>' + escapeHtml(u.current) + '</code>).</p>';
      var label = u.templateUpdateAvailable ? 'Update the template to ' + escapeHtml(u.latestTemplate) : 'Upgrade to ' + escapeHtml(u.latest);
      if (u.unavailableReason) {
        box.innerHTML = headline + '<p class="hint">' + escapeHtml(u.unavailableReason) + '</p>';
      } else if (!u.canUpgrade) {
        box.innerHTML = headline + '<p class="hint">Set LOOPENGINE_ADMIN_AUTH to upgrade from here, or run <code>npx create-loopengine@latest upgrade</code>.</p>';
      } else {
        box.innerHTML = headline +
          '<p class="hint">' + UPGRADE_NOTE + (u.restartsItself ? '' : ' This server has nothing to restart it, so restart it yourself afterwards.') + '</p>' +
          '<p><button type="button" class="primary" id="upgradeBtn">' + label + '</button></p>' +
          '<div id="upgradeMsg" class="hint"></div>';
      }
    }
  }

  function loadUpgrade(refresh) {
    fetch('/config/upgrade' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(renderUpgrade)
      .catch(function (err) {
        var box = upgradeBox();
        if (box) box.innerHTML = '<p class="error">Could not check for updates: ' + escapeHtml(err.message) + '</p>';
      });
  }

  function upgradeMsg(html, bad) {
    var el = document.getElementById('upgradeMsg');
    if (!el) return;
    el.innerHTML = html;
    el.className = bad ? 'error' : 'hint';
  }

  // After a successful upgrade the server restarts: wait for it to answer
  // again on the new versions (loopengine, and the template's), then
  // reload so the page runs the new code.
  function waitForRestart(target, tries) {
    if (tries > 90) { upgradeMsg('The server hasn' + String.fromCharCode(8217) + 't come back yet. Reload this page in a minute.', true); return; }
    setTimeout(function () {
      fetch('/config/upgrade', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (u) {
          var ready = u && !u.running && (!target.version || u.current === target.version) && (!target.template || u.templateVersion === target.template);
          if (ready && tries > 0) location.reload();
          else waitForRestart(target, tries + 1);
        })
        .catch(function () { waitForRestart(target, tries + 1); });
    }, 2000);
  }

  document.getElementById('settingsContent').addEventListener('click', function (ev) {
    var recheck = ev.target.closest('#upgradeRecheck');
    if (recheck) {
      ev.preventDefault();
      var box = upgradeBox();
      if (box) box.innerHTML = '<p class="hint">Checking for a newer LoopEngine' + String.fromCharCode(8230) + '</p>';
      loadUpgrade(true);
      return;
    }
    var btn = ev.target.closest('#upgradeBtn');
    if (!btn) return;
    if (btn.getAttribute('data-armed') !== '1') {
      btn.setAttribute('data-armed', '1');
      btn.textContent = 'Click again to upgrade';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Upgrading' + String.fromCharCode(8230);
    upgradeMsg('Installing the new version. This takes a minute or two; keep this page open.', false);
    fetch('/config/upgrade', { method: 'POST' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'upgrade failed');
        var o = r.body.outcome;
        var changed = o.files.filter(function (f) { return f.status === 'updated'; }).map(function (f) { return f.file; });
        var kept = o.files.filter(function (f) { return f.status === 'kept'; }).map(function (f) { return f.file; });
        var deps = o.dependencies.map(function (d) { return d.name + ' ' + d.from + ' ' + String.fromCharCode(8594) + ' ' + d.to; });
        var loopengineTo = (o.dependencies.filter(function (d) { return d.name === 'loopengine'; })[0] || {}).to;
        var target = { version: loopengineTo ? loopengineTo.replace(/[^0-9.]/g, '') : null, template: o.toVersion || null };
        var summary = (deps.length ? 'Installed ' + escapeHtml(deps.join(', ')) + '. ' : '') +
          (changed.length ? 'Updated ' + escapeHtml(changed.join(', ')) + '. ' : '') +
          (kept.length ? 'Left as you edited them: ' + escapeHtml(kept.join(', ')) + '. ' : '');
        btn.textContent = 'Upgraded';
        if (r.body.restarting && (target.version || target.template)) {
          upgradeMsg(summary + 'Restarting' + String.fromCharCode(8230), false);
          waitForRestart(target, 0);
        } else {
          upgradeMsg(summary + 'Restart the server to finish.', false);
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.removeAttribute('data-armed');
        btn.textContent = 'Try again';
        upgradeMsg(escapeHtml(err.message) + ' Nothing was changed.', true);
      });
  });

  function loadSettings() {
    var content = document.getElementById('settingsContent');
    fetch('/config/settings')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        content.innerHTML = renderSettings(d);
        loadedSections.settings = true;
        loadTimeZone();
        loadAbilitySources();
        loadUpgrade();
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
    if (section === 'abilities' && !loadedSections.abilities) loadAbilities();
    if (section === 'settings' && !loadedSections.settings) loadSettings();
  }

  for (var i = 0; i < sectionButtons.length; i++) {
    sectionButtons[i].addEventListener('click', function (ev) { switchSection(ev.currentTarget.dataset.section); });
  }

  // Deep-linked from the console sidebar's Models/Abilities/Settings
  // links (/config?section=abilities, say) — preselect it if it names a
  // real section, same "trust the query param only if it's valid"
  // caution playground.ts's own ?agent= handling already uses.
  var requestedSection = new URLSearchParams(location.search).get('section');
  // ?section=gateways is the old Integrations page's link.
  if (requestedSection === 'gateways') requestedSection = 'abilities';
  var initialSection = requestedSection === 'abilities' || requestedSection === 'models' || requestedSection === 'settings' ? requestedSection : currentSection;
  switchSection(initialSection);
})();
</script>
</body>
</html>
`
