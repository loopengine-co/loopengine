// The app shell every console page renders inside: a sidebar listing the
// agents (plus Models, Abilities and Settings), and, for a page about one agent,
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
//   leShell.wireModelPicker(form)  model dropdown for a provider select
//   leShell.loadProviderKeys()     Promise of {provider: key saved?}, or null
//   leShell.applyProviderKeys(form, keys, keep)  only providers with a key
//   leShell.abilityOriginBadge(origin)    Public/Private badge for an ability
//   leShell.toggleAbilityDetails(btn)     an ability's tools, skills and settings
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
  <a class="le-find" href="/interview" data-le-nav="interview">Find your first agent</a>
  <a class="le-find" href="/templates" data-le-nav="templates">Start from a template</a>
  <nav class="le-foot" aria-label="Settings">
    <a href="/config?section=models" data-le-nav="models">Models</a>
    <a href="/config?section=abilities" data-le-nav="abilities">Abilities</a>
    <a href="/config?section=settings" data-le-nav="settings">Settings</a>
    <div class="le-who" id="leWho" hidden></div>
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
    ['overview', 'Overview'], ['chat', 'Chat'], ['abilities', 'Abilities'], ['tools', 'Tools'],
    ['skills', 'Skills'], ['actauth', 'Permissions'], ['messaging', 'Messaging'], ['schedules', 'Schedules'], ['env', 'Environment']
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

  var loadError = null;
  var ready = fetch('/agents', { headers: { accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 ? 'sign-in required (HTTP 401)' : 'HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      agents = data.agents || [];
      renderList();
      loadToSet();
      return agents;
    })
    .catch(function (err) {
      loadError = err.message;
      if (list) list.innerHTML = '<li class="le-agent-item"><span></span><span class="le-meta">Could not load agents: ' + esc(err.message) + '</span><span></span></li>';
      return [];
    });

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

  var section = params.get('section');
  var foot = page === 'config' ? (section === 'abilities' || section === 'gateways' ? 'abilities' : section === 'settings' ? 'settings' : 'models') : page === 'interview' || page === 'templates' ? page : '';
  var footLinks = document.querySelectorAll('[data-le-nav]');
  for (var i = 0; i < footLinks.length; i++) {
    if (footLinks[i].getAttribute('data-le-nav') === foot) footLinks[i].setAttribute('aria-current', 'page');
  }

  // Who is signed in: the email and a link back to the dashboard when a
  // hosting router signs requests, otherwise how this server is protected.
  var who = document.getElementById('leWho');
  if (who) {
    fetch('/config/settings')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s || !s.signIn) return;
        var si = s.signIn;
        if (si.mode === 'hosted') {
          who.innerHTML = '<span class="le-who-name" title="' + esc(si.email || '') + '">' + esc(si.email || 'Signed in') + '</span>' +
            (si.dashboardUrl ? '<a href="' + esc(si.dashboardUrl) + '">Dashboard</a>' : '');
        } else {
          who.innerHTML = '<span class="le-who-name">' + (si.mode === 'basic' ? 'Signed in with Basic Auth' : 'No sign-in configured') + '</span>';
        }
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
  // Used by the Abilities page and each agent's Abilities tab.

  var DECISION_LABELS = { allow: 'Allow', ask: 'Ask me', deny: 'Never' };

  function decisionPill(decision) {
    return decision ? '<span class="le-pill ' + decision + '">' + DECISION_LABELS[decision] + '</span>' : '<span class="hint">No rule</span>';
  }

  // Public (npm) or Private, with where it came from on hover.
  function abilityOriginBadge(origin) {
    if (!origin) return '';
    return '<span class="le-pill ' + (origin.kind === 'private' ? 'accent' : '') + '" title="' + esc(origin.label) + '">' +
      (origin.kind === 'private' ? 'Private' : 'Public') + '</span> <span class="hint">' + esc(origin.label) + '</span>';
  }





  // What an ability can do: its tools (what each one does and its
  // permission: this agent's own when it's installed, else the one it
  // ships with), skills and settings.
  function renderAbilityDetails(d) {
    var tools = d.tools || [];
    var skills = d.skills || [];
    var settings = d.settings || [];
    var toolRows = tools.map(function (t) {
      var permission = d.agent
        ? decisionPill(t.agentDecision) + (t.decision && t.decision !== t.agentDecision ? ' <span class="hint">ships as ' + DECISION_LABELS[t.decision] + '</span>' : '')
        : decisionPill(t.decision);
      return '<tr><td><code>' + esc(t.name) + '</code></td><td>' + (t.description ? esc(t.description) : '<span class="hint">No description</span>') + '</td><td>' + permission + '</td></tr>';
    }).join('');
    // A one-line summary at the top: how many tools, by permission, and skills.
    var counts = {};
    tools.forEach(function (t) {
      var decision = d.agent ? t.agentDecision : t.decision;
      if (decision) counts[decision] = (counts[decision] || 0) + 1;
    });
    var byDecision = ['allow', 'ask', 'deny'].filter(function (k) { return counts[k]; }).map(function (k) { return counts[k] + ' ' + DECISION_LABELS[k]; });
    var summary = tools.length + (tools.length === 1 ? ' tool' : ' tools') + (byDecision.length ? ' (' + byDecision.join(', ') + ')' : '') +
      ' ' + String.fromCharCode(183) + ' ' + skills.length + (skills.length === 1 ? ' skill' : ' skills') +
      (settings.length ? ' ' + String.fromCharCode(183) + ' ' + settings.length + (settings.length === 1 ? ' setting' : ' settings') : '');
    return '<div class="ability-details">' +
      '<div class="ability-details-head"><span class="ability-details-title">What <code>' + esc(d.name) + '</code>' + (d.version ? ' <span class="hint">' + esc(d.version) + '</span>' : '') + ' can do</span>' +
        '<span class="ability-details-summary">' + summary + '</span></div>' +
      (d.description ? '<p style="margin:0 0 6px">' + esc(d.description) + '</p>' : '') +
      '<h4>Tools (' + tools.length + ')</h4>' +
      (tools.length
        ? '<table><thead><tr><th>Tool</th><th>What it does</th><th>' + (d.agent ? 'Permission in ' + esc(d.agent) : 'Permission it ships with') + '</th></tr></thead><tbody>' + toolRows + '</tbody></table>'
        : '<p class="hint">No tools.</p>') +
      '<h4>Skills (' + skills.length + ')</h4>' +
      (skills.length
        ? '<ul class="ability-skills">' + skills.map(function (s) { return '<li><code>' + esc(s.name) + '</code>' + (s.description ? ' ' + String.fromCharCode(8212) + ' ' + esc(s.description) : '') + '</li>'; }).join('') + '</ul>'
        : '<p class="hint">No skills.</p>') +
      (settings.length
        ? '<h4>Settings it needs (' + settings.length + ')</h4><ul class="ability-skills">' + settings.map(function (s) { return '<li><code>' + esc(s.name) + '</code>' + (s.description ? ' ' + String.fromCharCode(8212) + ' ' + esc(s.description) : '') + '</li>'; }).join('') + '</ul>'
        : '') +
      '</div>';
  }

  // Opens (or closes) an ability's details in a row right under its own.
  function toggleAbilityDetails(btn) {
    var tr = btn.closest('tr');
    var next = tr.nextElementSibling;
    if (next && next.classList.contains('ability-details-row')) {
      next.remove();
      btn.textContent = 'Details';
      btn.classList.remove('is-open');
      return;
    }
    var row = document.createElement('tr');
    row.className = 'ability-details-row';
    row.innerHTML = '<td colspan="' + tr.children.length + '"><div class="ability-details"><p class="hint" style="margin:0">Reading what it can do' + String.fromCharCode(8230) + '</p></div></td>';
    tr.parentNode.insertBefore(row, tr.nextSibling);
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


  window.leShell = { loadError: function () { return loadError; }, ready: ready, renderHead: renderHead, setTab: setTab, setActive: setActive, esc: esc, tabHref: tabHref, envCountHtml: envCountHtml, setCount: setCount, wireModelPicker: wireModelPicker, loadProviderKeys: loadProviderKeys, applyProviderKeys: applyProviderKeys, abilityOriginBadge: abilityOriginBadge, toggleAbilityDetails: toggleAbilityDetails };
})();
</script>`
