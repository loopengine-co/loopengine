// The console's Inbox, for acting: every workflow run as a conversation
// between the agent and the people it works for. The list (All, Needs
// attention, Completed, Failed, Archived) shows each as its title, its
// agent and workflow, where it stands, what it last said and when; one
// opens beside it as a thread: what started it, what the agent said and
// did, what it asked and the answers and decisions people gave, how it
// ended, and (when it waits) the question to answer or the approval to
// give, right there (web/inbox-admin.ts behind /inbox/*). A run's trace,
// its record to download and saving it as an eval case are on its
// workflow's Activity tab. An approver or viewer sees only this page; a
// viewer can't decide. Like the other console pages, its inline script avoids
// backslashes and template placeholders, since it lives inside a template
// literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { renderMarkdownScript } from './markdown-script.js'

export const inboxPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inbox</title>
<style>${devUiCss}
  .ib { max-width: 980px; display: grid; gap: 16px; }
  .ib-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ib-bar select, .ib-bar input { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
  .ib-bar input { flex: 1; min-width: 160px; }
  .ib-state { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .ib-state.warn { background: var(--warn-soft); color: var(--warn); }
  .ib-state.good { background: var(--good-soft); color: var(--good); }
  .ib-state.bad { background: var(--bad-soft); color: var(--bad); }
  .ib-state.run { background: var(--accent-soft); color: var(--accent-ink); }
  body[data-le-page="inbox"] .le-page { max-width: 1320px; }
  .ib.is-inbox { max-width: none; }
  .ib-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--line); }
  .ib-tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; height: auto; padding: 8px 12px; margin-bottom: -1px; font-size: 13.5px; font-weight: 600; color: var(--ink-muted); }
  .ib-tabs button[aria-selected="true"] { color: var(--accent-ink); border-bottom-color: var(--accent); }
  .ib-tabs .ib-count { margin-left: 6px; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .ib-tabs button[data-view="needs"] .ib-count.on { background: var(--warn-soft); color: var(--warn); }
  .ib-split { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
  .ib-items { display: grid; gap: 8px; align-content: start; max-height: calc(100vh - 230px); overflow: auto; padding: 2px; }
  .ib-item { display: grid; gap: 5px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); text-decoration: none; }
  .ib-item:hover { border-color: var(--ink-faint); }
  .ib-item.is-selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .ib-item.is-needs { border-left: 3px solid var(--warn); }
  .ib-item-title { font-weight: 700; font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
  .ib-item-meta { font-size: 12.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ib-item .ib-state { justify-self: start; }
  .ib-item-summary { margin: 0; font-size: 13px; line-height: 1.45; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .ib-item-time { font-size: 12px; color: var(--ink-faint); }
  .ib-item-time.late { color: var(--warn); font-weight: 700; }
  .ib-thread { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: calc(100vh - 230px); }
  .ib-thread-empty { padding: 48px 24px; text-align: center; color: var(--ink-muted); font-size: 13.5px; }
  .ib-thread-head { display: grid; gap: 6px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .ib-thread-head h2 { margin: 0; font-size: 17px; letter-spacing: -0.01em; overflow-wrap: anywhere; }
  .ib-thread-top { display: flex; align-items: flex-start; gap: 10px; }
  .ib-thread-top h2 { flex: 1; min-width: 0; }
  .ib-thread-tools { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .ib-thread-tools a, .ib-thread-tools button { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--line); background: var(--bg); color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
  .ib-thread-tools .ib-thread-back { display: none; }
  .ib-msgs { list-style: none; margin: 0; padding: 16px 18px 20px; display: grid; gap: 12px; overflow: auto; align-content: start; }
  .ib-msg { display: grid; gap: 4px; max-width: 86%; min-width: 0; }
  .ib-msg.person { justify-self: end; justify-items: end; }
  .ib-msg.system { justify-self: center; justify-items: center; max-width: 100%; }
  .ib-msg-who { font-size: 11.5px; color: var(--ink-muted); }
  .ib-msg-who strong { color: var(--ink); font-weight: 600; }
  .ib-bubble { padding: 10px 14px; border-radius: 14px; background: var(--surface); font-size: 14px; line-height: 1.5; min-width: 0; max-width: 100%; overflow-wrap: anywhere; box-sizing: border-box; }
  .ib-msg.agent .ib-bubble { border-top-left-radius: 4px; }
  .ib-msg.person .ib-bubble { background: var(--accent-soft); color: var(--ink); border-top-right-radius: 4px; }
  .ib-msg.person.is-denied .ib-bubble { background: var(--bad-soft); }
  .ib-msg.system .ib-bubble { background: none; border: 1px dashed var(--line); font-size: 12.5px; color: var(--ink-muted); padding: 8px 12px; }
  .ib-msg.system .ib-kv { text-align: left; margin-top: 6px; color: var(--ink); }
  .ib-msg.failed .ib-bubble { background: var(--bad-soft); color: var(--bad); }
  .ib-msg.ask .ib-bubble { background: var(--bg); border: 1px solid var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); width: 100%; display: grid; gap: 10px; }
  .ib-msg.ask { max-width: 100%; width: 100%; }
  .ib-msg.ask .ib-card { border: 0; padding: 0; box-shadow: none; background: none; }
  .ib-act { justify-self: start; display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-muted); max-width: 100%; min-width: 0; }
  .ib-act summary { cursor: pointer; }
  .ib-act summary code { font-size: 12px; }
  .ib-act.failed summary { color: var(--bad); }
  .ib-typing { font-size: 13px; color: var(--ink-muted); font-style: italic; }
  @media (max-width: 860px) {
    .ib-split { grid-template-columns: minmax(0, 1fr); }
    .ib-split.has-thread .ib-items { display: none; }
    .ib-split:not(.has-thread) .ib-thread { display: none; }
    .ib-thread-tools .ib-thread-back { display: inline-flex; }
    .ib-items, .ib-thread { max-height: none; }
  }
  .ib-empty { padding: 28px 16px; text-align: center; color: var(--ink-muted); font-size: 13.5px; }
  .ib-link { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .ib-link:hover { text-decoration: underline; }
  .ib-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; color: var(--ink-muted); }
  .ib-card { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); padding: 14px 16px; display: grid; gap: 10px; }
  .ib-card h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); }
  .ib-card.needs { border-color: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
  .ib-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 6px 14px; font-size: 13.5px; }
  .ib-kv dt { color: var(--ink-muted); font-family: var(--font-mono); font-size: 12.5px; padding-top: 1px; }
  .ib-kv dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .ib-pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; background: var(--surface); padding: 10px 12px; border-radius: 8px; max-height: 360px; overflow: auto; }
  .ib-question { margin: 0; font-size: 14.5px; }
  .ib-card textarea { width: 100%; box-sizing: border-box; min-height: 80px; font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); resize: vertical; }
  .ib-card textarea.mono { font-family: var(--font-mono); font-size: 12.5px; min-height: 200px; }
  .ib-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .ib-btn { height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--primary); background: var(--primary); color: var(--on-primary); cursor: pointer; }
  .ib-btn.plain { background: none; border-color: var(--line); color: var(--ink); font-weight: 500; }
  .ib-btn.bad { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
  .ib-btn.opt { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; font-weight: 500; }
  .ib-change { display: grid; gap: 2px; margin: 2px 0 0 12px; font-size: 12.5px; }
  .ib-change del { color: var(--bad); }
  .ib-change ins { color: var(--good); text-decoration: none; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .ib-md { font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
  .ib-md > :first-child { margin-top: 0; }
  .ib-md > :last-child { margin-bottom: 0; }
  .ib-md p, .ib-md ul, .ib-md ol, .ib-md pre { margin: 0 0 .6em; }
  .ib-md ul, .ib-md ol { padding-left: 1.4em; }
  .ib-md li + li { margin-top: .25em; }
  .ib-md h1, .ib-md h2, .ib-md h3, .ib-md h4, .ib-md h5, .ib-md h6 { margin: .8em 0 .4em; font-size: 15px; line-height: 1.35; }
  .ib-md h1, .ib-md h2 { font-size: 16px; }
  .ib-md a { color: var(--accent-ink); }
  .ib-md code { font-family: var(--font-mono); font-size: .9em; background: var(--code-bg); padding: 1px 4px; border-radius: 4px; }
  .ib-md pre { background: var(--code-bg); padding: 10px 12px; border-radius: 8px; overflow-x: auto; }
  .ib-md pre code { background: none; padding: 0; }
  .ib-md hr { border: 0; border-top: 1px solid var(--line); margin: .8em 0; }
  .ib-md .workflow-markdown-table { overflow-x: auto; margin: 0 0 .6em; }
  .ib-md table { border-collapse: collapse; font-size: 13px; }
  .ib-md th, .ib-md td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 640px) { .ib-kv { grid-template-columns: 1fr; } }
</style>
</head>
<body data-le-page="inbox">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Inbox</h1><p>Your conversations with your agents' workflow runs: what each asks you, what it did, and how it ended.</p></div>
      </div>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="ib" id="ibPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
${renderMarkdownScript}
  var page = document.getElementById('ibPage');
  var ELLIPSIS = String.fromCharCode(8230);
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var params = new URLSearchParams(location.search);
  // All, Needs attention, Completed, Failed or Archived; none asked:
  // Needs attention when anything waits, else All. Recent (the older view)
  // is All now. ?item= is the conversation open beside the list.
  var VIEWS = [['all', 'All'], ['needs', 'Needs attention'], ['completed', 'Completed'], ['failed', 'Failed'], ['archived', 'Archived']];
  var asked = params.get('open') === '1' ? 'needs' : params.get('view') === 'recent' ? 'all' : params.get('view') || '';
  var state = { view: VIEWS.some(function (v) { return v[0] === asked; }) ? asked : '', q: params.get('q') || '', workflow: params.get('workflow') || '', item: params.get('item') || '' };
  var listed = null;
  var openThread = null;
  // The conversation the address opens on (?item=) is asked for now,
  // alongside the list, not after it: on a hosted workspace that saves a
  // round trip of hundreds of milliseconds. Used once.
  var earlyThread = state.item ? { id: state.item, response: fetch('/inbox/cases/' + encodeURIComponent(state.item), { headers: { accept: 'application/json' } }) } : null;
  var fullAccess = !document.querySelector('.le-app.le-inbox-only');
  var role = 'owner';
  var workflows = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
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
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  function when(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
  function canDecide() { return role !== 'viewer'; }

  // How long a case has waited: "Waiting 3 h", "Waiting 12 days".
  function waitedFor(ms) {
    var h = Math.floor(ms / 3600000);
    if (h < 1) return 'Waiting ' + Math.max(1, Math.floor(ms / 60000)) + ' min';
    if (h < 48) return 'Waiting ' + h + ' h';
    return 'Waiting ' + Math.floor(h / 24) + ' days';
  }
  // The run on its workflow's Activity tab, with its trace open.
  function traceHref(c) {
    return '/agents/config?agent=' + encodeURIComponent(c.agent) + '&tab=workflows&workflow=' + encodeURIComponent(c.workflowId) + '&wtab=activity&run=' + encodeURIComponent(c.id);
  }

  function stateHtml(item) {
    if (item.waiting && item.waiting.length) return '<span class="ib-state warn">' + (item.waiting.indexOf('approval') !== -1 ? 'Approval needed' : 'Question for you') + '</span>';
    if (item.status === 'running') return '<span class="ib-state run">Running</span>';
    if (item.status === 'awaiting_approval') return '<span class="ib-state warn">Waiting</span>';
    if (item.status === 'error') return '<span class="ib-state bad">Failed</span>';
    if (item.status === 'done') return '<span class="ib-state good">Completed</span>';
    return '<span class="ib-state">' + esc(item.status) + '</span>';
  }

  function listUrl() {
    var q = new URLSearchParams();
    q.set('view', state.view || 'auto');
    if (state.q) q.set('q', state.q);
    if (state.workflow) q.set('workflow', state.workflow);
    return '/inbox/items?' + q.toString();
  }
  function pageUrl() {
    var q = new URLSearchParams();
    if (state.view) q.set('view', state.view);
    if (state.q) q.set('q', state.q);
    if (state.workflow) q.set('workflow', state.workflow);
    if (state.item) q.set('item', state.item);
    var s = q.toString();
    return '/inbox' + (s ? '?' + s : '');
  }

  // A conversation in the list: its title, its agent and workflow, where
  // it stands, what it last said, and when.
  function itemHtml(i) {
    var waited = i.waitingSince ? Date.now() - new Date(i.waitingSince).getTime() : 0;
    var late = waited > 3 * 86400000;
    return '<a class="ib-item' + (i.id === state.item ? ' is-selected' : '') + (i.state === 'needs' ? ' is-needs' : '') + '" href="/inbox?item=' + encodeURIComponent(i.id) + '" data-item="' + esc(i.id) + '">' +
      '<span class="ib-item-title">' + esc(i.title) + '</span>' +
      '<span class="ib-item-meta">' + esc(i.agentLabel || i.agent) + DOT + esc(i.workflowTitle) + '</span>' +
      stateHtml(i) +
      (i.summary ? '<p class="ib-item-summary">' + esc(i.summary) + '</p>' : '') +
      '<span class="ib-item-time' + (late ? ' late' : '') + '" title="' + esc(when(i.lastActivity)) + '">' + esc(i.state === 'needs' ? (late ? waitedFor(waited) : ago(i.waitingSince || i.lastActivity)) : ago(i.lastActivity)) + '</span>' +
    '</a>';
  }

  var EMPTY = {
    all: 'Nothing here yet. Every workflow run shows here as a conversation: what it asks you, what it did and how it ended.',
    needs: 'Nothing needs you right now. Questions and approvals from your agents land here, however long ago they were asked.',
    completed: 'No completed runs.',
    failed: 'Nothing failed.',
    archived: 'Nothing archived. Archive a finished conversation to clear it from All.',
  };

  // The page around the list: the tabs, the filters, the list and the
  // open conversation. Drawn once; the list and tabs redraw in place.
  function renderInbox() {
    page.classList.add('is-inbox');
    page.innerHTML =
      '<div class="ib-tabs" role="tablist" aria-label="Show"></div>' +
      '<div class="ib-bar">' +
        '<select id="ibWorkflow" aria-label="Workflow"><option value="">All workflows</option></select>' +
        '<input id="ibSearch" type="search" placeholder="Search conversations, inputs or people" value="' + esc(state.q) + '" aria-label="Search">' +
      '</div>' +
      '<div class="ib-split"><div class="ib-items" role="list"><p class="hint">Loading' + ELLIPSIS + '</p></div>' +
        '<section class="ib-thread" aria-live="polite"><div class="ib-thread-empty">Pick a conversation to see it here.</div></section></div>';
    page.querySelector('.ib-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-view]');
      if (!b) return;
      state.view = b.getAttribute('data-view');
      refreshList();
    });
    page.querySelector('#ibWorkflow').addEventListener('change', function (ev) { state.workflow = ev.currentTarget.value; refreshList(); });
    var search = page.querySelector('#ibSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value.trim(); refreshList(); }, 300);
    });
    page.querySelector('.ib-items').addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-item]');
      if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      ev.preventDefault();
      selectItem(a.getAttribute('data-item'));
    });
  }

  function renderList(data) {
    listed = data;
    var items = data.items || [];
    (data.workflows || []).forEach(function (w) { workflows[w.id] = w.title; });
    state.view = data.view || state.view || 'all';
    var counts = data.counts || {};
    page.querySelector('.ib-tabs').innerHTML = VIEWS.map(function (v) {
      var n = counts[v[0]];
      return '<button type="button" role="tab" data-view="' + v[0] + '" aria-selected="' + (state.view === v[0]) + '">' + v[1] +
        (n ? '<span class="ib-count' + (v[0] === 'needs' ? ' on' : '') + '">' + n + '</span>' : '') + '</button>';
    }).join('');
    var select = page.querySelector('#ibWorkflow');
    select.innerHTML = '<option value="">All workflows</option>' + Object.keys(workflows).sort(function (a, b) { return workflows[a].localeCompare(workflows[b]); })
      .map(function (id) { return '<option value="' + esc(id) + '"' + (id === state.workflow ? ' selected' : '') + '>' + esc(workflows[id]) + '</option>'; }).join('');
    var box = page.querySelector('.ib-items');
    var top = box.scrollTop;
    box.innerHTML = items.length ? items.map(itemHtml).join('') : '<p class="ib-empty">' + esc(EMPTY[state.view] || EMPTY.all) + '</p>';
    box.scrollTop = top;
    // Wide enough for both: the first conversation opens beside the list.
    if (!state.item && items.length && window.matchMedia('(min-width: 861px)').matches) selectItem(items[0].id, true);
    // The open one changed (a decision, a new step): shown again, unless
    // someone is typing in it.
    var current = items.filter(function (i) { return i.id === state.item; })[0];
    if (current && openThread && openThread.lastActivity !== current.lastActivity && !threadInUse()) loadThread(state.item);
  }

  function refreshList() {
    history.replaceState(null, '', pageUrl());
    return fetch(listUrl(), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(renderList)
      .catch(function (err) { var box = page.querySelector('.ib-items'); if (box) box.innerHTML = '<p class="error">Could not load the Inbox: ' + esc(err.message) + '</p>'; });
  }

  function selectItem(id, quiet) {
    state.item = id;
    history.replaceState(null, '', pageUrl());
    var cards = page.querySelectorAll('.ib-item');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('is-selected', cards[i].getAttribute('data-item') === id);
    page.querySelector('.ib-split').classList.toggle('has-thread', !quiet);
    loadThread(id);
  }

  // Something being written in the open conversation: an answer, a
  // reason, changed arguments.
  function threadInUse() {
    var boxes = page.querySelectorAll('.ib-thread textarea');
    for (var i = 0; i < boxes.length; i++) if ((boxes[i].value && !boxes[i].hidden && boxes[i].className.indexOf('ib-args') === -1) || boxes[i] === document.activeElement) return true;
    return false;
  }

  function loadThread(id) {
    var box = page.querySelector('.ib-thread');
    if (!openThread || openThread.id !== id) box.innerHTML = '<div class="ib-thread-empty">Loading' + ELLIPSIS + '</div>';
    var early = earlyThread && earlyThread.id === id ? earlyThread.response : null;
    earlyThread = null;
    return (early || fetch('/inbox/cases/' + encodeURIComponent(id), { headers: { accept: 'application/json' } }))
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (c) {
        if (state.item !== id) return;
        var item = listed && (listed.items || []).filter(function (i) { return i.id === id; })[0];
        openThread = { id: id, lastActivity: item ? item.lastActivity : null };
        renderThread(c);
      })
      .catch(function (err) { if (state.item === id) box.innerHTML = '<div class="ib-thread-empty"><p class="error">Could not open it: ' + esc(err.message) + '</p></div>'; });
  }

  var SOURCES = { webhook: 'a webhook', schedule: 'a schedule', console: 'Run now', api: 'an app', assignment: 'an assignment', chain: 'another workflow' };

  function msgHtml(kind, who, at, body, extra) {
    return '<li class="ib-msg ' + kind + (extra ? ' ' + extra : '') + '">' +
      (who || at ? '<span class="ib-msg-who">' + (who ? '<strong>' + esc(who) + '</strong>' : '') + (who && at ? DOT : '') + (at ? '<span title="' + esc(when(at)) + '">' + esc(ago(at)) + '</span>' : '') + '</span>' : '') +
      '<div class="ib-bubble">' + body + '</div></li>';
  }
  function activityHtml(s) {
    return '<li class="ib-act' + (s.failed ? ' failed' : '') + '"><details><summary>' + (s.failed ? 'Tried ' : 'Used ') + '<code>' + esc(s.tool) + '</code>' + (s.failed ? ' (failed)' : '') + '</summary>' +
      '<pre class="ib-pre">' + esc(JSON.stringify(s.args, null, 2)) + '</pre>' + (s.result != null ? '<pre class="ib-pre" style="margin-top:6px">' + esc(s.result) + '</pre>' : '') + '</details></li>';
  }

  // The conversation, in order: what started it, then the agent's words,
  // the tools it used, what it asked and what people answered or decided,
  // then what it waits on now (answer or decide right there) or how it
  // ended.
  function threadMessagesHtml(c) {
    var run = c.run;
    var agent = c.agentLabel || c.agent;
    var out = [];
    if (run) {
      var params = run.params && Object.keys(run.params).length ? kvHtml(run.params) : '';
      out.push(msgHtml('system', '', run.started_at, 'Started by ' + esc(SOURCES[run.source] || run.source || 'a person') + (params ? params : '')));
    }
    var decisions = ((run && run.decisions) || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    var answers = ((run && run.answers) || []).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    var waitingTools = c.pending.filter(function (p) { return p.kind === 'approval'; }).map(function (p) { return p.tool; });
    var lastText = '';
    c.steps.forEach(function (s) {
      lastText = s.kind === 'text' ? s.text.trim() : '';
      if (s.kind === 'text') { out.push(msgHtml('agent', agent, '', '<div class="ib-md">' + renderMarkdownPreview(s.text) + '</div>')); return; }
      if (s.kind === 'question') {
        if (s.answer == null) return;
        var a = answers.shift();
        out.push(msgHtml('agent', agent, '', '<div class="ib-md">' + renderMarkdownPreview(s.question) + '</div>'));
        out.push(msgHtml('person', a && a.by ? a.by : 'Answer', a && a.at, '<div style="white-space:pre-wrap">' + esc(s.answer) + '</div>'));
        return;
      }
      var di = -1;
      for (var k = 0; k < decisions.length; k++) if (decisions[k].tool === s.tool) { di = k; break; }
      if (di >= 0) {
        var d = decisions.splice(di, 1)[0];
        out.push(msgHtml('agent', agent, '', 'Wants to run <code>' + esc(s.tool) + '</code>' + '<details><summary class="hint">With these values</summary>' + kvHtml(d.edited && d.before ? d.before : s.args) + '</details>'));
        var change = d.edited ? changeOf(d.before, d.after) : '';
        out.push(msgHtml('person', d.by || 'Decision', d.at, '<strong>' + (d.approved ? (d.edited ? 'Approved with changes' : 'Approved') : 'Denied') + '</strong>' +
          (d.reason ? '<div>' + String.fromCharCode(8220) + esc(d.reason) + String.fromCharCode(8221) + '</div>' : '') + (change ? '<div class="ib-change">' + change + '</div>' : ''), d.approved ? '' : 'is-denied'));
        if (d.approved) out.push(activityHtml(s));
        return;
      }
      // Waiting on a decision: asked below, with its buttons.
      if (s.result == null && waitingTools.indexOf(s.tool) !== -1) return;
      out.push(activityHtml(s));
    });
    c.pending.forEach(function (p) { out.push('<li class="ib-msg agent ask"><span class="ib-msg-who"><strong>' + esc(agent) + '</strong>' + (p.createdAt ? DOT + esc(ago(p.createdAt)) : '') + '</span><div class="ib-bubble">' + pendingHtml(p) + '</div></li>'); });
    if (run && !c.pending.length) {
      if (run.status === 'running') out.push('<li class="ib-msg agent"><span class="ib-typing">' + esc(agent) + ' is working' + ELLIPSIS + '</span></li>');
      if (run.status === 'error') out.push(msgHtml('agent', agent, run.finished_at, '<strong>Failed.</strong> ' + esc(run.error || 'It stopped with an error.') +
        (run.output_errors && run.output_errors.length ? '<ul class="ib-schema-errors">' + run.output_errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : ''), 'failed'));
      // Its result, unless that's what it just said.
      if (run.status === 'done' && !(run.output === undefined && lastText && lastText === String(run.result || '').trim())) out.push(msgHtml('agent', agent, run.finished_at, run.output !== undefined
        ? '<pre class="ib-pre">' + esc(JSON.stringify(run.output, null, 2)) + '</pre>'
        : '<div class="ib-md">' + renderMarkdownPreview(run.result || 'Done.') + '</div>'));
    }
    return out.join('');
  }

  function renderThread(c) {
    var box = page.querySelector('.ib-thread');
    var run = c.run;
    var status = stateHtml({ waiting: c.pending.map(function (p) { return p.kind; }), status: run ? run.status : 'awaiting_approval' });
    var canArchive = canDecide() && !c.pending.length && run && run.status !== 'running';
    var msgs = box.querySelector('.ib-msgs');
    var keepScroll = openThread && msgs && msgs.getAttribute('data-id') === c.id ? msgs.scrollTop : null;
    box.innerHTML =
      '<header class="ib-thread-head"><div class="ib-thread-top"><div class="ib-thread-tools"><button type="button" class="ib-thread-back">' + String.fromCharCode(8592) + ' Inbox</button></div><h2>' + esc(c.title) + '</h2>' +
        '<div class="ib-thread-tools">' + (canArchive ? '<button type="button" data-act="archive">' + (c.archived ? 'Unarchive' : 'Archive') + '</button>' : '') +
          (fullAccess && run && c.workflowId ? '<a href="' + esc(traceHref(c)) + '">View trace</a>' : '') + '</div></div>' +
        '<div class="ib-chips">' + status + (c.archived ? '<span class="ib-state">Archived</span>' : '') + '<span>' + caseLinks(c) + '</span></div></header>' +
      '<ol class="ib-msgs" data-id="' + esc(c.id) + '">' + threadMessagesHtml(c) + '</ol>';
    msgs = box.querySelector('.ib-msgs');
    // The latest at the bottom, in view; a redraw keeps where it was.
    msgs.scrollTop = keepScroll != null ? keepScroll : msgs.scrollHeight;
    box.querySelector('.ib-thread-back').addEventListener('click', function () {
      state.item = '';
      openThread = null;
      history.replaceState(null, '', pageUrl());
      page.querySelector('.ib-split').classList.remove('has-thread');
    });
    var archive = box.querySelector('[data-act="archive"]');
    if (archive) archive.addEventListener('click', function () {
      archive.disabled = true;
      fetch('/inbox/cases/' + encodeURIComponent(c.id) + '/archive', { method: c.archived ? 'DELETE' : 'POST' })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'That did not work'); }); })
        .then(function () { openThread = null; loadThread(c.id); refreshList(); })
        .catch(function (err) { archive.disabled = false; archive.textContent = err.message; });
    });
    wireCase(c);
  }

  function valueHtml(v) {
    if (v == null) return '<span class="hint">(empty)</span>';
    if (typeof v === 'object') return '<pre class="ib-pre">' + esc(JSON.stringify(v, null, 2)) + '</pre>';
    return esc(String(v));
  }
  function kvHtml(obj) {
    var keys = Object.keys(obj || {});
    if (!keys.length) return '<p class="hint" style="margin:0">None.</p>';
    return '<dl class="ib-kv">' + keys.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + valueHtml(obj[k]) + '</dd>'; }).join('') + '</dl>';
  }

  function pendingHtml(p) {
    var locked = canDecide() ? '' : '<p class="hint" style="margin:0">Your role can see this but not decide.</p>';
    if (p.kind === 'question') {
      return '<div class="ib-card needs" data-pending="' + esc(p.pendingId) + '" data-kind="question"><h3>Question for you</h3>' +
        '<div class="ib-question ib-md">' + renderMarkdownPreview(p.question || '') + '</div>' +
        (canDecide()
          ? (p.options && p.options.length ? '<div class="ib-actions">' + p.options.map(function (o) { return '<button type="button" class="ib-btn opt" data-option="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>' : '') +
            '<textarea class="ib-answer" placeholder="Your answer"></textarea>' +
            '<div class="ib-actions"><button type="button" class="ib-btn" data-act="answer">Answer</button><span class="hint ib-result" role="status"></span></div>'
          : locked) +
        '</div>';
    }
    return '<div class="ib-card needs" data-pending="' + esc(p.pendingId) + '" data-kind="approval"><h3>Approve this?</h3>' +
      '<p class="ib-question">The agent wants to run <code>' + esc(p.tool) + '</code> with:</p>' + kvHtml(p.args) +
      (canDecide()
        ? '<textarea class="ib-args mono" hidden>' + esc(JSON.stringify(p.args, null, 2)) + '</textarea>' +
          '<textarea class="ib-deny-reason" hidden placeholder="Why not? (optional) The agent reads this, and it' + String.fromCharCode(8217) + 's kept with the run."></textarea>' +
          '<div class="ib-actions"><button type="button" class="ib-btn" data-act="approve">Approve</button>' +
            '<button type="button" class="ib-btn plain" data-act="change">Change</button>' +
            '<button type="button" class="ib-btn bad" data-act="deny">Deny</button><span class="hint ib-result" role="status"></span></div>'
        : locked) +
      '</div>';
  }

  // What a person changed before approving: each field whose value
  // differs, from what the agent asked for to what ran.
  function changeOf(before, after) {
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return '';
    var keys = Object.keys(before).concat(Object.keys(after).filter(function (k) { return !(k in before); }));
    var show = function (v) { var t = v === undefined ? '(none)' : typeof v === 'string' ? v : JSON.stringify(v); return esc(t.length > 160 ? t.slice(0, 160) + String.fromCharCode(8230) : t); };
    return keys.filter(function (k) { return JSON.stringify(before[k]) !== JSON.stringify(after[k]); }).map(function (k) {
      return '<div><code>' + esc(k) + '</code>: <del>' + show(before[k]) + '</del> ' + String.fromCharCode(8594) + ' <ins>' + show(after[k]) + '</ins></div>';
    }).join('');
  }

  // The case's workflow and agent, each opening its page. An approver or
  // viewer can open only the Inbox, so for them they're plain text.
  function caseLinks(c) {
    if (document.querySelector('.le-app.le-inbox-only')) return esc(c.agentLabel || c.agent) + DOT + esc(c.workflowTitle);
    var agentUrl = '/agents/config?agent=' + encodeURIComponent(c.agent);
    var wf = c.workflowId ? '<a class="ib-link" href="' + agentUrl + '&tab=workflows&workflow=' + encodeURIComponent(c.workflowId) + '">' + esc(c.workflowTitle) + '</a>' : esc(c.workflowTitle);
    return '<a class="ib-link" href="' + agentUrl + '">' + esc(c.agentLabel || c.agent) + '</a>' + DOT + wf;
  }

  function send(card, path, body) {
    var result = card.querySelector('.ib-result');
    var buttons = card.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    result.textContent = 'Sending' + ELLIPSIS;
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'That did not work');
        result.textContent = 'Done. The agent is carrying on' + ELLIPSIS;
        if (window.leShell && window.leShell.reloadInboxCount) window.leShell.reloadInboxCount();
        setTimeout(function () { openThread = null; if (state.item) loadThread(state.item); refreshList(); }, 1200);
      })
      .catch(function (err) {
        result.textContent = err.message;
        for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
      });
  }

  function wireCase(c) {
    var cards = page.querySelectorAll('[data-pending]');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var id = card.getAttribute('data-pending');
        if (card.getAttribute('data-kind') === 'question') {
          var answer = card.querySelector('.ib-answer');
          var opts = card.querySelectorAll('[data-option]');
          for (var o = 0; o < opts.length; o++) opts[o].addEventListener('click', function (ev) { answer.value = ev.currentTarget.getAttribute('data-option'); answer.focus(); });
          var btn = card.querySelector('[data-act="answer"]');
          if (btn) btn.addEventListener('click', function () {
            if (!answer.value.trim()) { card.querySelector('.ib-result').textContent = 'Write an answer first.'; return; }
            send(card, '/pending-questions/' + encodeURIComponent(id) + '/answer', { answer: answer.value.trim() });
          });
          return;
        }
        var args = card.querySelector('.ib-args');
        var approve = card.querySelector('[data-act="approve"]');
        var change = card.querySelector('[data-act="change"]');
        var deny = card.querySelector('[data-act="deny"]');
        if (change) change.addEventListener('click', function () {
          args.hidden = !args.hidden;
          approve.textContent = args.hidden ? 'Approve' : 'Approve as changed';
          change.textContent = args.hidden ? 'Change' : 'Cancel change';
          if (!args.hidden) args.focus();
        });
        if (approve) approve.addEventListener('click', function () {
          var body = { decision: 'approve' };
          if (!args.hidden) {
            try { body.editedArgs = JSON.parse(args.value); }
            catch (e) { card.querySelector('.ib-result').textContent = 'The changed arguments are not valid JSON: ' + e.message; return; }
          }
          send(card, '/pending-approvals/' + encodeURIComponent(id) + '/resolve', body);
        });
        if (deny) deny.addEventListener('click', function (ev) {
          var b = ev.currentTarget;
          var reason = card.querySelector('.ib-deny-reason');
          if (b.getAttribute('data-confirming') !== '1') { b.setAttribute('data-confirming', '1'); b.textContent = 'Deny'; reason.hidden = false; reason.focus(); return; }
          var body = { decision: 'deny' };
          if (reason.value.trim()) body.reason = reason.value.trim();
          send(card, '/pending-approvals/' + encodeURIComponent(id) + '/resolve', body);
        });
      })(cards[i]);
    }
  }

  function start() {
    renderInbox();
    refreshList().then(function () { if (state.item && (!openThread || openThread.id !== state.item)) selectItem(state.item); });
    // The list keeps itself current while it's open.
    setInterval(function () {
      if (document.hidden) return;
      if (document.activeElement && document.activeElement.id === 'ibSearch') return;
      refreshList();
    }, 15000);
  }

  // The list doesn't wait for the person's role: only whether they can
  // decide depends on it, so a conversation already open is drawn again
  // if they turn out not to.
  start();
  (window.leShell && window.leShell.settings ? window.leShell.settings() : fetch('/config/settings').then(function (r) { return r.ok ? r.json() : null; }))
    .then(function (s) {
      var was = role;
      if (s && s.signIn && s.signIn.role) role = s.signIn.role;
      if (role !== was && state.item && openThread) { openThread = null; loadThread(state.item); }
    })
    .catch(function () {});
})();
</script>
</body>
</html>`

/** What an Inbox-only role sees on any other page. */
export function renderInboxOnlyPage(message: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Inbox only</title>
<style>${devUiCss} .io { max-width: 460px; margin: 18vh auto 0; padding: 0 20px; display: grid; gap: 12px; } .io a { color: var(--accent-ink); font-weight: 600; }</style></head>
<body><div class="io"><h1 style="margin:0;font-size:20px">Inbox only</h1><p style="margin:0">${esc(message)}</p><p style="margin:0"><a href="/inbox">Open the Inbox</a></p></div></body></html>`
}
