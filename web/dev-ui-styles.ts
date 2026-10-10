// Shared look for every browser page adapters/http.ts serves — the agent
// console (agents-config-page.ts), its Chat tab (playground.ts), the
// agents home (agents-list-page.ts) and the Models/Integrations pages
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
  .le-pill.neutral { background: var(--surface-2); color: var(--ink-muted); }
  .le-pill.accent { background: var(--accent-soft); color: var(--accent-ink); }

  /* ---------- app shell (web/console-shell.ts) ---------- */
  .le-app { display: grid; grid-template-columns: 240px minmax(0, 1fr); height: 100%; }
  .le-sidebar { background: var(--sidebar); border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  .le-brand { display: flex; align-items: center; gap: 8px; padding: 16px 16px 12px; text-decoration: none; color: var(--ink); }
  .le-brand-mark { width: 22px; height: 22px; border-radius: 6px; background: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
  .le-brand-name { font-weight: 600; font-size: 16px; letter-spacing: -0.01em; }
  .le-nav-label { padding: 10px 16px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); display: flex; justify-content: space-between; align-items: center; }
  .le-nav-label a { text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 12px; text-decoration: none; }
  .le-agent-list { list-style: none; margin: 0; padding: 0 8px; overflow-y: auto; flex: 1; min-height: 0; }
  .le-agent-item { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 6px; color: var(--ink); text-decoration: none; }
  .le-agent-item:hover { background: var(--surface-2); }
  .le-agent-item[aria-current="page"] { background: var(--accent-soft); }
  .le-agent-item .le-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .le-agent-item .le-meta { font-size: 12px; color: var(--ink-faint); }
  .le-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
  .le-dot.warn { background: var(--warn); }
  .le-foot { border-top: 1px solid var(--line); padding: 8px; display: grid; gap: 2px; }
  .le-foot a { padding: 7px 8px; border-radius: 6px; color: var(--ink-muted); text-decoration: none; }
  .le-foot a:hover { background: var(--surface-2); color: var(--ink); }
  .le-foot a[aria-current="page"] { background: var(--accent-soft); color: var(--ink); }
  .le-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
  .le-scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .le-page { padding: 24px; max-width: 1100px; display: grid; gap: 24px; }
  .le-head { padding: 20px 24px 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; border-bottom: 1px solid var(--line); }
  .le-head.plain { padding-bottom: 16px; }
  .le-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .le-title { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
  .le-title h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0; overflow-wrap: anywhere; }
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
    .le-sidebar { position: fixed; inset: 0 auto 0 0; width: 264px; z-index: 20; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 24px rgba(0, 0, 0, .25); }
    .le-app.nav-open .le-sidebar { transform: none; }
    .le-menu-btn { display: block; }
    .le-head, .le-page { padding-left: 16px; padding-right: 16px; }
  }
  @media (prefers-reduced-motion: reduce) { .le-sidebar { transition: none; } }
`
