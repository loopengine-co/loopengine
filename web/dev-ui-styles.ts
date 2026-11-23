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
// Colors match the loopengine.co site (teal accent). Fonts are a system
// stack that picks up Inter / JetBrains Mono when installed — never a
// web font download, so a self-hosted server works offline and loads
// nothing from a third party.
export const devUiCss: string = `
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --surface: #f1f4f3;
    --surface-2: #e7ece9;
    --sidebar: #f6f8f7;
    --ink: #10181a;
    --ink-muted: #4c5c5c;
    --ink-faint: #7c8d8b;
    --line: #d7e0dc;
    --code-bg: #e9efec;
    --accent: #0c7a6a;
    --accent-ink: #0c7a6a;
    --accent-soft: #d7f0e9;
    --on-accent: #ffffff;
    --good: #1f7a3d; --good-soft: #dff3e5;
    --warn: #9a5b00; --warn-soft: #fbeccf;
    --bad: #b42318; --bad-soft: #fde4e1;
    --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --radius: 8px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #0b1112; --surface: #121a1b; --surface-2: #1a2425; --sidebar: #0e1516;
      --ink: #e6ecea; --ink-muted: #9db0ac; --ink-faint: #647775; --line: #223030; --code-bg: #0f1718;
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
    background: var(--bg);
    color: var(--ink);
  }
  a { color: var(--accent-ink); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  select, input, textarea, button {
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 10px;
  }
  textarea { line-height: 1.45; }
  button {
    cursor: pointer;
    font-weight: 500;
  }
  button:hover:not(:disabled) { background: var(--surface); }
  button[type="submit"], button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  button[type="submit"]:hover:not(:disabled), button.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
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
  th { color: var(--ink-faint); font-weight: 500; font-size: 12px; background: var(--surface); white-space: nowrap; }
  tbody tr:last-child td { border-bottom: 0; }

  /* ---------- pills: one shape for every allow/ask/deny or status word ---------- */
  .le-pill { display: inline-block; font-size: 11.5px; font-weight: 500; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
  .le-pill.allow, .le-pill.good { background: var(--good-soft); color: var(--good); }
  .le-pill.ask, .le-pill.warn { background: var(--warn-soft); color: var(--warn); }
  .le-pill.deny, .le-pill.bad { background: var(--bad-soft); color: var(--bad); }
  /* An ability's details (leShell.toggleAbilityDetails), on the Abilities
     page and each agent's Apps tab. */
  .ability-details-row > td { padding: 0 10px 14px; border-top: 0; background: transparent; }
  .ability-details { border: 1px solid var(--accent); border-left-width: 4px; border-radius: var(--radius); background: var(--accent-soft); padding: 12px 16px 14px; }
  .ability-details-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .ability-details-title { font-size: 14px; font-weight: 600; }
  .ability-details-summary { font-size: 12.5px; color: var(--ink-muted); }
  .ability-details h4 { font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  .ability-details table { width: 100%; background: var(--surface); border-radius: var(--radius); }
  .ability-details-btn.is-open { border-color: var(--accent); color: var(--accent-ink, var(--accent)); }
  .ability-skills { margin: 0; padding-left: 18px; }
  .ability-skills li { margin: 3px 0; }
  .le-pill.neutral { background: var(--surface-2); color: var(--ink-muted); }
  .le-pill.accent { background: var(--accent-soft); color: var(--accent-ink); }

  /* ---------- app shell (web/console-shell.ts) ---------- */
  .le-app { display: grid; grid-template-columns: auto minmax(0, 1fr); height: 100%; }
  /* Two columns: the sections, and what's in the current one. */
  .le-sidebar { position: relative; background: var(--sidebar); border-right: 1px solid var(--line); display: flex; min-height: 0; }
  .le-rail { width: 76px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 12px 6px 10px; min-height: 0; }
  .le-brand { display: grid; place-items: center; height: 36px; margin-bottom: 8px; text-decoration: none; }
  .le-brand-mark { width: 26px; height: 26px; border-radius: 7px; background: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
  .le-rail-item { position: relative; display: grid; justify-items: center; gap: 3px; padding: 8px 2px 7px; border-radius: 8px; color: var(--ink-muted); text-decoration: none; font-size: 11px; font-weight: 600; }
  .le-rail-item .le-nav-icon { width: 19px; height: 19px; }
  .le-rail-item:hover { background: var(--surface-2); color: var(--ink); }
  .le-rail-item.is-current { background: var(--accent-soft); color: var(--accent-ink); }
  .le-rail-item .le-inbox-count { position: absolute; top: 3px; right: 6px; margin: 0; padding: 0 6px; font-size: 10.5px; }
  .le-inbox-count[hidden] { display: none; }
  .le-rail-gap { flex: 1; }
  .le-nav-icon { width: 15px; height: 15px; flex-shrink: 0; }
  .le-panel { width: 228px; flex: none; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); padding-top: 14px; }
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
  .le-agent-list { list-style: none; margin: 0; padding: 0 8px; overflow-y: auto; flex: 0 1 auto; max-height: 40vh; min-height: 0; }
  /* Find your first agent: one more item under Agents. */
  .le-sub-link { margin: 2px 8px 0; padding: 5px 8px 5px 26px; flex: none; border-radius: 6px; font-size: 12.5px; font-weight: 500; color: var(--accent-ink); text-decoration: none; }
  .le-sub-link:hover { background: var(--surface-2); }
  .le-sub-link[aria-current="page"] { background: var(--accent-soft); font-weight: 600; }
  /* List items read smaller than their section's head. */
  .le-agent-item { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 5px 8px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 12.5px; }
  .le-agent-item:hover { background: var(--surface-2); }
  .le-agent-item[aria-current="page"] { background: var(--accent-soft); }
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
  .le-settings-menu a { padding: 6px 10px; border-radius: 6px; color: var(--ink-muted); text-decoration: none; font-size: 13px; }
  .le-settings-menu a:hover { background: var(--surface-2); color: var(--ink); }
  .le-settings-menu a[aria-current="page"] { background: var(--accent-soft); color: var(--ink); }
  .le-who { position: relative; display: grid; place-items: center; padding-top: 8px; }
  .le-who[hidden] { display: none; }
  .le-who-badge { width: 30px; height: 30px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink); font: inherit; font-size: 13px; font-weight: 700; cursor: default; }
  .le-who-card { position: absolute; left: calc(100% - 4px); bottom: 0; z-index: 40; display: none; gap: 6px; min-width: 200px; max-width: 280px; padding: 10px 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .14); font-size: 12.5px; color: var(--ink-muted); }
  .le-who:hover .le-who-card, .le-who:focus-within .le-who-card { display: grid; }
  .le-who-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .le-who-card a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .le-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
  .le-scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .le-page { padding: 24px; max-width: 1100px; display: grid; gap: 24px; }
  .le-head { padding: 20px 24px 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; border-bottom: 1px solid var(--line); }
  .le-head.plain { padding-bottom: 16px; }
  .le-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .le-title { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
  .le-title h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0; overflow-wrap: anywhere; }
  .le-head-id { margin-left: 10px; font-family: var(--font-mono); font-size: 12.5px; font-weight: 400; color: var(--ink-faint); letter-spacing: 0; vertical-align: middle; }
  .le-title p { margin: 4px 0 0; color: var(--ink-muted); max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .le-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .le-chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink-muted); white-space: nowrap; }
  .le-chip.mono { font-family: var(--font-mono); font-size: 11.5px; }
  .le-tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
  .le-tab { padding: 10px 12px; color: var(--ink-muted); border-bottom: 2px solid transparent; white-space: nowrap; display: flex; gap: 6px; align-items: center; text-decoration: none; }
  .le-tab:hover { color: var(--ink); }
  .le-tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 500; }
  .le-count { font-size: 11px; background: var(--surface-2); color: var(--ink-muted); padding: 0 6px; border-radius: 999px; }
  .le-count.warn { background: var(--warn-soft); color: var(--warn); }
  .le-menu-btn { display: none; border: 0; background: transparent; padding: 2px 6px; font-size: 18px; line-height: 1; color: var(--ink-muted); }
  .le-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .le-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; display: grid; gap: 6px; align-content: start; color: var(--ink); text-decoration: none; background: var(--bg); }
  a.le-card:hover { border-color: var(--accent); }
  .le-card .le-card-label { font-size: 12px; color: var(--ink-faint); display: flex; justify-content: space-between; }
  .le-card .le-card-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .le-card .le-card-detail { font-size: 12.5px; color: var(--ink-muted); overflow-wrap: anywhere; }
  .le-card.attention { border-color: var(--warn); box-shadow: inset 0 3px 0 var(--warn-soft); }
  .le-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .le-empty { color: var(--ink-faint); padding: 24px; text-align: center; border: 1px dashed var(--line); border-radius: var(--radius); }
  @media (max-width: 860px) {
    .le-app { grid-template-columns: minmax(0, 1fr); }
    .le-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 24px rgba(0, 0, 0, .25); }
    .le-app.nav-open .le-sidebar { transform: none; }
    .le-panel { width: 204px; }
    .le-menu-btn { display: block; }
    .le-head, .le-page { padding-left: 16px; padding-right: 16px; }
  }
  @media (prefers-reduced-motion: reduce) { .le-sidebar { transition: none; } }
`
