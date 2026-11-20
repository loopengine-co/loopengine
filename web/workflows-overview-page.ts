// The console's front page: / and /workflows list every workflow in the
// workspace with how it starts, how it's been running and what's waiting
// in the Inbox (web/workflows-overview.ts behind /workflows/overview).
// Goals and Jobs are the way in when there's nothing to automate yet.
// Like the other console pages, its inline script avoids backslashes and
// template placeholders, since it lives inside a template literal.
import { devUiCss } from './dev-ui-styles.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'

export const workflowsOverviewPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workflows</title>
<style>${devUiCss}
  .wo { max-width: 1040px; display: grid; gap: 20px; }
  .wo-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .wo-stat { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); padding: 14px 16px; display: grid; gap: 2px; color: var(--ink); text-decoration: none; }
  a.wo-stat:hover { border-color: var(--accent); }
  .wo-stat b { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
  .wo-stat span { font-size: 12.5px; color: var(--ink-muted); }
  .wo-stat.warn { border-color: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
  .wo-stat.warn b { color: var(--warn); }
  .wo-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg); }
  .wo-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 14px 16px; border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
  .wo-row:first-child { border-top: 0; }
  .wo-row:hover { background: var(--surface); }
  .wo-head { font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); background: var(--surface); }
  .wo-head:hover { background: var(--surface); }
  .wo-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wo-sub { font-size: 12.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wo-runs { font-size: 13px; display: grid; gap: 2px; }
  .wo-side { display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  .wo-pill { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); white-space: nowrap; }
  .wo-pill.warn { background: var(--warn-soft); color: var(--warn); }
  .wo-pill.good { background: var(--good-soft); color: var(--good); }
  .wo-pill.bad { background: var(--bad-soft); color: var(--bad); }
  .wo-pill.run { background: var(--accent-soft); color: var(--accent-ink); }
  .wo-new { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; background: var(--accent); color: var(--on-accent); text-decoration: none; white-space: nowrap; }
  .wo-empty { border: 1px dashed var(--line); border-radius: 12px; padding: 28px 24px; display: grid; gap: 14px; }
  .wo-empty h2 { margin: 0; font-size: 17px; }
  .wo-ways { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .wo-way { border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 4px; color: var(--ink); text-decoration: none; background: var(--bg); }
  .wo-way:hover { border-color: var(--accent); }
  .wo-way b { font-size: 14px; }
  .wo-way span { font-size: 12.5px; color: var(--ink-muted); }
  .wo-plan { border-radius: 12px; background: var(--surface); padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; justify-content: space-between; font-size: 13.5px; }
  .wo-plan a { font-weight: 600; color: var(--accent-ink); text-decoration: none; }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 760px) { .wo-row { grid-template-columns: minmax(0, 1fr) auto; } .wo-row .wo-col-starts, .wo-row .wo-col-runs { display: none; } .wo-head { display: none; } }
</style>
</head>
<body data-le-page="workflows-overview">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Workflows</h1><p>Every job your agents run: how each one starts, how it's been going, and what's waiting for you.</p></div>
      </div>
      <a class="wo-new" href="/workflows/new">New workflow</a>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="wo" id="woPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('woPage');
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var esc = window.leShell.esc;

  function ago(iso) {
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function lastRunPill(w) {
    if (w.waiting) return '<span class="wo-pill warn">' + w.waiting + ' waiting</span>';
    if (!w.lastRun) return '<span class="wo-pill">Not run yet</span>';
    var st = w.lastRun.status;
    if (st === 'running') return '<span class="wo-pill run">Running</span>';
    if (st === 'error') return '<span class="wo-pill bad">Last run failed</span>';
    if (st === 'awaiting_approval') return '<span class="wo-pill warn">Waiting</span>';
    return '<span class="wo-pill good">Done</span>';
  }
  function href(w) {
    return '/agents/config?agent=' + encodeURIComponent(w.agent) + '&tab=workflows&workflow=' + encodeURIComponent(w.id);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var PLAN = '<div class="wo-plan"><span>Not sure what to automate next? Say what you want to achieve, and LoopEngine suggests the jobs that move it.</span><a href="/goals?new=1">Start from a goal &rarr;</a></div>';

  function renderEmpty() {
    page.innerHTML =
      '<div class="wo-empty"><h2>No workflows yet</h2>' +
        '<p class="hint" style="margin:0">A workflow is a job an agent does again and again: it runs on a schedule, from a webhook or from your app, asks you when it needs to, and every run is kept to check and improve.</p>' +
        '<div class="wo-ways">' +
          '<a class="wo-way" href="/workflows/new"><b>Describe a workflow</b><span>Write the job in a sentence or two and review the plan.</span></a>' +
          '<a class="wo-way" href="/workflows/new#examples"><b>Start from an example</b><span>A ready-made workflow for a common job.</span></a>' +
          '<a class="wo-way" href="/goals?new=1"><b>Start from a goal</b><span>Not sure what to automate? Get jobs suggested for what you want to achieve.</span></a>' +
        '</div></div>';
  }

  function render(d) {
    if (!d.workflows.length) return renderEmpty();
    var s = d.summary;
    var stats =
      '<div class="wo-stats">' +
        '<a class="wo-stat' + (s.waiting ? ' warn' : '') + '" href="/inbox"><b>' + s.waiting + '</b><span>' + (s.waiting === 1 ? 'Case waiting for you' : 'Cases waiting for you') + '</span></a>' +
        '<div class="wo-stat"><b>' + s.runsThisWeek + '</b><span>Runs in the last 7 days</span></div>' +
        '<div class="wo-stat"><b>' + s.failedThisWeek + '</b><span>Failed in the last 7 days</span></div>' +
        '<div class="wo-stat"><b>' + s.workflows + '</b><span>' + (s.workflows === 1 ? 'Workflow' : 'Workflows') + '</span></div>' +
      '</div>';
    var rows = d.workflows.map(function (w) {
      var decided = w.approved + w.refused;
      return '<a class="wo-row" href="' + href(w) + '">' +
        '<span style="min-width:0"><div class="wo-title">' + esc(w.title) + '</div><div class="wo-sub">' + esc(w.agentLabel) + '</div></span>' +
        '<span class="wo-col-starts wo-sub" title="' + esc(w.starts.join(', ')) + '">' + esc(w.starts.join(DOT)) + '</span>' +
        '<span class="wo-col-runs wo-runs"><span>' + plural(w.runsThisWeek, 'run', 'runs') + ' this week' + (w.failedThisWeek ? ', <span style="color:var(--bad)">' + w.failedThisWeek + ' failed</span>' : '') + '</span>' +
          '<span class="wo-sub">' + (w.lastRun ? 'Last ' + esc(ago(w.lastRun.at)) : 'Not run yet') + (decided ? DOT + w.approved + ' of ' + decided + ' approved' : '') + '</span></span>' +
        '<span class="wo-side">' + lastRunPill(w) + '</span>' +
      '</a>';
    }).join('');
    page.innerHTML = stats +
      '<div class="wo-list"><div class="wo-row wo-head"><span>Workflow</span><span class="wo-col-starts">Starts</span><span class="wo-col-runs">Runs</span><span></span></div>' + rows + '</div>' +
      PLAN;
  }

  fetch('/workflows/overview', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(render)
    .catch(function (err) { page.innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your workflows: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
