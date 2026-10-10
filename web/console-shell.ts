// The app shell every console page renders inside: a sidebar listing the
// agents (plus Models and Integrations), and, for a page about one agent,
// a header with its name, prompt and tabs. The tabs span two pages —
// Chat is playground.ts, every other tab is agents-config-page.ts — so
// both render the header through this one script and read as one app.
//
// A page opts in with <body data-le-page="...">, the sidebar markup
// (consoleSidebarHtml) inside a .le-app grid, and consoleShellScript
// before its own script. Pages talk to it through window.leShell:
//   leShell.ready            Promise of the /agents list
//   leShell.setActive(name)  highlight the agent this page shows
//   leShell.renderHead(opts) agent header + tabs HTML (see below)
//   leShell.setTab(tab)      move the tab highlight without a reload
//   leShell.esc(s)           HTML-escape
// Same embedded-string conventions as the pages themselves: plain
// string concatenation and no backslashes inside the script, so nothing
// here needs double-escaping in the template literal.

const BRAND_MARK =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
  '<path d="M3 7a4 4 0 1 0 4-4" stroke="var(--on-accent)" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M7 1.2v3.6L9.2 3z" fill="var(--on-accent)"/></svg>'

export const consoleSidebarHtml: string = `<aside class="le-sidebar" aria-label="Console navigation">
  <a class="le-brand" href="/agents"><span class="le-brand-mark">${BRAND_MARK}</span><span class="le-brand-name">LoopEngine</span></a>
  <div class="le-nav-label"><span>Agents</span><a href="/agents?new=1">+ New</a></div>
  <ul class="le-agent-list" id="leAgentList"></ul>
  <nav class="le-foot" aria-label="Settings">
    <a href="/config?section=models" data-le-nav="models">Models</a>
    <a href="/config?section=gateways" data-le-nav="integrations">Integrations</a>
  </nav>
</aside>`

export const consoleShellScript: string = `<script>
(function () {
  var page = document.body.getAttribute('data-le-page') || '';
  var params = new URLSearchParams(location.search);
  var app = document.querySelector('.le-app');
  var list = document.getElementById('leAgentList');
  var agents = [];
  var activeAgent = null;
  // Settings an installed ability declared scope "agent" for and this
  // agent hasn't set — the only kind with no fallback, so the only kind
  // that's certainly missing (see core/agent-env.ts). Filled in per agent
  // after the list loads.
  var toSet = {};
  var TABS = [
    ['chat', 'Chat'], ['overview', 'Overview'], ['tools', 'Tools'], ['skills', 'Skills'],
    ['abilities', 'Abilities'], ['actauth', 'Permissions'], ['env', 'Environment']
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function enc(s) { return encodeURIComponent(s); }

  function tabHref(name, tab) {
    if (tab === 'chat') return '/playground?agent=' + enc(name);
    return '/agents/config?agent=' + enc(name) + (tab && tab !== 'overview' ? '&tab=' + enc(tab) : '');
  }

  // Switching agents keeps you where you are: on a config tab you land on
  // the same tab for the other agent, anywhere else you land in its Chat.
  function agentHref(name) {
    if (page === 'agent-config') return tabHref(name, params.get('tab') || 'overview');
    return tabHref(name, 'chat');
  }

  function renderList() {
    if (!list) return;
    if (!agents.length) {
      list.innerHTML = '<li class="le-agent-item"><span></span><span class="le-meta">No agents yet</span><span></span></li>';
      return;
    }
    list.innerHTML = agents.map(function (a) {
      var n = toSet[a.name] || 0;
      var meta = n ? '<span class="le-pill warn" title="Settings this agent must set before its tools work">' + n + ' to set</span>' : '';
      return '<li><a class="le-agent-item" href="' + agentHref(a.name) + '"' + (a.name === activeAgent ? ' aria-current="page"' : '') + '>' +
        '<span class="le-dot' + (n ? ' warn' : '') + '" aria-hidden="true"></span>' +
        '<span class="le-name">' + esc(a.name) + '</span>' + meta + '</a></li>';
    }).join('');
  }

  function envCountHtml(name) {
    var n = toSet[name] || 0;
    return n ? '<span class="le-count warn">' + n + ' to set</span>' : '';
  }

  function loadToSet() {
    agents.forEach(function (a) {
      fetch('/agents/' + enc(a.name) + '/env')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (vars) {
          toSet[a.name] = (vars || []).filter(function (v) { return v.slot === 'agent' && v.scope === 'agent' && !v.set; }).length;
          renderList();
          var slots = document.querySelectorAll('[data-le-env-count="' + a.name + '"]');
          for (var i = 0; i < slots.length; i++) slots[i].innerHTML = envCountHtml(a.name);
        })
        .catch(function () {});
    });
  }

  var ready = fetch('/agents')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      agents = data.agents || [];
      renderList();
      loadToSet();
      return agents;
    })
    .catch(function () { return []; });

  // opts: { name, prompt, chips: [{ text, mono }], tab, counts: { tools, skills, abilities, actauth } }
  function renderHead(opts) {
    var counts = opts.counts || {};
    var chips = (opts.chips || []).map(function (c) {
      return '<span class="le-chip' + (c.mono ? ' mono' : '') + '">' + esc(c.text) + '</span>';
    }).join('');
    var tabs = TABS.map(function (t) {
      var count = t[0] === 'env'
        ? '<span data-le-env-count="' + esc(opts.name) + '">' + envCountHtml(opts.name) + '</span>'
        : (counts[t[0]] != null ? '<span class="le-count">' + counts[t[0]] + '</span>' : '');
      return '<a class="le-tab" data-tab="' + t[0] + '" href="' + tabHref(opts.name, t[0]) + '" aria-selected="' + (t[0] === opts.tab) + '">' + t[1] + count + '</a>';
    }).join('');
    return '<div class="le-head"><div class="le-head-row">' +
      '<div class="le-title"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>' +
      '<div style="min-width:0"><h1>' + esc(opts.name) + '</h1>' + (opts.prompt ? '<p>' + esc(opts.prompt) + '</p>' : '') + '</div></div>' +
      '<div class="le-chips">' + chips + '</div></div>' +
      '<nav class="le-tabs" aria-label="Agent sections">' + tabs + '</nav></div>';
  }

  function setTab(tab) {
    var links = document.querySelectorAll('.le-tab');
    for (var i = 0; i < links.length; i++) links[i].setAttribute('aria-selected', String(links[i].getAttribute('data-tab') === tab));
    if (tab === 'overview') params.delete('tab'); else params.set('tab', tab);
    renderList();
  }

  function setActive(name) {
    activeAgent = name;
    renderList();
  }

  var foot = page === 'config' ? (params.get('section') === 'gateways' ? 'integrations' : 'models') : '';
  var footLinks = document.querySelectorAll('[data-le-nav]');
  for (var i = 0; i < footLinks.length; i++) {
    if (footLinks[i].getAttribute('data-le-nav') === foot) footLinks[i].setAttribute('aria-current', 'page');
  }

  document.addEventListener('click', function (ev) {
    if (!app) return;
    if (ev.target.closest('[data-le-menu]')) { app.classList.toggle('nav-open'); return; }
    if (app.classList.contains('nav-open') && !ev.target.closest('.le-sidebar')) app.classList.remove('nav-open');
  });

  window.leShell = { ready: ready, renderHead: renderHead, setTab: setTab, setActive: setActive, esc: esc, tabHref: tabHref, envCountHtml: envCountHtml };
})();
</script>`
