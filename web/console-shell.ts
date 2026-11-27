// The app shell every console page renders inside: a sidebar listing the
// agents (plus Models, Apps and Settings), and, for a page about one agent,
// a header with its name, prompt and tabs. The tabs span two pages —
// Chat is playground.ts, every other tab is agents-config-page.ts — so
// both render the header through this one script and read as one app.
//
// A page opts in with <body data-le-page="...">, the sidebar markup
// (consoleSidebarHtml) inside a .le-app grid, and consoleShellScript
// before its own script. Pages talk to it through window.leShell:
//   leShell.ready            Promise of the /agents list
//   leShell.setActive(name)  highlight the agent this page shows
//   leShell.setDisplayName(name, displayName)  show a renamed agent's new name
//   leShell.displayNameOf(name)  an agent's display name, or its id
//   leShell.renderHead(opts) agent header + tabs HTML (see below)
//   leShell.setTab(tab)      move the tab highlight without a reload
//   leShell.esc(s)           HTML-escape
//   leShell.wireModelPicker(form)  model dropdown for a provider select
//   leShell.loadProviderKeys()     Promise of {provider: key saved?}, or null
//   leShell.applyProviderKeys(form, keys, keep)  only providers with a key
//   leShell.abilityOriginBadge(origin)    Official/Public/Private badge for an ability
//   leShell.toggleAbilityDetails(btn)     an ability's tools, skills and settings
//   leShell.adminNote(tech)  "Only your workspace admin can change this",
//                            with the technical how-to
// Same embedded-string conventions as the pages themselves: plain
// string concatenation and no backslashes inside the script, so nothing
// here needs double-escaping in the template literal.

const BRAND_MARK =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
  '<path d="M3 7a4 4 0 1 0 4-4" stroke="var(--on-accent)" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M7 1.2v3.6L9.2 3z" fill="var(--on-accent)"/></svg>'

// A robot for Agents. It's drawn smaller in its 24 box than the other
// icons: cropped to its middle 18, it shows at the same size.
const AGENTS_ICON = '<svg class="le-nav-icon" viewBox="3 3 18 18" fill="currentColor" aria-hidden="true"><path d="M11 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm3.5 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 5.5a1 1 0 0 1 1 1V7h4a3 3 0 0 1 3 3v3.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V10a3 3 0 0 1 3-3h4v-.5a1 1 0 0 1 1-1ZM7 9h10a1 1 0 0 1 1 1v3.5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V10a1 1 0 0 1 1-1Z"/></svg>'

// Two linked steps going round, for Workflows.
const WORKFLOWS_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M10 6.5h4a3.5 3.5 0 0 1 3.5 3.5v4"/><path d="M14 17.5h-4A3.5 3.5 0 0 1 6.5 14v-4"/></svg>'

// An inbox tray, for the Inbox.
const INBOX_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>'

// A target, for Goals.
const GOALS_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>'

// A clipboard with a tick, for Audit.
const AUDIT_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/></svg>'

// A gear, for Settings.
const SCHEDULES_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
const SETTINGS_ICON = '<svg class="le-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

