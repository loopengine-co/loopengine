// The console's Schedules page (/schedules): every workflow on a timer,
// across agents, in two views under its top bar.
//
// - Schedules: a card for each schedule, in a hairline grid: what it
//   runs, how often, its agent, when it runs next, and a switch to pause
//   or resume it (POST /schedules/:id/pause|resume), with Run now and
//   its workflow in a menu. Then the workflows with no schedule yet, to
//   add one to.
// - Calendar: a week, day by day: the runs that happened (from each
//   schedule's history, by outcome) and those to come (worked out from
//   each schedule's rule and its next run).
//
// + Add schedule opens Create schedule: which workflow, its name, how
// often (an interval, daily at a time, weekly on a day, or once), whether
// each result goes to the messaging app, and the workflow's inputs for
// every run. A schedule is part of its workflow, so it's added to that
// workflow's draft (POST .../draft/schedules); when that's all the draft
// holds, it can be published right there.
//
// Its data is each agent's /agents/:name/schedules. Like the other
// console pages, its inline script avoids backslashes and template
// placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'

export const schedulesPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schedules</title>
<style>${devUiCss}${MASCOT_CSS}
  .sc { max-width: 1120px; display: grid; gap: 0; }
  .sc-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 36px 32px 28px; border: 1px solid var(--line); border-bottom: 0; }
  .sc-hero .le-mascot { flex: none; margin-bottom: -6px; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .sc-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sc-card { display: grid; gap: 14px; padding: 20px 22px; background: var(--bg); }
  .sc-card.is-off .sc-card-text { opacity: .55; }
  .sc-card-head { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; gap: 12px; align-items: start; }
  .sc-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); color: var(--ink-muted); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
  .sc-icon svg { width: 16px; height: 16px; }
  .sc-card-text { display: grid; gap: 2px; min-width: 0; }
  .sc-card-title { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .sc-card-desc { font-size: 13px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .sc-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sc-chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); font-size: 12px; color: var(--ink-muted); white-space: nowrap; text-decoration: none; }
  .sc-chip.strong { background: var(--surface); border-color: transparent; color: var(--ink); font-weight: 500; }
  a.sc-chip:hover { color: var(--ink); border-color: var(--ink-faint); }
  .sc-chip.warn { background: var(--warn-soft); border-color: transparent; color: var(--warn); font-weight: 600; }
  .sc-chip.bad { background: var(--bad-soft); border-color: transparent; color: var(--bad); }
  .sc-next { font-size: 12px; color: var(--ink-faint); margin-left: 4px; white-space: nowrap; }
  .sc-menu { position: relative; }
  .sc-menu summary { list-style: none; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; cursor: pointer; color: var(--ink-muted); }
  .sc-menu summary::-webkit-details-marker { display: none; }
  .sc-menu summary:hover { background: var(--surface); color: var(--ink); }
  .sc-menu[open] .sc-menu-list { display: grid; }
  .sc-menu-list { display: none; position: absolute; right: 0; top: 32px; z-index: 20; min-width: 170px; padding: 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); box-shadow: 0 8px 24px rgba(0, 0, 0, .12); }
  .sc-menu-list a, .sc-menu-list button { display: block; width: 100%; text-align: left; height: auto; padding: 7px 10px; border: 0; border-radius: 7px; background: none; font-size: 13px; color: var(--ink); text-decoration: none; }
  .sc-menu-list a:hover, .sc-menu-list button:hover:not(:disabled) { background: var(--surface); }
  .sc-section-title { margin: 0; padding: 30px 32px 16px; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .sc-adds { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sc-add { display: grid; gap: 6px; align-content: start; padding: 22px; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; background: var(--bg); text-align: left; height: auto; cursor: pointer; transition: background .15s; }
  .sc-add:hover:not(:disabled) { background: var(--surface); }
  .sc-add b { font-size: 15px; font-weight: 600; color: var(--ink); }
  .sc-add span { font-size: 13px; color: var(--ink-muted); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .sc-add small { font-size: 12px; color: var(--ink-faint); }
  .sc-empty { padding: 40px 32px; text-align: center; color: var(--ink-muted); font-size: 14px; background: var(--bg); grid-column: 1 / -1; }
  /* Calendar: a week, a column a day. */
  .sc-week-bar { display: flex; align-items: center; gap: 10px; padding: 18px 32px; border: 1px solid var(--line); border-bottom: 0; }
  .sc-week-bar h2 { margin: 0 auto 0 0; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; }
  .sc-week-bar button { height: 32px; padding: 0 12px; border-radius: 9px; font-size: 13px; }
  .sc-week { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .sc-day { display: grid; align-content: start; gap: 6px; min-height: 360px; padding: 12px 10px; background: var(--bg); }
  .sc-day.is-today { background: color-mix(in srgb, var(--accent-soft) 45%, var(--bg)); }
  .sc-day-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; font-size: 12px; color: var(--ink-faint); }
  .sc-day-head b { font-size: 18px; font-weight: 500; color: var(--ink); }
  .sc-day.is-today .sc-day-head b { color: var(--accent-ink); }
  .sc-ev { display: grid; gap: 1px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); font-size: 12px; color: var(--ink); text-decoration: none; min-width: 0; }
  .sc-ev b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sc-ev span { color: var(--ink-faint); font-variant-numeric: tabular-nums; }
  .sc-ev.ok { background: var(--good-soft); border-color: transparent; }
  .sc-ev.ok span { color: var(--good); }
  .sc-ev.error { background: var(--bad-soft); border-color: transparent; }
  .sc-ev.error span { color: var(--bad); }
  .sc-ev.next { border-style: dashed; }
  a.sc-ev:hover { border-color: var(--ink-faint); }
  .sc-more { font-size: 11.5px; color: var(--ink-faint); padding: 0 4px; }
  .sc-legend { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 2px 0; font-size: 12px; color: var(--ink-faint); }
  .sc-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; border: 1px solid var(--line); }
  .sc-legend i.ok { background: var(--good-soft); border-color: transparent; }
  .sc-legend i.error { background: var(--bad-soft); border-color: transparent; }
  .sc-legend i.next { border-style: dashed; }
  /* Create schedule */
  .sc-dialog { width: min(920px, calc(100vw - 32px)); max-height: calc(100vh - 48px); padding: 0; border: 1px solid var(--line); border-radius: 18px; background: var(--bg); color: var(--ink); box-shadow: 0 24px 60px rgba(0, 0, 0, .22); overflow: hidden; }
  .sc-dialog::backdrop { background: rgba(20, 24, 25, .35); backdrop-filter: blur(3px); }
  .sc-dialog form { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 50px); }
  .sc-dlg-head { display: flex; align-items: center; gap: 8px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
  .sc-dlg-head h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 500; }
  .sc-dlg-head button { height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; }
  .sc-dlg-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); overflow: auto; }
  .sc-dlg-col { display: grid; align-content: start; }
  .sc-dlg-col + .sc-dlg-col { border-left: 1px solid var(--line); background: var(--surface); }
  .sc-field { display: grid; gap: 9px; padding: 16px 22px; border-bottom: 1px solid var(--line); }
  .sc-field > label, .sc-field-k { font-size: 14px; font-weight: 500; }
  .sc-field .hint { margin: 0; }
  .sc-field input, .sc-field select { height: 38px; border-radius: 9px; font-size: 13.5px; width: 100%; }
  .sc-field .le-seg { display: flex; }
  .sc-field .le-seg button { flex: 1; justify-content: center; }
  .sc-row { display: flex; gap: 8px; }
  .sc-row > * { flex: 1; min-width: 0; }
  .sc-row[hidden], .sc-field .le-seg[hidden] { display: none; }
  .sc-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sc-inputs { display: grid; gap: 12px; }
  .sc-inputs label { display: grid; gap: 5px; font-size: 13px; font-weight: 500; }
  .sc-inputs textarea { min-height: 70px; border-radius: 9px; font-size: 13.5px; }
  .sc-dlg-foot { padding: 12px 22px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); min-height: 46px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sc-dlg-foot:empty { display: none; }
  .sc-dlg-foot .error { color: var(--bad); }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 860px) {
    .sc-hero { padding: 24px 18px 20px; }
    .sc-cards, .sc-adds { grid-template-columns: minmax(0, 1fr); }
    .sc-week { grid-template-columns: minmax(0, 1fr); }
    .sc-day { min-height: 0; }
    .sc-dlg-body { grid-template-columns: minmax(0, 1fr); }
    .sc-dlg-col + .sc-dlg-col { border-left: 0; border-top: 1px solid var(--line); }
    .le-search { display: none; }
  }
