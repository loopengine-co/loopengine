// Shared look for every browser page adapters/http.ts serves — the agent
// console (agents-config-page.ts), its Chat tab (playground.ts), the
// agents home (agents-list-page.ts) and the Models/Abilities pages
// (global-config-page.ts). All four render inside the same app shell
// (web/console-shell.ts), so the shell's own classes (.le-*) live here
// too, alongside the shared base: color tokens, type, form controls,
// tables, pills. Each page still owns its page-specific rules (chat
// bubbles, trace events, the HTTP tool builder, ...) in its own <style>
// block, written against these same tokens.
//
// Colors match the loopengine.co site (teal accent). The look: the app is
// one white panel on a light grey canvas, with the sidebar on the canvas;
// soft lines, round corners and flat cards; near-black primary buttons,
// with teal kept for the brand, links and what's selected. Fonts are the
// system's own (SF Pro, Segoe UI, Roboto...): never a web font download,
// so a self-hosted server works offline and loads nothing from a third
// party.
export const devUiCss: string = `
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --canvas: #f2f3f2;
    --surface: #f5f6f5;
    --surface-2: #ebedec;
    --sidebar: var(--canvas);
    --ink: #111516;
    --ink-muted: #51595a;
    --ink-faint: #858c8c;
    --line: #e5e8e7;
    --code-bg: #eef0ef;
    --primary: #151a1b;
    --on-primary: #ffffff;
    --accent: #0c7a6a;
    --accent-ink: #0c7a6a;
    --accent-soft: #d7f0e9;
    --on-accent: #ffffff;
    --good: #1f7a3d; --good-soft: #dff3e5;
    --warn: #9a5b00; --warn-soft: #fbeccf;
    --bad: #b42318; --bad-soft: #fde4e1;
    --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --radius: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #101617; --canvas: #070b0c; --surface: #151d1e; --surface-2: #1c2627; --sidebar: var(--canvas);
      --ink: #e8eded; --ink-muted: #a2b0ae; --ink-faint: #6b7a78; --line: #222d2e; --code-bg: #141c1d;
      --primary: #eef2f1; --on-primary: #0c1112;
      --accent: #57cdb8; --accent-ink: #7ee0cd; --accent-soft: #16302c; --on-accent: #06221d;
      --good: #6fd08f; --good-soft: #12301d; --warn: #f0b75c; --warn-soft: #33270f; --bad: #f2877c; --bad-soft: #3a1714;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    background: var(--canvas);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent-ink); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  select, input, textarea, button {
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 10px;
  }
  input:focus, textarea:focus, select:focus { border-color: var(--ink-faint); outline: none; }
  textarea { line-height: 1.45; }
  button {
    cursor: pointer;
    font-weight: 500;
  }
  select { cursor: pointer; }
  select:disabled { cursor: default; }
  button:hover:not(:disabled) { background: var(--surface); }
  button[type="submit"], button.primary {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  button[type="submit"]:hover:not(:disabled), button.primary:hover:not(:disabled) { background: var(--primary); opacity: 0.88; }
  button:disabled { opacity: 0.5; cursor: default; }
  code {
    font-family: var(--font-mono);
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-muted);
  }
  .badge-custom { background: var(--good-soft); color: var(--good); }
  .badge-default { background: var(--surface-2); color: var(--ink-muted); }
  .muted { color: var(--ink-muted); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--ink-faint); font-weight: 500; font-size: 12px; background: transparent; white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }

  /* ---------- pills: one shape for every allow/ask/deny or status word ---------- */
  .le-pill { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
  .le-pill.allow, .le-pill.good { background: var(--good-soft); color: var(--good); }
  .le-pill.ask, .le-pill.warn { background: var(--warn-soft); color: var(--warn); }
  .le-pill.deny, .le-pill.bad { background: var(--bad-soft); color: var(--bad); }
  /* An ability's details (leShell.toggleAbilityDetails), on the Abilities
     page and each agent's Apps tab. */
  .ability-details-row > td { padding: 0 10px 14px; border-top: 0; background: transparent; }
  .ability-details { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); overflow: hidden; }
  .ad-head { display: grid; gap: 10px; padding: 16px 18px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .ad-title { font-size: 14px; font-weight: 600; }
  .ad-title code { font-size: 13px; background: none; padding: 0; }
  .ad-ver { font-size: 12px; font-weight: 400; color: var(--ink-faint); font-family: var(--font-mono); }
  .ad-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .ad-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg); font-size: 12px; color: var(--ink-muted); white-space: nowrap; }
  .ad-chip.strong { border-color: transparent; background: var(--surface-2); color: var(--ink); font-weight: 500; }
  .ad-chip.allow { border-color: transparent; background: var(--good-soft); color: var(--good); }
  .ad-chip.ask { border-color: transparent; background: var(--warn-soft); color: var(--warn); }
  .ad-chip.deny { border-color: transparent; background: var(--bad-soft); color: var(--bad); }
  .ad-about { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-muted); }
  .ad-sec { padding: 14px 18px 16px; }
  .ad-sec + .ad-sec { border-top: 1px solid var(--line); }
  .ad-k { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 8px; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-faint); }
  .ad-list { display: grid; }
  .ad-row { display: grid; gap: 3px; padding: 10px 0; min-width: 0; }
  .ad-row + .ad-row { border-top: 1px solid var(--line); }
  .ad-row:first-child { padding-top: 2px; }
  .ad-row:last-child { padding-bottom: 0; }
  .ad-row-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
  .ad-name { font-size: 12.5px; font-weight: 600; background: none; padding: 0; color: var(--ink); overflow-wrap: anywhere; }
  .ad-perm { display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .ad-perm .le-pill { margin: 0; }
  .ad-ships { font-size: 11.5px; color: var(--ink-faint); }
  .ad-desc { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-muted); max-width: 760px; }
  .ad-none { margin: 0; font-size: 13px; color: var(--ink-muted); }
  .ability-details-btn.is-open { background: var(--surface); }
  .le-pill.neutral { background: var(--surface-2); color: var(--ink-muted); }
  .le-pill.accent { background: var(--accent-soft); color: var(--accent-ink); }

  /* ---------- app shell (web/console-shell.ts) ---------- */
  .le-app { display: grid; grid-template-columns: auto minmax(0, 1fr); height: 100%; background: var(--canvas); }
  /* Two columns: the sections, and what's in the current one. */
  .le-sidebar { position: relative; background: var(--sidebar); display: flex; min-height: 0; }
  .le-rail { width: 62px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 12px 6px 10px; min-height: 0; }
  .le-brand { display: grid; place-items: center; height: 36px; margin-bottom: 8px; text-decoration: none; }
  .le-brand-mark { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
  .le-rail-item { position: relative; display: grid; place-items: center; height: 40px; padding: 0; border-radius: 10px; color: var(--ink-muted); text-decoration: none; font-size: 11px; font-weight: 600; }
  .le-rail-item .le-nav-icon { width: 19px; height: 19px; }
  /* Icons only: each one's name shows beside it on hover. */
  .le-rail-item > span:not(.le-inbox-count) { position: absolute; left: calc(100% + 8px); top: 50%; transform: translate(-4px, -50%); padding: 4px 9px; border-radius: 7px; background: var(--primary); color: var(--on-primary); font-size: 12px; font-weight: 500; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .12s, transform .12s; z-index: 60; }
  .le-rail-item:hover > span:not(.le-inbox-count), .le-rail-item:focus-visible > span:not(.le-inbox-count) { opacity: 1; transform: translate(0, -50%); }
  .le-rail-item:hover { background: var(--surface-2); color: var(--ink); }
  .le-rail-item.is-current { background: var(--bg); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
  .le-rail-item.is-current .le-nav-icon { color: var(--accent-ink); }
  .le-rail-item .le-inbox-count { position: absolute; top: 2px; right: 4px; margin: 0; padding: 0 5px; font-size: 10px; }
  .le-inbox-count[hidden] { display: none; }
  .le-rail-gap { flex: 1; }
  .le-nav-icon { width: 15px; height: 15px; flex-shrink: 0; }
  .le-panel { width: 228px; flex: none; display: flex; flex-direction: column; min-height: 0; padding-top: 14px; }
  .le-panel[hidden] { display: none; }
  .le-sidebar.previewing .le-panel { position: absolute; left: 100%; top: 0; bottom: 0; z-index: 30; background: var(--sidebar); border: 1px solid var(--line); border-width: 0 1px 0 0; box-shadow: 8px 0 24px rgba(0, 0, 0, .12); }
  .le-pane { display: none; flex-direction: column; min-height: 0; flex: 1; }
  .le-pane.is-shown { display: flex; }
  .le-pane-head { display: flex; justify-content: space-between; align-items: center; padding: 6px 16px 10px; }
  .le-pane-head a { color: var(--ink); font-size: 15px; font-weight: 650; text-decoration: none; }
  .le-pane-head a:hover { text-decoration: underline; }
  .le-pane-head a.le-pane-new { font-size: 12.5px; font-weight: 600; color: var(--accent-ink); }
  .le-pane-head a.le-pane-new[aria-current="page"] { text-decoration: underline; }
  .le-pane .le-agent-list { max-height: none; }
  .le-goal-item .le-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Workflows: each with its agent under its name. */
  .le-wf-list .le-agent-item { align-items: start; }
  .le-wf-list .le-dot { margin-top: 5px; }
  .le-wf-text { display: grid; gap: 1px; min-width: 0; }
  .le-wf-text .le-name, .le-wf-text .le-meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .le-agent-list { list-style: none; margin: 0; padding: 0 8px; overflow-y: auto; flex: 0 1 auto; max-height: 40vh; min-height: 0; display: grid; gap: 2px; align-content: start; }
  /* Find your first agent: one more item under Agents. */
  .le-sub-link { margin: 2px 8px 0; padding: 8px 10px 8px 28px; flex: none; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--accent-ink); text-decoration: none; }
  .le-sub-link:hover { background: var(--surface-2); }
  .le-sub-link[aria-current="page"] { background: var(--accent-soft); font-weight: 600; }
  /* List items read smaller than their section's head. */
  .le-agent-item { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; font-size: 13px; }
  .le-agent-item:hover { background: var(--surface-2); }
  .le-agent-item[aria-current="page"] { background: var(--bg); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
  .le-agent-item .le-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .le-agent-item .le-meta { font-size: 11.5px; color: var(--ink-faint); }
  .le-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
  .le-dot.warn { background: var(--warn); }
  .le-dot.tint { background: var(--accent); }
  .le-dot.pending { background: #E8B06A; }
  .le-inbox-count { margin-left: auto; font-size: 11px; padding: 0 7px; }
  .le-inbox-only .le-rail-item:not([data-le-section="inbox"]), .le-inbox-only .le-panel { display: none; }
  .le-dot.idle { background: var(--ink-faint); }
  .le-settings-menu { display: grid; gap: 2px; padding: 0 8px; }
  .le-settings-menu a { padding: 8px 10px; border-radius: 8px; color: var(--ink-muted); text-decoration: none; font-size: 13px; }
  .le-settings-menu a:hover { background: var(--surface-2); color: var(--ink); }
  .le-settings-menu a[aria-current="page"] { background: var(--bg); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
  .le-who { position: relative; display: grid; place-items: center; padding-top: 8px; }
  .le-who[hidden] { display: none; }
  .le-who-badge { width: 30px; height: 30px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: default; }
  .le-who-card { position: absolute; left: calc(100% - 4px); bottom: 0; z-index: 40; display: none; gap: 6px; min-width: 200px; max-width: 280px; padding: 10px 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .14); font-size: 12.5px; color: var(--ink-muted); }
  .le-who:hover .le-who-card, .le-who:focus-within .le-who-card { display: grid; }
  .le-who-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .le-who-card a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .le-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--bg); margin: 8px 8px 8px 0; border-radius: 16px; border: 1px solid var(--line); box-shadow: 0 1px 3px rgba(0, 0, 0, .04); }
  .le-scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .le-page { padding: 28px 32px; max-width: 1140px; display: grid; gap: 28px; }
  .le-head { padding: 26px 32px 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; border-bottom: 1px solid var(--line); }
  .le-head.plain { padding-bottom: 20px; }
  .le-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .le-title { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
  .le-title h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0; overflow-wrap: anywhere; }
  .le-head-id { margin-left: 10px; font-family: var(--font-mono); font-size: 12.5px; font-weight: 400; color: var(--ink-faint); letter-spacing: 0; vertical-align: middle; }
  .le-title p { margin: 4px 0 0; color: var(--ink-muted); max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .le-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .le-chip { display: inline-flex; align-items: center; height: 26px; font-size: 12px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line); color: var(--ink-muted); white-space: nowrap; }
  .le-chip.mono { font-family: var(--font-mono); font-size: 11.5px; }
  /* An agent's header: a top bar (Agents / its name, its chips), then its
     tabs as a segmented control. */
  .le-agent-head { padding: 0; gap: 0; }
  .le-agent-bar { display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 10px 20px; }
  .le-crumb { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0; }
  .le-crumb a { color: var(--ink-muted); text-decoration: none; }
  .le-crumb a:hover { color: var(--ink); }
  .le-crumb-sep { color: var(--ink-faint); font-weight: 400; }
  .le-crumb-here { color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .le-agent-head .le-head-id { font-size: 12px; margin-left: 8px; }
  .le-tabs { display: flex; gap: 2px; width: fit-content; max-width: calc(100% - 40px); margin: 0 20px 14px; padding: 3px; border-radius: 10px; background: var(--surface); overflow-x: auto; scrollbar-width: none; }
  .le-tab { height: 30px; padding: 0 12px; border-radius: 8px; color: var(--ink-muted); white-space: nowrap; display: flex; gap: 6px; align-items: center; text-decoration: none; font-size: 13px; font-weight: 500; }
  .le-tab:hover { color: var(--ink); background: var(--surface-2); }
  .le-tab[aria-selected="true"] { color: var(--ink); background: var(--bg); box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
  .le-count { font-size: 11px; background: var(--surface-2); color: var(--ink-muted); padding: 0 6px; border-radius: 6px; }
  .le-count.warn { background: var(--warn-soft); color: var(--warn); }
  .le-menu-btn { display: none; border: 0; background: transparent; padding: 2px 6px; font-size: 18px; line-height: 1; color: var(--ink-muted); }
  .le-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  /* Cards in a hairline grid (.le-grid): cells share their lines. */
  .le-grid.le-cards { gap: 0; }
  .le-grid > .le-card { border-width: 0 1px 1px 0; border-radius: 0; padding: 20px 22px; gap: 4px; }
  .le-grid > a.le-card:hover { border-color: var(--line); box-shadow: none; background: var(--surface); }
  .le-grid > .le-card .le-card-value { font-size: 28px; font-weight: 400; letter-spacing: -0.02em; }
  .le-grid > .le-card.attention { box-shadow: none; background: var(--warn-soft); }
  .le-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 6px; align-content: start; color: var(--ink); text-decoration: none; background: var(--bg); transition: border-color .15s, box-shadow .15s; }
  a.le-card:hover { border-color: var(--ink-faint); box-shadow: 0 2px 8px rgba(0, 0, 0, .05); }
  .le-card .le-card-label { font-size: 12px; color: var(--ink-faint); display: flex; justify-content: space-between; }
  .le-card .le-card-value { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .le-card .le-card-detail { font-size: 12.5px; color: var(--ink-muted); overflow-wrap: anywhere; }
  .le-card.attention { border-color: var(--warn); box-shadow: inset 0 3px 0 var(--warn-soft); }
  .le-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .le-empty { color: var(--ink-faint); padding: 24px; text-align: center; border: 1px dashed var(--line); border-radius: var(--radius); }

  /* ---------- page language: top bar, display title, hairline grid ---------- */
  /* A page's top bar: its name and tabs, then search and actions. */
  .le-topbar { display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 10px 20px; border-bottom: 1px solid var(--line); flex: none; }
  .le-topbar-title { font-size: 15px; font-weight: 600; margin: 0 6px 0 0; white-space: nowrap; }
  .le-topbar-gap { flex: 1; }
  .le-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface); }
  .le-seg button, .le-seg a { border: 0; background: none; height: 30px; padding: 0 13px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--ink-muted); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .le-seg button:hover:not(:disabled), .le-seg a:hover { background: var(--surface-2); color: var(--ink); }
  .le-seg [aria-selected="true"], .le-seg [aria-pressed="true"], .le-seg button[aria-selected="true"]:hover:not(:disabled), .le-seg button[aria-pressed="true"]:hover:not(:disabled), .le-seg a[aria-selected="true"]:hover, .le-seg a[aria-pressed="true"]:hover { background: var(--bg); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
  .le-btn-dark { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 15px; border-radius: 10px; border: 0; background: var(--primary); color: var(--on-primary); font-size: 13.5px; font-weight: 600; text-decoration: none; cursor: pointer; white-space: nowrap; }
  .le-btn-dark:hover:not(:disabled) { background: var(--primary); opacity: .88; }
  .le-search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--surface); color: var(--ink-faint); min-width: 200px; }
  .le-search input { border: 0; background: none; padding: 0; height: 100%; font-size: 13px; flex: 1; min-width: 0; }
  .le-search input:focus { outline: none; }
  /* A big, light title: a sentence, with its key words darker. */
  .le-display { margin: 0; font-size: 40px; line-height: 1.12; font-weight: 400; letter-spacing: -0.03em; color: var(--ink); }
  .le-display .soft { color: var(--ink-faint); }
  .le-display-sub { margin: 8px 0 0; font-size: 15px; color: var(--ink-muted); }
  /* A hairline grid: cells share their lines, and small crosses mark the
     outer corners, like a drawing's guides. */
  .le-grid { position: relative; display: grid; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .le-grid > * { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); min-width: 0; }
  .le-grid::before, .le-grid::after { content: ""; position: absolute; top: -5px; width: 9px; height: 9px; background: linear-gradient(var(--accent), var(--accent)) center / 1px 100% no-repeat, linear-gradient(var(--accent), var(--accent)) center / 100% 1px no-repeat; pointer-events: none; }
  .le-grid::before { left: -5px; }
  .le-grid::after { right: -5px; }
  /* An on/off switch. */
  .le-switch { position: relative; width: 36px; height: 21px; flex: none; border-radius: 999px; border: 0; padding: 0; background: var(--surface-2); cursor: pointer; transition: background .15s; }
  .le-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 15px; height: 15px; border-radius: 50%; background: var(--bg); box-shadow: 0 1px 2px rgba(0, 0, 0, .2); transition: left .15s; }
  .le-switch[aria-checked="true"] { background: var(--primary); }
  .le-switch[aria-checked="true"]::after { left: 18px; }
  .le-switch:hover:not(:disabled) { background: var(--surface-2); filter: brightness(.96); }
  .le-switch[aria-checked="true"]:hover:not(:disabled) { background: var(--primary); }
  .le-mascot { display: block; }
  @media (max-width: 860px) {
    .le-app { grid-template-columns: minmax(0, 1fr); }
    .le-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 24px rgba(0, 0, 0, .25); }
    .le-app.nav-open .le-sidebar { transform: none; }
    .le-panel { width: 204px; }
    .le-menu-btn { display: block; }
    .le-head, .le-page { padding-left: 16px; padding-right: 16px; }
    .le-main { margin: 0; border-radius: 0; border: 0; box-shadow: none; }
  }
  @media (prefers-reduced-motion: reduce) { .le-sidebar { transition: none; } }
`
