// The console's Inbox: /inbox lists every workflow run as a case, the ones
// waiting on a person first (?open=1 shows only those); /inbox?case=<id> opens one, with what it was
// given, what the agent did, what it asks now (answer, approve, approve
// as changed, deny) and who decided what (web/inbox-admin.ts behind
// /inbox/*). An approver or viewer sees only this page; a viewer can't
// decide. Like the other console pages, its inline script avoids
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
  .ib-filter { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .ib-filter button { border: 0; border-radius: 0; background: var(--bg); padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--ink-muted); }
  .ib-filter button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent-ink); }
  .ib-bar select, .ib-bar input { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
  .ib-bar input { flex: 1; min-width: 160px; }
  .ib-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
  .ib-row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
  .ib-row:first-child { border-top: 0; }
  .ib-row:hover { background: var(--surface); }
  .ib-row-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ib-row-meta { font-size: 12.5px; color: var(--ink-muted); }
  .ib-row-side { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12px; color: var(--ink-muted); white-space: nowrap; }
  .ib-state { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .ib-state.warn { background: var(--warn-soft); color: var(--warn); }
  .ib-state.good { background: var(--good-soft); color: var(--good); }
  .ib-state.bad { background: var(--bad-soft); color: var(--bad); }
  .ib-state.run { background: var(--accent-soft); color: var(--accent-ink); }
  .ib-empty { padding: 28px 16px; text-align: center; color: var(--ink-muted); font-size: 13.5px; }
  .ib-back { font-size: 13px; color: var(--accent-ink); text-decoration: none; font-weight: 600; }
  .ib-case-head h2 { margin: 4px 0 6px; font-size: 20px; letter-spacing: -0.01em; }
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
  .ib-btn { height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); cursor: pointer; }
  .ib-btn.plain { background: none; border-color: var(--line); color: var(--ink); font-weight: 500; }
  .ib-btn.bad { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
  .ib-btn.opt { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; font-weight: 500; }
  .ib-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .ib-step { display: grid; gap: 4px; padding-left: 14px; border-left: 2px solid var(--line); font-size: 13.5px; }
  .ib-step.q { border-left-color: var(--warn); }
  .ib-step-k { font-size: 12px; font-weight: 700; color: var(--ink-muted); }
  .ib-step-meta { font-weight: 400; color: var(--ink-faint); margin-left: 8px; }
  .ib-totals { margin: -4px 0 10px; font-size: 12.5px; color: var(--ink-muted); }
  .ib-export { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .ib-export a.ib-btn { text-decoration: none; display: inline-flex; align-items: center; }
  @media print {
    .le-sidebar, .ib-back, .ib-export, .ib-actions, .le-head, .le-menu-btn { display: none !important; }
    .le-app { display: block !important; }
    .ib-card { break-inside: avoid; }
    details { display: block; }
  }
  .ib-step details summary { cursor: pointer; font-size: 12.5px; color: var(--ink-muted); }
  .ib-who { font-size: 13px; display: grid; gap: 4px; }
  .ib-reason { color: var(--ink-muted); margin: 2px 0 0 12px; }
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
  @media (max-width: 640px) { .ib-row { grid-template-columns: 12px minmax(0, 1fr); } .ib-row-side { grid-column: 2; align-items: flex-start; flex-direction: row; gap: 8px; } .ib-kv { grid-template-columns: 1fr; } }
</style>
</head>
<body data-le-page="inbox">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Inbox</h1><p>Questions and approvals from your agents' runs, and the history of each case: what it was given, what the agent did and who decided what.</p></div>
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
  var state = { open: params.get('open') === '1', q: params.get('q') || '', workflow: params.get('workflow') || '' };
  var role = 'owner';
  var workflows = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ago(iso) {
    if (!iso) return '';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(iso).toLocaleDateString();
  }
  function when(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
  function canDecide() { return role !== 'viewer'; }

  function stateHtml(item) {
    if (item.waiting && item.waiting.length) return '<span class="ib-state warn">' + (item.waiting.indexOf('approval') !== -1 ? 'Needs approval' : 'Question') + '</span>';
    if (item.status === 'running') return '<span class="ib-state run">Running</span>';
    if (item.status === 'error') return '<span class="ib-state bad">Failed</span>';
    if (item.status === 'done') return '<span class="ib-state good">Done</span>';
    return '<span class="ib-state">' + esc(item.status) + '</span>';
  }

  function listUrl() {
    var q = new URLSearchParams();
    if (state.open) q.set('open', '1');
    if (state.q) q.set('q', state.q);
    if (state.workflow) q.set('workflow', state.workflow);
    return '/inbox/items?' + q.toString();
  }
  function pageUrl() {
    var q = new URLSearchParams();
    if (state.open) q.set('open', '1');
    if (state.q) q.set('q', state.q);
    if (state.workflow) q.set('workflow', state.workflow);
    var s = q.toString();
    return '/inbox' + (s ? '?' + s : '');
  }

  function renderList(data) {
    var items = data.items || [];
    (data.workflows || []).forEach(function (w) { workflows[w.id] = w.title; });
    var options = Object.keys(workflows).sort(function (a, b) { return workflows[a].localeCompare(workflows[b]); }).map(function (id) { return '<option value="' + esc(id) + '"' + (id === state.workflow ? ' selected' : '') + '>' + esc(workflows[id]) + '</option>'; }).join('');
    var rows = items.map(function (i) {
      return '<a class="ib-row" href="/inbox?case=' + encodeURIComponent(i.id) + '">' +
        '<span class="le-dot' + (i.waiting.length ? ' warn' : i.status === 'running' ? '' : ' idle') + '" aria-hidden="true"></span>' +
        '<span style="min-width:0"><div class="ib-row-title">' + esc(i.title) + '</div>' +
          '<div class="ib-row-meta">' + esc(i.workflowTitle) + DOT + esc(i.agent) + (i.lastBy ? DOT + 'last decided by ' + esc(i.lastBy) : '') + '</div></span>' +
        '<span class="ib-row-side">' + stateHtml(i) + '<span>' + esc(ago(i.startedAt)) + '</span></span></a>';
    }).join('');
    page.innerHTML =
      '<div class="ib-bar">' +
        '<span class="ib-filter" role="group" aria-label="Show"><button type="button" data-open="0" aria-pressed="' + !state.open + '">All</button><button type="button" data-open="1" aria-pressed="' + state.open + '">Needs you (' + (data.open || 0) + ')</button></span>' +
        '<select id="ibWorkflow" aria-label="Workflow"><option value="">All workflows</option>' + options + '</select>' +
        '<input id="ibSearch" type="search" placeholder="Search cases, inputs or people" value="' + esc(state.q) + '" aria-label="Search">' +
      '</div>' +
      (items.length ? '<div class="ib-list">' + rows + '</div>'
        : '<div class="ib-list"><p class="ib-empty">' + (state.open ? 'Nothing needs you right now. Questions and approvals from your agents land here.' : 'No cases yet. Each workflow run shows here.') + '</p></div>');
    var buttons = page.querySelectorAll('[data-open]');
    for (var b = 0; b < buttons.length; b++) buttons[b].addEventListener('click', function (ev) { state.open = ev.currentTarget.getAttribute('data-open') === '1'; refreshList(); });
    page.querySelector('#ibWorkflow').addEventListener('change', function (ev) { state.workflow = ev.currentTarget.value; refreshList(); });
    var search = page.querySelector('#ibSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value.trim(); refreshList(true); }, 300);
    });
  }

  function refreshList(keepFocus) {
    history.replaceState(null, '', pageUrl());
    return fetch(listUrl(), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (data) {
        var had = keepFocus && document.activeElement && document.activeElement.id === 'ibSearch';
        renderList(data);
        if (had) { var s = page.querySelector('#ibSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      })
      .catch(function (err) { page.innerHTML = '<p class="error">Could not load the Inbox: ' + esc(err.message) + '</p>'; });
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
          '<textarea class="ib-deny-reason" hidden placeholder="Why not? (optional) The agent reads this, and it' + String.fromCharCode(8217) + 's kept with the case."></textarea>' +
          '<div class="ib-actions"><button type="button" class="ib-btn" data-act="approve">Approve</button>' +
            '<button type="button" class="ib-btn plain" data-act="change">Change</button>' +
            '<button type="button" class="ib-btn bad" data-act="deny">Deny</button><span class="hint ib-result" role="status"></span></div>'
        : locked) +
      '</div>';
  }

  // How long something took, in words: 850 ms, 4.2 s, 3 min, 2 h 5 min.
  function duration(ms) {
    if (ms < 1000) return Math.round(ms) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
    var min = Math.round(ms / 60000);
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
  }
  function count(n) { return Number(n).toLocaleString(); }

  // A step's model call (tokens, time) and the wait after it.
  function stepMeta(s) {
    var parts = [];
    if (s.call) parts.push('model ' + (s.call.durationMs != null ? duration(s.call.durationMs) + ', ' : '') + count(s.call.inputTokens) + ' in ' + String.fromCharCode(183) + ' ' + count(s.call.outputTokens) + ' out tokens');
    if (s.waitMs != null) parts.push((s.kind === 'question' ? 'answered after ' : 'took ') + duration(s.waitMs));
    return parts.length ? '<span class="ib-step-meta">' + esc(parts.join(DOT)) + '</span>' : '';
  }

  function stepHtml(s) {
    if (s.kind === 'text') return '<li class="ib-step"><span class="ib-step-k">Agent' + stepMeta(s) + '</span><div class="ib-md">' + renderMarkdownPreview(s.text) + '</div></li>';
    if (s.kind === 'question') return '<li class="ib-step q"><span class="ib-step-k">Asked' + stepMeta(s) + '</span><div class="ib-md">' + renderMarkdownPreview(s.question) + '</div>' +
      (s.answer != null ? '<span class="ib-step-k">Answer</span><div style="white-space:pre-wrap">' + esc(s.answer) + '</div>' : '<span class="hint">Waiting for an answer</span>') + '</li>';
    return '<li class="ib-step"><span class="ib-step-k">Used ' + esc(s.tool) + (s.failed ? ' (failed)' : '') + stepMeta(s) + '</span>' +
      '<details><summary>What it sent' + (s.result != null ? ' and got back' : '') + '</summary><pre class="ib-pre">' + esc(JSON.stringify(s.args, null, 2)) + '</pre>' +
      (s.result != null ? '<pre class="ib-pre" style="margin-top:6px">' + esc(s.result) + '</pre>' : '') + '</details></li>';
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

  function decidedHtml(run) {
    var rows = [];
    (run.decisions || []).forEach(function (d) { rows.push({ at: d.at, text: (d.approved ? (d.edited ? 'Approved as changed' : 'Approved') : 'Denied') + ' ' + d.tool, by: d.by, reason: d.reason, change: d.edited ? changeOf(d.before, d.after) : '' }); });
    (run.answers || []).forEach(function (a) { rows.push({ at: a.at, text: 'Answered: ' + a.answer, by: a.by }); });
    rows.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    if (!rows.length) return '';
    return '<div class="ib-card"><h3>Decisions</h3><div class="ib-who">' + rows.map(function (r) {
      return '<div>' + esc(r.text) + ' <span class="hint">' + (r.by ? 'by ' + esc(r.by) + DOT : '') + esc(when(r.at)) + '</span>' +
        (r.reason ? '<div class="ib-reason">' + String.fromCharCode(8220) + esc(r.reason) + String.fromCharCode(8221) + '</div>' : '') +
        (r.change ? '<div class="ib-change">' + r.change + '</div>' : '') + '</div>';
    }).join('') + '</div></div>';
  }

  // The case's workflow and agent, each opening its page. An approver or
  // viewer can open only the Inbox, so for them they're plain text.
  function caseLinks(c) {
    if (document.querySelector('.le-app.le-inbox-only')) return esc(c.workflowTitle) + DOT + esc(c.agent);
    var agentUrl = '/agents/config?agent=' + encodeURIComponent(c.agent);
    var wf = c.workflowId ? '<a class="ib-link" href="' + agentUrl + '&tab=workflows&workflow=' + encodeURIComponent(c.workflowId) + '">' + esc(c.workflowTitle) + '</a>' : esc(c.workflowTitle);
    return wf + DOT + '<a class="ib-link" href="' + agentUrl + '">' + esc(c.agent) + '</a>';
  }

  function totalsHtml(c) {
    var t = c.totals;
    if (!t) return '';
    return '<p class="ib-totals">' + esc([
      t.calls + (t.calls === 1 ? ' model call' : ' model calls'),
      count(t.inputTokens) + ' tokens in, ' + count(t.outputTokens) + ' out',
      'model time ' + duration(t.modelMs),
      t.elapsedMs != null ? 'start to finish ' + duration(t.elapsedMs) : '',
    ].filter(Boolean).join(DOT)) + '</p>';
  }

  // Keep the case: its whole record as a file, or printed (to paper or
  // a PDF, from the browser's print dialog).
  function exportHtml(c) {
    return '<div class="ib-export"><a class="ib-btn plain" href="/inbox/cases/' + encodeURIComponent(c.id) + '/export" download>Download record</a>' +
      '<button type="button" class="ib-btn plain" data-act="print">Print or save as PDF</button></div>';
  }

  function renderCase(c) {
    var run = c.run;
    var status = run ? stateHtml({ waiting: c.pending.map(function (p) { return p.kind; }), status: run.status }) : stateHtml({ waiting: c.pending.map(function (p) { return p.kind; }), status: 'awaiting_approval' });
    page.innerHTML =
      '<a class="ib-back" href="' + pageUrl() + '">' + String.fromCharCode(8592) + ' Inbox</a>' +
      '<div class="ib-case-head"><h2>' + esc(c.title) + '</h2><div class="ib-chips">' + status + '<span>' + caseLinks(c) + (run ? DOT + 'started ' + esc(when(run.started_at)) + (run.source ? ' by ' + esc(run.source === 'webhook' ? 'a webhook' : run.source === 'schedule' ? 'a schedule' : run.source === 'console' ? 'Run now' : run.source === 'api' ? 'an app' : run.source) : '') : '') + '</span></div></div>' +
      c.pending.map(pendingHtml).join('') +
      (run && run.params ? '<div class="ib-card"><h3>Inputs</h3>' + kvHtml(run.params) + '</div>' : '') +
      (c.steps.length ? '<div class="ib-card"><h3>What the agent did</h3>' + totalsHtml(c) + '<ol class="ib-steps">' + c.steps.map(stepHtml).join('') + '</ol></div>' : '') +
      (run ? decidedHtml(run) : '') +
      (run && run.result ? '<div class="ib-card"><h3>Result</h3><div class="ib-md">' + renderMarkdownPreview(run.result) + '</div></div>' : '') +
      (run && run.error ? '<div class="ib-card"><h3>Failed</h3><p class="error">' + esc(run.error) + '</p></div>' : '') +
      exportHtml(c);
    var print = page.querySelector('[data-act="print"]');
    if (print) print.addEventListener('click', function () { window.print(); });
    wireCase(c);
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
        setTimeout(openCase, 1200);
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

  function openCase() {
    var id = new URLSearchParams(location.search).get('case');
    return fetch('/inbox/cases/' + encodeURIComponent(id), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(renderCase)
      .catch(function (err) { page.innerHTML = '<a class="ib-back" href="/inbox">' + String.fromCharCode(8592) + ' Inbox</a><p class="error">Could not open this case: ' + esc(err.message) + '</p>'; });
  }

  function start() {
    if (new URLSearchParams(location.search).get('case')) openCase();
    else refreshList();
    // The list keeps itself current while it's open.
    setInterval(function () {
      if (document.hidden || new URLSearchParams(location.search).get('case')) return;
      if (document.activeElement && document.activeElement.id === 'ibSearch') return;
      refreshList();
    }, 15000);
  }

  (window.leShell && window.leShell.settings ? window.leShell.settings() : fetch('/config/settings').then(function (r) { return r.ok ? r.json() : null; }))
    .then(function (s) { if (s && s.signIn && s.signIn.role) role = s.signIn.role; })
    .catch(function () {})
    .then(start);
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
