// The console's home page (/ and /home). Under its top bar, a two-line
// question, "What should your agents take care of today?", and the box
// to answer it in, with the mascot perched on its edge. Two ways to send
// it: Suggest workflows (the default) starts a goal (web/goals-page.ts,
// which suggests the workflows it takes), One workflow plans a single one
// for the agent chosen (web/workflow-page.ts). Under the box, a link to
// connect apps, three ideas to start from, then what's waiting for you
// and the latest runs, from the Inbox's data (/inbox/items), each opening
// its conversation. Every workflow, as a table, is at /workflows.
// Like the other console pages, its inline script avoids backslashes and
// template placeholders, since it lives inside a template literal.
import { devUiCss, themeHeadHtml } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'

const IDEA_ICONS = {
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>',
  invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>',
}

export const homePageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home</title>
${themeHeadHtml}<style>${devUiCss}${MASCOT_CSS}
  .hm { width: 100%; max-width: 860px; margin: 0 auto; display: grid; gap: 44px; padding: 0 0 56px; }
  /* The hero, between two guide lines, with crosses where they end. */
  .hm-hero { position: relative; display: grid; justify-items: center; gap: 0; padding: 7vh 56px 44px; border-left: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .hm-hero::before, .hm-hero::after { content: ""; position: absolute; bottom: -5px; width: 9px; height: 9px; background: linear-gradient(var(--accent), var(--accent)) center / 1px 100% no-repeat, linear-gradient(var(--accent), var(--accent)) center / 100% 1px no-repeat; }
  .hm-hero::before { left: -5px; }
  .hm-hero::after { right: -5px; }
  .hm-q { margin: 0 0 30px; text-align: center; font-size: 40px; line-height: 1.15; font-weight: 400; letter-spacing: -0.03em; }
  .hm-q .soft { display: block; color: var(--ink-faint); }
  .hm-mascot { margin: 0 0 -16px; position: relative; z-index: 1; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .hm-composer { width: 100%; max-width: 620px; border-radius: 18px; background: var(--surface); padding: 0 0 2px; }
  .hm-box { display: grid; gap: 12px; padding: 16px 16px 14px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg); box-shadow: 0 3px 14px rgba(0, 0, 0, .06); transition: border-color .15s, box-shadow .15s; }
  .hm-box:focus-within { border-color: var(--ink-faint); box-shadow: 0 6px 22px rgba(0, 0, 0, .09); }
  .hm-box textarea { border: 0; padding: 2px 2px; min-height: 54px; max-height: 240px; resize: none; font-size: 15.5px; line-height: 1.5; background: none; }
  .hm-box textarea:focus { outline: none; }
  .hm-box-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hm-box-foot .le-seg { margin-right: auto; }
  .hm-agent { height: 34px; border: 0; background: none; font-size: 13px; color: var(--ink-muted); padding: 0 6px; }
  .hm-agent[hidden] { display: none; }
  .hm-send { width: 38px; height: 38px; padding: 0; border-radius: 11px; border: 0; background: var(--primary); color: var(--on-primary); display: grid; place-items: center; }
  .hm-send:hover:not(:disabled) { background: var(--primary); opacity: .88; }
  .hm-send:disabled { opacity: .3; }
  .hm-send svg { width: 17px; height: 17px; }
  .hm-connect { display: flex; align-items: center; gap: 8px; padding: 10px 16px 9px; font-size: 13px; color: var(--ink-muted); text-decoration: none; }
  .hm-connect:hover { color: var(--ink); }
  .hm-connect svg { width: 15px; height: 15px; flex: none; }
  .hm-ideas { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hm-top { display: grid; }
  .hm-top .hm-ideas { border-top: 0; }
  .hm-top .hm-ideas::before, .hm-top .hm-ideas::after { display: none; }
  .hm-idea { display: flex; align-items: center; gap: 14px; padding: 22px 20px; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; background: var(--bg); text-align: left; font-size: 14px; line-height: 1.35; color: var(--ink-muted); height: auto; cursor: pointer; transition: background .15s, color .15s; }
  .hm-idea:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .hm-idea-icon { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 11px; border: 1px solid var(--line); background: var(--bg); color: var(--ink-muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
  .hm-idea-icon svg { width: 18px; height: 18px; }
  .hm-section { display: grid; gap: 12px; }
  .hm-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .hm-label { margin: 0; font-size: 12px; color: var(--ink-faint); font-family: var(--font-mono); }
  .hm-section-head a { font-size: 12.5px; font-weight: 600; color: var(--ink-muted); text-decoration: none; }
  .hm-section-head a:hover { color: var(--ink); }
  .hm-list { grid-template-columns: minmax(0, 1fr); }
  .hm-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 14px 18px; color: var(--ink); text-decoration: none; background: var(--bg); }
  .hm-row:hover { background: var(--surface); }
  .hm-row-main { display: grid; gap: 2px; min-width: 0; }
  .hm-row-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hm-row-sub { font-size: 12.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hm-row-side { display: grid; justify-items: end; gap: 3px; font-size: 12px; color: var(--ink-faint); white-space: nowrap; }
  .hm-empty { padding: 20px 18px; font-size: 13px; color: var(--ink-muted); text-align: center; }
  .hm-state { font-size: 11.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .hm-state.warn { background: var(--warn-soft); color: var(--warn); }
  .hm-state.good { background: var(--good-soft); color: var(--good); }
  .hm-state.bad { background: var(--bad-soft); color: var(--bad); }
  .hm-state.run { background: var(--accent-soft); color: var(--accent-ink); }
  .hm-page { padding-top: 0; max-width: none; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 720px) {
    .hm-hero { padding: 32px 18px 30px; }
    .hm-q { font-size: 30px; }
    .hm-ideas { grid-template-columns: minmax(0, 1fr); }
    .hm-row { grid-template-columns: minmax(0, 1fr); }
    .hm-row-side { justify-items: start; grid-auto-flow: column; justify-content: start; gap: 8px; }
  }
</style>
</head>
<body data-le-page="home">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <header class="le-topbar">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <h1 class="le-topbar-title">Home</h1>
    <span class="le-topbar-gap"></span>
    <a class="le-btn-dark" href="/workflows?new=1">+ New workflow</a>
  </header>
  <div class="le-scroll"><div class="le-page hm-page">
    <div class="hm">
      <div class="hm-top">
      <section class="hm-hero">
        <h2 class="hm-q"><span class="soft" id="hmGreet">Hello,</span>what should your agents take care of?</h2>
        <span class="hm-mascot">${mascotSvg(76)}</span>
        <div class="hm-composer">
          <form class="hm-box" id="hmForm">
            <textarea id="hmText" rows="2" maxlength="500" aria-label="What should your agents take care of?" placeholder="Describe what you want done, in your own words"></textarea>
            <div class="hm-box-foot">
              <span class="le-seg" role="group" aria-label="What to make">
                <button type="button" data-mode="goal" aria-pressed="true" title="Your agents suggest the workflows it takes">Suggest workflows</button>
                <button type="button" data-mode="one" aria-pressed="false" title="Plan a single workflow for one agent">One workflow</button>
              </span>
              <select class="hm-agent" id="hmAgent" aria-label="Agent" hidden><option value="">Any agent</option></select>
              <button type="submit" class="hm-send" id="hmSend" aria-label="Send" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button>
            </div>
          </form>
          <a class="hm-connect" href="/config?section=apps"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Connect your apps to give your agents more to work with</a>
        </div>
      </section>
      <div class="le-grid hm-ideas" id="hmIdeas">
        <button type="button" class="hm-idea"><span class="hm-idea-icon">${IDEA_ICONS.mail}</span><span>Answer every customer email within a day</span></button>
        <button type="button" class="hm-idea"><span class="hm-idea-icon">${IDEA_ICONS.chart}</span><span>Send me a sales summary every Monday</span></button>
        <button type="button" class="hm-idea"><span class="hm-idea-icon">${IDEA_ICONS.invoice}</span><span>Follow up on unpaid invoices each week</span></button>
      </div>
      </div>
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
  var text = document.getElementById('hmText');
  var send = document.getElementById('hmSend');
  var agentPick = document.getElementById('hmAgent');
  var mode = 'goal';

  var hour = new Date().getHours();
  document.getElementById('hmGreet').textContent = (hour < 5 ? 'Working late?' : hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,');

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
  function go() {
    var said = text.value.trim();
    if (mode === 'one') location.href = '/workflows?new=1&description=' + encodeURIComponent(said) + (agentPick.value ? '&agent=' + encodeURIComponent(agentPick.value) : '');
    else location.href = '/goals?new=1&go=1&text=' + encodeURIComponent(said);
  }
  document.getElementById('hmForm').addEventListener('submit', function (ev) { ev.preventDefault(); if (!send.disabled) go(); });
  // Suggest workflows, or One workflow (for the agent chosen).
  document.querySelector('.hm-box .le-seg').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-mode]');
    if (!b) return;
    mode = b.getAttribute('data-mode');
    var all = this.querySelectorAll('[data-mode]');
    for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', String(all[i] === b));
    agentPick.hidden = mode !== 'one';
    text.focus();
  });
  window.leShell.ready.then(function (agents) {
    agentPick.innerHTML = '<option value="">Any agent</option>' + (agents || []).map(function (a) { return '<option value="' + esc(a.name) + '">' + esc(a.displayName || a.name) + '</option>'; }).join('');
  });
  document.getElementById('hmIdeas').addEventListener('click', function (ev) {
    var b = ev.target.closest('.hm-idea');
    if (!b) return;
    text.value = b.textContent.trim();
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
          '<div class="le-grid hm-list">' + needs.slice(0, 5).map(rowHtml).join('') + '</div>';
      }
      document.getElementById('hmRecent').innerHTML = '<div class="hm-section-head"><p class="hm-label">// Latest runs</p>' + (rest.length ? '<a href="/workflows">All workflows ' + String.fromCharCode(8594) + '</a>' : '') + '</div>' +
        '<div class="le-grid hm-list">' + (rest.length ? rest.map(rowHtml).join('') : '<p class="hm-empty">No runs yet. Describe something above, and the workflows your agents build will show their runs here.</p>') + '</div>';
    })
    .catch(function (err) { document.getElementById('hmRecent').innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your runs: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