</style>
</head>
<body data-le-page="schedules">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <header class="le-topbar">
    <button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
    <h1 class="le-topbar-title">Schedules</h1>
    <span class="le-seg" role="tablist" aria-label="View">
      <button type="button" role="tab" data-view="list" aria-selected="true">Schedules</button>
      <button type="button" role="tab" data-view="calendar" aria-selected="false">Calendar</button>
    </span>
    <span class="le-topbar-gap"></span>
    <label class="le-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="scSearch" placeholder="Search schedules" aria-label="Search schedules"></label>
    <button type="button" class="le-btn-dark" id="scAdd">+ Add schedule</button>
  </header>
  <div class="le-scroll"><div class="le-page">
    <div class="sc" id="scPage"><p class="hint">Loading&hellip;</p></div>
  </div></div>
</main>
</div>
<template id="scMascot">${mascotSvg(92)}</template>
<dialog class="sc-dialog" id="scDialog" aria-labelledby="scDlgTitle">
  <form method="dialog" id="scForm">
    <div class="sc-dlg-head"><h2 id="scDlgTitle">Create schedule</h2><button type="button" id="scCancel">Cancel</button><button type="submit" class="primary" id="scSave">Save</button></div>
    <div class="sc-dlg-body">
      <div class="sc-dlg-col">
        <div class="sc-field"><label for="scWorkflow">Workflow</label><select id="scWorkflow" required></select></div>
        <div class="sc-field"><label for="scName">Name <span class="hint">(optional)</span></label><input id="scName" maxlength="80" placeholder="e.g. Monday sales summary"></div>
        <div class="sc-field">
          <span class="sc-field-k">Schedule</span>
          <span class="le-seg" id="scKind"><button type="button" data-kind="repeat" aria-pressed="true">Recurring</button><button type="button" data-kind="once" aria-pressed="false">One time</button></span>
          <span class="le-seg" id="scFreq"><button type="button" data-freq="interval" aria-pressed="false">Interval</button><button type="button" data-freq="daily" aria-pressed="true">Daily</button><button type="button" data-freq="weekly" aria-pressed="false">Weekly</button></span>
          <div class="sc-row" id="scWhenInterval" hidden><input type="number" id="scEvery" min="1" step="1" value="1" aria-label="Every"><select id="scUnit" aria-label="Unit"><option value="m">minutes</option><option value="h" selected>hours</option><option value="d">days</option></select></div>
          <div class="sc-row" id="scWhenDaily"><input type="time" id="scAt" value="09:00" aria-label="At"></div>
          <div class="sc-row" id="scWhenWeekly" hidden><select id="scWeekday" aria-label="On"><option value="monday">Monday</option><option value="tuesday">Tuesday</option><option value="wednesday">Wednesday</option><option value="thursday">Thursday</option><option value="friday">Friday</option><option value="saturday">Saturday</option><option value="sunday">Sunday</option></select><input type="time" id="scAtWeekly" value="09:00" aria-label="At"></div>
          <div class="sc-row" id="scWhenOnce" hidden><input type="date" id="scDate" aria-label="Date"><input type="time" id="scAtOnce" value="09:00" aria-label="At"></div>
          <p class="hint" id="scZone"></p>
        </div>
        <div class="sc-field">
          <div class="sc-switch-row"><span class="sc-field-k">Send each result to chat</span><button type="button" class="le-switch" id="scNotify" role="switch" aria-checked="false" aria-label="Send each result to chat"></button></div>
          <p class="hint">After every run, its result goes to the agent's messaging app (Slack, Telegram or Lark), if it has one.</p>
        </div>
      </div>
      <div class="sc-dlg-col">
        <div class="sc-field"><span class="sc-field-k">Inputs for every run</span><div class="sc-inputs" id="scInputs"></div></div>
        <div class="sc-field"><span class="sc-field-k">Before it starts</span><p class="hint">A schedule is part of its workflow, so it goes into the workflow's draft. Publish the draft and it starts running; until then nothing runs.</p></div>
      </div>
    </div>
    <div class="sc-dlg-foot" id="scFoot"></div>
  </form>
