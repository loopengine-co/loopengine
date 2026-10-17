// The console's "Find your first agent" page (/interview): a chat with the
// built-in interviewer (core/system-agents/interviewer.ts), the ranked
// candidates it finds, and Create this agent (web/interview-admin.ts
// behind /interviews/*). Same shell and styles as the other console
// pages. Like them, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const interviewPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Find your first agent</title>
<style>${devUiCss}
  .iv-steps { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--ink-faint); }
  .iv-steps span { padding: 2px 8px; border-radius: 999px; background: var(--surface); }
  .iv-steps span.on { background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; }
  .iv-chat { display: grid; gap: 10px; max-width: 760px; }
  .iv-msg { padding: 10px 14px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; font-size: 14px; max-width: 85%; }
  .iv-msg.assistant { background: var(--surface); justify-self: start; }
  .iv-msg.user { background: var(--accent-soft); justify-self: end; }
  .iv-compose { display: grid; gap: 8px; max-width: 760px; }
  .iv-compose textarea { min-height: 72px; font: inherit; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); color: var(--ink); }
  .iv-compose .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .iv-cards { display: grid; gap: 12px; max-width: 760px; }
  .iv-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 8px; }
  .iv-card h3 { margin: 0; font-size: 15px; }
  .iv-card .meta { font-size: 12.5px; color: var(--ink-muted); display: grid; gap: 4px; }
  .iv-card .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .iv-preview { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 8px; font-size: 13px; }
  .iv-preview pre { white-space: pre-wrap; max-height: 180px; overflow: auto; margin: 0; }
  .iv-list { display: grid; gap: 6px; max-width: 760px; }
  .iv-list a { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); text-decoration: none; color: var(--ink); font-size: 13.5px; }
  .iv-btn { display: inline-block; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; background: var(--accent); color: var(--on-accent); }
  .iv-btn.plain { background: none; color: var(--ink); border: 1px solid var(--line); }
  .hint { font-size: 12px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); }