// Two columns: the sections (Inbox, Goals, Agents, Workflows, Audit,
// Settings), and beside them what's in the current one. A goal holds the
// workflows, and groups of workflows, suggested for it. Pointing at
// another section shows its column instead, until the pointer leaves.
// Inbox and Home have no second column; pointing at a section there
// opens its column over the page.
export const consoleSidebarHtml: string = `<aside class="le-sidebar" aria-label="Console navigation">
  <nav class="le-rail" aria-label="Sections">
    <a class="le-brand" href="/" title="Home"><span class="le-brand-mark">${BRAND_MARK}</span></a>
    <a class="le-rail-item" href="/inbox" data-le-nav-head="inbox" data-le-section="inbox">${INBOX_ICON}<span>Inbox</span><span class="le-pill warn le-inbox-count" id="leInboxCount" hidden></span></a>
    <a class="le-rail-item" href="/goals" data-le-nav-head="goals" data-le-section="goals">${GOALS_ICON}<span>Goals</span></a>
    <a class="le-rail-item" href="/agents" data-le-nav-head="agents" data-le-section="agents">${AGENTS_ICON}<span>Agents</span></a>
    <a class="le-rail-item" href="/workflows" data-le-nav-head="workflows" data-le-section="workflows">${WORKFLOWS_ICON}<span>Workflows</span></a>
    <a class="le-rail-item" href="/schedules" data-le-nav-head="schedules" data-le-section="schedules">${SCHEDULES_ICON}<span>Schedules</span></a>
    <span class="le-rail-gap"></span>
    <a class="le-rail-item" href="/audit" data-le-nav-head="audit" data-le-section="audit">${AUDIT_ICON}<span>Audit</span></a>
    <a class="le-rail-item" href="/config?section=settings" data-le-nav-head="settings" data-le-section="settings">${SETTINGS_ICON}<span>Settings</span></a>
    <div class="le-who" id="leWho" hidden></div>
  </nav>
  <div class="le-panel" hidden>
    <section class="le-pane" data-le-pane="goals">
      <div class="le-pane-head"><a href="/goals">Goals</a><a class="le-pane-new" href="/goals?new=1" data-le-goal-new>+ New</a></div>
      <ul class="le-agent-list le-goal-list" id="leGoalList"></ul>
    </section>
    <section class="le-pane" data-le-pane="agents">
      <div class="le-pane-head"><a href="/agents">Agents</a><a class="le-pane-new" href="/agents?new=1">+ New</a></div>
      <ul class="le-agent-list" id="leAgentList"></ul>
      <a class="le-sub-link" href="/interview" data-le-nav="interview">Find your first agent</a>
    </section>
    <section class="le-pane" data-le-pane="workflows">
      <div class="le-pane-head"><a href="/workflows">Workflows</a><a class="le-pane-new" href="/workflows?new=1">+ New</a></div>
      <ul class="le-agent-list le-goal-list le-wf-list" id="leWorkflowList"></ul>
    </section>
    <section class="le-pane" data-le-pane="settings">
      <div class="le-pane-head"><a href="/config?section=settings">Settings</a></div>
      <nav class="le-settings-menu" aria-label="Settings">
        <a href="/config?section=models" data-le-nav="models">Models</a>
        <a href="/config?section=apps" data-le-nav="apps">Apps</a>
        <a href="/config?section=settings" data-le-nav="settings">General settings</a>
      </nav>
    </section>
  </div>
</aside>`

