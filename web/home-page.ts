// The console's home page (/ and /home): one question, "What should your
// agents take care of?", in a box to answer it in your own words, with a
// few suggestions; what goes in starts a goal (web/goals-page.ts, which
// suggests the workflows it needs), and "Just one workflow" builds a
// single one instead (web/workflow-page.ts). Under it, what's waiting for
// you and the latest runs, from the Inbox's data (/inbox/items), each
// opening its conversation. Every workflow, as a table, is at /workflows.
// Like the other console pages, its inline script avoids backslashes and
// template placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const homePageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home</title>
<style>${devUiCss}
  .hm { width: 100%; max-width: 760px; margin: 0 auto; display: grid; gap: 40px; padding: 8vh 0 48px; }
  .hm-hello { display: grid; justify-items: center; gap: 14px; text-align: center; }
  .hm-mark { width: 44px; height: 44px; border-radius: 13px; background: var(--accent); display: grid; place-items: center; box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 28%, transparent); }
  .hm-mark svg { width: 22px; height: 22px; }
  .hm-greet { margin: 0; font-size: 14px; color: var(--ink-muted); }
  .hm-q { margin: 0; font-size: 34px; line-height: 1.18; font-weight: 400; letter-spacing: -0.025em; color: var(--ink-muted); }
  .hm-q b { font-weight: 650; color: var(--ink); }
  .hm-box { display: grid; gap: 10px; padding: 14px 14px 12px 18px; border: 1px solid var(--line); border-radius: 20px; background: var(--bg); box-shadow: 0 2px 10px rgba(0, 0, 0, .05); transition: border-color .15s, box-shadow .15s; }
  .hm-box:focus-within { border-color: var(--ink-faint); box-shadow: 0 4px 18px rgba(0, 0, 0, .08); }
  .hm-box textarea { border: 0; padding: 4px 0; min-height: 64px; max-height: 240px; resize: none; font-size: 15.5px; line-height: 1.5; background: none; }
  .hm-box textarea:focus { outline: none; }
  .hm-box-foot { display: flex; align-items: center; gap: 10px; }
  .hm-box-foot .hint { flex: 1; font-size: 12.5px; color: var(--ink-faint); }
  .hm-alt { border: 0; background: none; padding: 0; height: auto; font-size: 12.5px; font-weight: 600; color: var(--ink-muted); }
  .hm-alt:hover:not(:disabled) { background: none; color: var(--ink); text-decoration: underline; }
  .hm-send { width: 36px; height: 36px; padding: 0; border-radius: 50%; border: 0; background: var(--primary); color: var(--on-primary); display: grid; place-items: center; }
  .hm-send:hover:not(:disabled) { background: var(--primary); opacity: .88; }
  .hm-send:disabled { opacity: .3; }
  .hm-send svg { width: 17px; height: 17px; }
  .hm-ideas { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .hm-idea { border: 1px solid var(--line); background: var(--bg); border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 500; color: var(--ink-muted); height: auto; }
  .hm-idea:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .hm-section { display: grid; gap: 10px; }
  .hm-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .hm-label { margin: 0; font-size: 12px; font-weight: 600; color: var(--ink-faint); font-family: var(--font-mono); letter-spacing: 0; }
  .hm-section-head a { font-size: 12.5px; font-weight: 600; color: var(--ink-muted); text-decoration: none; }
  .hm-section-head a:hover { color: var(--ink); }
  .hm-list { display: grid; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--bg); }
  .hm-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
  .hm-row:first-child { border-top: 0; }
  .hm-row:hover { background: var(--surface); }
  .hm-row-main { display: grid; gap: 2px; min-width: 0; }
  .hm-row-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hm-row-sub { font-size: 12.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hm-row-side { display: grid; justify-items: end; gap: 3px; font-size: 12px; color: var(--ink-faint); white-space: nowrap; }
  .hm-list.needs { border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
  .hm-empty { padding: 18px 16px; font-size: 13px; color: var(--ink-muted); text-align: center; }
  .hm-state { font-size: 11.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .hm-state.warn { background: var(--warn-soft); color: var(--warn); }
  .hm-state.good { background: var(--good-soft); color: var(--good); }
  .hm-state.bad { background: var(--bad-soft); color: var(--bad); }
  .hm-state.run { background: var(--accent-soft); color: var(--accent-ink); }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 620px) { .hm { padding-top: 24px; } .hm-q { font-size: 26px; } .hm-row { grid-template-columns: minmax(0, 1fr); } .hm-row-side { justify-items: start; grid-auto-flow: column; justify-content: start; gap: 8px; } }
</style>
</head>
<body data-le-page="home">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-scroll"><div class="le-page" style="max-width:none">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <div class="hm">
      <div class="hm-hello">
        <span class="hm-mark" aria-hidden="true"><svg viewBox="0 0 14 14" fill="none"><path d="M3 7a4 4 0 1 0 4-4" stroke="var(--on-accent)" stroke-width="1.8" stroke-linecap="round"/><path d="M7 1.2v3.6L9.2 3z" fill="var(--on-accent)"/></svg></span>
        <p class="hm-greet" id="hmGreet">Hello</p>
        <h1 class="hm-q">What should your agents <b>take care of</b>?</h1>
      </div>
      <form class="hm-box" id="hmForm">
        <textarea id="hmText" rows="2" maxlength="500" aria-label="What should your agents take care of?" placeholder="Describe it in your own words, e.g. answer every customer email within a day"></textarea>
        <div class="hm-box-foot">
          <span class="hint">Your agents suggest the workflows it takes. Nothing runs until you say so.</span>
          <button type="button" class="hm-alt" id="hmOne" title="Plan a single workflow from this, for one agent">Just one workflow</button>
          <button type="submit" class="hm-send" id="hmSend" aria-label="Suggest workflows" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg></button>
        </div>
      </form>
      <div class="hm-ideas" id="hmIdeas"></div>
      <section class="hm-section" id="hmWaiting" hidden></section>
      <section class="hm-section" id="hmRecent"><div class="hm-section-head"><p class="hm-label">// Latest runs</p></div><p class="hint">Loading&hellip;</p></section>
    </div>
  </div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var esc = window.leShell.esc;
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var IDEAS = ['Answer every customer email within a day', 'Post on LinkedIn three times a week', 'Send me a sales summary every Monday', 'Follow up on unpaid invoices'];
  var text = document.getElementById('hmText');
  var send = document.getElementById('hmSend');

  var hour = new Date().getHours();
  document.getElementById('hmGreet').textContent = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // The box grows with what's typed, and sends on Enter (Shift+Enter for
  // a new line).
  function sync() {
    send.disabled = text.value.trim().length < 5;
    text.style.height = 'auto';
    text.style.height = Math.min(240, text.scrollHeight) + 'px';
  }
  text.addEventListener('input', sync);
  text.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!send.disabled) go(); }
  });
  function go() { location.href = '/goals?new=1&go=1&text=' + encodeURIComponent(text.value.trim()); }
  document.getElementById('hmForm').addEventListener('submit', function (ev) { ev.preventDefault(); if (!send.disabled) go(); });
  document.getElementById('hmOne').addEventListener('click', function () {
    location.href = '/workflows/new' + (text.value.trim() ? '?description=' + encodeURIComponent(text.value.trim()) : '');
  });
  var ideas = document.getElementById('hmIdeas');
  ideas.innerHTML = IDEAS.map(function (i) { return '<button type="button" class="hm-idea">' + esc(i) + '</button>'; }).join('');
  ideas.addEventListener('click', function (ev) {
    var b = ev.target.closest('.hm-idea');
    if (!b) return;
    text.value = b.textContent;
    sync();
    text.focus();
  });
  text.focus();

  // 1 hour ago, Yesterday, 3 days ago, then the date.
  function ago(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) { var m = Math.floor(s / 60); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (d >= today) { var h = Math.floor(s / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    var days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  var STATES = { needs: ['warn', 'Needs you'], running: ['run', 'Running'], completed: ['good', 'Completed'], failed: ['bad', 'Failed'] };
  function rowHtml(i) {
    var st = i.waiting && i.waiting.length ? ['warn', i.waiting.indexOf('approval') !== -1 ? 'Approval needed' : 'Question for you'] : (STATES[i.state] || ['', i.state]);
    return '<a class="hm-row" href="/inbox?item=' + encodeURIComponent(i.id) + '">' +
      '<span class="hm-row-main"><span class="hm-row-title">' + esc(i.title) + '</span>' +
        '<span class="hm-row-sub">' + esc(i.agentLabel || i.agent) + DOT + esc(i.workflowTitle) + (i.summary ? DOT + esc(i.summary) : '') + '</span></span>' +
      '<span class="hm-row-side"><span class="hm-state ' + st[0] + '">' + esc(st[1]) + '</span><span>' + esc(ago(i.waitingSince || i.lastActivity)) + '</span></span></a>';
  }

  // Waiting for you (its own block, when anything waits), then the latest
  // runs that don't.
  fetch('/inbox/items?view=all', { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      var items = d.items || [];
      var needs = items.filter(function (i) { return i.state === 'needs'; });
      var rest = items.filter(function (i) { return i.state !== 'needs'; }).slice(0, 6);
      var waiting = document.getElementById('hmWaiting');
      if (needs.length) {
        waiting.hidden = false;
        waiting.innerHTML = '<div class="hm-section-head"><p class="hm-label">// Waiting for you ' + String.fromCharCode(183) + ' ' + needs.length + '</p><a href="/inbox?view=needs">Open the Inbox ' + String.fromCharCode(8594) + '</a></div>' +
          '<div class="hm-list needs">' + needs.slice(0, 5).map(rowHtml).join('') + '</div>';
      }
      document.getElementById('hmRecent').innerHTML = '<div class="hm-section-head"><p class="hm-label">// Latest runs</p>' + (rest.length ? '<a href="/workflows">All workflows ' + String.fromCharCode(8594) + '</a>' : '') + '</div>' +
        (rest.length ? '<div class="hm-list">' + rest.map(rowHtml).join('') + '</div>'
          : '<div class="hm-list"><p class="hm-empty">No runs yet. Describe something above, and the workflows your agents build will show their runs here.</p></div>');
    })
    .catch(function (err) { document.getElementById('hmRecent').innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your runs: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