</style>
</head>
<body data-le-page="interview">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Find your first agent</h1><p>A short interview about your work. It suggests up to three agents worth building, and creates the one you pick. Every agent it creates asks you before it sends, pays, changes or deletes anything.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page" id="ivPage"><p class="hint">Loading&hellip;</p></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('ivPage');
  var STAGES = [['work', 'Your work'], ['tools', 'Your tools'], ['tasks', 'Repeat tasks'], ['details', 'Details'], ['done', 'Results']];
  var ELLIPSIS = String.fromCharCode(8230);
  var current = null;
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function setUrl(id) {
    var url = new URL(location.href);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    history.replaceState(null, '', url.pathname + url.search);
  }

  // ---- Start page: past interviews and a Start button ----
  function showStart(message) {
    current = null;
    setUrl(null);
    api('GET', '/interviews').then(function (r) {
      var list = (r.ok && r.body.interviews) || [];
      var ready = r.ok && r.body.ready;
      page.innerHTML =
        '<section style="max-width:760px"><p>About 10 minutes, a few questions at a time, in any language. Nothing is created until you choose to.</p>' +
        (ready ? '<button type="button" class="primary" id="ivStart">Start the interview</button>'
               : '<p class="error">The interviewer uses the model of one of your agents, and none has a model set yet. Set one on an agent (Overview, then Model) and add its key under Models.</p>') +
        (message ? '<p class="error">' + esc(message) + '</p>' : '') + '</section>' +
        (list.length ? '<section><h3>Your interviews</h3><div class="iv-list">' + list.map(function (iv) {
          var made = Object.keys(iv.created || {}).length;
          var label = iv.candidates && iv.candidates.length ? iv.candidates.length + ' suggestion' + (iv.candidates.length === 1 ? '' : 's') + (made ? ', ' + made + ' created' : '') : 'In progress';
          return '<a href="?id=' + esc(iv.id) + '" data-id="' + esc(iv.id) + '"><span>' + esc(new Date(iv.startedAt).toLocaleString()) + '</span><span class="hint">' + esc(label) + '</span></a>';
        }).join('') + '</div></section>' : '');
      var start = document.getElementById('ivStart');
      if (start) start.addEventListener('click', function () {
        start.disabled = true;
        api('POST', '/interviews').then(function (r2) {
          if (!r2.ok) { showStart(r2.body.error || 'Could not start'); return; }
          showInterview(r2.body);
        });
      });
      Array.prototype.forEach.call(page.querySelectorAll('.iv-list a'), function (a) {
        a.addEventListener('click', function (ev) { ev.preventDefault(); load(a.getAttribute('data-id')); });
      });
    });
  }

  function load(id) {
    api('GET', '/interviews/' + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { showStart(r.body.error || 'Could not open that interview'); return; }
      showInterview(r.body);
    });
  }

  // ---- The interview: steps, chat, answer box, results ----
  function stepsHtml(stage) {
    var at = STAGES.map(function (s) { return s[0]; }).indexOf(stage);
    return '<div class="iv-steps">' + STAGES.map(function (s, i) {
      return '<span class="' + (i === at ? 'on' : '') + '">' + s[1] + '</span>';
    }).join('') + '</div>';
  }

  function cardHtml(c, i, iv) {
    var made = iv.created && iv.created[String(i)];
    var needs = (c.needs || []).map(function (n) { return esc(n.name || n.description); }).join(', ');
    return '<div class="iv-card" data-index="' + i + '">' +
      '<h3>' + (i + 1) + '. ' + esc(c.title) + ' <span class="hint">' + String.fromCharCode(183) + ' saves about ' + esc(Math.round(c.hoursPerWeek * 10) / 10) + ' h a week</span></h3>' +
      '<div>' + esc(c.summary) + '</div>' +
      '<div class="meta">' +
        '<div><strong>Starts:</strong> ' + esc(c.trigger.description) + '</div>' +
        (c.asksFirst && c.asksFirst.length ? '<div><strong>Asks you first:</strong> ' + esc(c.asksFirst.join(', ')) + '</div>' : '') +
        (needs ? '<div><strong>Needs:</strong> ' + needs + '</div>' : '') +
      '</div>' +
      '<div class="row">' + (made
        ? '<a class="iv-btn" href="/agents/config?agent=' + encodeURIComponent(made) + '">Open ' + esc(made) + '</a>'
        : '<button type="button" class="primary iv-preview-btn">Create this agent</button>') +
      '</div><div class="iv-slot"></div></div>';
  }

  function showInterview(iv) {
    current = iv;
    setUrl(iv.id);
    var done = iv.stage === 'done' && iv.candidates && iv.candidates.length;
    page.innerHTML =
      stepsHtml(iv.stage) +
      '<div class="iv-chat" id="ivChat">' + iv.display.map(function (m) {
        return '<div class="iv-msg ' + (m.role === 'user' ? 'user' : 'assistant') + '">' + esc(m.text) + '</div>';
      }).join('') + '</div>' +
      (done ? '<section><h3>Agents worth building</h3><div class="iv-cards">' + iv.candidates.map(function (c, i) { return cardHtml(c, i, iv); }).join('') + '</div></section>' : '') +
      '<form class="iv-compose" id="ivCompose"><textarea name="text" placeholder="' + (done ? 'Ask about a suggestion, or for a change' : 'Your answer') + '"></textarea>' +
        '<div class="row"><button type="submit" class="primary">Send</button>' +
        (done ? '' : '<button type="button" id="ivFinish">Finish now</button>') +
        '<a href="/interview" id="ivBack" class="hint" style="margin-left:auto">All interviews</a></div>' +
        '<div id="ivStatus" class="hint"></div></form>';
    var chat = document.getElementById('ivChat');
    var last = chat.lastElementChild;
    if (last && !done) last.scrollIntoView({ block: 'end' });
    var form = document.getElementById('ivCompose');
    var status = document.getElementById('ivStatus');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = form.querySelector('textarea').value.trim();
      if (!text || busy) return;
      busy = true;
      chat.insertAdjacentHTML('beforeend', '<div class="iv-msg user">' + esc(text) + '</div><div class="iv-msg assistant hint" id="ivTyping">' + ELLIPSIS + '</div>');
      form.querySelector('textarea').value = '';
      document.getElementById('ivTyping').scrollIntoView({ block: 'end' });
      api('POST', '/interviews/' + encodeURIComponent(iv.id) + '/messages', { text: text }).then(function (r) {
        busy = false;
        if (!r.ok) { var t = document.getElementById('ivTyping'); if (t) t.remove(); status.textContent = r.body.error || 'Something went wrong'; return; }
        showInterview(r.body);
      }).catch(function () { busy = false; status.textContent = 'Could not reach the server; try again.'; });
    });
    form.querySelector('textarea').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) form.requestSubmit();
    });
    var finish = document.getElementById('ivFinish');
    if (finish) finish.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      finish.disabled = true;
      status.textContent = 'Ranking what it has' + ELLIPSIS;
      api('POST', '/interviews/' + encodeURIComponent(iv.id) + '/finish').then(function (r) {
        busy = false;
        if (!r.ok) { finish.disabled = false; status.textContent = r.body.error || 'Something went wrong'; return; }
        showInterview(r.body);
      });
    });
    document.getElementById('ivBack').addEventListener('click', function (ev) { ev.preventDefault(); showStart(); });
    Array.prototype.forEach.call(page.querySelectorAll('.iv-preview-btn'), function (btn) {
      btn.addEventListener('click', function () { preview(btn.closest('.iv-card')); });
    });
  }

  // ---- Create this agent: preview, then create, then Finish setup ----
  function checklistHtml(items) {
    if (!items.length) return '<p>Nothing else to set up.</p>';
    return '<ul style="margin:0;padding-left:18px">' + items.map(function (it) {
      return '<li>' + (it.href ? '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>' : esc(it.label)) + '</li>';
    }).join('') + '</ul>';
  }

  function preview(card) {
    var i = card.getAttribute('data-index');
    var slot = card.querySelector('.iv-slot');
    slot.innerHTML = '<p class="hint">Loading' + ELLIPSIS + '</p>';
    api('GET', '/interviews/' + encodeURIComponent(current.id) + '/candidates/' + i + '/preview').then(function (r) {
      if (!r.ok) { slot.innerHTML = '<p class="error">' + esc(r.body.error || 'Could not prepare it') + '</p>'; return; }
      var p = r.body;
      slot.innerHTML = '<div class="iv-preview">' +
        '<div><strong>Agent:</strong> <code>' + esc(p.name) + '</code></div>' +
        '<div><strong>Instructions:</strong><pre>' + esc(p.systemPrompt) + '</pre></div>' +
        '<div><strong>Permissions:</strong> ' + esc(p.permissions) + '</div>' +
        (p.schedule ? '<div><strong>Schedule:</strong> ' + esc(p.schedule) + '</div>' : '') +
        '<div><strong>Then, to finish setup:</strong>' + checklistHtml(p.checklist) + '</div>' +
        '<div class="row"><button type="button" class="primary iv-create">Create it</button><button type="button" class="iv-cancel">Cancel</button></div>' +
        '<div class="hint iv-create-status"></div></div>';
      slot.querySelector('.iv-cancel').addEventListener('click', function () { slot.innerHTML = ''; });
      slot.querySelector('.iv-create').addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        slot.querySelector('.iv-create-status').textContent = 'Creating' + ELLIPSIS;
        api('POST', '/interviews/' + encodeURIComponent(current.id) + '/candidates/' + i + '/create').then(function (r2) {
          if (!r2.ok) { btn.disabled = false; slot.querySelector('.iv-create-status').textContent = r2.body.error || 'Could not create it'; return; }
          var c = r2.body;
          slot.innerHTML = '<div class="iv-preview">' +
            '<div><strong>Created <code>' + esc(c.name) + '</code>.</strong> It asks you before every tool until you change that in its Permissions tab.</div>' +
            (c.scheduleError ? '<div class="error">Its schedule wasn' + String.fromCharCode(8217) + 't created: ' + esc(c.scheduleError) + '. Add one in its Schedules tab.</div>' : '') +
            '<div><strong>Finish setup:</strong>' + checklistHtml(c.checklist) + '</div>' +
            (c.exampleMessage ? '<div><strong>Try it</strong> in Chat with: <em>' + esc(c.exampleMessage) + '</em></div>' : '') +
            '<div class="row"><a class="iv-btn" href="/agents/config?agent=' + encodeURIComponent(c.name) + '">Open ' + esc(c.name) + '</a>' +
            '<a class="iv-btn plain" href="' + esc(leShell.tabHref(c.name, 'chat')) + '">Try it in Chat</a></div></div>';
          current.created = current.created || {};
          current.created[String(i)] = c.name;
        });
      });
    });
  }

  var initial = new URLSearchParams(location.search).get('id');
  if (initial) load(initial); else showStart();
})();
</script>
</body>
</html>`
