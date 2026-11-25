// The console's home page (/home): each goal, and the workflows and
// groups of workflows built for it, one tinted level under the other;
// then workflows no goal points to. Its data is
// homeOverview (web/workflows-overview.ts) behind /home/overview. Every
// workflow on its own, as a table, stays at /workflows.
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
  .hm { max-width: 860px; display: grid; gap: 28px;
    --goal: #7a3e8f; --goal-soft: #f3e9f6; --job: #0c7a6a; --job-soft: #e2f1ef;
    --how: #3d5a99; --how-soft: #e8edf8; --agent: #8a5a12; --agent-soft: #f7eedf; }
  @media (prefers-color-scheme: dark) {
    .hm { --goal: #d6a2e6; --goal-soft: #2e1d36; --job: #5cc0b0; --job-soft: #143330;
      --how: #93abe6; --how-soft: #1b2440; --agent: #e0b56a; --agent-soft: #33280f; }
  }
  .hm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .hm-stat { border: 1px solid var(--line); border-radius: 10px; background: var(--bg); padding: 10px 14px; display: grid; gap: 0; color: var(--ink); text-decoration: none; }
  a.hm-stat:hover { border-color: var(--accent); }
  .hm-stat b { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .hm-stat span { font-size: 12.5px; color: var(--ink-muted); }
  .hm-stat.warn { border-color: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
  .hm-stat.warn b { color: var(--warn); }
  .hm-section { display: grid; gap: 10px; }
  .hm-section h2 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-muted); }
  .hm-tree { display: grid; gap: 8px; }
  .hm-node { border-radius: 10px; padding: 12px 14px; display: grid; gap: 4px; }
  .hm-row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
  .hm-node strong { font-weight: 600; }
  .hm-node strong a { color: var(--ink); text-decoration: none; }
  .hm-node strong a:hover { text-decoration: underline; }
  .hm-m { font-size: 13px; color: var(--ink-muted); }
  .hm-m a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .hm-goal { background: var(--goal-soft); }
  .hm-job { background: var(--job-soft); margin-left: 22px; }
  .hm-how { background: var(--bg); border: 1px solid var(--line); margin-left: 44px; }
  .hm-tree.flat .hm-job { margin-left: 0; }
  .hm-tree.flat .hm-how { margin-left: 22px; }
  .hm-tree.loose .hm-how { margin-left: 0; }
  .hm-tag { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
  .hm-t-goal { background: var(--bg); color: var(--goal); }
  .hm-t-job { background: var(--bg); color: var(--job); }
  .hm-t-how { background: var(--how-soft); color: var(--how); }
  .hm-t-agent { background: var(--agent-soft); color: var(--agent); }
  .hm-t-warn { background: var(--warn-soft); color: var(--warn); }
  .hm-slug { font-family: var(--font-mono); font-size: 13px; background: var(--code-bg); padding: 1px 6px; border-radius: 4px; color: var(--ink); text-decoration: none; }
  a.hm-slug:hover { text-decoration: underline; }
  .hm-new { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13.5px; font-weight: 600; background: var(--accent); color: var(--on-accent); text-decoration: none; white-space: nowrap; }
  .hm-empty { border: 1px dashed var(--line); border-radius: 12px; padding: 28px 24px; display: grid; gap: 14px; }
  .hm-empty h2 { margin: 0; font-size: 17px; }
  .hm-ways { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .hm-way { border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 4px; color: var(--ink); text-decoration: none; background: var(--bg); }
  .hm-way:hover { border-color: var(--accent); }
  .hm-way b { font-size: 14px; }
  .hm-way span { font-size: 12.5px; color: var(--ink-muted); }
  .hint { font-size: 12.5px; color: var(--ink-muted); }
  .error { font-size: 13px; color: var(--bad); margin: 0; }
  @media (max-width: 620px) { .hm-job { margin-left: 10px; } .hm-how { margin-left: 20px; } .hm-tree.flat .hm-how { margin-left: 10px; } }
</style>
</head>
<body data-le-page="home">
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div class="le-head plain">
    <div class="le-head-row">
      <div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>
        <div><h1>Home</h1><p>Your goals, big or small, and the workflows and groups of workflows that take care of them.</p></div>
      </div>
      <a class="hm-new" href="/goals?new=1">New goal</a>
    </div>
  </div>
  <div class="le-scroll"><div class="le-page"><div class="hm" id="hmPage"><p class="hint">Loading&hellip;</p></div></div></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  var page = document.getElementById('hmPage');
  var DOT = ' ' + String.fromCharCode(183) + ' ';
  var esc = window.leShell.esc;

  function wfHref(agent, id) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id);
  }
  function agentTag(name) { return '<span class="hm-tag hm-t-agent">' + esc(name) + '</span>'; }

  // A workflow or group's workflows, a chained one marked "then", and a
  // group's steps not built yet.
  function howHtml(j) {
    var unbuilt = j.group ? j.group.steps.filter(function (st) { return !st.built; }) : [];
    if (j.flows.length) {
      return '<div class="hm-node hm-how">' + j.flows.map(function (f) {
        return '<div class="hm-row">' +
          (f.then ? '<span class="hm-m">then ' + String.fromCharCode(8594) + '</span>' : '<span class="hm-tag hm-t-how">Workflow</span>') +
          '<a class="hm-slug" href="' + wfHref(f.agent, f.id) + '">' + esc(f.id) + '</a>' + agentTag(f.agent) +
          (f.gone ? '<span class="hm-m">no longer on this agent</span>' : f.starts.length ? '<span class="hm-m">' + esc(f.starts.join(DOT)) + '</span>' : '') +
          (f.waiting ? '<a class="hm-tag hm-t-warn" href="/inbox">' + f.waiting + ' waiting</a>' : '') +
        '</div>';
      }).join('') + unbuilt.map(function (st) { return '<div class="hm-row"><span class="hm-m">then ' + String.fromCharCode(8594) + ' ' + esc(st.name) + ', not built yet</span></div>'; }).join('') + '</div>';
    }
    return '';
  }

  // A goal's workflow, or group of workflows that run in order.
  function itemHtml(j, goalId) {
    return '<div class="hm-node hm-job"><div class="hm-row"><span class="hm-tag hm-t-job">' + (j.group ? 'Group' : 'Workflow') + '</span>' +
        '<strong><a href="/goals?goal=' + encodeURIComponent(goalId) + '">' + esc(j.title) + '</a></strong>' +
        (j.group ? '<span class="hm-m">' + j.group.steps.length + ' workflows in order</span>' : '') + '</div>' +
        (j.measure ? '<span class="hm-m">measured by: ' + esc(j.measure) + '</span>' : '') +
      '</div>' + howHtml(j);
  }

  function goalHtml(g) {
    return '<div class="hm-tree">' +
      '<div class="hm-node hm-goal"><div class="hm-row"><span class="hm-tag hm-t-goal">Goal</span><strong><a href="/goals?goal=' + encodeURIComponent(g.id) + '">' + esc(g.goal) + '</a></strong></div>' +
        (g.measure ? '<span class="hm-m">measured by: ' + esc(g.measure) + '</span>' : '') + '</div>' +
      (g.jobs.length ? g.jobs.map(function (j) { return itemHtml(j, g.id); }).join('') : '<div class="hm-node hm-job"><span class="hm-m">Nothing built yet' + DOT + '<a href="/goals?goal=' + encodeURIComponent(g.id) + '">See its suggestions</a></span></div>') +
    '</div>';
  }

  function looseHtml(w) {
    return '<div class="hm-node hm-how"><div class="hm-row"><span class="hm-tag hm-t-how">Workflow</span>' +
      '<a class="hm-slug" href="' + wfHref(w.agent, w.id) + '">' + esc(w.id) + '</a>' + agentTag(w.agent) +
      '<span class="hm-m">' + esc(w.starts.join(DOT)) + '</span>' +
      (w.waiting ? '<a class="hm-tag hm-t-warn" href="/inbox">' + w.waiting + ' waiting</a>' : '') + '</div></div>';
  }

  function renderEmpty() {
    page.innerHTML =
      '<div class="hm-empty"><h2>Nothing set up yet</h2>' +
        '<p class="hint" style="margin:0">Give LoopEngine a goal, big or small, and it suggests the workflows for it, and groups of workflows that run in order. Or go straight to a workflow: how an agent does something again and again.</p>' +
        '<div class="hm-ways">' +
          '<a class="hm-way" href="/goals?new=1"><b>Start from a goal</b><span>Work to hand off or a result to reach: get workflows suggested for it.</span></a>' +
          '<a class="hm-way" href="/workflows/new"><b>Build a workflow</b><span>Say what the agent should do, or start from an example.</span></a>' +
        '</div></div>';
  }

  function render(d) {
    if (!d.goals.length && !d.workflows.length) return renderEmpty();
    var s = d.summary;
    var html =
      '<div class="hm-stats">' +
        '<a class="hm-stat' + (s.waiting ? ' warn' : '') + '" href="/inbox"><b>' + s.waiting + '</b><span>' + (s.waiting === 1 ? 'Case waiting for you' : 'Cases waiting for you') + '</span></a>' +
        '<a class="hm-stat" href="/workflows"><b>' + s.runsThisWeek + '</b><span>Runs in the last 7 days</span></a>' +
        '<a class="hm-stat" href="/workflows"><b>' + s.failedThisWeek + '</b><span>Failed in the last 7 days</span></a>' +
      '</div>';
    if (d.goals.length) html += '<div class="hm-section"><h2>Goals</h2>' + d.goals.map(goalHtml).join('') + '</div>';
    if (d.loose.length) html += '<div class="hm-section"><h2>' + (d.goals.length ? 'Workflows not for a goal' : 'Workflows') + '</h2><div class="hm-tree loose">' + d.loose.map(looseHtml).join('') + '</div></div>';
    page.innerHTML = html;
  }

  fetch('/home/overview', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(render)
    .catch(function (err) { page.innerHTML = '<p class="error">Couldn' + String.fromCharCode(8217) + 't load your home page: ' + esc(err.message) + '</p>'; });
})();
</script>
</body>
</html>`