</dialog>
${consoleShellScript}
<script>
(function () {
  var esc = window.leShell.esc;
  var page = document.getElementById('scPage');
  var params = new URLSearchParams(location.search);
  var view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  var weekOffset = 0;
  var data = { tasks: [], workflows: [], zone: '' };
  var DAY = 86400000;
  var UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: DAY };
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ICON_REPEAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/></svg>';
  var ICON_ONCE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/></svg>';
  var mascot = document.getElementById('scMascot').innerHTML;
  var ICON_DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';

  function api(method, path, body) {
    return fetch(path, { method: method, headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }
  function wfHref(agent, id, tab) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id) + (tab ? '&wtab=' + tab : '');
  }
  // A time of day in the workspace's time zone: 09:00.
  function clock(ms) {
    try { return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: data.zone || undefined }); }
    catch (e) { return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  }
  function weekdayOf(ms) {
    try { return new Date(ms).toLocaleDateString('en-US', { weekday: 'long', timeZone: data.zone || undefined }); }
    catch (e) { return WEEKDAYS[new Date(ms).getDay()]; }
  }
  function everyMs(every) {
    var m = String(every || '').trim().match(/^([0-9]+)([smhd])$/);
    return m ? Number(m[1]) * UNIT_MS[m[2]] : 0;
  }
  // How often, in words: Every 2 hours, Daily at 09:00, Weekly on Monday
  // at 09:00, Once on 3 Dec, 09:00.
  function describe(t) {
    var s = t.schedule || {};
    if (s.run_at) return 'Once, ' + new Date(s.run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: data.zone || undefined });
    var m = String(s.every || '').match(/^([0-9]+)([smhd])$/);
    if (!m) return String(s.every || '');
    var n = Number(m[1]);
    var at = t.next_run_at ? Date.parse(t.next_run_at) : (s.anchor ? Date.parse(s.anchor) : 0);
    if (m[2] === 'd' && n === 1 && at) return 'Daily at ' + clock(at);
    if (m[2] === 'd' && n === 7 && at) return 'Weekly on ' + weekdayOf(at) + ' at ' + clock(at);
    if (m[2] === 'd') return 'Every ' + n + ' days' + (at ? ' at ' + clock(at) : '');
    var unit = { s: 'second', m: 'minute', h: 'hour' }[m[2]];
    return n === 1 ? 'Every ' + unit : 'Every ' + n + ' ' + unit + 's';
  }
  // In 7h 36m, in 3 days, or now.
  function untilText(iso) {
    var ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return 'any moment';
    var min = Math.round(ms / 60000);
    if (min < 60) return 'in ' + min + 'm';
    var h = Math.floor(min / 60);
    if (h < 48) return 'in ' + h + 'h ' + (min % 60) + 'm';
    return 'in ' + Math.round(h / 24) + ' days';
  }

  function isLive(t) { return t.status !== 'cancelled' && t.status !== 'done'; }

  // Every agent's schedules, with its workflows.
  function load() {
    return window.leShell.ready.then(function (agents) {
      return Promise.all((agents || []).map(function (a) {
        return api('GET', '/agents/' + encodeURIComponent(a.name) + '/schedules').then(function (r) {
          if (!r.ok) return null;
          var label = a.displayName || a.name;
          return {
            tasks: (r.body.tasks || []).map(function (t) { t.agentLabel = label; return t; }),
            workflows: (r.body.workflows || []).map(function (w) { return { agent: a.name, agentLabel: label, id: w.id, title: w.title, description: w.description, parameters: w.parameters || {} }; }),
            zone: r.body.time_zone || '',
          };
        }).catch(function () { return null; });
      }));
    }).then(function (all) {
      data = { tasks: [], workflows: [], zone: '' };
      all.forEach(function (x) { if (!x) return; data.tasks = data.tasks.concat(x.tasks); data.workflows = data.workflows.concat(x.workflows); data.zone = data.zone || x.zone; });
      render();
    });
  }

  function cardHtml(t) {
    var on = t.status !== 'paused';
    var wf = t.workflow;
    var title = t.task_name || (wf && wf.title) || String(t.message || '').split(String.fromCharCode(10))[0] || 'Schedule';
    var desc = (wf && (wf.description && wf.description !== wf.title ? wf.description : wf.start_message)) || t.message || '';
    var state = t.status === 'awaiting_approval' || t.pending ? '<a class="sc-chip warn" href="/inbox?view=needs">Waiting for you</a>'
      : t.status === 'running' ? '<span class="sc-chip strong">Running now</span>'
      : t.last_status === 'error' ? '<span class="sc-chip bad" title="' + esc(t.last_error || '') + '">Last run failed</span>' : '';
    var next = !on ? 'Paused' : t.next_run_at ? 'Next run ' + untilText(t.next_run_at) : '';
    return '<div class="sc-card' + (on ? '' : ' is-off') + '" data-task="' + esc(t.task_id) + '">' +
      '<div class="sc-card-head"><span class="sc-icon">' + (t.schedule && t.schedule.run_at ? ICON_ONCE : ICON_REPEAT) + '</span>' +
        '<span class="sc-card-text"><span class="sc-card-title">' + esc(title) + '</span>' + (desc ? '<span class="sc-card-desc">' + esc(desc) + '</span>' : '') + '</span>' +
        '<button type="button" class="le-switch" role="switch" aria-checked="' + on + '" aria-label="' + (on ? 'Pause ' : 'Resume ') + esc(title) + '" data-toggle="' + esc(t.task_id) + '"' + (t.status === 'running' ? ' disabled' : '') + '></button>' +
        '<details class="sc-menu"><summary aria-label="More">' + ICON_DOTS + '</summary><div class="sc-menu-list">' +
          '<button type="button" data-run="' + esc(t.task_id) + '">Run now</button>' +
          (t.workflow_id ? '<a href="' + wfHref(t.agent, t.workflow_id, 'activity') + '">Open its workflow</a><a href="' + wfHref(t.agent, t.workflow_id, 'triggers') + '">Change or remove</a>' : '') +
        '</div></details></div>' +
      '<div class="sc-chips"><span class="sc-chip strong">' + esc(describe(t)) + '</span>' +
        '<a class="sc-chip" href="/agents/config?agent=' + encodeURIComponent(t.agent) + '">' + esc(t.agentLabel) + '</a>' +
        (t.notify ? '<span class="sc-chip">Result to chat</span>' : '') + state +
        (next ? '<span class="sc-next">' + esc(next) + '</span>' : '') + '</div>' +
    '</div>';
  }

  function matches(t, q) {
    if (!q) return true;
    var wf = t.workflow || {};
    return [t.task_name, wf.title, wf.description, t.message, t.agentLabel, describe(t)].join(' ').toLowerCase().indexOf(q) !== -1;
  }

  function listHtml() {
    var q = (document.getElementById('scSearch').value || '').trim().toLowerCase();
    var live = data.tasks.filter(isLive).filter(function (t) { return matches(t, q); })
      .sort(function (a, b) { return (a.status === 'paused') - (b.status === 'paused') || String(a.next_run_at || '').localeCompare(String(b.next_run_at || '')); });
    var scheduled = {};
    data.tasks.filter(isLive).forEach(function (t) { if (t.workflow_id) scheduled[t.agent + '/' + t.workflow_id] = true; });
    var free = data.workflows.filter(function (w) { return !scheduled[w.agent + '/' + w.id]; });
    var count = data.tasks.filter(isLive).length;
    var paused = data.tasks.filter(function (t) { return t.status === 'paused'; }).length;
    return '<div class="sc-hero"><div><h2 class="le-display">Scheduled runs</h2><p class="le-display-sub">' +
        (count ? count + (count === 1 ? ' schedule' : ' schedules') + (paused ? ', ' + paused + ' paused' : '') + '. Switch one off to pause it.' : 'Put a workflow on a timer, and your agents run it for you.') + '</p></div>' +
        mascot + '</div>' +
      '<div class="le-grid sc-cards">' + (live.length ? live.map(cardHtml).join('') + (live.length % 2 ? '<div class="sc-card" aria-hidden="true"></div>' : '')
        : '<p class="sc-empty">' + (q ? 'No schedule matches.' : 'No schedules yet. Add one to run a workflow every day, every week, or once.') + '</p>') + '</div>' +
      (free.length ? '<h3 class="sc-section-title">Put a workflow on a timer</h3><div class="le-grid sc-adds">' +
        free.slice(0, 9).map(function (w) {
          return '<button type="button" class="sc-add" data-add="' + esc(w.agent + '/' + w.id) + '"><b>' + esc(w.title) + '</b>' + (w.description && w.description !== w.title ? '<span>' + esc(w.description) + '</span>' : '') + '<small>' + esc(w.agentLabel) + '</small></button>';
        }).join('') + (free.length % 3 ? new Array(3 - (free.length % 3) + 1).join('<div class="sc-add" aria-hidden="true" style="cursor:default"></div>') : '') + '</div>' : '');
  }

  // The week shown: Monday to Sunday, weekOffset weeks from this one.
  function weekStart() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var back = (d.getDay() + 6) % 7;
    return d.getTime() - back * DAY + weekOffset * 7 * DAY;
  }
  // Each schedule's runs in the week: those that happened (its history),
  // and those to come (its next run, then every interval after).
  function weekEvents(from, to) {
    var out = [];
    data.tasks.forEach(function (t) {
      var wf = t.workflow;
      var title = t.task_name || (wf && wf.title) || 'Schedule';
      var href = t.workflow_id ? wfHref(t.agent, t.workflow_id, 'activity') : '/agents/config?agent=' + encodeURIComponent(t.agent) + '&tab=schedules';
      (t.history || []).forEach(function (h) {
        var at = Date.parse(h.ran_at);
        if (at >= from && at < to) out.push({ at: at, title: title, kind: h.status === 'error' ? 'error' : 'ok', href: href, task: t.task_id });
      });
      if (t.status !== 'scheduled' || !t.next_run_at) return;
      var next = Date.parse(t.next_run_at);
      var step = t.schedule && t.schedule.every ? everyMs(t.schedule.every) : 0;
      var n = 0;
      while (next < to && n < 400) {
        if (next >= from && next > Date.now()) out.push({ at: next, title: title, kind: 'next', href: href, task: t.task_id });
        if (!step) break;
        next += step; n++;
      }
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  function calendarHtml() {
    var from = weekStart(), to = from + 7 * DAY;
    var events = weekEvents(from, to);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var label = new Date(from).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + ' ' + String.fromCharCode(8211) + ' ' + new Date(to - DAY).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    var days = [];
    for (var i = 0; i < 7; i++) {
      var dayFrom = from + i * DAY, dayTo = dayFrom + DAY;
      var mine = events.filter(function (e) { return e.at >= dayFrom && e.at < dayTo; });
      var d = new Date(dayFrom);
      days.push('<div class="sc-day' + (dayFrom === today.getTime() ? ' is-today' : '') + '"><div class="sc-day-head"><b>' + d.getDate() + '</b>' + esc(d.toLocaleDateString(undefined, { weekday: 'short' })) + '</div>' +
        mine.slice(0, 8).map(function (e) { return '<a class="sc-ev ' + e.kind + '" href="' + e.href + '" title="' + esc(e.title) + '"><b>' + esc(e.title) + '</b><span>' + esc(clock(e.at)) + (e.kind === 'error' ? ' ' + String.fromCharCode(183) + ' failed' : e.kind === 'ok' ? ' ' + String.fromCharCode(183) + ' done' : '') + '</span></a>'; }).join('') +
        (mine.length > 8 ? '<span class="sc-more">+' + (mine.length - 8) + ' more</span>' : '') + '</div>');
    }
    return '<div class="sc-week-bar"><h2>' + esc(label) + '</h2><button type="button" data-week="-1" aria-label="Previous week">' + String.fromCharCode(8249) + '</button><button type="button" data-week="0">This week</button><button type="button" data-week="1" aria-label="Next week">' + String.fromCharCode(8250) + '</button></div>' +
      '<div class="le-grid sc-week">' + days.join('') + '</div>' +
      '<div class="sc-legend"><span><i class="next"></i>Coming up</span><span><i class="ok"></i>Ran</span><span><i class="error"></i>Failed</span>' + (data.zone ? '<span>Times in ' + esc(data.zone) + '</span>' : '') + '</div>';
  }

  function render() {
    var tabs = document.querySelectorAll('.le-topbar [data-view]');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', String(tabs[i].getAttribute('data-view') === view));
    document.querySelector('.le-search').style.visibility = view === 'list' ? '' : 'hidden';
    page.innerHTML = view === 'calendar' ? calendarHtml() : listHtml();
  }

  document.querySelector('.le-topbar .le-seg').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-view]');
    if (!b) return;
    view = b.getAttribute('data-view');
    var u = new URL(location.href);
    if (view === 'calendar') u.searchParams.set('view', 'calendar'); else u.searchParams.delete('view');
    history.replaceState(null, '', u);
    render();
  });
  document.getElementById('scSearch').addEventListener('input', function () { if (view === 'list') render(); });

  page.addEventListener('click', function (ev) {
    var toggle = ev.target.closest('[data-toggle]');
    if (toggle) {
      var on = toggle.getAttribute('aria-checked') === 'true';
      toggle.disabled = true;
      api('POST', '/schedules/' + encodeURIComponent(toggle.getAttribute('data-toggle')) + '/' + (on ? 'pause' : 'resume')).then(function (r) {
        if (!r.ok) { toggle.disabled = false; alertIn(toggle, r.body.error || 'That did not work'); return; }
        load();
      });
      return;
    }
    var run = ev.target.closest('[data-run]');
    if (run) {
      run.disabled = true;
      run.textContent = 'Starting' + String.fromCharCode(8230);
      api('POST', '/schedules/' + encodeURIComponent(run.getAttribute('data-run')) + '/run').then(function (r) {
        run.textContent = r.ok ? 'Started: follow it in the Inbox' : (r.body.error || 'Could not start it');
        setTimeout(load, 1500);
      });
      return;
    }
    var week = ev.target.closest('[data-week]');
    if (week) {
      var w = Number(week.getAttribute('data-week'));
      weekOffset = w === 0 ? 0 : weekOffset + w;
      render();
      return;
    }
    var add = ev.target.closest('[data-add]');
    if (add) openDialog(add.getAttribute('data-add'));
  });
  // Clicking elsewhere closes an open menu.
  document.addEventListener('click', function (ev) {
    var open = document.querySelectorAll('.sc-menu[open]');
    for (var i = 0; i < open.length; i++) if (!open[i].contains(ev.target)) open[i].removeAttribute('open');
  });
  function alertIn(el, text) {
    var card = el.closest('.sc-card');
    if (!card) return;
    var p = card.querySelector('.error') || card.appendChild(document.createElement('p'));
    p.className = 'error';
    p.textContent = text;
  }

  // ---- Create schedule ----
  var dlg = document.getElementById('scDialog');
  var form = document.getElementById('scForm');
  var foot = document.getElementById('scFoot');
  var kind = 'repeat', freq = 'daily';
  function pressIn(groupId, attr, value) {
    var all = document.querySelectorAll('#' + groupId + ' [' + attr + ']');
    for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', String(all[i].getAttribute(attr) === value));
  }
  function showWhen() {
    document.getElementById('scFreq').hidden = kind !== 'repeat';
    document.getElementById('scWhenInterval').hidden = !(kind === 'repeat' && freq === 'interval');
    document.getElementById('scWhenDaily').hidden = !(kind === 'repeat' && freq === 'daily');
    document.getElementById('scWhenWeekly').hidden = !(kind === 'repeat' && freq === 'weekly');
    document.getElementById('scWhenOnce').hidden = kind !== 'once';
  }
  document.getElementById('scKind').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-kind]');
    if (!b) return;
    kind = b.getAttribute('data-kind'); pressIn('scKind', 'data-kind', kind); showWhen();
  });
  document.getElementById('scFreq').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-freq]');
    if (!b) return;
    freq = b.getAttribute('data-freq'); pressIn('scFreq', 'data-freq', freq); showWhen();
  });
  var notify = document.getElementById('scNotify');
  notify.addEventListener('click', function () { notify.setAttribute('aria-checked', String(notify.getAttribute('aria-checked') !== 'true')); });
  var pick = document.getElementById('scWorkflow');
  function chosen() {
    var v = pick.value.split('/');
    return data.workflows.filter(function (w) { return w.agent === v[0] && w.id === v.slice(1).join('/'); })[0];
  }
  // The chosen workflow's inputs, each a field to fill for every run.
  function fillInputs() {
    var w = chosen();
    var box = document.getElementById('scInputs');
    var names = w ? Object.keys(w.parameters || {}) : [];
    box.innerHTML = !w ? '<p class="hint">Choose a workflow.</p>'
      : !names.length ? '<p class="hint">This workflow takes no inputs: every run is the same.</p>'
      : names.map(function (n) {
          var spec = w.parameters[n] || {};
          return '<label>' + esc(n) + (spec.required ? '' : ' <span class="hint">(optional)</span>') + (spec.description ? '<span class="hint" style="font-weight:400">' + esc(spec.description) + '</span>' : '') +
            '<textarea data-param="' + esc(n) + '" rows="2"' + (spec.required ? ' required' : '') + '>' + esc(spec.default != null ? String(spec.default) : '') + '</textarea></label>';
        }).join('');
  }
  pick.addEventListener('change', fillInputs);
  function openDialog(preset) {
    if (!data.workflows.length) { page.insertAdjacentHTML('afterbegin', '<p class="error" style="margin:0 0 12px">There are no workflows to schedule yet. Build one first, from Home or Workflows.</p>'); return; }
    var groups = {};
    data.workflows.forEach(function (w) { (groups[w.agentLabel] = groups[w.agentLabel] || []).push(w); });
    pick.innerHTML = Object.keys(groups).sort().map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (w) { return '<option value="' + esc(w.agent + '/' + w.id) + '">' + esc(w.title) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    if (preset) pick.value = preset;
    form.reset();
    if (preset) pick.value = preset;
    kind = 'repeat'; freq = 'daily'; pressIn('scKind', 'data-kind', kind); pressIn('scFreq', 'data-freq', freq); showWhen();
    notify.setAttribute('aria-checked', 'false');
    var t = new Date(Date.now() + DAY);
    document.getElementById('scDate').value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    document.getElementById('scZone').textContent = data.zone ? 'Times are in ' + data.zone + ', the workspace' + String.fromCharCode(8217) + 's time zone.' : '';
    foot.innerHTML = '';
    document.getElementById('scSave').disabled = false;
    fillInputs();
    dlg.showModal();
  }
  document.getElementById('scAdd').addEventListener('click', function () { openDialog(''); });
  document.getElementById('scCancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });

  function scheduleBody() {
    if (kind === 'once') {
      var date = document.getElementById('scDate').value, at = document.getElementById('scAtOnce').value;
      if (!date || !at) return null;
      return { run_at: date + 'T' + at };
    }
    if (freq === 'interval') {
      var n = Math.max(1, Number(document.getElementById('scEvery').value) || 1);
      return { every: n + document.getElementById('scUnit').value };
    }
    if (freq === 'weekly') return { every: '7d', at: document.getElementById('scAtWeekly').value || '09:00', weekday: document.getElementById('scWeekday').value };
    return { every: '1d', at: document.getElementById('scAt').value || '09:00' };
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var w = chosen();
    var schedule = scheduleBody();
    if (!w) { foot.innerHTML = '<span class="error">Choose a workflow.</span>'; return; }
    if (!schedule) { foot.innerHTML = '<span class="error">Choose a date and time.</span>'; return; }
    var values = {};
    var fields = document.querySelectorAll('#scInputs [data-param]');
    for (var i = 0; i < fields.length; i++) if (fields[i].value.trim()) values[fields[i].getAttribute('data-param')] = fields[i].value.trim();
    var body = { schedule: schedule };
    if (Object.keys(values).length) body.params = values;
    var name = document.getElementById('scName').value.trim();
    if (name) body.task_name = name;
    if (notify.getAttribute('aria-checked') === 'true') body.notify = true;
    var save = document.getElementById('scSave');
    save.disabled = true;
    foot.textContent = 'Saving' + String.fromCharCode(8230);
    var base = '/agents/' + encodeURIComponent(w.agent) + '/workflows/' + encodeURIComponent(w.id);
    api('POST', base + '/draft/schedules', body).then(function (r) {
      if (!r.ok) { save.disabled = false; foot.innerHTML = '<span class="error">' + esc(r.body.error || 'Could not add it') + '</span>'; return; }
      var only = (r.body.changes || []).length === 1;
      // On its own in the draft, it can go live now; with other changes,
      // they're reviewed together on the workflow's page.
      foot.innerHTML = only
        ? '<span>Added to ' + esc(w.title) + String.fromCharCode(8217) + 's draft. Publish it to start the schedule.</span><span style="flex:1"></span><button type="button" class="le-btn-dark" id="scPublish">Publish now</button>'
        : '<span>Added to ' + esc(w.title) + String.fromCharCode(8217) + 's draft, with its other changes.</span><span style="flex:1"></span><a class="le-btn-dark" href="' + wfHref(w.agent, w.id, 'triggers') + '">Review and publish</a>';
      var pub = document.getElementById('scPublish');
      if (pub) pub.addEventListener('click', function () {
        pub.disabled = true;
        pub.textContent = 'Publishing' + String.fromCharCode(8230);
        api('POST', base + '/publish', { note: 'Added a schedule' + (name ? ': ' + name : '') }).then(function (p) {
          if (!p.ok) { pub.disabled = false; pub.textContent = 'Publish now'; foot.insertAdjacentHTML('beforeend', '<span class="error">' + esc(p.body.error || 'Could not publish') + '</span>'); return; }
          dlg.close();
          load();
        });
      });
    });
  });

  load().catch(function (err) { page.innerHTML = '<p class="error">Could not load schedules: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