export const consoleShellScript: string = `<script>
(function () {
  // A setting only the workspace's admin can change: said plainly, with
  // the technical how-to.
  function adminNote(tech) {
    return '<p class="hint le-admin-note">Only your workspace admin can change this. ' + tech + '</p>';
  }
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
  // Tools and Skills live under Advanced (an agent's own tools and skills,
  // Composio, subagents): what an agent can do is shown per app and
  // ability on the Apps tab (id 'abilities', so older links still work).
  // ?tab=tools and ?tab=skills still open Advanced.
  var TABS = [
    ['overview', 'Overview'], ['workflows', 'Workflows'], ['abilities', 'Apps'], ['messaging', 'Messaging Apps'],
    ['schedules', 'Schedules'], ['chat', 'Chat'], ['actauth', 'Permissions'], ['env', 'Environment'], ['advanced', 'Advanced']
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function enc(s) { return encodeURIComponent(s); }

  // The sidebar's lists, kept in this tab's session storage: a page shows
  // the last ones at once, then fetches them again and redraws only if
  // something changed. Each console page is a full page load, so without
  // this every click would redraw the lists from empty.
  function recall(key) {
    try { var v = sessionStorage.getItem('le-side:' + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function remember(key, value) {
    try { sessionStorage.setItem('le-side:' + key, JSON.stringify(value)); } catch (e) {}
  }
  // A list asked for again while it's still loading, or within a couple
  // of seconds of arriving (a page reloading the sidebar as it opens),
  // reuses that answer instead of another round trip.
  var recent = {};
  function getJson(url) {
    var hit = recent[url];
    if (hit && (!hit.at || Date.now() - hit.at < 2000)) return hit.promise;
    var entry = { at: 0, promise: null };
    entry.promise = fetch(url, { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) { entry.at = Date.now(); return data; });
    recent[url] = entry;
    return entry.promise;
  }
  function cachedFetch(key, url, render) {
    var seen = recall(key);
    if (seen) { try { render(seen); } catch (e) {} }
    return getJson(url)
      .then(function (data) {
        if (!data) return;
        if (!seen || JSON.stringify(seen) !== JSON.stringify(data)) render(data);
        remember(key, data);
      })
      .catch(function () {});
  }

  // Who is signed in and their role (GET /config/settings), read once;
  // pages read it through leShell.settings() rather than asking again.
  var settings = getJson('/config/settings');
  // An approver or viewer sees the Inbox only, with the rest of the
  // sidebar hidden. The server knows the role from the request and marks
  // the page before it's sent (and those roles can't open any other
  // page), so the lists draw at once instead of waiting on a role check.
  var markedInboxOnly = Boolean(app && app.classList.contains('le-inbox-only'));
  if (markedInboxOnly) {
    var inboxBrand = document.querySelector('.le-brand');
    if (inboxBrand) inboxBrand.setAttribute('href', '/inbox');
  }
  var fullAccess = Promise.resolve(!markedInboxOnly);

  function tabHref(name, tab) {
    if (tab === 'chat') return '/playground?agent=' + enc(name);
    return '/agents/config?agent=' + enc(name) + (tab && tab !== 'overview' ? '&tab=' + enc(tab) : '');
  }

  // An agent in the list opens its Overview. Switching agents keeps you
  // where you are: on a config tab you land on the same tab for the other
  // agent, and in Chat on its Chat.
  function agentHref(name) {
    // Read live: the agent page changes tabs and agents without reloading.
    if (page === 'agent-config') return tabHref(name, new URLSearchParams(location.search).get('tab') || 'overview');
    if (page === 'chat') return tabHref(name, 'chat');
    return tabHref(name, 'overview');
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
      return '<li><a class="le-agent-item" href="' + agentHref(a.name) + '" data-le-agent="' + esc(a.name) + '"' + (a.displayName ? ' title="' + esc(a.name) + '"' : '') + (a.name === activeAgent ? ' aria-current="page"' : '') + '>' +
        '<span class="le-dot' + (n ? ' warn' : '') + '" aria-hidden="true"></span>' +
        '<span class="le-name">' + esc(a.displayName || a.name) + '</span>' + meta + '</a></li>';
    }).join('');
  }

  function envCountHtml(name) {
    var n = toSet[name] || 0;
    return n ? '<span class="le-count warn">' + n + ' to set</span>' : '';
  }

  // Each agent's count comes with GET /agents (toSet).
  function loadToSet() {
    var next = {};
    agents.forEach(function (a) { next[a.name] = a.toSet || 0; });
    var changed = JSON.stringify(next) !== JSON.stringify(toSet);
    toSet = next;
    remember('toSet', toSet);
    if (changed) renderList();
    agents.forEach(function (a) {
      var slots = document.querySelectorAll('[data-le-env-count="' + a.name + '"]');
      for (var i = 0; i < slots.length; i++) slots[i].innerHTML = envCountHtml(a.name);
    });
  }

  // ---- Goals, listed above the agents: each opens its goal on the Goals
  // page; + New opens a new one. The Goals page reloads the list when it
  // adds or removes one (leShell.reloadGoals).
  var agentsHead = document.querySelector('[data-le-nav-head="agents"]');
  if (agentsHead && page === 'agents') agentsHead.setAttribute('aria-current', 'page');
  var goalList = document.getElementById('leGoalList');
  function reloadGoals() {
    if (!goalList) return Promise.resolve();
    return cachedFetch('goals', '/goals', function (data) {
        var goals = data.goals || [];
        var current = page === 'goals' ? new URLSearchParams(location.search).get('goal') : null;
        var newLink = document.querySelector('[data-le-goal-new]');
        var creating = page === 'goals' && !current && (location.pathname === '/' || new URLSearchParams(location.search).has('new'));
        var head = document.querySelector('[data-le-nav-head="goals"]');
        if (head) { if (page === 'goals' && !current && !creating) head.setAttribute('aria-current', 'page'); else head.removeAttribute('aria-current'); }
        if (newLink) { if (creating) newLink.setAttribute('aria-current', 'page'); else newLink.removeAttribute('aria-current'); }
        goalList.innerHTML = goals.length ? goals.map(function (g) {
          return '<li><a class="le-agent-item le-goal-item" href="/goals?goal=' + enc(g.id) + '" title="' + esc(g.goal) + '"' + (g.id === current ? ' aria-current="page"' : '') + '>' +
            '<span class="le-dot' + (g.status === 'planning' ? ' warn' : '') + '" aria-hidden="true"></span><span class="le-name">' + esc(g.goal) + '</span></a></li>';
        }).join('') : '<li class="le-agent-item"><span></span><span class="le-meta">No goals yet</span><span></span></li>';
      });
  }
  fullAccess.then(function (full) { if (full) reloadGoals(); });

  // Jobs are gone: a goal holds workflows and groups. Kept so a page that
  // still asks to reload them does nothing.
  function reloadJobs() { return Promise.resolve(); }

  // ---- Workflows, listed under the agents (GET /workflows/overview),
  // each opening on its agent's Workflows tab. A tinted dot is running (a
  // run under way, or a schedule or webhook on); yellow is pending (it
  // only runs when someone starts it).
  var workflowList = document.getElementById('leWorkflowList');
  function reloadWorkflows() {
    if (!workflowList) return Promise.resolve();
    var q = new URLSearchParams(location.search);
    var currentAgent = page === 'agent-config' && q.get('tab') === 'workflows' ? q.get('agent') : null;
    var currentId = currentAgent ? q.get('workflow') : null;
    return cachedFetch('workflows', '/workflows/overview', function (data) {
        var list = (data.workflows || []).slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
        workflowList.innerHTML = list.length ? list.map(function (w) {
          var on = w.agent === currentAgent && w.id === currentId;
          return '<li><a class="le-agent-item le-goal-item" href="/agents/config?agent=' + enc(w.agent) + '&tab=workflows&workflow=' + enc(w.id) + '" title="' + esc(w.title) + ' (' + esc(w.agentLabel) + DOT_SEP + (w.live ? 'Running' : 'Pending') + ')"' + (on ? ' aria-current="page"' : '') + '>' +
            '<span class="le-dot ' + (w.live ? 'tint' : 'pending') + '" aria-hidden="true"></span><span class="le-wf-text"><span class="le-name">' + esc(w.title) + '</span><span class="le-meta">' + esc(w.agentLabel) + '</span></span></a></li>';
        }).join('') : '<li class="le-agent-item"><span></span><span class="le-meta">No workflows yet</span><span></span></li>';
      });
  }
  var DOT_SEP = ', ';
  fullAccess.then(function (full) { if (full) reloadWorkflows(); });

  // ---- The Inbox, at the top: how many cases wait on a person, kept
  // current. The Inbox page marks itself.
  var inboxCount = document.getElementById('leInboxCount');
  var inboxHead = document.querySelector('[data-le-nav-head="inbox"]');
  if (inboxHead && page === 'inbox') inboxHead.setAttribute('aria-current', 'page');
  var workflowsHead = document.querySelector('[data-le-nav-head="workflows"]');
  if (workflowsHead && page === 'workflows-overview') workflowsHead.setAttribute('aria-current', 'page');
  function reloadInboxCount() {
    if (!inboxCount) return;
    cachedFetch('inbox', '/inbox/count', function (d) { inboxCount.textContent = String(d.open || 0); inboxCount.hidden = !d.open; inboxCount.title = (d.open || 0) + ' waiting for a decision'; });
  }
  reloadInboxCount();
  setInterval(function () { if (!document.hidden) reloadInboxCount(); }, 30000);

  var loadError = null;
  var ready = fullAccess.then(function (full) { return full ? loadAgents() : []; });
  function loadAgents() {
    // The last list at once (with how many settings each still needs);
    // the fresh one replaces it below.
    var seen = recall('agents');
    if (seen && seen.agents) {
      agents = seen.agents;
      toSet = recall('toSet') || {};
      renderList();
    }
    return fetch('/agents', { headers: { accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 ? 'sign-in required (HTTP 401)' : 'HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      agents = data.agents || [];
      if (!seen || JSON.stringify(seen.agents) !== JSON.stringify(agents)) renderList();
      remember('agents', { agents: agents });
      loadToSet();
      return agents;
    })
    .catch(function (err) {
      loadError = err.message;
      if (list) list.innerHTML = '<li class="le-agent-item"><span></span><span class="le-meta">Could not load agents: ' + esc(err.message) + '</span><span></span></li>';
      return [];
    });
  }

  // opts: { name, displayName, prompt, chips: [{ text, mono }], tab, counts: { tools, skills, abilities, actauth } }
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
    // A top bar like the other pages': where you are (Agents / its name),
    // its model and permissions as chips; then its tabs, as a segmented
    // control. Its instructions are on Overview.
    return '<div class="le-head le-agent-head"><div class="le-agent-bar">' +
      '<button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>' +
      '<h1 class="le-crumb"><a href="/agents">Agents</a><span class="le-crumb-sep" aria-hidden="true">/</span>' +
        '<span class="le-crumb-here"><span data-le-head-name>' + esc(opts.displayName || opts.name) + '</span>' +
        '<span class="le-head-id" data-le-head-id' + (opts.displayName ? '' : ' hidden') + '>' + esc(opts.name) + '</span></span></h1>' +
      '<span class="le-topbar-gap"></span><div class="le-chips">' + chips + '</div></div>' +
      '<nav class="le-tabs" aria-label="Agent sections">' + tabs + '</nav></div>';
  }

  function setTab(tab) {
    var links = document.querySelectorAll('.le-tab');
    for (var i = 0; i < links.length; i++) links[i].setAttribute('aria-selected', String(links[i].getAttribute('data-tab') === tab));
    if (tab === 'overview') params.delete('tab'); else params.set('tab', tab);
    renderList();
  }

  // Updates one tab's count badge in place (e.g. after an install).
  function setCount(tab, n) {
    var link = document.querySelector('.le-tab[data-tab="' + tab + '"]');
    if (!link) return;
    var badge = link.querySelector('.le-count');
    if (!badge) { badge = document.createElement('span'); badge.className = 'le-count'; link.appendChild(badge); }
    badge.textContent = String(n);
  }

  function setActive(name) {
    activeAgent = name;
    renderList();
  }

  // After the agent's name for people changes: the sidebar and the
  // header show it, with the id beside it, or the id alone when cleared.
  function setDisplayName(name, displayName) {
    agents.forEach(function (a) { if (a.name === name) { if (displayName) a.displayName = displayName; else delete a.displayName; } });
    renderList();
    var title = document.querySelector('[data-le-head-name]');
    var id = document.querySelector('[data-le-head-id]');
    if (title) title.textContent = displayName || name;
    if (id) id.hidden = !displayName;
  }

  /** An agent's name for people: its display name, or its id. */
  function displayNameOf(name) {
    var a = agents.filter(function (x) { return x.name === name; })[0];
    return (a && a.displayName) || name;
  }

  var section = params.get('section');
  var foot = page === 'config' ? (section === 'abilities' || section === 'gateways' || section === 'apps' ? 'apps' : section === 'settings' ? 'settings' : 'models') : page === 'interview' || page === 'workflows' ? page : '';
  // The section this page is in, whose column shows beside the sections.
  var sidebar = document.querySelector('.le-sidebar');
  var panel = document.querySelector('.le-panel');
  var section0 = page === 'goals' ? 'goals'
    : page === 'agent-config' && params.get('tab') === 'workflows' && params.get('workflow') ? 'workflows'
    : page === 'agents' || page === 'agent-config' || page === 'chat' || page === 'interview' ? 'agents'
    : page === 'workflows' || page === 'workflows-overview' ? 'workflows'
    : page === 'config' ? 'settings'
    : page === 'inbox' ? 'inbox'
    : page === 'audit' ? 'audit'
    : page === 'schedules' ? 'schedules'
    : '';
  var railItems = document.querySelectorAll('[data-le-section]');
  for (var ri = 0; ri < railItems.length; ri++) {
    if (railItems[ri].getAttribute('data-le-section') === section0) railItems[ri].classList.add('is-current');
  }
  function showPane(name, preview) {
    if (!panel || markedInboxOnly) return;
    var pane = name ? document.querySelector('[data-le-pane="' + name + '"]') : null;
    if (!pane && preview) return;
    var panes = document.querySelectorAll('[data-le-pane]');
    for (var pi = 0; pi < panes.length; pi++) panes[pi].classList.toggle('is-shown', panes[pi] === pane);
    panel.hidden = !pane;
    // With no column of its own, the page gets one over it while pointing.
    sidebar.classList.toggle('previewing', Boolean(pane) && name !== section0 && !document.querySelector('[data-le-pane="' + section0 + '"]'));
  }
  showPane(section0, false);
  if (sidebar) {
    for (var rj = 0; rj < railItems.length; rj++) {
      railItems[rj].addEventListener('mouseenter', function (ev) { showPane(ev.currentTarget.getAttribute('data-le-section'), true); });
      railItems[rj].addEventListener('focus', function (ev) { showPane(ev.currentTarget.getAttribute('data-le-section'), true); });
    }
    sidebar.addEventListener('mouseleave', function () { showPane(section0, false); });
  }
  var settingsHead = document.querySelector('[data-le-nav-head="settings"]');
  if (settingsHead && page === 'config') settingsHead.setAttribute('aria-current', 'page');
  var footLinks = document.querySelectorAll('[data-le-nav]');
  for (var i = 0; i < footLinks.length; i++) {
    if (footLinks[i].getAttribute('data-le-nav') === foot) footLinks[i].setAttribute('aria-current', 'page');
  }

  // Who is signed in, at the foot of the sections: a round badge with
  // their initial, and on pointing, the email and a link back to the
  // dashboard when a hosting router signs requests, otherwise how this
  // server is protected.
  var who = document.getElementById('leWho');
  if (who) {
    settings
      .then(function (s) {
        if (!s || !s.signIn) return;
        var si = s.signIn;
        var card, initial;
        if (si.mode === 'hosted') {
          var roleName = si.role && si.role !== 'owner' ? si.role.charAt(0).toUpperCase() + si.role.slice(1) : '';
          initial = (si.email || '?').charAt(0).toUpperCase();
          card = '<span class="le-who-name">' + esc(si.email || 'Signed in') + (roleName ? ' (' + esc(roleName) + ')' : '') + '</span>' +
            (si.dashboardUrl ? '<a href="' + esc(si.dashboardUrl) + '">Dashboard</a>' : '');
        } else {
          initial = '?';
          card = '<span class="le-who-name">' + (si.mode === 'basic' ? 'Signed in with Basic Auth' : 'No sign-in configured') + '</span>';
        }
        who.innerHTML = '<button type="button" class="le-who-badge" aria-label="Account">' + esc(initial) + '</button><span class="le-who-card">' + card + '</span>';
        who.hidden = false;
      })
      .catch(function () {});
  }

  document.addEventListener('click', function (ev) {
    if (!app) return;
    if (ev.target.closest('[data-le-menu]')) { app.classList.toggle('nav-open'); return; }
    if (app.classList.contains('nav-open') && !ev.target.closest('.le-sidebar')) app.classList.remove('nav-open');
  });

  // A model dropdown for a form with select[name=provider] and
  // input[name=modelName] (New agent, and an agent's Model form): the
  // provider's models from GET /config/models/:provider/models, reloaded
  // when the provider changes. The text input is still what the form
  // submits; it shows for "Other", which is all the dropdown offers when
  // a provider has no models to list. A short or empty list says why
  // (no key saved, provider down) under it. Safe to call more than once
  // for the same form.
  var OTHER_MODEL = '__other__';
  function wireModelPicker(form) {
    var providerSelect = form.querySelector('select[name="provider"]');
    var input = form.querySelector('input[name="modelName"]');
    if (!providerSelect || !input || input.getAttribute('data-le-model-picker')) return;
    input.setAttribute('data-le-model-picker', '1');
    var select = document.createElement('select');
    select.setAttribute('aria-label', 'Model name');
    var note = document.createElement('span');
    note.className = 'hint';
    note.style.display = 'none';
    input.parentNode.insertBefore(select, input);
    input.parentNode.insertBefore(note, input.nextSibling);
    var request = 0;

    function showInput(show) { input.style.display = show ? '' : 'none'; }
    function showNote(message) {
      note.textContent = message || '';
      note.style.display = message ? '' : 'none';
    }

    select.addEventListener('change', function () {
      if (select.value === OTHER_MODEL) {
        input.value = '';
        showInput(true);
        input.focus();
      } else {
        input.value = select.value;
        showInput(false);
      }
    });

    function load() {
      var provider = providerSelect.value;
      var current = input.value.trim();
      var mine = ++request;
      select.innerHTML = '<option>Loading models&hellip;</option>';
      select.disabled = true;
      showNote('');
      showInput(false);
      fetch('/config/models/' + encodeURIComponent(provider) + '/models')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (mine !== request) return;
          var models = data.models || [];
          showNote(data.error);
          // Only Anthropic has a default model (see agents' model config).
          var options = provider === 'anthropic' ? '<option value="">(provider default)</option>' : '';
          if (current && models.indexOf(current) === -1) options += '<option value="' + esc(current) + '">' + esc(current) + '</option>';
          options += models.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
          options += '<option value="' + OTHER_MODEL + '">Other&hellip;</option>';
          select.innerHTML = options;
          select.disabled = false;
          if (current || provider === 'anthropic' || models.length) {
            select.value = current || (provider === 'anthropic' ? '' : models[0]);
            input.value = select.value;
          } else {
            // Nothing listed: "Other" with the name box open.
            select.value = OTHER_MODEL;
            showInput(true);
          }
        })
        .catch(function (err) {
          if (mine !== request) return;
          select.innerHTML = '<option value="' + OTHER_MODEL + '">Other&hellip;</option>';
          select.disabled = false;
          showInput(true);
          showNote('Could not list models: ' + err.message);
        });
    }

    providerSelect.addEventListener('change', function () { input.value = ''; load(); });
    // form.reset() (after New agent creates one) puts the provider and
    // the hidden model name back to their defaults, but not this
    // dropdown's options; reload once the reset has happened.
    form.addEventListener('reset', function () { setTimeout(load, 0); });
    load();
  }

  // Which model providers have a key saved, from GET /config/models:
  // {provider: true/false}, or null when that can't be read.
  function loadProviderKeys() {
    return fetch('/config/models')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return null;
        var keys = {};
        data.providers.forEach(function (p) { keys[p.provider] = p.configured; });
        return keys;
      })
      .catch(function () { return null; });
  }

  // Lets a form's select[name=provider] choose only providers with a key
  // saved, since an agent on one without a key can't answer. The rest stay
  // listed, disabled and marked "(no key)", with a note under the select
  // linking to the Models page. keepProvider (an agent's current provider)
  // stays selectable without a key, so its other settings can still be
  // saved. Moves a disabled choice to the first provider with a key and
  // fires change, so the model dropdown follows. Returns that first
  // provider with a key, or null when there's none.
  function applyProviderKeys(form, keys, keepProvider) {
    var select = form.querySelector('select[name="provider"]');
    if (!select || !keys) return null;
    var note = form.querySelector('[data-le-provider-note]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'hint';
      note.style.margin = '0';
      note.setAttribute('data-le-provider-note', '');
      var label = select.closest('label') || select;
      label.parentNode.insertBefore(note, label.nextSibling);
    }
    var firstWithKey = null;
    var withoutKey = 0;
    Array.prototype.forEach.call(select.options, function (option) {
      var hasKey = Boolean(keys[option.value]);
      option.disabled = !hasKey && option.value !== keepProvider;
      option.textContent = hasKey ? option.value : option.value + ' (no key)';
      if (hasKey && !firstWithKey) firstWithKey = option.value;
      if (!hasKey) withoutKey++;
    });
    var modelsLink = '<a href="/config?section=models">Models page</a>';
    note.innerHTML = firstWithKey
      ? 'Add a key on the ' + modelsLink + ' to use more providers.'
      : 'No model provider has a key yet. Add one on the ' + modelsLink + ' to choose a model.';
    note.style.display = withoutKey ? '' : 'none';
    var chosen = select.options[select.selectedIndex];
    if (firstWithKey && chosen && chosen.disabled) {
      select.value = firstWithKey;
      var input = form.querySelector('input[name="modelName"]');
      if (input) input.value = '';
      select.dispatchEvent(new Event('change'));
    }
    return firstWithKey;
  }

  // ---- Abilities: where one came from, and what it can do ----
  // Used by the Abilities page and each agent's Apps tab.

  var DECISION_LABELS = { allow: 'Allow', ask: 'Ask me', deny: 'Never' };

  function decisionPill(decision) {
    return decision ? '<span class="le-pill ' + decision + '">' + DECISION_LABELS[decision] + '</span>' : '<span class="hint">No rule</span>';
  }

  // Official (@loopengine-co), Public (other npm), Private or App (a
  // connected app's MCP server), with where it came from on hover.
  var ORIGIN_LABELS = { official: 'Official', public: 'Public', private: 'Private', app: 'App' };
  function abilityOriginBadge(origin) {
    if (!origin) return '';
    return '<span class="le-pill ' + (origin.kind === 'private' || origin.kind === 'app' ? 'accent' : '') + '" title="' + esc(origin.label) + '">' +
      (ORIGIN_LABELS[origin.kind] || 'Public') + '</span> <span class="hint">' + esc(origin.label) + '</span>';
  }





  // What an ability can do: its tools (what each one does and its
  // permission: this agent's own when it's installed, else the one it
  // ships with), skills and settings.
  function renderAbilityDetails(d) {
    var tools = d.tools || [];
    var skills = d.skills || [];
    var settings = d.settings || [];
    // At the top: how many tools, by permission, skills and settings.
    var counts = {};
    tools.forEach(function (t) {
      var decision = d.agent ? t.agentDecision : t.decision;
      if (decision) counts[decision] = (counts[decision] || 0) + 1;
    });
    var chips = '<span class="ad-chip strong">' + tools.length + (tools.length === 1 ? ' tool' : ' tools') + '</span>' +
      ['allow', 'ask', 'deny'].filter(function (k) { return counts[k]; }).map(function (k) { return '<span class="ad-chip ' + k + '">' + counts[k] + ' ' + DECISION_LABELS[k] + '</span>'; }).join('') +
      '<span class="ad-chip">' + skills.length + (skills.length === 1 ? ' skill' : ' skills') + '</span>' +
      (settings.length ? '<span class="ad-chip">' + settings.length + (settings.length === 1 ? ' setting' : ' settings') + '</span>' : '');
    var row = function (name, desc, right) {
      return '<div class="ad-row"><div class="ad-row-head"><code class="ad-name">' + esc(name) + '</code>' + (right || '') + '</div>' +
        (desc ? '<p class="ad-desc">' + esc(desc) + '</p>' : '') + '</div>';
    };
    var toolRows = tools.map(function (t) {
      var permission = d.agent
        ? decisionPill(t.agentDecision) + (t.decision && t.decision !== t.agentDecision ? '<span class="ad-ships">ships as ' + DECISION_LABELS[t.decision] + '</span>' : '')
        : decisionPill(t.decision);
      return row(t.name, t.description || '', '<span class="ad-perm">' + permission + '</span>');
    }).join('');
    var description = String(d.description || '').replace(/^A loopengine ability: */i, '');
    return '<div class="ability-details">' +
      '<div class="ad-head"><div class="ad-title">What <code>' + esc(d.name) + '</code>' + (d.version ? ' <span class="ad-ver">v' + esc(d.version) + '</span>' : '') + ' can do</div>' +
        '<div class="ad-chips">' + chips + '</div>' +
        (description ? '<p class="ad-about">' + esc(description.charAt(0).toUpperCase() + description.slice(1)) + '</p>' : '') + '</div>' +
      '<div class="ad-sec"><div class="ad-k"><span>Tools</span><span>' + (d.agent ? 'Permission in ' + esc(d.agent) : 'Permission it ships with') + '</span></div>' +
        (tools.length ? '<div class="ad-list">' + toolRows + '</div>' : '<p class="ad-none">No tools.</p>') + '</div>' +
      (skills.length ? '<div class="ad-sec"><div class="ad-k"><span>Skills</span></div><div class="ad-list">' + skills.map(function (s) { return row(s.name, s.description || ''); }).join('') + '</div></div>' : '') +
      (settings.length ? '<div class="ad-sec"><div class="ad-k"><span>Settings it needs</span></div><div class="ad-list">' + settings.map(function (s) { return row(s.name, s.description || ''); }).join('') + '</div></div>' : '') +
      '</div>';
  }

  // Opens (or closes) an ability's details in a row right under its own.
  // Under the button's table row, or at the end of its card
  // ([data-details-host]).
  function toggleAbilityDetails(btn) {
    var tr = btn.closest('tr');
    var host = tr ? null : btn.closest('[data-details-host]');
    var next = tr ? tr.nextElementSibling : host.querySelector('.ability-details-row');
    if (next && next.classList.contains('ability-details-row')) {
      next.remove();
      btn.textContent = 'Details';
      btn.classList.remove('is-open');
      return;
    }
    var reading = '<div class="ability-details"><p class="hint" style="margin:0">Reading what it can do' + String.fromCharCode(8230) + '</p></div>';
    var row = document.createElement(tr ? 'tr' : 'div');
    row.className = 'ability-details-row';
    if (tr) {
      row.innerHTML = '<td colspan="' + tr.children.length + '">' + reading + '</td>';
      tr.parentNode.insertBefore(row, tr.nextSibling);
    } else {
      row.innerHTML = '<div>' + reading + '</div>';
      host.appendChild(row);
    }
    btn.textContent = 'Hide details';
    btn.classList.add('is-open');
    var agent = btn.dataset.agent;
    fetch('/abilities/details?spec=' + encodeURIComponent(btn.dataset.spec) + (agent ? '&agent=' + encodeURIComponent(agent) : ''))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        row.firstChild.innerHTML = r.ok ? renderAbilityDetails(r.body) : '<div class="ability-details"><p class="error" style="margin:0">Could not read it: ' + esc(r.body.error || 'unknown error') + '</p></div>';
      })
      .catch(function (err) { row.firstChild.innerHTML = '<div class="ability-details"><p class="error" style="margin:0">Could not read it: ' + esc(err.message) + '</p></div>'; });
  }


  window.leShell = { adminNote: adminNote, loadError: function () { return loadError; }, ready: ready, settings: function () { return settings; }, getJson: getJson, reloadGoals: reloadGoals, reloadJobs: reloadJobs, reloadWorkflows: reloadWorkflows, reloadInboxCount: reloadInboxCount, renderHead: renderHead, setTab: setTab, setActive: setActive, setDisplayName: setDisplayName, displayNameOf: displayNameOf, esc: esc, tabHref: tabHref, envCountHtml: envCountHtml, setCount: setCount, wireModelPicker: wireModelPicker, loadProviderKeys: loadProviderKeys, applyProviderKeys: applyProviderKeys, abilityOriginBadge: abilityOriginBadge, toggleAbilityDetails: toggleAbilityDetails };
})();
</script>`
