// The console's Templates page (/templates): ready-made agents
// (core/system-agents/templates.ts) a person can preview and create in
// one click (web/templates-admin.ts behind /starter-templates/*). Same
// shell and styles as the other console pages. Like them, its inline
// script avoids backslashes and template placeholders, since it lives
// inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const templatesPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Templates</title>
<style>${devUiCss}
  .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; max-width: 1000px; }
  .tp-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 8px; align-content: start; }
  .tp-card h3 { margin: 0; font-size: 15px; }
  .tp-cat { justify-self: start; font-size: 11.5px; font-weight: 600; color: var(--ink-muted); background: var(--surface); padding: 2px 8px; border-radius: 999px; }
  .tp-card .meta { font-size: 12.5px; color: var(--ink-muted); display: grid; gap: 4px; }
  .tp-card .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .tp-preview { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 8px; font-size: 13px; }
  .tp-preview pre { white-space: pre-wrap; max-height: 220px; overflow: auto; margin: 0; }
  .tp-btn { display: inline-block; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; background: var(--accent); color: var(--on-accent); }
  .tp-btn.plain { background: none; color: var(--ink); border: 1px solid var(--line); }
  .hint { font-size: 12px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); }
</style>
</head>
<body data-le-page="templates">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Templates</h1><p>Ready-made agents to start from. Each one asks you before it sends, pays, changes or deletes anything.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page" id="tpPage"><p class="hint">Loading&hellip;</p></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('tpPage');
  var ELLIPSIS = String.fromCharCode(8230);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(method, path) {
    return fetch(path, { method: method, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function checklistHtml(items) {
    if (!items.length) return '<p>Nothing else to set up.</p>';
    return '<ul style="margin:0;padding-left:18px">' + items.map(function (it) {
      return '<li>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>';
    }).join('') + '</ul>';
  }

  var canInstall = true;
  var DECISIONS = { allow: 'runs on its own', ask: 'asks you first', deny: 'never' };
  var CHECK = String.fromCharCode(10003);

  function cardHtml(t) {
    return '<div class="tp-card" data-id="' + esc(t.id) + '">' +
      '<span class="tp-cat">' + esc(t.category) + '</span>' +
      '<h3>' + esc(t.title) + '</h3>' +
      '<div>' + esc(t.summary) + '</div>' +
      '<div class="meta">' +
        '<div><strong>Runs:</strong> ' + esc(t.trigger) + '</div>' +
        (t.asksFirst.length ? '<div><strong>Asks you first:</strong> ' + esc(t.asksFirst.join(', ')) + '</div>' : '') +
        '<div><strong>Installs:</strong> ' + t.abilities.map(function (a) { return '<code>' + esc(a) + '</code>'; }).join(' ') + '</div>' +
      '</div>' +
      '<div class="row"><button type="button" class="primary tp-use">Use this template</button></div>' +
      '<div class="tp-slot"></div></div>';
  }

  function listHtml(items) {
    return '<ul style="margin:4px 0 0;padding-left:18px">' + items.join('') + '</ul>';
  }

  function show() {
    api('GET', '/starter-templates').then(function (r) {
      if (!r.ok) { page.innerHTML = '<p class="error">' + esc(r.body.error || 'Could not load the templates') + '</p>'; return; }
      canInstall = r.body.canInstallAbilities !== false;
      page.innerHTML = '<div class="tp-grid">' + r.body.templates.map(cardHtml).join('') + '</div>' +
        '<p class="hint" style="margin-top:16px">Not what you need? <a href="/interview">Find your first agent</a> suggests one from your own work, or <a href="/agents?new=1">start from a blank agent</a>.</p>';
      Array.prototype.forEach.call(page.querySelectorAll('.tp-use'), function (btn) {
        btn.addEventListener('click', function () { preview(btn.closest('.tp-card')); });
      });
    });
  }

  function preview(card) {
    var id = card.getAttribute('data-id');
    var slot = card.querySelector('.tp-slot');
    slot.innerHTML = '<p class="hint">Loading' + ELLIPSIS + '</p>';
    api('GET', '/starter-templates/' + encodeURIComponent(id) + '/preview').then(function (r) {
      if (!r.ok) { slot.innerHTML = '<p class="error">' + esc(r.body.error || 'Could not prepare it') + '</p>'; return; }
      var p = r.body;
      var settings = Object.keys(p.settings || {});
      slot.innerHTML = '<div class="tp-preview">' +
        '<div><strong>Agent:</strong> <code>' + esc(p.name) + '</code></div>' +
        '<div><strong>Instructions</strong> <span class="hint">(edit them later in its Overview tab)</span><pre>' + esc(p.systemPrompt) + '</pre></div>' +
        '<div><strong>Installs</strong> <span class="hint">(abilities: their tools, skills and permission rules)</span>' +
          listHtml(p.abilities.map(function (a) { return '<li><code>' + esc(a) + '</code></li>'; })) +
          (canInstall ? '' : '<p class="error" style="margin:4px 0 0">Installing abilities needs <code>LOOPENGINE_ADMIN_AUTH</code> set on the server. Without it, the agent is created and its abilities head the checklist.</p>') + '</div>' +
        '<div><strong>Permissions</strong> <span class="hint">(anything not listed asks you first)</span>' +
          listHtml(p.rules.map(function (rule) { return '<li><code>' + esc(rule.tool) + '</code>: ' + esc(DECISIONS[rule.decision] || rule.decision) + '</li>'; })) + '</div>' +
        '<div><strong>Keys it needs</strong>' +
          listHtml(p.keys.map(function (k) {
            var names = k.names.length > 1 ? 'one of ' + k.names.join(', ') : k.names[0];
            return '<li>' + esc(names) + (k.set ? ' <span class="hint">' + CHECK + ' already set</span>' : '') + '</li>';
          })) + '</div>' +
        (settings.length ? '<div><strong>Settings filled in:</strong> ' + settings.map(function (s) { return '<code>' + esc(s) + '=' + esc(p.settings[s]) + '</code>'; }).join(', ') + '</div>' : '') +
        (p.schedule ? '<div><strong>Schedule:</strong> ' + esc(p.schedule) + '</div>' : '') +
        (p.needsApprovals ? '<div><strong>Approvals:</strong> requests reach you wherever its Messaging tab sends them (Slack, email, Lark or a webhook).</div>' : '') +
        (p.notes.length ? '<div><strong>You also</strong>' + listHtml(p.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; })) + '</div>' : '') +
        '<div class="row"><button type="button" class="primary tp-create">Create it</button><button type="button" class="tp-cancel">Cancel</button></div>' +
        '<div class="hint tp-status"></div></div>';
      slot.querySelector('.tp-cancel').addEventListener('click', function () { slot.innerHTML = ''; });
      slot.querySelector('.tp-create').addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        slot.querySelector('.tp-status').textContent = 'Creating it and installing its abilities' + ELLIPSIS + ' (this can take a minute)';
        api('POST', '/starter-templates/' + encodeURIComponent(id) + '/create').then(function (r2) {
          if (!r2.ok) { btn.disabled = false; slot.querySelector('.tp-status').textContent = r2.body.error || 'Could not create it'; return; }
          var c = r2.body;
          var installed = c.abilities.installed.map(function (a) { return '<code>' + esc(a) + '</code>'; }).join(' ');
          slot.innerHTML = '<div class="tp-preview">' +
            '<div><strong>Created <code>' + esc(c.name) + '</code>.</strong> Anything its permissions don' + String.fromCharCode(8217) + 't cover asks you first.</div>' +
            (installed ? '<div>' + CHECK + ' Installed ' + installed + '</div>' : '') +
            (c.schedule ? '<div>' + CHECK + ' Schedule created, paused: ' + esc(c.schedule.description) + (c.schedule.next_run_at ? ' (first run ' + esc(new Date(c.schedule.next_run_at).toLocaleString()) + ' once turned on)' : '') + '</div>' : '') +
            (c.loadError ? '<div class="error">It was written but couldn' + String.fromCharCode(8217) + 't be loaded: ' + esc(c.loadError) + '</div>' : '') +
            (c.scheduleError ? '<div class="error">Its schedule wasn' + String.fromCharCode(8217) + 't created: ' + esc(c.scheduleError) + '. Add one in its Schedules tab.</div>' : '') +
            '<div><strong>Finish setup:</strong>' + checklistHtml(c.checklist) + '</div>' +
            (c.exampleMessage ? '<div><strong>Try it</strong> in Chat with: <em>' + esc(c.exampleMessage) + '</em></div>' : '') +
            '<div class="row"><a class="tp-btn" href="/agents/config?agent=' + encodeURIComponent(c.name) + '">Open ' + esc(c.name) + '</a>' +
            '<a class="tp-btn plain" href="' + esc(leShell.tabHref(c.name, 'chat')) + '">Try it in Chat</a></div></div>';
        }).catch(function () { btn.disabled = false; slot.querySelector('.tp-status').textContent = 'Could not reach the server; try again.'; });
      });
    });
  }

  show();
})();
</script>
</body>
</html>`
