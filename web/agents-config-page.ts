// A local dev page: a single self-contained HTML page (no build step, no
// framework, no CDN) served by adapters/http.ts at GET /agents/config. It's
// a browser client on top of the existing GET /agents, GET
// /agents/:name/config, and GET/POST/DELETE /agents/:name/gateway-tools
// routes — nothing here talks to runAgent, SessionStore, or ActAuth
// directly; it only renders/writes through what those routes already
// resolve, so what's shown here is always what a real request would
// actually get (see describeAgent in adapters/http.ts).
//
// Once an agent is picked, its detail pane is a submenu — Overview /
// Actauth / Gateway tools — rather than one long scrolling page. Gateway
// tools used to be its own top-level page (adapters/gateway-tools-page.ts,
// now removed) with its own agent-picker sidebar; folded in here instead
// so there's one place to pick an agent and one place to see everything
// about it, not two parallel agent pickers for two halves of the same
// picture. The Gateway tools tab's own content is fetched lazily, only
// when that tab is actually opened — unlike Overview/Actauth (both free,
// pulled from the same /config fetch already made to open the agent at
// all), resolving gateway tools means actually connecting to each one
// (see gateway-tools.ts's describeGatewayTools), a real cost not worth
// paying for an agent whose gateway tools nobody looked at this visit.
//
// Embedded as a TS string (not a separate .html file), same reasoning as
// web/playground.ts: tsc's ordinary compile emits it straight into
// dist/adapters/ alongside http.js, no asset-copy step needed. Plain string
// concatenation, not a nested template literal, for the same
// backtick/${}-escaping reason playground.ts's own header comment explains.
import { WORKFLOW_SECTIONS_CSS, WORKFLOW_SECTIONS_SCRIPT } from './workflow-sections.js'
import { devUiCss } from './dev-ui-styles.js'
import { MESSAGING_ICONS } from './messaging-icons.js'
import { renderMarkdownScript } from './markdown-script.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { MASCOT_CSS, mascotSvg } from './mascot.js'
import { REASONING_PROVIDERS } from './agent-file-admin.js'

export const agentsConfigPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Console</title>
<style>${devUiCss}${MASCOT_CSS}
  /* Each tab panel is a .le-page column inside the shell's scrolling
     main area (see web/console-shell.ts); everything below styles the
     panels' own content. */
  #empty { color: var(--ink-muted); font-size: 13px; padding: 24px; }
  .env-cell { display: grid; gap: 6px; }
  .schedule-result { max-width: 420px; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 12.5px; }
  .schedule-result-full { max-width: 900px; max-height: 70vh; overflow: auto; margin: 6px 0 0; padding: 10px; border: 1px solid var(--le-line, #e5e7eb); border-radius: 6px; background: var(--le-surface, #f6f7f9); }
  .schedule-result-details { margin-top: 5px; }
  .schedule-result-details summary { cursor: pointer; color: var(--ink-muted); font-size: 12px; }
  .workflow-markdown { display: block; max-width: 420px; max-height: 6.2em; overflow: hidden; white-space: normal; overflow-wrap: anywhere; font-size: 12.5px; line-height: 1.5; }
  .workflow-markdown p { margin: 0 0 .45em; }
  .workflow-markdown p:last-child { margin-bottom: 0; }
  .workflow-markdown h1, .workflow-markdown h2, .workflow-markdown h3, .workflow-markdown h4, .workflow-markdown h5, .workflow-markdown h6 { margin: .35em 0 .25em; font-size: 1.05em; line-height: 1.3; }
  .workflow-markdown ul, .workflow-markdown ol { margin: .2em 0 .45em; padding-left: 1.5em; }
  .workflow-markdown li { margin: .1em 0; }
  .workflow-markdown pre { margin: .35em 0; padding: 8px 10px; overflow-x: auto; border-radius: 5px; background: var(--le-surface, #f6f7f9); }
  .workflow-markdown code { padding: 1px 4px; border-radius: 4px; background: var(--le-surface, #f6f7f9); font: 11.5px/1.4 var(--le-mono, ui-monospace, monospace); }
  .workflow-markdown pre code { padding: 0; background: transparent; }
  .workflow-markdown a { color: var(--le-accent, #0f766e); }
  .workflow-markdown-table { max-width: 100%; overflow-x: auto; margin: .35em 0 .6em; }
  .workflow-markdown table { border-collapse: collapse; width: max-content; min-width: 100%; font-size: 12px; }
  .workflow-markdown th, .workflow-markdown td { padding: 5px 8px; border: 1px solid var(--le-line, #e5e7eb); text-align: left; vertical-align: top; }
  .workflow-markdown th { background: var(--le-surface, #f6f7f9); font-weight: 650; }
  .workflow-markdown-full { max-width: 900px; max-height: 70vh; overflow: auto; }
  .workflow-run-entry .workflow-markdown { max-width: none; }
  .schedule-history { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 8px; }
  /* A workflow card: a header (title, description, what starts it, and its
     actions), then rows that open: its message, instructions, run options
     and recent runs. */
  .le-tab .le-pending { margin-left: 4px; font-size: 11px; padding: 0 6px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); }
  /* A workflow's own page: the agent's header and list intro give way to it. */
  .wf-page-mode > .le-head, .wf-page-mode .wf-tab-head { display: none; }
  .wf-page { display: grid; gap: 20px; }
  /* Its header, in the other pages' style: a top bar (Workflows / its
     agent / its name, and Edit workflow), then a big, light title, what
     it does and its facts as chips. */
  .wf-page-head { display: grid; gap: 0; }
  .wf-page-crumb-row { display: flex; align-items: center; gap: 12px; margin: -28px -32px 28px; padding: 10px 20px; min-height: 58px; box-sizing: border-box; border-bottom: 1px solid var(--line); }
  .wf-page-crumb-row .le-crumb { flex: 1; }
  /* The top bar spans the page; the rest keeps the page's width. */
  .wf-page-mode .le-page { max-width: none; }
  .wf-page > :not(.wf-page-head), .wf-page-hero { max-width: 1076px; }
  .wf-page-crumb-row .wf-row-actions .le-btn-dark:hover:not(:disabled) { background: var(--primary); color: var(--on-primary); }
  .wf-page-hero { display: grid; gap: 12px; padding: 32px 32px 26px; border: 1px solid var(--line); }
  .wf-page-hero h1 { margin: 0; font-size: 36px; font-weight: 400; letter-spacing: -0.03em; line-height: 1.15; overflow-wrap: anywhere; }
  .wf-page-desc { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink-muted); max-width: 80ch; }
  .wf-page-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12.5px; margin-top: 4px; }
  .wf-page-meta-item { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 7px; min-width: 0; color: var(--ink); }
  .wf-page-meta-k { font-size: 12px; font-weight: 400; color: var(--ink-faint); }
  .wf-page-meta-item a { color: var(--ink); font-weight: 600; text-decoration: none; }
  .wf-page-meta-item a:hover { text-decoration: underline; }
  @media (max-width: 860px) { .wf-page-crumb-row { margin: -28px -16px 20px; } .wf-page-hero { padding: 22px 18px; } .wf-page-hero h1 { font-size: 28px; } }
  .wf-page .wf-page-body { padding: 0; gap: 16px; }
  .wf-page-starts { display: inline-flex; flex-wrap: wrap; gap: 2px 8px; color: var(--ink); }
  .wf-page-last { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .wf-list-box.wf-page-box { border: 0; border-radius: 0; background: none; overflow: visible; }
  .wf-page .workflow-steps-text { margin: 0; padding: 14px 16px; border-radius: 10px; background: var(--surface); font-size: 13.5px; line-height: 1.6; max-height: 480px; overflow: auto; white-space: pre-wrap; }
  .wf-page .workflow-result:empty { display: none; }
  .wf-tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0 0 20px; }
  .wf-tab-head p { margin: 0; max-width: 72ch; }
  .wf-new-btn { flex: none; display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 8px; background: var(--primary); color: var(--on-primary); font-size: 13.5px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .wf-new-btn:hover { filter: brightness(1.08); }
  .wf-card { margin: 0 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); box-shadow: 0 1px 2px rgba(15, 23, 42, .04); overflow: hidden; }
  .wf-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 18px 20px 16px; }
  .wf-card-title { min-width: 0; }
  .wf-card-title h3 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; color: var(--ink); }
  .wf-card-title p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-muted); }
  .wf-card-actions { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 50%; }
  .wf-card-actions button { height: 32px; padding: 0 12px; border-radius: 8px; font-size: 13px; }
  .wf-card-actions .workflow-edit { border-color: var(--line); background: var(--bg); color: var(--ink); font-weight: 600; }
  .wf-card-actions .workflow-edit:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .wf-card-actions .wf-remove { border-color: var(--bad); background: var(--bad-soft); color: var(--bad); font-weight: 600; }
  .wf-card-actions .wf-remove:hover:not(:disabled) { background: var(--bad); color: var(--bg); }
  .wf-card-actions .wf-remove[data-confirming="1"] { height: auto; min-height: 32px; padding: 6px 12px; text-align: left; white-space: normal; }
  .wf-empty { padding: 12px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); }
  .wf-card > .workflow-result:empty { display: none; }
  .wf-card > .workflow-result { padding: 10px 20px; border-top: 1px solid var(--line); }
  /* The list: one row per workflow; a row opens to its tabs. */
  .wf-list-box { border: 1px solid var(--line); border-radius: 0; background: var(--bg); overflow: hidden; }
  .wf-row + .wf-row { border-top: 1px solid var(--line); }
  .wf-row.workflow-focus { box-shadow: inset 3px 0 0 var(--accent); }
  .wf-row-head { display: grid; grid-template-columns: 14px minmax(0, 1fr) 210px 200px auto; align-items: center; gap: 14px; padding: 12px 16px; cursor: pointer; }
  .wf-row-head:hover, .wf-row.is-open .wf-row-head { background: var(--surface); }
  .wf-row-head:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .wf-row-job { font-size: 12.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wf-row-job a { color: var(--accent-ink); }
  .wf-row-caret { width: 7px; height: 7px; border-right: 2px solid var(--ink-muted); border-bottom: 2px solid var(--ink-muted); transform: rotate(-45deg); transition: transform .15s; }
  .wf-row.is-open .wf-row-caret { transform: rotate(45deg); }
  .wf-row-main { min-width: 0; display: grid; gap: 2px; }
  .wf-row-main strong { font-size: 14px; font-weight: 650; color: var(--ink); }
  .wf-desc { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--ink-muted); overflow-wrap: anywhere; }
  .wf-row-starts { display: grid; gap: 2px; font-size: 12.5px; color: var(--ink-muted); min-width: 0; }
  .wf-start-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wf-start-state { font-size: 11px; font-weight: 700; padding: 0 6px; margin-left: 2px; border-radius: 999px; }
  .wf-start-state + .wf-start-state { margin-left: 4px; }
  .wf-start-state.on { background: var(--good-soft); color: var(--good); }
  .wf-start-state.off { background: var(--warn-soft); color: var(--warn); }
  .wf-start-state.warn { background: var(--warn-soft); color: var(--warn); }
  .wf-row-last { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; white-space: nowrap; }
  .wf-row-last .hint { white-space: nowrap; }
  /* The row's grey notes ("Run now or API", "Last run …", "No runs yet",
     "+2 more schedules") at the same size as its schedule lines. */
  .wf-row-starts .hint, .wf-row-last .hint { font-size: 12.5px; }
  .wf-row-actions { display: flex; gap: 6px; }
  .wf-row-actions button, .wf-row-foot button { height: 30px; padding: 0 12px; border-radius: 9px; font-size: 13px; font-weight: 600; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
  .wf-row-actions button:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .wf-row-body { padding: 4px 16px 16px 44px; display: grid; gap: 12px; }
  .wf-row-body[hidden], .wf-panel[hidden] { display: none; }
  /* Its tabs, as the segmented control the other pages use. */
  .wf-tabs { display: flex; gap: 2px; width: fit-content; max-width: 100%; padding: 3px; border-radius: 10px; background: var(--surface); overflow-x: auto; scrollbar-width: none; }
  .wf-tab { border: 0; border-radius: 8px; background: none; height: 30px; padding: 0 12px; font-size: 13px; font-weight: 500; color: var(--ink-muted); white-space: nowrap; }
  .wf-tab:hover:not(:disabled) { background: none; color: var(--ink); }
  .wf-tab[aria-selected="true"] { color: var(--ink); background: var(--bg); box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
  .wf-tab[aria-selected="true"]:hover:not(:disabled) { background: var(--bg); }
  .wf-msg-form { display: flex; flex-direction: column; gap: 14px; }
  .wf-draft-note { margin: 0; display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--ink-muted); }
  .wf-msg-dests { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .wf-msg-dest { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
  .wf-msg-dest-k { font-weight: 600; font-size: 13px; }
  .wf-msg-dest input[name="msgUrl"] { margin-top: 4px; }
  .wf-msg-grid-wrap { overflow-x: auto; }
  .wf-msg-grid { width: 100%; border-collapse: collapse; font-size: 13px; }
  .wf-msg-grid th, .wf-msg-grid td { padding: 10px 8px; border-top: 1px solid var(--line); vertical-align: top; }
  .wf-msg-grid thead th { border-top: 0; font-weight: 600; text-align: center; }
  .wf-msg-grid th { background: none; }
  .wf-msg-grid tbody th { text-align: left; font-weight: 600; }
  .wf-msg-grid tbody th .hint { font-weight: 400; }
  .wf-msg-grid td { text-align: center; width: 110px; }
  .wf-msg-cell { display: inline-flex; justify-content: center; }
  .wf-msg-cell input { width: auto; margin: 0; }
  .wf-msg-appcell.is-off { opacity: .35; }
  .wf-msg-notice { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; font-weight: 400; }
  .wf-msg-notice[hidden] { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .wf-msg-own { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 8px; background: var(--surface-2); }
  .wf-msg-foot { display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
  @media (max-width: 640px) { .wf-msg-dests { grid-template-columns: 1fr; } .wf-msg-grid td { width: 64px; } }
  .wf-tab-count { margin-left: 4px; font-size: 11px; padding: 0 6px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .wf-row .workflow-steps-text { margin: 0; padding: 12px 14px; border-radius: 8px; background: var(--surface); font-size: 13px; line-height: 1.6; max-height: 420px; overflow: auto; white-space: pre-wrap; }
  .wf-original { margin-top: 10px; }
  .wf-original summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--ink-muted); margin-bottom: 6px; }
  .wf-row .workflow-result:empty { display: none; }
  .wf-cb { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: 13px; line-height: 1.5; }
  .wf-cb-k { font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; color: var(--accent-ink); padding-top: 1px; }
  .wf-cb-v { display: grid; gap: 3px; min-width: 0; }
  .wf-cb-line { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; overflow-wrap: anywhere; }
  .wf-cb-line code { font-size: 12px; }
  .wf-cb-indent { padding-left: 14px; }
  .wf-cb-tools { flex: 1 1 260px; min-width: 0; }
  .wf-cb-named { font-weight: 700; color: var(--ink); }
  .wf-cb-decision { font-size: 11.5px; font-weight: 700; padding: 0 8px; border-radius: 999px; white-space: nowrap; }
  .wf-cb-decision.allow { background: var(--good-soft); color: var(--good); }
  .wf-cb-decision.ask { background: var(--warn-soft); color: var(--warn); }
  .wf-cb-decision.deny { background: var(--bad-soft); color: var(--bad); }
  @media (max-width: 520px) { .wf-cb { grid-template-columns: minmax(0, 1fr); gap: 2px; } .wf-cb-v { margin-bottom: 8px; } }
  .wf-ways { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  @media (max-width: 900px) { .wf-ways { grid-template-columns: minmax(0, 1fr); } }
  .wf-way { margin: 0; display: grid; gap: 10px; align-content: start; padding: 20px 22px; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; background: var(--bg); min-width: 0; font-size: 13px; }
  .wf-way h4 { margin: 0; font-size: 18px; font-weight: 400; letter-spacing: -0.01em; color: var(--ink); }
  .wf-way-what { margin: 0; font-size: 12.5px; color: var(--ink-muted); }
  .wf-way .hint[hidden], .wf-way [hidden] { display: none; }
  .wf-way .workflow-hooks:empty { display: none; }
  .wf-way .workflow-hook { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .wf-way button { justify-self: start; }
  .wf-trigger-item { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .wf-trigger-item button, .wf-way .workflow-hook button { padding: 2px 10px; font-size: 12px; }
  .wf-api { display: grid; gap: 6px; }
  .wf-api pre { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--bg); border: 1px solid var(--line); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .wf-run-bar { display: grid; gap: 10px; }
  .wf-run-bar .workflow-params { margin: 0; }
  .wf-run-bar-controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
  .wf-sub { margin: 6px 0 0; font-size: 18px; font-weight: 400; letter-spacing: -0.01em; color: var(--ink); }
  /* Its numbers, in a hairline grid of cells. */
  .wf-scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .wf-score { display: grid; gap: 2px; align-content: start; padding: 16px 18px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .wf-score-k { font-size: 12.5px; font-weight: 400; color: var(--ink-muted); }
  .wf-score-v { font-size: 28px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .wf-evals-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .wf-evals-bar button, .wf-case-actions button { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-crits { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .wf-crit { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .wf-crit-kind { font-size: 12px; color: var(--ink-muted); }
  .wf-crit-rate { font-variant-numeric: tabular-nums; }
  .wf-case-standins { margin: 0; font-size: 12.5px; color: var(--ink-muted); }
  .wf-panel { min-width: 0; }
  .wf-section { display: grid; gap: 10px; min-width: 0; }
  .wf-panel > .wf-section + .wf-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
  .wf-section .wf-sub { margin: 0; }
  .wf-run-lines, .wf-cand-list { min-width: 0; }
  .wf-run-line, .wf-run-link { min-width: 0; overflow: hidden; }
  .wf-run-lines, .wf-cand-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .wf-run-line, .wf-cand-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 8px 12px; border-top: 1px solid var(--line); font-size: 13px; }
  .wf-run-line:first-child, .wf-cand-list li:first-child { border-top: 0; }
  .wf-run-link { display: flex; gap: 10px; flex: 1 1 320px; min-width: 0; color: var(--ink); text-decoration: none; }
  .wf-run-link:hover .wf-run-text { text-decoration: underline; }
  .wf-run-when { color: var(--ink-muted); white-space: nowrap; }
  .wf-run-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .wf-run-line .wf-run-evidence { flex-basis: 100%; padding-left: 2px; }
  .wf-cand-text { display: grid; gap: 2px; flex: 1 1 320px; min-width: 0; }
  .wf-cand-text strong { font-weight: 600; overflow-wrap: anywhere; }
  .wf-health { display: grid; gap: 12px; margin-bottom: 8px; }
  .wf-health-alert { padding: 10px 12px; border-radius: 8px; background: var(--bad-soft); color: var(--bad); font-size: 13px; font-weight: 600; }
  .wf-health-chart { margin: 0; display: grid; gap: 4px; }
  .wf-health-chart svg { width: 100%; height: 96px; display: block; border-bottom: 1px solid var(--line); }
  .wf-health-chart figcaption { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-faint); }
  .wf-health-table { overflow-x: auto; }
  .wf-health-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .wf-health-table th { text-align: left; font-weight: 600; color: var(--ink-muted); padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .wf-health-table td { padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .wf-audit-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .wf-audit-tools a { font-size: 13px; font-weight: 600; color: var(--accent-ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; }
  .wf-audit-tools a.primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .wf-health-more summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--accent-ink); }
  .wf-health-more .wf-health-table { margin-top: 8px; }
  .wf-sub-sub { font-size: 12px; font-weight: 700; color: var(--ink-muted); margin-top: 6px; }
  .wf-eval-last { margin: 0; font-size: 13px; }
  .wf-eval-details { display: inline; }
  .wf-eval-details summary { display: inline; cursor: pointer; color: var(--accent-ink); font-size: 12.5px; }
  .chg { display: grid; gap: 6px; margin-top: 4px; font-size: 12.5px; flex-basis: 100%; }
  .chg-field del { color: var(--bad); }
  .chg-field ins { color: var(--good); text-decoration: none; }
  .chg-lines { display: grid; gap: 1px; margin-top: 3px; font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chg-del { background: var(--bad-soft); color: var(--bad); padding: 1px 6px; }
  .chg-ins { background: var(--good-soft); color: var(--good); padding: 1px 6px; }
  .chg-note { color: var(--ink-muted); font-family: inherit; font-weight: 400; }
  .chg details summary { cursor: pointer; color: var(--accent-ink); font-family: var(--font-sans, inherit); font-size: 12px; margin-top: 2px; }
  .wf-page-meta-item[hidden] { display: none; }
  .wf-fb { display: grid; gap: 26px; }
  .wf-fb-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .wf-fb-stat { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: grid; gap: 2px; }
  .wf-fb-stat b { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .wf-fb-stat span { font-size: 12.5px; color: var(--ink-muted); }
  .wf-fb-stat.good b { color: var(--good); }
  .wf-fb-stat.bad b { color: var(--bad); }
  .wf-fb-sources { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12.5px; color: var(--ink-muted); }
  .wf-fb-src { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 7px; background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 500; }
  .wf-fb-improve { display: grid; gap: 12px; padding: 18px 20px; border-radius: 14px; border: 1px solid var(--line); background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 55%, var(--bg)), var(--bg)); }
  .wf-fb-improve h3 { margin: 0; font-size: 17px; font-weight: 600; }
  .wf-fb-improve p { margin: 0; font-size: 13.5px; color: var(--ink-muted); }
  .wf-fb-improve-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .wf-fb-sugg { display: grid; gap: 14px; }
  .wf-fb-sugg[hidden] { display: none; }
  .wf-fb-sugg h4 { margin: 0; font-size: 12px; color: var(--ink-faint); font-family: var(--font-mono); font-weight: 500; }
  .wf-fb-changes { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  .wf-fb-changes li { display: grid; gap: 2px; padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); font-size: 13.5px; }
  .wf-fb-changes li span { font-size: 12.5px; color: var(--ink-muted); }
  .wf-fb-crits { display: grid; gap: 6px; }
  .wf-fb-crits label { display: flex; gap: 8px; align-items: baseline; font-size: 13.5px; }
  .wf-fb-open { margin: 0; padding-left: 18px; font-size: 13px; color: var(--warn); }
  .wf-fb-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  .wf-fb-item { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; font-size: 13.5px; }
  .wf-fb-item-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .wf-fb-item-head .hint { margin-left: auto; }
  .wf-fb-note { margin: 0; overflow-wrap: anywhere; }
  .wf-fb-item details summary { cursor: pointer; font-size: 12.5px; color: var(--ink-muted); }
  .wf-fb-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin-top: 6px; }
  .wf-fb-pair pre { margin: 0; max-height: 220px; overflow: auto; font-size: 12.5px; white-space: pre-wrap; }
  .wf-fb-ways { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .wf-fb-way { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: grid; gap: 4px; align-content: start; font-size: 13px; }
  .wf-fb-way b { font-size: 13.5px; }
  .wf-fb-way span { color: var(--ink-muted); }
  .wf-fb-way pre { margin: 4px 0 0; font-size: 11.5px; }
  @media (max-width: 760px) { .wf-fb-stats, .wf-fb-ways, .wf-fb-pair { grid-template-columns: minmax(0, 1fr); } }
  .wf-sub-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .wf-act-main[hidden], .wf-trace[hidden] { display: none; }
  .wf-act-main > .wf-section + .wf-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
  /* Runs, as rows sharing their lines. */
  .wf-run-cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; border: 1px solid var(--line); }
  .wf-run-card { display: grid; gap: 6px; padding: 14px 18px; border: 0; border-radius: 0; background: var(--bg); min-width: 0; font-size: 13px; }
  .wf-run-card + .wf-run-card { border-top: 1px solid var(--line); }
  .wf-run-card:hover { background: var(--surface); }
  .wf-run-card.is-failed { box-shadow: inset 3px 0 0 var(--bad); }
  .wf-run-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .wf-run-card-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
  .wf-run-card-actions .wf-run-trace { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
  .wf-run-card-actions .wf-run-trace:hover { background: var(--surface); color: var(--ink); }
  .wf-run-version { font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--ink-muted); }
  .wf-run-card-inputs { color: var(--ink-muted); overflow-wrap: anywhere; }
  .wf-run-card-out { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .wf-run-card-out.error { color: var(--bad); }
  .wf-trace { display: grid; gap: 20px; min-width: 0; }
  .wf-trace-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .wf-trace-bar a.wf-link { text-decoration: none; }
  .wf-trace-save-case { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-trace-case { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 13px; }
  .wf-trace-case[hidden] { display: none; }
  .wf-trace-suggest { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .wf-trace-suggest li { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; }
  .wf-xd { padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .wf-xd-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
  .wf-xd-head h3 { margin: 0; font-size: 16px; }
  .wf-xd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 16px; margin: 0; }
  .wf-xd-item { display: grid; gap: 2px; min-width: 0; }
  .wf-xd-item dt, .wf-xd-k { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .wf-xd-item dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
  .wf-xd-item dd a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
  .wf-xd-error { padding: 8px 12px; border-radius: 8px; background: var(--bad-soft); color: var(--bad); font-size: 13px; overflow-wrap: anywhere; }
  .wf-xd-io { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
  .wf-xd-io > div { display: grid; gap: 4px; align-content: start; min-width: 0; }
  .wf-xd-params { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 0; font-size: 13px; }
  .wf-xd-params dt { font-family: var(--font-mono); font-size: 12px; color: var(--ink-muted); }
  .wf-xd-params dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
  .wf-tv-pre { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line); font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 360px; overflow: auto; }
  .wf-tv-block { display: grid; gap: 4px; min-width: 0; }
  .wf-tv-block summary { cursor: pointer; color: var(--accent-ink); font-size: 12.5px; font-weight: 600; }
  .wf-tl-wrap { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .wf-tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; position: relative; }
  .wf-tl::before { content: ""; position: absolute; left: 15px; top: 14px; bottom: 14px; width: 2px; background: var(--line); }
  .wf-tl-step { position: relative; width: 100%; height: auto; display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; grid-template-areas: "dot text time" ". bar bar"; gap: 2px 10px; align-items: start; padding: 8px 10px 8px 9px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; }
  .wf-tl-step:hover { background: var(--surface); }
  .wf-tl-step[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
  .wf-tl-dot { grid-area: dot; width: 12px; height: 12px; margin-top: 3px; border-radius: 50%; background: var(--bg); border: 2px solid var(--ink-faint); position: relative; z-index: 1; }
  .wf-tl-step.k-model .wf-tl-dot { border-color: var(--accent); }
  .wf-tl-step.k-tool .wf-tl-dot { border-color: var(--good); }
  .wf-tl-step.k-person .wf-tl-dot { border-color: var(--warn); }
  .wf-tl-step.k-start .wf-tl-dot, .wf-tl-step.k-end .wf-tl-dot { background: var(--ink-faint); }
  .wf-tl-step.is-bad .wf-tl-dot { border-color: var(--bad); background: var(--bad); }
  .wf-tl-text { grid-area: text; display: grid; gap: 1px; min-width: 0; }
  .wf-tl-kind { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .wf-tl-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wf-tl-step.is-bad .wf-tl-title { color: var(--bad); }
  .wf-tl-meta { font-size: 12px; color: var(--ink-muted); }
  .wf-tl-time { grid-area: time; display: grid; justify-items: end; font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-muted); }
  .wf-tl-bar { grid-area: bar; position: relative; height: 4px; border-radius: 2px; background: var(--surface-2); margin-top: 4px; }
  .wf-tl-bar span { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: var(--ink-faint); }
  .wf-tl-step.k-model .wf-tl-bar span { background: var(--accent); }
  .wf-tl-step.k-tool .wf-tl-bar span { background: var(--good); }
  .wf-tl-step.is-bad .wf-tl-bar span { background: var(--bad); }
  .wf-tl-detail { position: sticky; top: 12px; display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); min-width: 0; }
  .wf-tl-detail-head { display: grid; gap: 2px; }
  .wf-tl-detail-head strong { font-size: 14px; overflow-wrap: anywhere; }
  @media (max-width: 860px) { .wf-tl-wrap, .wf-xd-io { grid-template-columns: minmax(0, 1fr); } .wf-tl-detail { position: static; } }
  .wf-versions { display: grid; gap: 10px; font-size: 13px; }
  .wf-version-cards { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .wf-version-card { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); min-width: 0; }
  .wf-version-card.is-current { border-color: var(--accent); }
  .wf-version-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .wf-version-head strong { font-size: 14px; }
  .wf-version-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
  .wf-version-actions button { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
  .wf-version-actions button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-version-actions .wf-version-restore { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-version-reason { margin: 0; color: var(--ink-muted); }
  .wf-version-text[hidden], .wf-version-diff[hidden] { display: none; }
  .wf-version-diff { margin: 0; display: grid; gap: 10px; }
  .wf-vd { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px 16px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); font-size: 13px; line-height: 1.5; }
  .wf-vd-k { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); padding-top: 2px; }
  .wf-vd-v { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
  .wf-vd-v .workflow-steps-text { margin: 0; }
  .wf-vc-summary { margin: 0; padding-left: 18px; display: grid; gap: 2px; font-size: 13px; }
  .wf-vc-part { display: grid; gap: 4px; }
  .wf-vc-part h5 { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-faint); }
  .wf-vc-body del { color: var(--bad); }
  .wf-vc-body ins { color: var(--good); text-decoration: none; }
  .wf-vc-body > div:not([class]) { padding: 1px 6px; font-family: var(--font-sans, inherit); }
  @media (max-width: 640px) { .wf-vd { grid-template-columns: minmax(0, 1fr); } }
  .wf-version-diff .chg-lines { margin: 0; max-height: 480px; overflow: auto; }
  .chg-same { color: var(--ink-muted); padding: 1px 6px; }
  .chg-gap { color: var(--ink-faint); font-family: var(--font-sans, inherit); font-style: italic; padding: 2px 6px; }
  .wf-crit-form { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .wf-crit-form[hidden] { display: none; }
  .wf-crit-row { display: grid; grid-template-columns: 170px minmax(0, 1fr) 180px auto; gap: 8px; align-items: center; }
  .wf-crit-row select, .wf-crit-row input { font: inherit; font-size: 13px; height: 32px; padding: 0 8px; min-width: 0; }
  .wf-crit-row input[data-crit-value][hidden] { visibility: hidden; display: block; }
  .wf-crit-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .wf-crit-bar button, .wf-crit-edit { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
  .wf-crit-bar button.plain { border-color: var(--line); background: var(--bg); color: var(--ink); }
  .wf-case-fails { margin: 0; padding-left: 18px; display: grid; gap: 2px; font-size: 12.5px; color: var(--ink-muted); }
  @media (max-width: 720px) { .wf-crit-row { grid-template-columns: minmax(0, 1fr) auto; } .wf-crit-row input[data-crit-text] { grid-column: 1 / -1; } }
  .wf-cases { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .wf-case { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; font-size: 13px; }
  .wf-case-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .wf-case-head .wf-link { margin-left: auto; }
  .wf-case textarea { width: 100%; box-sizing: border-box; min-height: 90px; margin-top: 6px; font: inherit; font-size: 13px; }
  .wf-case-actions { display: flex; gap: 8px; margin: 6px 0; }
  .wf-case summary { cursor: pointer; color: var(--ink-muted); font-size: 12.5px; }
  .wf-link { background: none; border: 0; padding: 0; height: auto; color: var(--accent-ink); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .wf-link.wf-case-remove { color: var(--bad); }
  .wf-run-evidence { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .wf-editor-part { margin: 8px 0 0; font-size: 13px; font-weight: 700; padding-top: 10px; border-top: 1px solid var(--line); }
  .wf-editor-part:first-of-type { border-top: 0; padding-top: 0; }
  .wp-model-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .wf-draft { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 14px; padding: 10px 14px; border: 1px solid var(--warn, #d9a400); border-radius: 10px; background: var(--warn-soft, #fff8e1); font-size: 13.5px; }
  .wf-draft-actions { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
  .wf-publish { display: grid; gap: 12px; }
  .wf-publish h4 { margin: 4px 0 0; font-size: 13px; }
  .wf-pub-version { margin: 0; }
  .wf-pub-stale { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--warn-soft, #fff8e1); font-size: 13px; }
  .wf-publish .ed-actions { align-items: center; }
  .wf-publish .ed-actions .hint { margin-right: auto; }
  .workflow-editor-dialog .ed-actions .hint { margin-right: auto; font-size: 12.5px; }
  .wp-schema { font-family: var(--font-mono); font-size: 12.5px; }
  .wf-schema { display: block; flex-basis: 100%; width: 100%; }
  .wf-schema summary { cursor: pointer; color: var(--ink-muted); font-size: 12.5px; }
  .wf-schema pre { margin: 6px 0 0; padding: 8px 10px; background: var(--surface); border-radius: 8px; font-size: 12px; max-height: 260px; overflow: auto; }
  .wp-model-row input { flex: 1 1 200px; }
  .wp-mono { font-family: var(--font-mono); font-size: 12.5px; }
  @media (max-width: 640px) { .wf-scores { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .wf-row-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
  /* Triggers in the pink of .delete-btn, apart from Edit's accent. */
  .wf-page .wf-row-actions .workflow-edit { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
  .wf-page .wf-row-actions .workflow-edit:hover:not(:disabled) { background: var(--primary); color: var(--on-primary); opacity: 0.88; }
  .wf-row-actions .workflow-triggers-open { border-color: var(--line); background: var(--bg); color: var(--ink); }
  .wf-row-actions .workflow-triggers-open:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .wf-row-foot .wf-remove { border-color: var(--bad); background: var(--bad-soft); color: var(--bad); }
  .wf-row-foot .wf-remove:hover:not(:disabled) { background: var(--bad); color: var(--bg); }
  @media (max-width: 760px) {
    .wf-row-head { grid-template-columns: 14px minmax(0, 1fr) auto; row-gap: 6px; }
    .wf-row-starts, .wf-row-last { white-space: normal; }
    .wf-row-starts, .wf-row-last { grid-column: 2 / 3; }
    .wf-row-actions { grid-column: 3; grid-row: 1; }
    .wf-row-body { padding-left: 16px; }
  }
  .wf-empty-state { display: grid; justify-items: start; gap: 8px; padding: 28px; border: 1px dashed var(--line); border-radius: 12px; background: var(--surface); }
  .wf-empty-state p { margin: 0; color: var(--ink-muted); max-width: 60ch; }
  .workflow-section { margin: 0; border-top: 1px solid var(--line); background: none; }
  .workflow-section-title { display: flex; align-items: center; gap: 10px; padding: 12px 20px; color: var(--ink); font-size: 13.5px; font-weight: 600; cursor: pointer; list-style: none; }
  .workflow-section-title:hover { background: var(--surface); }
  .workflow-section-title::-webkit-details-marker { display: none; }
  .workflow-section-title::before { content: ''; width: 7px; height: 7px; border-right: 2px solid var(--ink-muted); border-bottom: 2px solid var(--ink-muted); transform: rotate(-45deg); transition: transform .15s; margin-right: 2px; }
  .workflow-section[open] > .workflow-section-title::before { transform: rotate(45deg); }
  .workflow-section-content { padding: 4px 20px 24px; }
  .workflow-section-meta { margin-left: auto; color: var(--ink-muted); font-size: 12px; font-weight: 500; }
  .wf-card .workflow-steps-text { margin: 0; padding: 12px 14px; border-radius: 8px; background: var(--surface); font-size: 13px; line-height: 1.6; max-height: 320px; overflow: auto; }
  @media (max-width: 640px) {
    .wf-tab-head, .wf-card-head { flex-direction: column; }
    .wf-card-actions { max-width: none; justify-content: flex-start; }
  }
  .workflow-run-entry { padding: 10px 12px; border: 1px solid var(--le-line, #e5e7eb); border-radius: 8px; background: var(--le-bg, #fff); display: grid; gap: 8px; }
  .workflow-run-entry-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .workflow-run-time { font-size: 12px; }
  .workflow-run-source { margin-left: auto; font-size: 11px; }
  .workflow-run-entry-label { color: var(--ink-muted); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 4px; }
  .workflow-run-params { display: flex; flex-wrap: wrap; gap: 5px; }
  .workflow-run-params span { padding: 3px 7px; border-radius: 5px; background: var(--le-surface, #f6f7f9); font-size: 11px; overflow-wrap: anywhere; }
  .workflow-option-value { display: inline-flex; align-items: center; padding: 3px 7px; border: 1px solid var(--le-line, #e5e7eb); border-radius: 6px; background: var(--le-bg, #fff); color: var(--ink, #1f2937); font-size: 11px; line-height: 1.3; }
  .workflow-run-entry .schedule-result { max-width: none; }
  form.add-source .schedule-when { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
  form.add-source .schedule-when label { display: inline; font-size: 13px; }
  form.add-source .schedule-when input[type="radio"] { width: auto; margin: 0; }
  form.add-source .schedule-when input[type="number"] { width: 80px; }
  form.add-source .schedule-when select, form.add-source .schedule-when input[type="datetime-local"] { width: auto; }
  .workflow-card.workflow-focus { box-shadow: 0 0 0 2px var(--le-accent, #0f766e); transition: box-shadow 0.3s; }
  tr.schedule-focus td { background: var(--le-accent-soft, #e6f4ef); transition: background 0.3s; }
  .workflow-run-notify { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
  .workflow-run-notify input { width: auto; margin: 0; }
  .workflow-steps-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; margin: 6px 0 0; padding: 8px 10px; border-radius: 6px; background: var(--le-surface, #f6f7f9); }
  .workflow-params { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .workflow-params[hidden] { display: none; }
  .workflow-hooks[hidden] { display: none; }
  .hook-custom[hidden] { display: none; }
  /* The add-webhook dialog: a header, sections that scroll, and a footer
     that stays with the buttons. */
  dialog.le-dialog { width: min(600px, calc(100vw - 24px)); max-width: none; max-height: calc(100vh - 48px); padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); color: var(--ink); box-shadow: 0 24px 64px rgba(15, 23, 42, .22), 0 2px 8px rgba(15, 23, 42, .08); }
  dialog.le-dialog::backdrop { background: rgba(15, 23, 42, .45); backdrop-filter: blur(2px); }
  .hd { display: flex; flex-direction: column; max-height: calc(100vh - 48px); margin: 0; }
  .hd [hidden] { display: none !important; }
  .hd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
  .hd-head h3 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
  .hd-head p { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--ink-muted); }
  .hd-close { flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--ink-muted); font-size: 22px; line-height: 1; cursor: pointer; }
  .hd-close:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
  .hd-body { overflow-y: auto; padding: 0 24px; }
  .hd-section { display: grid; gap: 14px; margin: 0; padding: 18px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; box-shadow: none; }
  .hd-section:last-child { border-bottom: 0; }
  .hd-section h4 { margin: 0; font-size: 11.5px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-muted); }
  .hd-field { display: grid; gap: 6px; }
  .hd-label { font-size: 13px; font-weight: 600; color: var(--ink); }
  .hd-optional { font-weight: 400; color: var(--ink-muted); }
  .hd-hint { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--ink-muted); }
  .hd input:not([type="checkbox"]), .hd select { width: 100%; box-sizing: border-box; height: 38px; padding: 0 12px; font: inherit; font-size: 14px; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; transition: border-color .15s, box-shadow .15s; }
  .hd input::placeholder { color: var(--ink-faint); }
  .hd input:focus, .hd select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .hd-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 8px; }
  .hd-sig { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  .hd-map { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 10px; align-items: center; }
  .hd-map code { font-family: var(--font-mono); font-size: 12.5px; padding: 4px 8px; border-radius: 6px; background: var(--surface); }
  .hd-check { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; transition: border-color .15s, background .15s; }
  .hd-check:hover { border-color: var(--accent); }
  .hd-check:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .hd-check input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--accent); }
  .hd-check strong { display: block; font-size: 13.5px; font-weight: 600; }
  .hd-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface); }
  .hd-foot .hook-form-result { font-size: 13px; color: var(--ink-muted); }
  .hd-actions { display: flex; gap: 8px; margin-left: auto; }
  .hd-actions button { height: 38px; padding: 0 16px; border-radius: 8px; font-weight: 600; }
  /* Edit forms in a dialog (Overview and Advanced). */
  dialog.edit-dialog { width: min(680px, calc(100vw - 24px)); }
  .ed-body { overflow-y: auto; padding: 20px 24px; }
  .ed-body form.add-source { display: grid; gap: 14px; max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; }
  .ed-body form.add-source label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
  .ed-body form.add-source label .hint { font-weight: 400; }
  .ed-body input:not([type="checkbox"]):not([type="radio"]), .ed-body select, .ed-body textarea { width: 100%; box-sizing: border-box; font-family: inherit; font-weight: 400; font-size: 14px; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; transition: border-color .15s, box-shadow .15s; }
  .ed-body input:not([type="checkbox"]):not([type="radio"]), .ed-body select { height: 38px; padding: 0 12px; }
  .ed-body input, .ed-body select, .ed-body textarea { font-weight: 400; }
  .ed-body .body-field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink); }
  .ed-body .body-field .hint { font-weight: 400; }
  .ed-body textarea { padding: 10px 12px; line-height: 1.5; min-height: 140px; }
  .ed-body textarea.ed-tall { min-height: min(55vh, 520px); font-family: var(--font-mono); font-size: 13px; }
  .ed-body input:focus, .ed-body select:focus, .ed-body textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .ed-actions { position: sticky; bottom: -20px; z-index: 1; display: flex; justify-content: flex-end; gap: 8px; margin: 6px -24px -20px; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface); }
  .ed-actions button { height: 38px; padding: 0 16px; border-radius: 8px; font-weight: 600; }
  .edit-dialog [data-dialog-cancel] { display: inline-block !important; }
  .ov-name { margin: 0; font-size: 15px; }
  .ov-name code { font-size: 12.5px; }
  dialog.workflow-editor-dialog { width: min(760px, calc(100vw - 24px)); }
  .ed-body .workflow-param-row input:not([type="checkbox"]) { width: auto; }
  .ed-body .workflow-param-row select.wp-type { width: auto; flex: 0 0 140px; }
  .ed-body .workflow-param-row .wp-limits { padding-left: 176px; }
  .ed-body .workflow-param-row .wp-name { flex: 0 0 170px; font-family: var(--font-mono); font-size: 13px; }
  .ed-body .workflow-param-row .wp-desc { flex: 1 1 200px; }
  .ed-body .workflow-param-row label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  .ed-body .workflow-editor-form textarea[name="instructions"] { min-height: min(45vh, 420px); font-family: var(--font-mono); font-size: 13px; }
  .edit-dialog .hd-head h3 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
  @media (max-width: 520px) {
    .hd-row, .hd-sig, .hd-map { grid-template-columns: minmax(0, 1fr); }
    .ed-body { padding: 16px; }
    .ed-actions { bottom: -16px; margin: 6px -16px -16px; padding: 12px 16px; }
    .hd-head, .hd-foot { padding-left: 16px; padding-right: 16px; }
    .hd-body { padding: 0 16px; }
  }
  .workflow-hook { border-top: 1px solid var(--le-line, #e5e7eb); padding: 8px 0; }
  .hook-url { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; margin: 6px 0; border-radius: 6px; background: var(--le-surface, #f6f7f9); font-size: 13px; }
  .hook-url input { font-family: var(--le-mono, monospace); font-size: 12.5px; }
  .hook-steps { margin: 6px 0; padding-left: 20px; display: grid; gap: 8px; font-size: 13px; }
  .hook-steps .hook-url { margin: 4px 0 0; }
  .workflow-param-rows { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
  ${WORKFLOW_SECTIONS_CSS}
  .workflow-editor-form .wp-sections { margin-top: -4px; }
  .wp-instructions-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .wp-instructions-head label { flex: 1 1 260px; }
  .wp-long-note { margin: -6px 0 0; }
  .wp-preview-text { max-height: 50vh; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 4px 0 0; padding: 10px 12px; border-radius: 6px; background: var(--le-surface, #f6f7f9); font-family: var(--font-mono); font-size: 12.5px; }
  .workflow-param-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .workflow-param-row .wp-name { width: 160px; font-family: var(--le-mono, monospace); }
  .workflow-param-row .wp-desc { flex: 1; min-width: 200px; }
  .workflow-param-row select.wp-type { width: auto; flex: 0 0 140px; }
  .workflow-param-row .wp-limits { display: flex; gap: 6px; flex-basis: 100%; padding-left: 166px; }
  .workflow-param-row .wp-limits input { flex: 1; min-width: 140px; font-size: 12.5px; }
  .workflow-params select, .workflow-params input[type="number"], .workflow-params input[type="date"] { font: inherit; }
  .workflow-param { display: flex; flex-direction: column; gap: 3px; flex: 1 1 220px; font-size: 12px; min-width: 180px; }
  .workflow-param textarea { width: 100%; box-sizing: border-box; resize: none; overflow-y: hidden; max-height: 18em; font: inherit; font-size: 13px; line-height: 1.45; }
  .advanced-part { font-size: 17px; font-weight: 600; margin: 28px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); }
  .advanced-part#advanced-tools { margin-top: 0; padding-top: 0; border-top: 0; }
  .approvals-nudge { border: 1px solid var(--warn); background: var(--warn-soft); color: var(--ink); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 24px; font-size: 13px; }
  /* Permissions: Allow / Ask me / Never, switched in place and saved at once. */
  .decision-switch { display: inline-flex; gap: 4px; flex-wrap: nowrap; }
  .actauth-rules td:nth-child(3) { white-space: nowrap; width: 1%; }
  .actauth-rules-full td:nth-child(3) { white-space: normal; width: auto; }
  .actauth-rules-full td:nth-child(5), .actauth-rules-full td:nth-child(6) { white-space: nowrap; width: 1%; }
  .actauth-rules td code { overflow-wrap: anywhere; }
  .decision-switch button { min-width: 64px; padding: 5px 10px; white-space: nowrap; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .decision-switch button:hover { border-color: var(--ink-faint); }
  .decision-switch button[aria-pressed="true"] { color: var(--on-accent); }
  .decision-switch button[aria-pressed="true"][data-decision="allow"] { background: var(--accent); border-color: var(--accent); }
  .decision-switch button[aria-pressed="true"][data-decision="ask"] { background: var(--warn); border-color: var(--warn); }
  .decision-switch button[aria-pressed="true"][data-decision="deny"] { background: var(--ink-muted); border-color: var(--ink-muted); }
  .decision-switch.is-saving button { cursor: progress; opacity: 0.7; }
  /* Messaging: one section per app; the primary one is outlined. */
  .msg-conns { display: grid; gap: 10px; max-width: 720px; }
  .msg-conn { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 0 14px; }
  .msg-conn.is-primary { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .msg-conn > summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 0; cursor: pointer; }
  .msg-conn-title { font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; }
  .msg-conn-bot { font-weight: 500; font-size: 12.5px; color: var(--ink-muted); font-family: var(--font-mono); }
  .le-channel-icon { width: 18px; height: 18px; flex: none; }
  .msg-conn-blurb { flex-basis: 100%; margin: 0; }
  .msg-conn > form.add-source { border: 0; background: none; box-shadow: none; padding: 0 0 14px; margin: 0; }
  .env-desc { max-width: 340px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  form.add-source.env-inline { border: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; max-width: 320px; }
  form.add-source.env-inline input, form.add-source.env-inline select { flex: 1 1 140px; width: auto; min-width: 0; }
  form.add-source.env-inline textarea { flex: 1 1 100%; }
  form.add-source.env-inline button { padding: 4px 10px; }
  .tab-panel .le-table-wrap table { border: 0; border-radius: 0; }
  /* Overview, in the other pages' style: a big title with the agent's
     instructions and the mascot, its parts in a hairline grid of cards,
     then its settings in another. */
  .ov-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 36px 32px 28px; border: 1px solid var(--line); border-bottom: 0; }
  .ov-hero .le-mascot { flex: none; margin-bottom: -6px; filter: drop-shadow(0 8px 10px rgba(0, 0, 0, .12)); }
  .ov-hero-text { display: grid; gap: 10px; min-width: 0; }
  .ov-hero-sub { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink-muted); max-width: 72ch; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .ov-section-title { margin: 0; padding: 30px 32px 16px; font-size: 22px; font-weight: 400; letter-spacing: -0.02em; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  .ov-cards.le-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ov-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov-settings > section { margin: 0; padding: 20px 22px; background: var(--bg); min-width: 0; }
  .ov-settings > section.ov-wide { grid-column: 1 / -1; }
  .ov-settings pre { margin: 0; }
  @media (max-width: 1100px) { .ov-cards.le-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 860px) { .ov-hero { padding: 24px 18px 20px; } .ov-hero .le-mascot { display: none; } .ov-settings, .ov-cards.le-grid { grid-template-columns: minmax(0, 1fr); } .ov-section-title { padding: 24px 18px 14px; } }
  section { margin-bottom: 28px; }
  section h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  section > table, .tab-panel table { border: 1px solid var(--line); border-radius: var(--radius); border-collapse: separate; border-spacing: 0; overflow: hidden; }
  .hint-btn {
    font-size: 11px;
    text-transform: none;
    letter-spacing: normal;
    padding: 2px 8px;
  }
  .admin-subsection {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px dashed var(--line);
  }
  .admin-subsection h4 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
    margin: 0 0 8px;
  }
  pre {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  th { color: var(--ink-muted); font-weight: 600; }
  .decision-allow { color: var(--good); }
  .decision-ask { color: var(--warn); }
  .decision-deny { color: var(--bad); }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; font-size: 13px; }
  .kv dt { color: var(--ink-muted); }
  .kv dd .hint { margin-left: 6px; }
  #systemPromptDisplay { font-family: inherit; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; background: var(--surface); }
  .kv dd { margin: 0; }
  .error { color: var(--bad); font-size: 13px; }
  .hint { font-size: 11px; color: var(--ink-muted); }
  #playgroundLink { font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: normal; text-decoration: none; margin-left: 8px; }
  .source {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .source-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .source-head h4 { margin: 0; font-size: 14px; font-family: ui-monospace, monospace; }
  .status-ok { color: var(--good); }
  .status-error { color: var(--bad); }
  .tool-list { margin: 8px 0 0; padding-left: 0; font-size: 12px; }
  .tool-list li {
    margin-bottom: 2px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .delete-btn {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--bad);
    background: var(--bad-soft);
    border-color: var(--bad);
  }
  .delete-btn:hover { background: var(--bad-soft); }
  .agent-delete { display: grid; gap: 10px; max-width: 640px; }
  .agent-delete-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
  .agent-delete-row input { width: 220px; max-width: 100%; }
  .agent-delete .delete-btn:disabled { opacity: .5; cursor: not-allowed; }
  /* Explicit rather than relying on inherited font-size: .edit-rule-btn
     sits inside a 12px table, but .edit-skill-btn sits in .source-head
     (no font-size of its own, so it'd otherwise inherit the page's
     larger default) — without this the two Edit buttons render at
     visibly different sizes despite being the same component. */
  .edit-rule-btn, .edit-skill-btn { font-size: 12px; }
  /* Sits inside a section h3, which is uppercase/letter-spaced for its
     own heading text — without resetting both here, the button's own
     label ("Edit") would inherit that and render as "EDIT" with the
     heading's wide letter-spacing, not a normal-looking button. */
  .edit-btn { font-size: 11px; text-transform: none; letter-spacing: normal; margin-left: 6px; }
  /* Flex items default to min-width: auto, which means a long,
     unbreakable token (a slug like GITHUB_LIST_REPOSITORIES_FOR_THE_
     AUTHENTICATED_USER has no spaces for the browser to wrap at) simply
     doesn't shrink to fit — it overflows the row, and the row's
     ancestor forms, instead of wrapping. min-width: 0 lets it actually
     shrink to the available space; overflow-wrap lets it break mid-word
     once there's nowhere left to wrap normally. */
  .tool-picker-label { flex: 1; min-width: 0; overflow-wrap: break-word; }
  form.add-source {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px;
    display: grid;
    gap: 10px;
    max-width: 480px;
  }
  form.add-source label { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  form.add-source label[hidden] { display: none; }
  .schedule-notify { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 12px; cursor: pointer; }
  .schedule-notify input { width: auto; margin: 0; }
  form.add-source input, form.add-source select, form.add-source textarea { width: 100%; }
  form.add-source textarea { font-family: ui-monospace, monospace; min-height: 60px; }
  /* Overrides form.add-source's shared max-width/textarea defaults for
     the skill editor specifically — id selectors beat the class-level
     rules above without needing to touch what every other add-source
     form (gateway tools, actauth rules) looks like. A skill's
     description/body are real prose/markdown, not the short one-liners
     the shared 480px/60px defaults were sized for. */
  #skillForm { max-width: 720px; }
  #skillDescInput { font-family: inherit; min-height: 48px; resize: vertical; }
  #skillBodyInput { min-height: 280px; resize: vertical; }
  /* Same "field label" look form.add-source label gets, reproduced on a
     <div> instead of a <label> — a <label> wrapping the Write/Preview
     toggle buttons would make clicking them also fire the label's own
     default click-forwarding behavior, aimed at whatever form control
     the label wraps first (the textarea), which isn't what a toggle
     button click should do. */
  .body-field { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .body-field-head { display: flex; align-items: center; justify-content: space-between; }
  .md-toggle { display: flex; gap: 4px; }
  .md-toggle-btn { padding: 2px 8px; font-size: 11px; background: transparent; }
  .md-toggle-btn.active { background: var(--surface-2); font-weight: 600; }
  .markdown-body {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 14px;
    min-height: 280px;
    max-height: 480px;
    overflow-y: auto;
  }
  .markdown-body h1, .markdown-body h2 {
    border-bottom: 1px solid var(--line);
    padding-bottom: 4px;
  }
  .markdown-body pre {
    background: var(--surface);
    padding: 10px 12px;
    border-radius: 6px;
    overflow-x: auto;
  }
  .markdown-body code {
    background: var(--line);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .markdown-body pre code { background: none; padding: 0; }
  .tool-picker-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
  }
  .tool-picker-controls button { font-size: 11px; padding: 3px 8px; }
  .tool-picker-list {
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
  }
  /* "form.add-source label { flex-direction: column; }" above is meant
     for the form's own top-level fields (Provider/App/Name/...), each a
     <label> wrapping a heading over its input — but .tool-picker-item is
     also a <label> inside that same form, so that rule matches it too,
     and (higher specificity: form+class+label vs. just one class here)
     wins over flex-direction on this rule alone, stacking the checkbox
     under the text instead of beside it. "label.tool-picker-item" adds
     the element back in to match that specificity and override it. */
  form.add-source label.tool-picker-item {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 2px;
    font-size: 12px;
    border-bottom: 1px solid var(--line);
  }
  .tool-picker-item:last-child { border-bottom: none; }
  /* Higher specificity than "form.add-source input { width: 100%; }" —
     without this, that rule wins (one more element in its selector) and
     stretches the checkbox to the full row width, which visually
     overlaps the description text under it instead of sitting beside it. */
  form.add-source input[type="checkbox"] { width: auto; flex-shrink: 0; margin-top: 2px; }
  /* Same column-stacking issue as .tool-picker-item above: .http-tool-
     inline-label (the "required" / "send as JSON body" checkboxes in the
     HTTP tool builder) is a <label> too, so "form.add-source label" wins
     on specificity alone and stacks the checkbox above its own text
     instead of beside it — this rule needs to match "label" too to win. */
  form.add-source label.http-tool-inline-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  form.add-source label.http-tool-inline-label[hidden] { display: none; }
  /* These three are plain <div>s of sibling inputs/selects/buttons, not
     <label>s, so none of the rules above touch them — without an explicit
     row layout they just wrap at the browser's default inline spacing,
     which reads as everything jammed together with no breathing room.
     form.add-source itself caps at max-width: 480px (see above), which
     isn't wide enough to hold a field row's 5 items (name/type/
     description/required/delete) on one line at a readable width, so
     this wraps rather than forcing a single cramped line — each item
     gets a min-width so text inputs wrap onto their own line instead of
     shrinking to an unreadable sliver. */
  .http-tool-field-row, .http-tool-header-row, .http-tool-method-url {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  /* Same "form.add-source input { width: 100% }" override as the checkbox
     fix above — each field here sits beside its siblings in a row, not
     stacked full-width above them. */
  .http-tool-field-row input[type="text"],
  .http-tool-field-row select,
  .http-tool-header-row input[type="text"],
  .http-tool-method-url input[type="text"],
  .http-tool-method-url select {
    width: auto;
  }
  .http-tool-field-row .http-tool-field-name { flex: 1 1 100px; min-width: 100px; }
  .http-tool-field-row .http-tool-field-type { flex: 0 0 auto; }
  .http-tool-field-row .http-tool-field-description { flex: 2 1 140px; min-width: 140px; }
  .http-tool-field-row .http-tool-inline-label { flex: 0 0 auto; white-space: nowrap; }
  .http-tool-header-row .http-tool-header-key { flex: 1 1 100px; min-width: 100px; }
  .http-tool-header-row .http-tool-header-value { flex: 2 1 140px; min-width: 140px; }
  .http-tool-method-url select { flex: 0 0 auto; }
  .http-tool-method-url input[type="text"] { flex: 1 1 160px; min-width: 160px; }
  .http-tool-field-row .http-tool-remove-row,
  .http-tool-header-row .http-tool-remove-row {
    flex: 0 0 auto;
    margin-left: auto;
  }
  /* Taller than .hint-btn's own 2px 8px default (shared with the Gateway
     Tools "Refresh" button, which sits inline in an <h3> and shouldn't
     grow) — these two sit on their own line below the field/header rows,
     so there's no header-row height to match. */
  #httpToolAddFieldBtn, #httpToolAddHeaderBtn {
    padding: 6px 12px;
  }
  .app-pick { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; margin: 6px 0 12px; display: grid; gap: 8px; background: var(--surface); }
  .app-pick-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .app-pick-bar input[type=search] { font: inherit; font-size: 12px; padding: 5px 7px; max-width: 240px; }
  .app-pick-list { display: grid; gap: 2px; max-height: 380px; overflow: auto; border: 1px solid var(--line); border-radius: var(--radius); padding: 4px; background: var(--bg); }
  .app-pick-tool { display: flex; gap: 8px; align-items: flex-start; padding: 5px 6px; border-radius: 6px; font-size: 12.5px; }
  .app-pick-tool:hover { background: var(--surface); }
  .app-pick-tool input { margin-top: 3px; }
  .app-pick-tool code { overflow-wrap: anywhere; }
  .app-pick-tool select { font: inherit; font-size: 11.5px; padding: 1px 4px; }
  .app-pick-desc { display: block; }

  /* ---------- the new style, across the tabs ----------
     Headings in the big, light type; boxes square, and side by side or
     one under another they share their lines; the teal-tinted buttons
     plain, as on the other pages. */
  .tab-panel:not([data-tab-panel="overview"]) section h3 { font-size: 20px; font-weight: 400; letter-spacing: -0.01em; }
  .advanced-part { font-size: 22px; font-weight: 400; letter-spacing: -0.02em; }
  /* Side by side: a hairline grid. */
  .wf-msg-dests, .wf-fb-stats, .wf-fb-ways { gap: 0; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .wf-msg-dest, .wf-fb-stat, .wf-fb-way { border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; padding: 16px 18px; }
  .wf-fb-stat strong, .wf-fb-stat b { font-weight: 400; }
  /* One under another: rows sharing their lines. */
  .wf-crits, .wf-fb-list, .msg-conns, .wf-version-cards { gap: 0; border: 1px solid var(--line); }
  .wf-crit, .wf-fb-item, .msg-conn, .wf-version-card { border: 0; border-radius: 0; }
  .wf-crit + .wf-crit, .wf-fb-item + .wf-fb-item, .msg-conn + .msg-conn, .wf-version-card + .wf-version-card { border-top: 1px solid var(--line); }
  .wf-fb-item, .wf-version-card { padding: 14px 18px; }
  .msg-conn { background: var(--bg); }
  .wf-version-card { background: var(--bg); }
  .wf-version-card.is-current { box-shadow: inset 3px 0 0 var(--accent); }
  .wf-version-cards { list-style: none; margin: 0; padding: 0; display: grid; }
  /* Boxes on their own: square. */
  .wf-cb, .wf-fb-improve, .approvals-nudge, .le-table-wrap, .source, .workflow-steps-text, .wf-run-lines, .wf-cand-list, .tab-panel form.add-source, .tab-panel table { border-radius: 0; }
  .wf-fb-improve { background: var(--surface); }
  /* Plain buttons, as on the other pages. */
  .wf-evals-bar button, .wf-case-actions button, .wf-crit-bar button, .wf-crit-edit { border-color: var(--line); background: var(--bg); color: var(--ink); }
  .wf-evals-bar button:hover:not(:disabled), .wf-case-actions button:hover:not(:disabled), .wf-crit-bar button:hover:not(:disabled), .wf-crit-edit:hover:not(:disabled) { background: var(--surface); color: var(--ink); }
</style>
</head>
<body data-le-page="agent-config">
<template id="ovMascot">${mascotSvg(92)}</template>
<div class="le-app">
${consoleSidebarHtml}
<main class="le-main">
  <div id="empty">Loading&hellip;</div>
  <div id="detail" style="display:none;flex-direction:column;flex:1;min-height:0"></div>
</main>
</div>
${consoleShellScript}
<script>
(function () {
  // Every request this page's address already settles (the agent's
  // config, messaging, pending decisions, schedules and workflows, and on
  // a workflow's page its versions, health, eval candidates and runs)
  // starts now, together, instead of each waiting for the one before it:
  // on a hosted workspace every round trip costs hundreds of
  // milliseconds, and the chain was four of them deep. The page's own
  // request for one of these URLs then gets the response already on its
  // way; each is used once, so a later reload of it fetches fresh.
  var plainFetch = window.fetch.bind(window);
  var early = {};
  (function () {
    var q = new URLSearchParams(location.search);
    var agent = q.get('agent');
    if (location.pathname !== '/agents/config' || !agent) return;
    var base = '/agents/' + encodeURIComponent(agent);
    var urls = [base + '/config', base + '/notifier', base + '/pending', base + '/schedules', base + '/workflows'];
    var wf = q.get('tab') === 'workflows' && q.get('workflow');
    if (wf) {
      var b = base + '/workflows/' + encodeURIComponent(wf);
      urls.push(b + '/versions', b + '/health', b + '/evals/candidates', b + '/runs');
    }
    urls.forEach(function (u) { early[u] = plainFetch(u, { headers: { accept: 'application/json' } }); });
  })();
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : '';
    var method = String((init && init.method) || 'GET').toUpperCase();
    if (method === 'GET' && Object.prototype.hasOwnProperty.call(early, url)) {
      var pending = early[url];
      delete early[url];
      return pending.catch(function () { return plainFetch(input, init); });
    }
    return plainFetch(input, init);
  };
})();
(function () {
  // The providers whose models take a reasoning effort (web/agent-file-admin.ts).
  var REASONING_PROVIDERS = ${JSON.stringify(REASONING_PROVIDERS)};
  var empty = document.getElementById('empty');
  var detail = document.getElementById('detail');
  var currentName = null;
  var currentTab = 'overview';
  // Which agent's Gateway tools tab has already been fetched — reset on
  // every agent switch so a stale agent's sources are never shown under
  // a new one, and re-fetched the next time that tab is opened.
  var gatewayLoadedFor = null;
  // Same idea, for the Actauth tab's own separately-fetched GET
  // .../actauth (see renderActauthTabPlaceholder's own doc comment).
  var actauthLoadedFor = null;
  // Same idea again, for the Environment tab's own GET .../env.
  var envLoadedFor = null;
  // Same idea again, for the Apps tab's own GET .../abilities.
  var abilitiesLoadedFor = null;
  // The full /agents/:name/config response the currently-open agent was
  // last rendered from — kept around so refreshActauthDependentPanels/
  // refreshSkillsDependentPanels below can re-fetch and re-render just
  // the panels that read cfg (Overview, Skills) after a change, without
  // touching the Tools/Actauth tabs' own already-current state.
  var currentCfg = null;

  function decisionClass(decision) {
    return 'decision-' + decision;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // A stale keep-alive TCP connection reused right after the server (or
  // whatever's proxying it) closed it server-side fails silently — an
  // empty/truncated response, surfaced here as "Unexpected end of JSON
  // input" from r.json() — not a real request failure; a fresh
  // connection on an immediate retry works. Retried exactly once, not
  // looped: a genuine server-side error fails the retry too and should
  // still surface, not get masked by retrying forever.
  function fetchJsonRetryOnce(url, options) {
    function attempt() {
      return fetch(url, options).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; });
      });
    }
    return attempt().catch(function () { return attempt(); });
  }

${renderMarkdownScript}

  // ---- Overview tab ----

  // Whether a call to this tool runs on its own, waits for a person, or
  // never runs — read off the agent's resolved rules (cfg.permissions).
  // A tool whose rules disagree by tenant/environment, or depend on a
  // "when" condition, shows "depends" rather than picking one.
  function runsPill(toolName) {
    var perms = currentCfg && currentCfg.permissions;
    if (!perms) return '';
    var matching = perms.rules.filter(function (r) { return r.tool === toolName || r.tool === '*'; });
    var decisions = [];
    matching.forEach(function (r) { if (decisions.indexOf(r.decision) === -1) decisions.push(r.decision); });
    var conditional = matching.some(function (r) { return r.when; });
    var word = function (d) { return DEFAULT_DECISIONS[d] ? DEFAULT_DECISIONS[d].charAt(0).toUpperCase() + DEFAULT_DECISIONS[d].slice(1) : d; };
    if (!matching.length) return '<span class="le-pill ' + perms.defaultDecision + '" title="No rule names this tool; the default applies">' + escapeHtml(word(perms.defaultDecision)) + '</span>';
    if (decisions.length === 1 && !conditional) return '<span class="le-pill ' + decisions[0] + '">' + escapeHtml(word(decisions[0])) + '</span>';
    return '<span class="le-pill neutral" title="' + escapeHtml(decisions.map(word).join(' / ')) + ', depending on who, where or the call' + String.fromCharCode(8217) + 's values">Depends</span>';
  }

  function renderTools(tools) {
    if (!tools.length) return '<p class="muted">None.</p>';
    var rows = tools.map(function (t) {
      return '<tr><td><code>' + escapeHtml(t.name) + '</code></td>' +
        '<td>' + escapeHtml(t.description) + '</td>' +
        '<td>' + runsPill(t.name) + '</td>' +
        '<td>' + (t.safe ? 'Yes' : 'No') + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>What it does</th><th>Permission</th><th>Only reads</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // Local tools' own table, unlike renderTools above (shared by Agent as
  // Tools, which has nothing editable through this UI) — adds an Actions
  // column with an Edit button, but only for tools describeAgent flagged
  // httpToolEditable: those created through this same Tools tab's HTTP
  // tool builder (web/http-tool-admin.ts's own sidecar spec file is what
  // that flag is actually derived from). A hand-written tools/<name>.ts
  // has no spec to repopulate an edit form from, so it just gets a blank
  // cell — not a button that would 404 the moment it's clicked.
  function renderLocalTools(tools) {
    if (!tools.length) return '<p class="muted">No tools yet. Install an ability, or add one below.</p>';
    var rows = tools.map(function (t) {
      var actions = t.httpToolEditable
        ? '<button type="button" class="edit-http-tool-btn" data-name="' + escapeHtml(t.name) + '">Edit</button>'
        : '';
      return '<tr><td><code>' + escapeHtml(t.name) + '</code></td>' +
        '<td>' + escapeHtml(t.description) + '</td>' +
        '<td>' + runsPill(t.name) + '</td>' +
        '<td>' + (t.safe ? 'Yes' : 'No') + '</td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>What it does</th><th>Permission</th><th>Only reads</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // Overview's own tools table, unlike the Tools tab's three separately-
  // headed sections (Local tools / Gateway Tools / Agent as Tools), is
  // one flat list (cfg.tools) — without a Type column there's no way to
  // tell, at a glance, where a given tool actually comes from. Built
  // from cfg.localTools/cfg.gatewayTools/cfg.agentAsTools directly
  // (same three arrays the Tools tab renders) rather than cfg.tools, so
  // each row can be tagged with which one it came from — same order as
  // the Tools tab's own sections, for consistency. Deliberately excludes
  // cfg.systemTools/cfg.systemSkills — infrastructure every agent gets
  // automatically (see run-agent.ts's systemTools/systemSkillsDir), not
  // something an operator configured, so this page hides them rather
  // than clutter the per-agent view with tools/skills that aren't
  // actually specific to this agent.
  function renderToolsWithType(cfg) {
    var rows = [];
    function addRows(tools, type) {
      for (var i = 0; i < tools.length; i++) {
        var t = tools[i];
        rows.push(
          '<tr><td><code>' + escapeHtml(t.name) + '</code></td>' +
            '<td>' + escapeHtml(t.description) + '</td>' +
            '<td>' + escapeHtml(type) + '</td>' +
            '<td>' + (t.safe ? 'yes' : 'no') + '</td></tr>',
        );
      }
    }
    addRows(cfg.localTools, 'Local');
    addRows(cfg.gatewayTools, 'Gateway');
    addRows(cfg.agentAsTools, 'Agent as Tool');
    if (!rows.length) return '<p class="muted">No tools.</p>';
    return '<table><thead><tr><th>Name</th><th>Description</th><th>Type</th><th>Only reads</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderSkills(skills) {
    if (!skills.length) return '<p class="muted">No skills.</p>';
    var rows = skills.map(function (s) {
      return '<tr><td><code>' + escapeHtml(s.name) + '</code></td>' +
        '<td>' + escapeHtml(s.description) + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>Description</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // The top of Overview: one card per other tab, each a summary that
  // links to the tab with the detail — Overview itself no longer repeats
  // the full tool/skill/rule tables those tabs already show.
  function renderOverviewCards(cfg) {
    var rules = cfg.permissions.rules;
    var asks = rules.filter(function (r) { return r.decision === 'ask'; }).length;
    var toolNames = cfg.tools.map(function (t) { return t.name; });
    var modelValue = typeof cfg.model === 'string' ? cfg.model : (cfg.model.model || cfg.model.provider);
    var modelDetail = typeof cfg.model === 'string' ? 'custom createModelCall' : cfg.model.provider + (cfg.model.maxTokens != null ? ' \u00b7 max tokens ' + cfg.model.maxTokens : '');
    function card(tab, label, value, detailText) {
      var inner = '<span class="le-card-label"><span>' + label + '</span>' + (tab ? '<span aria-hidden="true">&rarr;</span>' : '') + '</span>' +
        '<span class="le-card-value">' + value + '</span>' +
        '<span class="le-card-detail">' + detailText + '</span>';
      return tab
        ? '<a class="le-card" data-tab="' + tab + '" href="' + leShell.tabHref(cfg.name, tab) + '">' + inner + '</a>'
        : '<div class="le-card">' + inner + '</div>';
    }
    return '<div class="le-cards le-grid ov-cards">' +
      card(null, 'Model', escapeHtml(modelValue), escapeHtml(modelDetail)) +
      (cfg.abilityCount != null
        ? card('abilities', 'Apps', String(cfg.abilityCount), cfg.abilityCount ? 'Apps and abilities added to this agent' : 'Add apps and abilities, with the tools you choose')
        : card('abilities', 'Apps', 'Browse', 'Add apps and abilities, with the tools you choose')) +
      card('workflows', 'Workflows', '<span id="ovWorkflowsValue">&hellip;</span>', '<span id="ovWorkflowsDetail">Loading&hellip;</span>') +
      card('tools', 'Tools &amp; skills', cfg.tools.length + (cfg.tools.length === 1 ? ' tool' : ' tools'),
        (cfg.skills.length + (cfg.skills.length === 1 ? ' skill' : ' skills')) + (toolNames.length ? ' \u00b7 ' + escapeHtml(toolNames.slice(0, 2).join(', ') + (toolNames.length > 2 ? ', \u2026' : '')) : '')) +
      card('actauth', 'Permissions', rules.length + (rules.length === 1 ? ' rule' : ' rules'),
        (asks ? asks + ' ask you first \u00b7 ' : '') + escapeHtml(defaultDecisionText(cfg.permissions.defaultDecision).toLowerCase())) +
      card('messaging', 'Messaging Apps', '<span id="ovMessagingValue">&hellip;</span>', '<span id="ovMessagingDetail">Loading&hellip;</span>') +
      card('schedules', 'Schedules', '<span id="ovSchedulesValue">&hellip;</span>', '<span id="ovSchedulesDetail">Loading&hellip;</span>') +
      card('env', 'Environment', 'Settings', '<span data-le-env-count="' + escapeHtml(cfg.name) + '">' + leShell.envCountHtml(cfg.name) + '</span> Values your installed abilities read') +
    '</div>';
  }

  var APP_NAMES = { slack: 'Slack', telegram: 'Telegram', lark: 'Lark', webhook: 'Webhook', email: 'Email', database: 'Database', redis: 'Redis' };

  // Messaging and Schedules come from their own endpoints, so their
  // cards are filled in once those answer. Called after every render of
  // Overview, which is also re-rendered after edits.
  // ---- Overview: the agent's workflows (web/workflow-admin.ts), added
  // from "Describe a workflow": each with its instructions, what starts it
  // (its real schedules and webhooks), its recent runs and Run now. ----

  // A workflow's schedules, each with its state and Pause/Resume and
  // Remove, as lines of its contract's trigger row.
  // A schedule added in a draft, as it was asked for, in words.
  function draftScheduleText(d) {
    var s = d.schedule || {};
    if (s.run_at) return 'Once at ' + new Date(s.run_at).toLocaleString();
    var every = String(s.every || '');
    var when = s.at ? ' at ' + s.at + (s.weekday ? ' on ' + s.weekday : '') : s.start_at ? ', from ' + new Date(s.start_at).toLocaleString() : '';
    return 'Every ' + every + when;
  }
  function workflowScheduleItemsHtml(w, agentName) {
    var drafted = (w.draft && w.draft.schedules) || { add: [], remove: [] };
    var adds = (drafted.add || []).map(function (d) {
      var values = d.params ? Object.keys(d.params).map(function (k) { return escapeHtml(k) + ': ' + escapeHtml(d.params[k]); }).join(' ' + String.fromCharCode(183) + ' ') : '';
      return '<div class="wf-trigger-item"><span>' + escapeHtml((d.task_name ? d.task_name + ': ' : '') + draftScheduleText(d)) + '</span>' +
        '<span class="le-pill warn">Draft: starts when published</span>' + (values ? '<span class="hint">' + values + '</span>' : '') +
        '<span style="display:flex;gap:6px;margin-left:auto"><button type="button" class="delete-btn workflow-schedule-draft" data-id="' + escapeHtml(d.id) + '" data-action="remove">Remove</button></span></div>';
    }).join('');
    return adds + (w.schedules || []).map(function (x) {
      if ((drafted.remove || []).indexOf(x.taskId) !== -1) {
        return '<div class="wf-trigger-item"><span><s>' + escapeHtml(x.describe.charAt(0).toUpperCase() + x.describe.slice(1)) + '</s></span>' +
          '<span class="le-pill warn">Removed in the draft</span>' +
          '<span style="display:flex;gap:6px;margin-left:auto"><button type="button" class="workflow-schedule-draft" data-id="' + escapeHtml(x.taskId) + '" data-action="restore">Undo</button></span></div>';
      }
      var state = x.waiting ? '<span class="le-pill ask">Waiting for a decision</span>'
        : x.status === 'paused' ? '<span class="le-pill warn">Paused</span>'
        : x.status === 'running' ? '<span class="le-pill accent">Running</span>'
        : (x.nextRunAt ? '<span class="hint">next ' + escapeHtml(new Date(x.nextRunAt).toLocaleString()) + '</span>' : '');
      var values = x.params ? Object.keys(x.params).map(function (k) { return escapeHtml(k) + ': ' + escapeHtml(x.params[k]); }).join(' ' + String.fromCharCode(183) + ' ') : '';
      return '<div class="wf-trigger-item">' +
        '<span><a href="?agent=' + encodeURIComponent(agentName) + '&amp;tab=schedules#schedule-' + escapeHtml(x.taskId) + '" class="workflow-schedule-link" data-task="' + escapeHtml(x.taskId) + '" title="See it in the Schedules tab">' +
          escapeHtml(x.describe.charAt(0).toUpperCase() + x.describe.slice(1)) + '</a></span>' + state +
        (values ? '<span class="hint">' + values + '</span>' : '') +
        '<span style="display:flex;gap:6px;margin-left:auto">' +
          (x.status === 'paused' ? '<button type="button" class="workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="resume">Resume</button>'
            : x.status === 'scheduled' ? '<button type="button" class="workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="pause">Pause</button>' : '') +
          '<button type="button" class="delete-btn workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="cancel">Remove in draft</button>' +
        '</span></div>';
    }).join('');
  }

  // Run now, above the tabs: the values a run is given, and whether its
  // result also goes to the messaging app.
  function workflowRunBarHtml(w, paramsHtml) {
    return '<div class="wf-run-bar">' +
      (paramsHtml ? '<div class="workflow-params">' + paramsHtml + '</div>' : '') +
      '<div class="wf-run-bar-controls">' +
        '<button type="button" class="workflow-run primary">Run now</button></div>' +
      '</div>';
  }

  // The call an app makes to start a run, folded under the trigger row.
  function workflowApiHtml(w, agentName) {
    var paramNames = Object.keys(w.parameters || {});
    // A body that shows what a call can carry: its values, and waiting
    // for the result.
    var example = '{ ' + (paramNames.length ? '"params": { ' + paramNames.map(function (p) { return '"' + p + '": "' + String.fromCharCode(8230) + '"'; }).join(', ') + ' }, ' : '') + '"wait": true }';
    var apiUrl = location.origin + '/agents/' + encodeURIComponent(agentName) + '/workflows/' + encodeURIComponent(w.id) + '/run';
    return '<div class="wf-api">' +
      '<pre>POST ' + escapeHtml(apiUrl) + String.fromCharCode(10) + escapeHtml(example) + '</pre>' +
      '<p class="hint" style="margin:0">' + (paramNames.length ? '<code>params</code>: ' + paramNames.map(function (p) { return '<code>' + escapeHtml(p) + '</code>' + (w.parameters[p].required ? ' (required)' : '') + (w.parameters[p].description ? ', ' + escapeHtml(w.parameters[p].description) : ''); }).join('; ') + '. ' : 'It takes no params. ') +
        'Optional: <code>"wait": true</code> answers with the result once the run finishes; without it you get the run' + String.fromCharCode(8217) + 's id back at once. Each run follows this workflow' + String.fromCharCode(8217) + 's <strong>Messaging</strong> tab for where its updates, approvals and result go. An app can send its own <code>"callback_url"</code> (and <code>"decisions": "callback"</code>) to get this run' + String.fromCharCode(8217) + 's updates itself.</p>' +
      '</div>';
  }



  // Which workflow is open in the list, and each one's chosen tab: kept
  // across redraws (a running run's refresh, a save), and in the URL.
  var openWorkflowId = null;
  var workflowTabs = {};
  // A workflow's own page: ?tab=workflows&workflow=<id> shows that one
  // workflow (its brief on top, its tabs below) in place of the agent's
  // header and list. Every link to a workflow lands here.
  var pageParams = new URLSearchParams(location.search);
  var workflowPageId = pageParams.get('tab') === 'workflows' && pageParams.get('workflow') || null;
  // Older tab names still open their tab: Evidence, Changes and Audit are
  // Activity now, Improve is Evaluation.
  var OLD_TABS = { evidence: 'activity', changes: 'activity', audit: 'activity', improve: 'evaluation' };
  if (workflowPageId && pageParams.get('wtab')) workflowTabs[workflowPageId] = OLD_TABS[pageParams.get('wtab')] || pageParams.get('wtab');
  // A run's conversation in the Inbox.
  function inboxHref(runId) {
    return '/inbox?item=' + encodeURIComponent(runId);
  }

  function workflowPageHref(agent, id, tab) {
    return '/agents/config?agent=' + encodeURIComponent(agent) + '&tab=workflows&workflow=' + encodeURIComponent(id) + (tab ? '&wtab=' + encodeURIComponent(tab) : '');
  }

  function workflowLastRun(w) {
    return (w.recentRuns || []).slice().sort(function (a, b) { return String(b.started_at).localeCompare(String(a.started_at)); })[0] || null;
  }

  function workflowNeedsDecision(w) {
    return (w.recentRuns || []).some(function (r) { return r.status === 'awaiting_approval'; }) || (w.schedules || []).some(function (x) { return x.waiting; });
  }

  // How it starts, for its row: each schedule (saying when it's paused)
  // and its webhooks on or off, so its state shows without opening it.
  function workflowStartsSummary(w) {
    var lines = [];
    var state = function (text, kind) { return ' <span class="wf-start-state ' + kind + '">' + text + '</span>'; };
    var schedules = (w.schedules || []).filter(function (x) { return x.status !== 'cancelled'; });
    schedules.slice(0, 2).forEach(function (x) {
      lines.push(escapeHtml(x.describe.charAt(0).toUpperCase() + x.describe.slice(1)) + (x.status === 'paused' ? state('paused', 'off') : ''));
    });
    if (schedules.length > 2) {
      var more = schedules.slice(2);
      var pausedMore = more.filter(function (x) { return x.status === 'paused'; }).length;
      lines.push('<span class="hint">+' + more.length + ' more ' + (more.length === 1 ? 'schedule' : 'schedules') + '</span>' + (pausedMore ? state(pausedMore + ' paused', 'off') : ''));
    }
    var on = w.webhooks || 0, waiting = w.webhooksWaiting || 0, off = w.webhooksOff || 0;
    if (on + waiting + off) {
      var name = on + waiting + off === 1 ? 'Webhook' : 'Webhooks';
      var states = [];
      if (on) states.push(state((on + waiting + off > 1 ? on + ' ' : '') + 'on', 'on'));
      if (off) states.push(state((on + waiting + off > 1 ? off + ' ' : '') + 'off', 'off'));
      if (waiting) states.push(state('needs its signing secret', 'warn'));
      lines.push(name + states.join(''));
    }
    // Nothing starts it on its own: the ways it does start.
    if (!lines.length) return '<span class="hint">Run now or API</span>';
    return lines.map(function (l) { return '<span class="wf-start-line">' + l + '</span>'; }).join('');
  }

  function workflowLastRunHtml(r) {
    if (!r) return '<span class="hint">No runs yet</span>';
    var when = new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    // A run that finished is just when it ran; the others say their state.
    if (r.status === 'done') return '<span class="hint">Last run ' + escapeHtml(when) + '</span>';
    var pill = r.status === 'error' ? '<span class="le-pill bad">Failed</span>'
      : r.status === 'awaiting_approval' ? '<span class="le-pill ask">Waiting for a decision</span>'
      : '<span class="le-pill accent">Running</span>';
    return pill + '<span class="hint">' + escapeHtml(when) + '</span>';
  }

  // Opens one workflow's row (closing the one open before), or closes it.
  function setWorkflowOpen(card, open) {
    if (card.classList.contains('wf-page')) return;
    var list = card.parentNode;
    if (open && list) {
      var others = list.querySelectorAll('.wf-row.is-open');
      for (var i = 0; i < others.length; i++) if (others[i] !== card) setWorkflowOpen(others[i], false);
    }
    card.classList.toggle('is-open', open);
    card.querySelector('.wf-row-head').setAttribute('aria-expanded', String(open));
    card.querySelector('.wf-row-body').hidden = !open;
    if (open) openWorkflowId = card.dataset.workflow;
    else if (openWorkflowId === card.dataset.workflow) openWorkflowId = null;
    try {
      var url = new URL(location.href);
      if (openWorkflowId) url.searchParams.set('workflow', openWorkflowId); else url.searchParams.delete('workflow');
      history.replaceState(history.state, '', url);
    } catch (e) { /* the list still works without it */ }
  }

  function showWorkflowTab(card, key) {
    workflowTabs[card.dataset.workflow] = key;
    // Run now's boxes grow with what's typed or pasted, up to their
    // max-height, then scroll.
    var growBoxes = card.querySelectorAll('.workflow-params textarea');
    for (var g = 0; g < growBoxes.length; g++) {
      growBoxes[g].addEventListener('input', function (ev) {
        var box = ev.currentTarget;
        box.style.height = 'auto';
        box.style.height = box.scrollHeight + 2 + 'px';
        box.style.overflowY = box.scrollHeight + 2 > box.clientHeight + 4 ? 'auto' : 'hidden';
      });
    }
    var tabs = card.querySelectorAll('.wf-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', String(tabs[i].dataset.tab === key));
    var panels = card.querySelectorAll('.wf-panel');
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].dataset.panel !== key;
  }

  // The Health panel: the last 30 days of runs, as totals, day by day and
  // per workflow version, and any alert (a rate that just got worse).
  function loadWorkflowHealth(card, base) {
    var box = card.querySelector('.wf-health');
    if (!box) return;
    fetch(base + '/health', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (h) { box.innerHTML = '<div class="wf-sub-row"><h4 class="wf-sub">Execution history</h4><span class="hint">Last ' + h.days + ' days</span></div>' + workflowHealthHtml(h); })
      .catch(function (err) { box.innerHTML = '<h4 class="wf-sub">Execution history</h4><p class="error">Could not load it: ' + escapeHtml(err.message) + '</p>'; });
  }

  function healthPct(part, whole) { return whole ? Math.round(100 * part / whole) + '%' : String.fromCharCode(8212); }
  function healthTime(ms) {
    if (ms == null) return String.fromCharCode(8212);
    if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
    var min = Math.round(ms / 60000);
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  function healthCost(usd) { return usd == null ? String.fromCharCode(8212) : '$' + (usd >= 0.1 ? usd.toFixed(2) : usd.toFixed(3)); }

  // Runs per day as bars, the failed part of each in red.
  function healthChartHtml(daily) {
    var max = 1;
    daily.forEach(function (d) { if (d.runs > max) max = d.runs; });
    var w = 600, h = 96, gap = 2, bw = (w - gap * (daily.length - 1)) / daily.length;
    var bars = daily.map(function (d, i) {
      var x = (i * (bw + gap)).toFixed(1);
      var all = d.runs / max * (h - 4), bad = d.failed / max * (h - 4);
      var tip = '<title>' + escapeHtml(d.date) + ': ' + d.runs + ' run' + (d.runs === 1 ? '' : 's') + (d.failed ? ', ' + d.failed + ' failed' : '') + '</title>';
      return '<g>' + tip + '<rect x="' + x + '" y="0" width="' + bw.toFixed(1) + '" height="' + h + '" fill="transparent"/>' +
        (d.runs ? '<rect x="' + x + '" y="' + (h - all).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + all.toFixed(1) + '" rx="1.5" fill="var(--accent)" opacity="0.75"/>' : '') +
        (d.failed ? '<rect x="' + x + '" y="' + (h - bad).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bad.toFixed(1) + '" rx="1.5" fill="var(--bad)"/>' : '') + '</g>';
    }).join('');
    var first = daily[0] ? daily[0].date.slice(5) : '', last = daily.length ? daily[daily.length - 1].date.slice(5) : '';
    return '<figure class="wf-health-chart"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Runs per day, failed in red">' + bars + '</svg>' +
      '<figcaption><span>' + escapeHtml(first) + '</span><span class="hint">Runs per day' + DOT + 'failed in red' + DOT + 'most ' + max + '</span><span>' + escapeHtml(last) + '</span></figcaption></figure>';
  }

  function workflowHealthHtml(h) {
    var t = h.total;
    if (!t.runs) return '<p class="hint" style="margin:0">No runs in the last ' + h.days + ' days.</p>';
    var decided = t.approved + t.denied;
    var alerts = (h.alerts || []).map(function (a) { return '<div class="wf-health-alert" role="alert">' + escapeHtml(a.text) + '</div>'; }).join('');
    var stat = function (label, value, detail) { return '<div class="wf-score"><span class="wf-score-k">' + label + '</span><strong class="wf-score-v">' + value + '</strong>' + (detail ? '<span class="hint">' + detail + '</span>' : '') + '</div>'; };
    var stats = '<div class="wf-scores">' +
      stat('Runs', String(t.runs), t.failed + ' failed (' + healthPct(t.failed, t.finished) + ')') +
      stat('Approved', healthPct(t.approved, decided), decided ? t.changed + ' changed first' + DOT + t.denied + ' denied' : 'none asked') +
      stat('Questions', t.runs ? (t.questions / t.runs).toFixed(1) : '0', 'per run') +
      stat('Time', healthTime(t.medianMs), 'middle run, start to finish') +
      stat('Cost', healthCost(t.costPerRunUsd), t.costPerRunUsd == null ? 'no price for its model' : 'per run' + (t.pricedRuns < t.runs ? ', from ' + t.pricedRuns + ' of ' + t.runs + ' runs' : '')) +
      '</div>';
    var rows = h.versions.map(function (v) {
      var d = v.approved + v.denied;
      return '<tr><td>' + (v.version == null ? '<span class="hint">before versions</span>' : 'Version ' + v.version) + '</td><td>' + v.runs + '</td><td>' + healthPct(v.failed, v.finished) + '</td><td>' + healthPct(v.approved, d) + '</td><td>' + healthPct(v.changed + v.denied, d) + '</td>' +
        '<td>' + (v.runs ? (v.questions / v.runs).toFixed(1) : '0') + '</td><td>' + (v.feedback ? healthPct(v.unedited, v.feedback) : String.fromCharCode(8212)) + '</td><td>' + healthTime(v.medianMs) + '</td><td>' + healthCost(v.costPerRunUsd) + '</td></tr>';
    }).join('');
    return alerts + stats + healthChartHtml(h.daily) +
      '<details class="wf-health-more"><summary>By version of its instructions</summary><div class="wf-health-table"><table><thead><tr><th>Version</th><th>Runs</th><th>Failed</th><th>Approved</th><th>Changed or denied</th><th>Questions per run</th><th>Used unedited</th><th>Time</th><th>Cost per run</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }

  // A change's details: each setting from and to, and for long texts the
  // lines added (+) and removed (−), a few shown and the rest folded.
  function changeDetailsHtml(d) {
    var list = d.changes || [];
    var version = d.version || d.brief;
    if (!list.length && !version) return '';
    var MINUS = String.fromCharCode(8722);
    var lineHtml = function (sign, cls, l) { return '<div class="' + cls + '">' + sign + ' ' + escapeHtml(l) + '</div>'; };
    var rows = list.map(function (c) {
      if (c.added || c.removed) {
        var lines = (c.removed || []).map(function (l) { return lineHtml(MINUS, 'chg-del', l); }).concat((c.added || []).map(function (l) { return lineHtml('+', 'chg-ins', l); }));
        var head = '<strong>' + escapeHtml(c.field) + '</strong>';
        var shown = lines.slice(0, 6).join('');
        var more = lines.length > 6 ? '<details><summary>' + (lines.length - 6) + ' more line' + (lines.length - 6 === 1 ? '' : 's') + '</summary>' + lines.slice(6).join('') + '</details>' : '';
        return '<div class="chg-field">' + head + '<div class="chg-lines">' + (shown || '<div class="chg-note">Only spacing changed.</div>') + more + '</div></div>';
      }
      return '<div class="chg-field"><strong>' + escapeHtml(c.field) + '</strong>: <del>' + escapeHtml(c.from) + '</del> ' + String.fromCharCode(8594) + ' <ins>' + escapeHtml(c.to) + '</ins></div>';
    }).join('');
    // The workflow's version before and after ("brief" on older changes).
    if (version) rows = '<div class="chg-note">Workflow v' + version.from + ' ' + String.fromCharCode(8594) + ' v' + version.to + '</div>' + rows;
    return '<div class="chg">' + rows + '</div>';
  }

  // ---- A workflow in three parts: its contract (what the system holds it
  // to: how it starts, its inputs, lookups, tools, model and result), its
  // brief (what the agent reads) and its evidence (how it's doing). ----
  var workflowsMeta = { policies: '', agentModel: '', messaging: null, agentTools: null, limits: null };
  var RSQ = String.fromCharCode(8217);
  var DOT = ' ' + String.fromCharCode(183) + ' ';

  // The contract as one block: trigger, inputs, tools, result, model.
  // Tools are grouped by what they may do.
  var SENDER_LABELS = { stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', standard: 'Standard Webhooks', custom: 'Your app' };
  var ARROW_L = String.fromCharCode(8592);
  function contractLinesHtml(lines) {
    return lines.map(function (l) { return '<div class="wf-cb-line">' + l + '</div>'; }).join('');
  }
  // Where a workflow's approvals and questions go, as a phrase: its app
  // (the contract's address), or the agent's messaging app.
  function workflowDecisionsTo(w) {
    if (w.delivery && w.delivery.decisions_to === 'callback') return 'your app (' + escapeHtml(w.delivery.callback_url) + ')';
    return 'the agent' + String.fromCharCode(8217) + 's messaging app';
  }

  // Where the agent's approvals go by name ("Telegram", "Webhook"), or
  // null with none.
  function workflowChatName() {
    return workflowsMeta.messaging ? (APP_NAMES[workflowsMeta.messaging] || workflowsMeta.messaging) : null;
  }
  // Its chat app by name, for messages people read (Slack, Telegram or
  // Lark), or null.
  function workflowChatAppName() {
    return ['slack', 'telegram', 'lark'].indexOf(workflowsMeta.messaging) !== -1 ? workflowChatName() : null;
  }

  // Its Messaging tab: where every run's messages go, however it starts,
  // as a grid of what happens in a run (rows) by where it can go
  // (columns): the agent's messaging app, the Inbox and your app's
  // address. What can't be turned off is shown ticked and locked: the
  // Inbox keeps every run (web/inbox-admin.ts); your app gets nothing
  // without an address, and with one gets every decision, finish and
  // failure (adapters/http.ts, reportWorkflowRun).
  function workflowMessagesHtml(w, agentName) {
    var d = draftedDelivery(w) || w.delivery || {};
    var RSQ = String.fromCharCode(8217);
    var chatName = workflowChatName();
    var chat = workflowChatAppName();
    var chatCol = escapeHtml(chatName || 'Messaging app');
    var toApp = d.decisions_to === 'callback';
    var box = function (name, checked, locked, label, extra) {
      return '<label class="wf-msg-cell"><input type="checkbox"' + (name ? ' name="' + name + '"' : '') + (checked ? ' checked' : '') + (locked ? ' disabled' : '') + ' aria-label="' + label + '"' + (extra || '') + '></label>';
    };
    var none = '<span class="wf-msg-cell hint" aria-label="Not sent">' + String.fromCharCode(8212) + '</span>';
    var always = function (label) { return box('', true, true, label + ': always'); };
    var appCell = function (key, label) { return '<span class="wf-msg-appcell" data-app="' + key + '">' + box('', Boolean(d.callback_url), true, label + ', when an address is set') + '</span>'; };
    var row = function (what, hint, chatCell, inboxCell, appCellHtml, below) {
      return '<tr><th scope="row"><div>' + what + '</div><div class="hint">' + hint + '</div>' + (below || '') + '</th>' +
        '<td>' + chatCell + '</td><td>' + inboxCell + '</td><td>' + appCellHtml + '</td></tr>';
    };
    // Webhooks saved with settings of their own: their runs use those.
    var own = (w.triggers || []).filter(function (t) { return t.callback || t.decisions_to || t.chat_notice || t.result_to_chat; });
    return '<form class="wf-msg-form">' +
      (draftedDelivery(w) ? draftNoteHtml('Where messages go is changed in the draft: runs follow the published setting until then.') : '') +
      '<p class="hint" style="margin:0">Where this workflow' + RSQ + 's messages go, for every run: started by Run now, a schedule, a webhook or the API. A ticked, greyed box can' + RSQ + 't be turned off. Your app gets nothing until you give it an address.</p>' +
      '<div class="wf-msg-dests">' +
        '<div class="wf-msg-dest"><div class="wf-msg-dest-k">' + chatCol + '</div><div class="hint">' +
          (chatName ? 'The agent' + RSQ + 's messaging app, set in its <a href="?agent=' + encodeURIComponent(agentName) + '&amp;tab=messaging">Messaging Apps</a> tab.'
            : 'Not set up. <a href="?agent=' + encodeURIComponent(agentName) + '&amp;tab=messaging">Set one up in Messaging</a> (Slack, Telegram or Lark) to post to chat.') + '</div></div>' +
        '<div class="wf-msg-dest"><div class="wf-msg-dest-k">Inbox</div><div class="hint">Always. Every run is a conversation there, where approvals and questions can be answered.</div></div>' +
        '<div class="wf-msg-dest"><div class="wf-msg-dest-k">Your app</div><div class="hint">Optional. Only when you set an address: it then gets each update as signed JSON (a webhook).</div>' +
          '<input name="msgUrl" inputmode="url" placeholder="https://example.com/hooks/loopengine" value="' + escapeHtml(d.callback_url || '') + '"></div>' +
      '</div>' +
      '<div class="wf-msg-grid-wrap"><table class="wf-msg-grid"><thead><tr><th scope="col"><span class="sr-only">When</span></th><th scope="col">' + chatCol + '</th><th scope="col">Inbox</th><th scope="col">Your app</th></tr></thead><tbody>' +
        row('A run starts', 'A short note that it began.',
          chat ? box('msgNoticeOn', Boolean(d.chat_notice), false, 'Post a start note to ' + chatCol) : none,
          always('Shown in the Inbox'),
          '<span class="wf-msg-appcell" data-app="start">' + box('', toApp, true, 'Sent to your app when it answers approvals and questions') + '</span>',
          chat ? '<div class="wf-msg-notice"' + (d.chat_notice ? '' : ' hidden') + '><input name="msgNotice" maxlength="1000" placeholder="Run started" value="' + escapeHtml(d.chat_notice || '') + '"><span class="hint">{{name}} puts in an input' + RSQ + 's value.</span></div>' : '') +
        row('Approvals and questions', 'Someone answers in one place; the Inbox can always answer too.',
          chatName ? box('msgDecisionsChat', !toApp, !d.callback_url, 'Send approvals and questions to ' + chatCol, ' data-locked-without-app="1"') : none,
          always('Approvals and questions in the Inbox'),
          appCell('decisions', 'Approvals and questions sent to your app')) +
        row('A run finishes or fails', 'Its result, or what went wrong.',
          chatName ? box('msgResult', Boolean(d.result_to_chat), false, 'Post the result to ' + chatCol) : none,
          always('Results in the Inbox'),
          appCell('finish', 'Results sent to your app')) +
      '</tbody></table></div>' +
      '<p class="hint wf-msg-decide-note" style="margin:0"></p>' +
      (own.length
        ? '<div class="wf-msg-own">' + own.map(function (t) {
            return '<p class="hint" style="margin:0">The ' + escapeHtml(t.name) + ' webhook has settings of its own, so its runs use those instead. ' +
              '<button type="button" class="wf-msg-clear-hook" data-trigger="' + escapeHtml(t.trigger_id) + '">Use these instead</button></p>';
          }).join('') + '</div>'
        : '') +
      '<div class="wf-msg-foot"><span class="hint wf-msg-result" role="status">Saved straight away: every run from now on follows it.</span><button type="submit" class="primary">Save</button></div>' +
      '</form>';
  }

  // Its Triggers tab: the four ways a run starts, each in its own box
  // with what it is: Run now, a schedule, a webhook, the API.
  function workflowTriggersHtml(w, name, params) {
    var schedules = workflowScheduleItemsHtml(w, name);
    var hasHooks = Boolean(w.webhooks || w.webhooksWaiting || w.webhooksOff);
    var way = function (key, title, what, body) {
      return '<section class="wf-way wf-way-' + key + '"' + '><h4>' + title + '</h4><p class="wf-way-what">' + what + '</p>' + body + '</section>';
    };
    return '<div class="wf-ways">' +
      way('run', 'Run now', 'Starts a run right away, from here. Follow it in Activity.', workflowRunBarHtml(w, params)) +
      way('schedule', 'Schedule', 'Runs it on a timer, like every day at 9:00. Approvals and questions go where its Messaging tab says.',
        (schedules || '<p class="hint" style="margin:0">None yet.</p>') +
        '<div><button type="button" class="workflow-add-schedule">+ Schedule</button></div>') +
      way('webhook', 'Webhook', 'Another app (Stripe, GitHub, Shopify or your own) calls a private address when something happens, and each call starts a run.',
        '<div class="workflow-hooks"></div>' +
        (hasHooks ? '' : '<p class="hint wf-hooks-none" style="margin:0">None yet.</p>') +
        '<div class="workflow-hooks-add"' + (w.webhooksWaiting ? ' hidden' : '') + '><button type="button" class="workflow-hooks-btn">+ Webhook</button></div>') +
      way('api', 'API', 'Your own app starts a run by calling this address with an API key.', workflowApiHtml(w, name)) +
      '</div>';
  }

  // Its Contract tab: what every run is held to, as the system enforces
  // it, apart from what the agent is only asked to do. Held to: the
  // published version; how it starts; its inputs, checked before it
  // starts; the tools it can call (every tool the agent has) and their
  // permissions; its output schema, checked on its result; its model;
  // where approvals go; its limits; where its result goes. Asked: its
  // prompt and the shared policies, its result format, and its success
  // criteria (judged in Evaluation only).
  function workflowContractHtml(w, name, params) {
    var row = function (k, lines) { return '<div class="wf-cb-k">' + k + '</div><div class="wf-cb-v">' + contractLinesHtml(lines) + '</div>'; };
    var hint = function (t) { return '<span class="hint">' + t + '</span>'; };

    var version = ['the published version, <span class="wf-contract-version">' + hint('loading' + String.fromCharCode(8230)) + '</span>' +
      (w.draft ? ' <span class="le-pill warn">Draft not live</span>' : ''), hint('A draft never runs: its changes, a webhook made in it included, apply once it' + RSQ + 's published. Each run records the version it ran.')];

    var trigger = [];
    (w.schedules || []).filter(function (x) { return x.status !== 'cancelled'; }).forEach(function (x) {
      trigger.push('schedule, ' + escapeHtml(x.describe) + (x.status === 'paused' ? ' <span class="le-pill warn">Paused</span>' : ''));
    });
    (w.triggers || []).forEach(function (t) {
      trigger.push(escapeHtml(SENDER_LABELS[t.sender] || t.sender) + ' webhook' + (t.filter ? ', <code>' + escapeHtml(t.filter.values.join(' | ')) + '</code>' : '') +
        (t.waiting ? ' <span class="le-pill ask">Needs its signing secret</span>' : !t.enabled ? ' <span class="le-pill warn">Off</span>' : ''));
      Object.keys(t.mapping || {}).forEach(function (param) { trigger.push('<span class="wf-cb-indent"><code>' + escapeHtml(param) + '</code> ' + ARROW_L + ' <code>' + escapeHtml(t.mapping[param]) + '</code></span>'); });
    });
    trigger.push('by hand (Run now) or from an app (API)');
    trigger.push(hint('A run with the same inputs as one still under way is turned away.'));

    var names = Object.keys(w.parameters || {});
    var inputs = names.length ? names.map(function (n) {
      var spec = w.parameters[n];
      var typed = inputTypeText(spec);
      return '<code>' + escapeHtml(n) + '</code>' + (spec.required ? ' (required)' : ' (optional)') + (typed ? ' ' + escapeHtml(typed) : '') + (spec.description ? ' <span class="hint">' + escapeHtml(spec.description) + '</span>' : '');
    }) : ['none: every run is the same'];
    inputs.push(hint('Checked before a run starts: a missing required input, any other input, or a value of the wrong type or outside its limits is refused (an app' + RSQ + 's call gets 400, a webhook 422, a schedule' + RSQ + 's run fails).'));

    // Every tool the agent has, by permission; those its prompt names first.
    var named = {};
    (w.tools || []).forEach(function (t) { named[t.name] = true; });
    var all = workflowsMeta.agentTools || w.tools || [];
    var groups = { allow: [], ask: [], deny: [] };
    all.forEach(function (t) { (groups[t.decision] || groups.ask).push(t.name); });
    var tools = [];
    [['allow', 'runs on its own'], ['ask', 'asks you first'], ['deny', 'never runs']].forEach(function (g) {
      var list = groups[g[0]].slice().sort(function (a, b) { return Number(!named[a]) - Number(!named[b]) || a.localeCompare(b); });
      if (!list.length) return;
      tools.push('<span class="wf-cb-tools">' + list.map(function (n) { return named[n] ? '<code class="wf-cb-named" title="Named in its prompt">' + escapeHtml(n) + '</code>' : '<code>' + escapeHtml(n) + '</code>'; }).join(', ') + '</span><span class="wf-cb-decision ' + g[0] + '">' + g[1] + '</span>');
    });
    if (!all.length) tools.push('none: the agent has no tools');
    tools.push('built in: asking a person a question, and scheduling ' + hint('(always allowed)'));
    tools.push(hint('A run can call any of the agent' + RSQ + 's tools, not only those its prompt names (in bold). Permissions are the agent' + RSQ + 's, shared by all its workflows, and are shown here as they apply before a call' + RSQ + 's values are known: a rule on the values can decide a call differently.'));

    var output = [];
    if (w.outputSchema) {
      var props = w.outputSchema.type === 'object' && w.outputSchema.properties ? Object.keys(w.outputSchema.properties) : [];
      output.push('JSON matching its output schema' + (props.length ? ': ' + props.map(function (n) { return '<code>' + escapeHtml(n) + '</code>'; }).join(', ') : '') +
        '<details class="wf-schema"><summary>Show the schema</summary><pre>' + escapeHtml(JSON.stringify(w.outputSchema, null, 2)) + '</pre></details>');
      output.push(hint('A result that doesn' + RSQ + 't match goes back to the agent with what' + RSQ + 's wrong, twice at most; then the run fails.'));
    } else output.push('not checked: no output schema ' + hint('(add one with Edit workflow to hold every result to a shape)'));

    var model = [w.model ? escapeHtml(w.model.provider + ' ' + w.model.model) : escapeHtml(workflowsMeta.agentModel || 'the agent' + RSQ + 's') + ' ' + hint('(the agent' + RSQ + 's model)')];

    var decisions = [(w.delivery && w.delivery.decisions_to === 'callback' ? 'your app (' + escapeHtml(w.delivery.callback_url || '') + ')' : escapeHtml(workflowChatName() || 'the Inbox') + (workflowChatName() ? ', and the Inbox' : '')),
      hint('A run that needs a decision or an answer waits for it, however long. An app or webhook that sets its own update address can take them instead.')];

    var lim = workflowsMeta.limits;
    var limits = [lim ? 'at most ' + lim.maxTurns + ' model turns, then the run stops' : 'the agent' + RSQ + 's limit on model turns',
      lim ? 'its conversation kept under ' + Number(lim.contextBudgetTokens).toLocaleString() + ' tokens ' + hint('(older steps are summarised as it fills)') : '',
      hint('No limit on time or cost: both are recorded on each run (Activity).')].filter(Boolean);

    var result = ['returned to whoever started it ' + hint('(Run now, or the app' + RSQ + 's API call)')];
    var notified = (w.delivery && w.delivery.result_to_chat) || (w.schedules || []).some(function (x) { return x.notify && x.status !== 'cancelled'; }) || (w.triggers || []).some(function (t) { return t.result_to_chat; });
    if (notified) result.push('posted to ' + escapeHtml(workflowsMeta.messaging ? (APP_NAMES[workflowsMeta.messaging] || workflowsMeta.messaging) : 'the messaging app') + (w.delivery && w.delivery.result_to_chat ? '' : ' ' + hint('(for the schedules and webhooks set to send it)')) + ', or its error if it fails');
    if (w.delivery && w.delivery.callback_url) result.push('posted to ' + escapeHtml(w.delivery.callback_url) + ' when it finishes, fails or waits for a decision ' + hint('(signed)'));
    if ((w.triggers || []).some(function (t) { return t.callback; })) result.push('posted to each webhook' + RSQ + 's update address, for runs it starts');

    var criteria = (w.evals && w.evals.criteria) || [];
    var asked = [
      'its prompt and the shared policies ' + hint('(Prompt tab; policies in Settings)'),
      w.output ? 'its result format: ' + escapeHtml(w.output) : 'no result format',
      criteria.length ? criteria.length + ' success ' + (criteria.length === 1 ? 'criterion' : 'criteria') + ' ' + hint('(judged when you evaluate it, not on live runs)') : 'no success criteria',
    ];

    return '<section class="wf-section"><div class="wf-sub-row"><h4 class="wf-sub">Held to on every run</h4><span class="hint">enforced by LoopEngine, whatever the agent decides</span></div>' +
        '<div class="wf-cb">' + row('version', version) + row('starts', trigger) + row('inputs', inputs) + row('tools', tools) + row('output', output) + row('model', model) + row('approvals', decisions) + row('limits', limits) + row('result', result) + '</div></section>' +
      '<section class="wf-section"><div class="wf-sub-row"><h4 class="wf-sub">Asked of the agent</h4><span class="hint">what it reads and follows; not checked</span></div>' +
        '<div class="wf-cb">' + row('reads', asked) + '</div>' +
        '<p class="hint" style="margin:0">Change the prompt, inputs, output schema and model with Edit workflow, where approvals and results go in Messaging, the agent' + RSQ + 's tool permissions in Permissions, and success criteria in Evaluation.</p></section>';
  }


  function workflowBriefHtml(w) {
    var policies = workflowsMeta.policies;
    return '<div class="workflow-steps-text">' + escapeHtml(w.instructions) + '</div>' +
      (policies
        ? '<details class="wf-original"><summary>Shared policies, read by every workflow</summary><div class="workflow-steps-text">' + escapeHtml(policies) + '</div><p class="hint" style="margin:6px 0 0">Change them in <a href="/config?section=settings">Settings</a>.</p></details>'
        : '<p class="hint" style="margin:0">No shared policies yet. Rules every workflow should follow, like your refund window or who signs messages, go in <a href="/config?section=settings">Settings</a>, so you write them once.</p>') +
      (w.originalRequest ? '<details class="wf-original"><summary>Original message</summary><div class="workflow-steps-text">' + escapeHtml(w.originalRequest) + '</div></details>' : '');
  }

  // A criterion's kind, in words, for its row and its editor.
  var CRIT_KINDS = [
    ['judge', 'Judge decides'],
    ['contains', 'Result contains'],
    ['not_contains', 'Result doesn' + String.fromCharCode(8217) + 't contain'],
    ['tool_called', 'Calls tool'],
    ['tool_not_called', 'Doesn' + String.fromCharCode(8217) + 't call tool'],
    ['reference', 'Matches the good result'],
  ];
  function critKindText(c) {
    if (c.kind === 'reference') return 'Checked against each eval case' + RSQ + 's saved good result';
    var label = (CRIT_KINDS.filter(function (k) { return k[0] === c.kind; })[0] || CRIT_KINDS[0])[1];
    return c.value ? label + ' ' + String.fromCharCode(8220) + c.value + String.fromCharCode(8221) : label;
  }
  function critRowHtml(c) {
    var needsValue = c.kind !== 'judge' && c.kind !== 'reference';
    return '<div class="wf-crit-row" data-crit-id="' + escapeHtml(c.id || '') + '">' +
      '<select data-crit-kind aria-label="How it' + RSQ + 's checked">' + CRIT_KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === c.kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>' +
      '<input data-crit-text value="' + escapeHtml(c.text || '') + '" placeholder="e.g. The reply gives the order' + RSQ + 's tracking number" aria-label="The check">' +
      '<input data-crit-value value="' + escapeHtml(c.value || '') + '" placeholder="' + (c.kind && c.kind.indexOf('tool') === 0 ? 'tool name' : 'exact text') + '" aria-label="What to look for"' + (needsValue ? '' : ' hidden') + '>' +
      '<button type="button" class="wf-link wf-crit-remove">Remove</button></div>';
  }
  var REFERENCE_CRIT = { id: 'reference', text: 'Matches the good result: the same facts and decisions', kind: 'reference' };

  // The Activity tab: its execution history over the last 30 days (runs
  // per day, failures, approvals, time and cost), then its runs, each a
  // card with the workflow version it ran and View trace. A trace takes
  // the tab's place: the run's execution details, then its execution
  // trace, step by step (see workflowTraceHtml).
  function workflowActivityHtml(w, runsHtml, name) {
    if (!workflowPageId) {
      return '<section class="wf-section"><h4 class="wf-sub">Latest runs</h4>' +
        (runsHtml ? '<ul class="wf-run-lines">' + runsHtml + '</ul>' : '<p class="hint" style="margin:0">No runs yet.</p>') + '</section>';
    }
    var loading = '<p class="hint" style="margin:0">Loading' + String.fromCharCode(8230) + '</p>';
    var auditHref = '/audit?agent=' + encodeURIComponent(name) + '&workflow=' + encodeURIComponent(w.id);
    return '<div class="wf-act-main">' +
        '<section class="wf-section wf-health">' + loading + '</section>' +
        '<section class="wf-section"><div class="wf-sub-row"><h4 class="wf-sub">Runs</h4><span class="hint wf-runs-count"></span></div><div class="wf-runs">' + loading + '</div></section>' +
        '<section class="wf-section"><div class="wf-audit-tools"><a href="/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id) + '/audit/report">Open the report</a><a href="' + auditHref + '">Who changed it, in Audit ' + String.fromCharCode(8594) + '</a></div></section>' +
      '</div>' +
      '<div class="wf-trace" hidden></div>';
  }

  var RUN_PILLS = { done: ['good', 'Done'], error: ['bad', 'Failed'], awaiting_approval: ['ask', 'Waiting'], running: ['accent', 'Running'] };
  var RUN_SOURCES = { console: 'Run now', api: 'API', schedule: 'Schedule', webhook: 'Webhook', assignment: 'Assigned', chain: 'Another workflow' };
  function runPillHtml(status) {
    var p = RUN_PILLS[status] || ['', status];
    return '<span class="le-pill ' + p[0] + '">' + p[1] + '</span>';
  }
  function runWhen(iso) {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function runVersionOf(r) {
    return r.versions ? (r.versions.workflow || r.versions.brief || null) : null;
  }

  // Its runs, newest first (the latest 50), each a card.
  function loadWorkflowRuns(name, card, base) {
    var box = card.querySelector('.wf-runs');
    if (!box) return;
    var w = workflowsById[card.dataset.workflow];
    fetch(base + '/runs', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (data) {
        var runs = data.runs || [];
        var count = card.querySelector('.wf-runs-count');
        if (count) count.textContent = runs.length >= 50 ? 'Latest 50' : runs.length ? runs.length + ' run' + (runs.length === 1 ? '' : 's') : '';
        box.innerHTML = runs.length ? '<ol class="wf-run-cards">' + runs.map(function (r) { return runCardHtml(w, r); }).join('') + '</ol>'
          : '<p class="hint" style="margin:0">No runs yet. Start one from Triggers (Run now), an app, a schedule or a webhook.</p>';
      })
      .catch(function (err) { box.innerHTML = '<p class="error">Could not load its runs: ' + escapeHtml(err.message) + '</p>'; });
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('.wf-run-trace');
      if (!b) return;
      openRunTrace(name, card, b.getAttribute('data-run'));
    });
  }

  function runCardHtml(w, r) {
    var version = runVersionOf(r);
    var values = r.params ? Object.keys(r.params).map(function (k) { return k + ': ' + r.params[k]; }).join(DOT) : '';
    var outcome = r.status === 'error' ? (r.error || '') : (r.result || '');
    var took = r.finished_at ? healthTime(Date.parse(r.finished_at) - Date.parse(r.started_at)) : '';
    return '<li class="wf-run-card' + (r.status === 'error' ? ' is-failed' : '') + '">' +
      '<div class="wf-run-card-head">' + runPillHtml(r.status) +
        '<strong>' + escapeHtml(runWhen(r.started_at)) + '</strong>' +
        (version ? '<span class="wf-run-version" title="The workflow version it ran">v' + version + '</span>' : '<span class="hint">before versions</span>') +
        '<span class="hint">' + escapeHtml(RUN_SOURCES[r.source] || r.source || '') + (took ? DOT + escapeHtml(took) : '') + '</span>' +
        '<span class="wf-run-card-actions"><a class="wf-link" href="' + inboxHref(r.run_id) + '">Open in Inbox</a><button type="button" class="wf-run-trace" data-run="' + escapeHtml(r.run_id) + '">View trace</button></span>' +
      '</div>' +
      (values ? '<div class="wf-run-card-inputs">' + escapeHtml(values.length > 200 ? values.slice(0, 200) + String.fromCharCode(8230) : values) + '</div>' : '') +
      (outcome ? '<div class="wf-run-card-out' + (r.status === 'error' ? ' error' : '') + '">' + escapeHtml(outcome.length > 280 ? outcome.slice(0, 280) + String.fromCharCode(8230) : outcome) + '</div>' : '') +
      runEvidenceHtml(w || {}, r) +
    '</li>';
  }

  // The run whose trace is open on each workflow's page, and its step, so
  // a redraw (a running run refreshing) keeps it open.
  var openTraces = {};
  if (workflowPageId && pageParams.get('run')) openTraces[workflowPageId] = { run: pageParams.get('run'), step: null };

  function setRunParam(runId) {
    var q = new URLSearchParams(location.search);
    if (runId) { q.set('run', runId); q.set('wtab', 'activity'); } else q.delete('run');
    history.replaceState(null, '', location.pathname + '?' + q.toString());
  }

  function openRunTrace(name, card, runId) {
    var id = card.dataset.workflow;
    var prev = openTraces[id];
    openTraces[id] = { run: runId, step: prev && prev.run === runId ? prev.step : null };
    setRunParam(runId);
    var main = card.querySelector('.wf-act-main');
    var box = card.querySelector('.wf-trace');
    if (!main || !box) return;
    main.hidden = true;
    box.hidden = false;
    if (!box.innerHTML) box.innerHTML = '<p class="hint">Loading the trace' + String.fromCharCode(8230) + '</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/runs/' + encodeURIComponent(runId) + '/trace', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (t) {
        if (!openTraces[id] || openTraces[id].run !== runId) return;
        box.innerHTML = workflowTraceHtml(name, t);
        wireTrace(name, card, box, t);
      })
      .catch(function (err) {
        box.innerHTML = traceBarHtml(name, runId) + '<p class="error">Could not load the trace: ' + escapeHtml(err.message) + '</p>';
        wireTrace(name, card, box, null);
      });
  }

  function closeRunTrace(card) {
    delete openTraces[card.dataset.workflow];
    setRunParam(null);
    var main = card.querySelector('.wf-act-main');
    var box = card.querySelector('.wf-trace');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (main) main.hidden = false;
  }

  // Back to the runs; the run's conversation in the Inbox; its record (the
  // run, every event in it, its trace, and the workflow version and
  // policies it ran under) or just its trace, as a file; and, for a run
  // that finished, saving it as an eval case.
  function traceBarHtml(name, runId, t) {
    return '<div class="wf-trace-bar"><button type="button" class="wf-link wf-trace-back">' + String.fromCharCode(8592) + ' All runs</button>' +
      '<span style="flex:1"></span><a class="wf-link" href="' + inboxHref(runId) + '">Open in Inbox</a>' +
      '<a class="wf-link" href="/inbox/cases/' + encodeURIComponent(runId) + '/export" download>Download record</a>' +
      '<a class="wf-link" href="/agents/' + encodeURIComponent(name) + '/runs/' + encodeURIComponent(runId) + '/trace" download="trace-' + escapeHtml(runId) + '.json">Download trace</a>' +
      (t && t.status === 'done' ? '<button type="button" class="wf-trace-save-case">Save as eval case</button>' : '') + '</div>' +
      '<div class="wf-trace-case" hidden></div>';
  }

  var STEP_KINDS = {
    start: ['Run started', 'start'], end: ['Run finished', 'end'], prompt: ['Prompt', 'prompt'], model_call: ['Model call', 'model'],
    tool_call: ['Tool call', 'tool'], decision: ['Approval', 'person'], answer: ['Answer', 'person'], feedback: ['Feedback', 'person'],
  };
  function traceMs(ms) {
    if (ms == null) return String.fromCharCode(8212);
    if (ms < 1000) return Math.round(ms) + ' ms';
    return healthTime(ms);
  }
  function traceTokens(n) { return n == null ? String.fromCharCode(8212) : Number(n).toLocaleString(); }

  // The steps from start to end: the run starting (its input), each step
  // the trace kept, and the run ending (its output or error).
  function traceSteps(t) {
    var steps = [{ type: 'start', at: t.started_at, input: t.input }].concat(t.step_events || []);
    if (t.finished_at) steps.push({ type: 'end', at: t.finished_at, status: t.status, output: t.final_output_json != null ? t.final_output_json : t.final_output, error: t.error });
    return steps;
  }

  function stepTitle(s, t) {
    if (s.type === 'tool_call') return s.name;
    if (s.type === 'model_call') return s.model || (t.model && t.model.model) || 'Model';
    if (s.type === 'decision') return (s.approved ? (s.changed ? 'Approved as changed: ' : 'Approved: ') : 'Denied: ') + s.tool;
    if (s.type === 'answer') return s.question;
    if (s.type === 'feedback') return [s.verdict, s.edit ? (s.edit === 'none' ? 'used unedited' : s.edit + ' edits') : ''].filter(Boolean).join(', ') || 'Given';
    if (s.type === 'prompt') return s.resumed ? 'Resumed' : 'System prompt, tools and input';
    if (s.type === 'end') return s.status === 'error' ? 'Failed' : s.status === 'done' ? 'Done' : s.status;
    return RUN_SOURCES[t.source] || 'Started';
  }
  function stepFailed(s) {
    return Boolean(s.error) || (s.type === 'decision' && !s.approved) || (s.type === 'end' && s.status === 'error') || (s.type === 'tool_call' && /denied|error|fail/i.test(s.status || ''));
  }

  function workflowTraceHtml(name, t) {
    var steps = traceSteps(t);
    var start = Date.parse(t.started_at);
    var end = t.finished_at ? Date.parse(t.finished_at) : start;
    steps.forEach(function (s) { var e = Date.parse(s.at) + (s.duration_ms || 0); if (e > end) end = e; });
    var total = Math.max(1, end - start);
    var cost = t.cost || {};
    // Its model calls as the trace kept them, where usage wasn't recorded.
    var calls = (t.step_events || []).filter(function (s) { return s.type === 'model_call'; });
    var sum = function (k) { return calls.reduce(function (n, s) { return n + (s[k] || 0); }, 0); };
    var tokensIn = cost.input_tokens || sum('input_tokens');
    var tokensOut = cost.output_tokens || sum('output_tokens');
    var item = function (k, v) { return '<div class="wf-xd-item"><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    var params = Object.keys((t.input && t.input.params) || {});
    var details = '<section class="wf-section wf-xd">' +
      '<div class="wf-xd-head">' + runPillHtml(t.status) + '<h3>Run <code>' + escapeHtml(String(t.execution_id).slice(0, 8)) + '</code></h3>' +
        (t.workflow_version ? '<span class="wf-run-version">v' + t.workflow_version + '</span>' : '') + '</div>' +
      '<h4 class="wf-sub">Execution details</h4>' +
      '<dl class="wf-xd-grid">' +
        item('Status', escapeHtml((RUN_PILLS[t.status] || [0, t.status])[1])) +
        item('Started by', escapeHtml(RUN_SOURCES[t.source] || t.source || String.fromCharCode(8212))) +
        item('Workflow version', t.workflow_version ? '<a href="#" class="wf-xd-version" data-version="' + t.workflow_version + '">v' + t.workflow_version + '</a>' : '<span class="hint">before versions</span>') +
        item('Started', escapeHtml(new Date(t.started_at).toLocaleString())) +
        item('Finished', t.finished_at ? escapeHtml(new Date(t.finished_at).toLocaleString()) : '<span class="hint">not yet</span>') +
        item('Duration', escapeHtml(traceMs(t.duration_ms))) +
        item('Model', t.model ? escapeHtml((t.model.provider ? t.model.provider + ' ' : '') + t.model.model) : String.fromCharCode(8212)) +
        item('Steps', String(steps.length - (t.finished_at ? 2 : 1)) + ' <span class="hint">' + calls.length + ' model, ' + (t.tool_calls || []).length + ' tool</span>') +
        item('Tokens', traceTokens(tokensIn) + ' in' + DOT + traceTokens(tokensOut) + ' out') +
        item('Cost', escapeHtml(healthCost(cost.usd))) +
        item('Execution ID', '<code>' + escapeHtml(t.execution_id) + '</code>') +
      '</dl>' +
      (t.error ? '<div class="wf-xd-error" role="alert"><strong>Error</strong> ' + escapeHtml(t.error) + '</div>' : '') +
      '<div class="wf-xd-io">' +
        '<div><div class="wf-xd-k">Input</div>' + (params.length
          ? '<dl class="wf-xd-params">' + params.map(function (k) { return '<dt>' + escapeHtml(k) + '</dt><dd>' + escapeHtml(t.input.params[k]) + '</dd>'; }).join('') + '</dl>'
          : '<p class="hint" style="margin:0">No inputs</p>') + '</div>' +
        '<div><div class="wf-xd-k">Output</div>' + (t.final_output_json != null || t.final_output
          ? '<pre class="wf-tv-pre">' + escapeHtml(traceValueText(t.final_output_json != null ? t.final_output_json : t.final_output)) + '</pre>'
          : '<p class="hint" style="margin:0">' + (t.status === 'error' ? 'None: it failed' : 'None yet') + '</p>') +
          (t.output_schema_check && t.output_schema_check.valid === false ? '<p class="error" style="margin:4px 0 0">Didn' + RSQ + 't match the output schema: ' + escapeHtml((t.output_schema_check.errors || []).join('; ')) + '</p>' : '') +
        '</div>' +
      '</div>' +
    '</section>';
    var rows = steps.map(function (s, i) {
      var kind = STEP_KINDS[s.type] || [s.type, 'other'];
      var at = Date.parse(s.at);
      var left = Math.min(100, Math.max(0, (at - start) / total * 100));
      var width = s.duration_ms ? Math.max(0.6, Math.min(100 - left, s.duration_ms / total * 100)) : 0;
      var meta = s.type === 'model_call' ? traceTokens(s.input_tokens) + ' / ' + traceTokens(s.output_tokens) + ' tokens'
        : s.type === 'tool_call' ? (s.status || '')
        : s.by ? s.by : '';
      return '<li><button type="button" class="wf-tl-step k-' + kind[1] + (stepFailed(s) ? ' is-bad' : '') + '" data-step="' + i + '" aria-pressed="false">' +
        '<span class="wf-tl-dot" aria-hidden="true"></span>' +
        '<span class="wf-tl-text"><span class="wf-tl-kind">' + kind[0] + '</span><span class="wf-tl-title">' + escapeHtml(stepTitle(s, t)) + '</span>' +
          (meta ? '<span class="wf-tl-meta">' + escapeHtml(meta) + '</span>' : '') + '</span>' +
        '<span class="wf-tl-time"><span>+' + escapeHtml(traceMs(at - start)) + '</span>' + (s.duration_ms != null ? '<span class="hint">' + escapeHtml(traceMs(s.duration_ms)) + '</span>' : '') + '</span>' +
        '<span class="wf-tl-bar" aria-hidden="true"><span style="left:' + left.toFixed(2) + '%;width:' + (width ? width.toFixed(2) + '%' : '2px') + '"></span></span>' +
      '</button></li>';
    }).join('');
    return traceBarHtml(name, t.execution_id, t) + details +
      '<section class="wf-section"><div class="wf-sub-row"><h4 class="wf-sub">Execution trace</h4><span class="hint">' + steps.length + ' steps' + DOT + 'click one for its details</span></div>' +
        '<div class="wf-tl-wrap"><ol class="wf-tl">' + rows + '</ol><div class="wf-tl-detail" aria-live="polite"></div></div>' +
      '</section>';
  }

  // A value as text: a string as it is; model messages and replies as
  // what each said (its text, the tools it called, what they returned);
  // anything else as JSON.
  function blockText(b) {
    if (!b || typeof b !== 'object') return String(b);
    if (b.type === 'text') return b.text || '';
    if (b.type === 'tool_use') return String.fromCharCode(8594) + ' ' + b.name + ' ' + JSON.stringify(b.input || {}, null, 2);
    if (b.type === 'tool_result') return String.fromCharCode(8592) + ' result' + (b.is_error ? ' (error)' : '') + ': ' + (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map(blockText).join(String.fromCharCode(10)) : JSON.stringify(b.content, null, 2));
    return JSON.stringify(b, null, 2);
  }
  function traceValueText(v) {
    var NL = String.fromCharCode(10);
    if (v == null) return '';
    // A tool's JSON reply, laid out.
    if (typeof v === 'string' && /^[[{]/.test(v.trim())) {
      try { return JSON.stringify(JSON.parse(v), null, 2); } catch (e) { return v; }
    }
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length && v.every(function (m) { return m && typeof m === 'object' && m.role; })) {
      return v.map(function (m) { return '[' + m.role + ']' + NL + (typeof m.content === 'string' ? m.content : (m.content || []).map(blockText).join(NL)); }).join(NL + NL);
    }
    if (Array.isArray(v) && v.length && v.every(function (b) { return b && typeof b === 'object' && b.type; })) return v.map(blockText).join(NL);
    return JSON.stringify(v, null, 2);
  }

  // A step's details: what it was (tool, model, status, who), how long it
  // took and its tokens, any error, then its input and output in full.
  function stepDetailHtml(s, t) {
    var start = Date.parse(t.started_at);
    var kind = STEP_KINDS[s.type] || [s.type];
    var rows = [];
    var row = function (k, v) { rows.push('<div class="wf-xd-item"><dt>' + k + '</dt><dd>' + v + '</dd></div>'); };
    var block = function (k, v) { return v == null || v === '' ? '' : '<div class="wf-tv-block"><div class="wf-xd-k">' + k + '</div><pre class="wf-tv-pre">' + escapeHtml(traceValueText(v)) + '</pre></div>'; };
    if (s.type === 'tool_call') { row('Tool', '<code>' + escapeHtml(s.name) + '</code>'); if (s.status) row('Status', escapeHtml(s.status)); }
    if (s.type === 'model_call') {
      row('Model', escapeHtml(s.model || (t.model && t.model.model) || String.fromCharCode(8212)));
      row('Tokens', traceTokens(s.input_tokens) + ' in' + DOT + traceTokens(s.output_tokens) + ' out');
      if (s.stop_reason) row('Stop reason', escapeHtml(s.stop_reason));
      if (s.messages_sent != null) row('Messages sent', String(s.messages_sent));
    }
    if (s.type === 'prompt') { if (t.model) row('Model', escapeHtml((t.model.provider ? t.model.provider + ' ' : '') + t.model.model)); row('Tools offered', (s.tools || []).length ? s.tools.map(function (x) { return '<code>' + escapeHtml(x) + '</code>'; }).join(', ') : 'none'); if (s.prior_messages) row('Earlier messages', String(s.prior_messages)); }
    if (s.type === 'decision') { row('Tool', '<code>' + escapeHtml(s.tool) + '</code>'); row('Decision', s.approved ? (s.changed ? 'Approved as changed' : 'Approved') : 'Denied'); }
    if (s.by) row('By', escapeHtml(s.by));
    if (s.type === 'start') row('Started by', escapeHtml(RUN_SOURCES[t.source] || t.source || ''));
    row('At', escapeHtml(new Date(s.at).toLocaleTimeString()) + ' <span class="hint">+' + escapeHtml(traceMs(Date.parse(s.at) - start)) + '</span>');
    if (s.duration_ms != null || s.type === 'model_call' || s.type === 'tool_call') row('Duration', escapeHtml(traceMs(s.duration_ms)));
    if (s.type === 'end') row('Total', escapeHtml(traceMs(t.duration_ms)));
    var io = '';
    if (s.type === 'start') io = block('Input', s.input && Object.keys(s.input.params || {}).length ? s.input.params : null) + block('Message', s.input && s.input.message);
    else if (s.type === 'prompt') io = block('Input', s.input) + (s.system ? '<details class="wf-tv-block"><summary>System prompt</summary><pre class="wf-tv-pre">' + escapeHtml(s.system) + '</pre></details>' : '');
    else if (s.type === 'model_call' || s.type === 'tool_call') io = block('Input', s.input) + block('Output', s.output);
    else if (s.type === 'decision') io = block('Reason', s.reason);
    else if (s.type === 'answer') io = block('Question', s.question) + block('Answer', s.answer);
    else if (s.type === 'feedback') io = block('Note', s.note);
    else if (s.type === 'end') io = block('Output', s.output);
    return '<div class="wf-tl-detail-head"><span class="wf-tl-kind">' + kind[0] + '</span><strong>' + escapeHtml(stepTitle(s, t)) + '</strong></div>' +
      (s.error ? '<div class="wf-xd-error" role="alert"><strong>Error</strong> ' + escapeHtml(s.error) + '</div>' : '') +
      '<dl class="wf-xd-grid">' + rows.join('') + '</dl>' + io;
  }

  // Save as eval case, from a trace: the run becomes a test its workflow
  // must keep passing; then success criteria suggested from what people
  // corrected in it, each added to the workflow's draft.
  function wireTraceEvalCase(name, card, box, t) {
    var btn = box.querySelector('.wf-trace-save-case');
    if (!btn) return;
    var id = card.dataset.workflow;
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(id);
    var panel = box.querySelector('.wf-trace-case');
    var w = workflowsById[id];
    var saved = function () { btn.disabled = true; btn.textContent = 'Saved as an eval case'; };
    if (w && w.evals && (w.evals.cases || []).some(function (k) { return k.fromRun === t.execution_id; })) saved();
    btn.addEventListener('click', function () {
      btn.disabled = true;
      panel.hidden = false;
      panel.innerHTML = '<p class="hint" style="margin:0">Saving' + String.fromCharCode(8230) + '</p>';
      fetchJsonRetryOnce(base + '/evals/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: t.execution_id }) }).then(function (r) {
        if (!r.ok) { btn.disabled = false; panel.innerHTML = '<p class="error">' + escapeHtml(r.body.error || 'Could not save it') + '</p>'; return; }
        saved();
        if (w && w.evals) w.evals.cases = (w.evals.cases || []).concat([{ fromRun: t.execution_id }]);
        var have = (r.body.criteria || []).map(function (k) { return k.text; });
        var fresh = (r.body.suggestions || []).filter(function (x) { return have.indexOf(x.text) === -1; });
        panel.innerHTML = '<p style="margin:0"><span class="le-pill good">Saved</span> It' + RSQ + 's one of this workflow' + RSQ + 's eval cases now. <a href="#" class="wf-link wf-trace-evals">See them in Evaluation</a></p>' +
          (fresh.length ? '<h4 class="wf-sub">Add to its success criteria?</h4><p class="hint" style="margin:0">From what people corrected in this run. Each goes into the draft; publish it to judge every eval case on it.</p>' +
            '<ul class="wf-trace-suggest">' + fresh.map(function (x, i) { return '<li><span>' + escapeHtml(x.text) + '</span><button type="button" class="wf-link" data-suggest="' + i + '">Add to draft</button></li>'; }).join('') + '</ul>' : '');
        panel.querySelector('.wf-trace-evals').addEventListener('click', function (ev) { ev.preventDefault(); showWorkflowTab(card, 'evaluation'); });
        panel.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-suggest]');
          if (!b) return;
          b.disabled = true;
          var x = fresh[Number(b.getAttribute('data-suggest'))];
          // The criteria as drafted, else as published, with this one added.
          fetchJsonRetryOnce(base + '/draft').then(function (d) {
            var list = d.ok && d.body.draft && d.body.draft.criteria ? d.body.draft.criteria : ((workflowsById[id] && workflowsById[id].evals && workflowsById[id].evals.criteria) || []);
            list = list.map(function (k) { return { text: k.text, kind: k.kind, value: k.value }; }).concat([{ text: x.text, kind: x.kind }]);
            return fetchJsonRetryOnce(base + '/draft/criteria', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ criteria: list }) });
          }).then(function (p) {
            if (!p.ok) { b.disabled = false; b.textContent = p.body.error || 'Could not add it'; return; }
            b.textContent = 'Added to the draft';
            refreshDraft(name, card);
          });
        });
      });
    });
  }

  function wireTrace(name, card, box, t) {
    var id = card.dataset.workflow;
    box.querySelector('.wf-trace-back').addEventListener('click', function () { closeRunTrace(card); });
    if (!t) return;
    wireTraceEvalCase(name, card, box, t);
    var steps = traceSteps(t);
    var detailBox = box.querySelector('.wf-tl-detail');
    var buttons = box.querySelectorAll('.wf-tl-step');
    function select(i) {
      for (var k = 0; k < buttons.length; k++) buttons[k].setAttribute('aria-pressed', String(k === i));
      detailBox.innerHTML = stepDetailHtml(steps[i], t);
      if (openTraces[id]) openTraces[id].step = i;
    }
    box.querySelector('.wf-tl').addEventListener('click', function (ev) {
      var b = ev.target.closest('.wf-tl-step');
      if (b) select(Number(b.getAttribute('data-step')));
    });
    // The step open before a redraw, else the first that failed, else the start.
    var kept = openTraces[id] && openTraces[id].step;
    var failed = steps.map(stepFailed).indexOf(true);
    select(kept != null && kept < steps.length ? kept : failed >= 0 ? failed : 0);
    var v = box.querySelector('.wf-xd-version');
    if (v) v.addEventListener('click', function (ev) { ev.preventDefault(); showWorkflowTab(card, 'versions'); });
  }

  // The Evaluation tab: the success criteria, the eval cases (saved, then
  // suggested from real runs), and Evaluate.
  // A workflow's draft over its live settings, for the tabs that draft:
  // its success criteria and where messages go (see workflowDraftBannerHtml).
  function draftedCriteria(w) {
    return w.draft && w.draft.criteria ? w.draft.criteria : null;
  }
  function draftedDelivery(w) {
    return w.draft && w.draft.messages ? (w.draft.messages.delivery || {}) : null;
  }
  function draftNoteHtml(what) {
    return '<p class="wf-draft-note"><span class="le-pill warn">Draft</span> ' + what + ' Publish the draft to make ' + (what.indexOf('These') === 0 ? 'them' : 'it') + ' live.</p>';
  }

  function workflowEvaluationHtml(w) {
    var live = w.evals || { cases: [], criteria: [], rounds: [] };
    var evals = draftedCriteria(w) ? Object.assign({}, live, { criteria: draftedCriteria(w) }) : live;
    var criteria = evals.criteria && evals.criteria.length ? evals.criteria : [REFERENCE_CRIT];
    var round = evals.rounds[0];
    var checked = round && round.passRates;
    // Each criterion, with how often the latest round passed it.
    var rateOf = {};
    (checked ? round.passRates : []).forEach(function (r) { rateOf[r.criterionId] = r; });
    var critList = criteria.map(function (c) {
      var r = rateOf[c.id];
      var pill = !r || !r.total ? '' : '<span class="le-pill ' + (r.passed === r.total ? 'good' : r.passed * 2 >= r.total ? 'ask' : 'bad') + ' wf-crit-rate">' + r.passed + ' / ' + r.total + '</span>';
      return '<li class="wf-crit"><span><strong>' + escapeHtml(c.text) + '</strong><br><span class="wf-crit-kind">' + escapeHtml(critKindText(c)) + '</span></span>' + pill + '</li>';
    }).join('');
    var critSection = '<h4 class="wf-sub">Success criteria</h4>' +
      (draftedCriteria(w) ? draftNoteHtml('These success criteria are in the draft: evaluations use the published ones until then.') : '') +
      '<p class="hint" style="margin:0">' + (evals.criteria && evals.criteria.length
        ? 'What every good result must get right. Each eval case is checked against every criterion, yes or no.'
        : 'What every good result must get right. None set yet, so each eval case is only compared with its good result. Add the criteria that matter, or have them suggested from its instructions.') + '</p>' +
      '<ul class="wf-crits">' + critList + '</ul>' +
      '<div class="wf-crit-bar"><button type="button" class="wf-crit-edit">' + (evals.criteria && evals.criteria.length ? 'Edit the success criteria' : 'Add success criteria') + '</button></div>' +
      '<div class="wf-crit-form" hidden>' +
        '<div class="wf-crit-rows">' + (evals.criteria && evals.criteria.length ? evals.criteria : []).map(critRowHtml).join('') + '</div>' +
        '<div class="wf-crit-bar"><button type="button" class="plain wf-crit-add">+ Add a criterion</button><button type="button" class="plain wf-crit-draft">Suggest from its instructions</button>' +
          '<span style="flex:1"></span><button type="button" class="plain wf-crit-cancel">Cancel</button><button type="button" class="wf-crit-save">Save as draft</button><button type="button" class="primary wf-crit-save wf-crit-publish" data-publish-offer hidden>Save and publish</button></div>' +
        '<span class="hint wf-crit-status"></span>' +
      '</div>';
    var latest = {};
    (round ? round.cases : []).forEach(function (c) { latest[c.caseId] = c; });
    var critName = {};
    ((round && round.criteria) || criteria).forEach(function (c) { critName[c.id] = c.text; });
    var running = evals.running;
    var cases = evals.cases.map(function (c, i) {
      var last = latest[c.id];
      var values = Object.keys(c.params || {}).map(function (k) { var v = String(c.params[k]); return escapeHtml(k) + ': ' + escapeHtml(v.length > 60 ? v.slice(0, 60) + String.fromCharCode(8230) : v); }).join(DOT);
      var fails = last && last.checks ? last.checks.filter(function (x) { return !x.pass; }) : [];
      var pill = !last ? ''
        : last.checks ? (fails.length ? '<span class="le-pill bad">' + fails.length + ' of ' + last.checks.length + ' criteria missed</span>' : '<span class="le-pill good">Passed all ' + last.checks.length + '</span>')
        : typeof last.score === 'number' ? '<span class="le-pill ' + (last.score >= 4 ? 'good' : last.score === 3 ? 'ask' : 'bad') + '">' + last.score + ' / 5</span>' : '<span class="le-pill bad">Not scored</span>';
      var why = !last ? ''
        : last.checks ? (fails.length ? '<ul class="wf-case-fails">' + fails.map(function (x) { return '<li><strong>' + escapeHtml(critName[x.criterionId] || x.criterionId) + '</strong>' + (x.reason ? ': ' + escapeHtml(x.reason) : '') + '</li>'; }).join('') + '</ul>' : '')
        : '<p class="hint" style="margin:0">' + escapeHtml(last.reason || last.error || '') + '</p>';
      // The calls the test didn't make: what it would have done.
      var standIns = last && last.standIns && last.standIns.length
        ? '<p class="wf-case-standins">Not made in the test: ' + last.standIns.map(function (x) {
            var shown = JSON.stringify(x.input);
            return '<code title="' + escapeHtml(shown) + '">' + escapeHtml(x.tool) + '</code>' + (x.replayed ? ' <span class="hint">(reply from its run)</span>' : '');
          }).join(', ') + '</p>'
        : '';
      return '<li class="wf-case" data-case="' + escapeHtml(c.id) + '"><div class="wf-case-head"><strong>Case ' + (i + 1) + '</strong>' + pill +
        '<span class="hint">' + (values || 'no inputs') + '</span><button type="button" class="wf-link wf-case-remove">Remove</button></div>' +
        why + standIns +
        '<details><summary>Good result' + (c.reference ? '' : ' (none)') + (last && last.result ? ' and its latest result' : '') + '</summary>' +
          '<textarea class="wf-case-ref" aria-label="Good result for case ' + (i + 1) + '" placeholder="Optional: what a good result says, to compare against">' + escapeHtml(c.reference || '') + '</textarea>' +
          '<div class="wf-case-actions"><button type="button" class="wf-case-save">Save good result</button></div>' +
          (last && last.result ? '<div class="workflow-run-entry-label">Latest result' + (last.tools && last.tools.length ? ' <span class="hint">(called ' + escapeHtml(last.tools.join(', ')) + ')</span>' : '') + '</div><div class="workflow-steps-text">' + escapeHtml(last.result) + '</div>' : '') +
        '</details></li>';
    }).join('');
    var lastLine = !round ? ''
      : '<p class="wf-eval-last"><strong>Last evaluation: ' + escapeHtml(new Date(round.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + ((round.workflowVersion || round.briefVersion) ? ', workflow v' + (round.workflowVersion || round.briefVersion) : '') + '</strong>' +
        (checked ? String.fromCharCode(8212) + ' ' + round.allPassed + ' of ' + round.cases.length + ' cases met every success criterion.' : '') +
        ' <details class="wf-eval-details"><summary>Details</summary>Ran with ' + escapeHtml(round.model) + DOT + 'judged by ' + escapeHtml(round.judge) + DOT + escapeHtml(new Date(round.at).toLocaleString()) + '</details></p>';
    return '<section class="wf-section">' + critSection + '</section>' +
      '<section class="wf-section"><h4 class="wf-sub">Eval cases' + (evals.cases.length ? ' (' + evals.cases.length + ')' : '') + '</h4>' +
        '<p class="hint" style="margin:0">Real runs saved to check every change against.</p>' +
        (cases ? '<ul class="wf-cases">' + cases + '</ul>' : '<p class="hint" style="margin:0">None yet: add suggested ones below, or save any run from its trace (Activity).</p>') +
        '<div class="wf-evals-bar"><button type="button" class="wf-evals-run"' + (!evals.cases.length || running ? ' disabled' : '') + '>' + (running ? 'Evaluating ' + running.done + ' of ' + running.total + String.fromCharCode(8230) : 'Evaluate') + '</button>' +
          '<span class="hint">Runs every eval case again with the current instructions and checks each result against the success criteria. Nothing is sent, refunded or submitted.</span></div>' +
        lastLine + '</section>' +
      (workflowPageId ? '<section class="wf-section"><h4 class="wf-sub">Suggested eval cases</h4><div class="wf-candidates"><p class="hint" style="margin:0">Looking through its runs' + String.fromCharCode(8230) + '</p></div></section>' : '');
  }

  // Worth testing: runs from the last 30 days that would make good eval
  // cases, each with why (a person denied or changed what it did, a bad
  // result, a question it asked, a failure, or a typical good run).
  var WHY = { denied: ['bad', 'Denied'], changed: ['ask', 'Changed'], bad: ['bad', 'Bad result'], asked: ['ask', 'Asked'], failed: ['bad', 'Failed'], typical: ['good', 'Typical'] };
  function loadCandidates(name, card, base) {
    var box = card.querySelector('.wf-candidates');
    if (!box) return;
    fetch(base + '/evals/candidates', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error(b.error || 'HTTP ' + r.status); }); })
      .then(function (data) {
        var list = data.candidates || [];
        if (!list.length) { box.innerHTML = '<p class="hint" style="margin:0">Nothing new to suggest from the last 30 days.</p>'; return; }
        box.innerHTML = '<p class="hint" style="margin:0 0 6px">Runs from the last 30 days worth adding, best first: where a person denied or changed what it did, a bad result, a question it asked, or a typical good run. Open one' + RSQ + 's trace to read it in full first.</p><ul class="wf-cand-list">' + list.map(function (c) {
          var why = WHY[c.why] || ['', c.why];
          return '<li><span class="le-pill ' + why[0] + '">' + why[1] + '</span>' +
            '<span class="wf-cand-text"><strong>' + escapeHtml(c.detail) + '</strong><span class="hint">' + escapeHtml(new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + (c.inputs ? DOT + escapeHtml(c.inputs) : '') + '</span></span>' +
            '<a class="wf-link wf-cand-trace" href="' + workflowPageHref(name, card.dataset.workflow, 'activity') + '&run=' + encodeURIComponent(c.runId) + '" data-run="' + escapeHtml(c.runId) + '">Open trace</a>' +
            '<button type="button" class="wf-link wf-save-case" data-run="' + escapeHtml(c.runId) + '">Add as eval case</button></li>';
        }).join('') + '</ul>';
      })
      .catch(function (err) { box.innerHTML = '<p class="error">Could not look through its runs: ' + escapeHtml(err.message) + '</p>'; });
    // Open trace: the run's trace on the Activity tab, without leaving.
    box.addEventListener('click', function (ev) {
      var a = ev.target.closest('.wf-cand-trace');
      if (!a || !card.querySelector('.wf-trace') || ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      showWorkflowTab(card, 'activity');
      openRunTrace(name, card, a.getAttribute('data-run'));
      card.scrollIntoView({ block: 'start' });
    });
  }

  // A run's evidence line: its feedback, and saving it as an eval case.
  function runEvidenceHtml(w, r) {
    var parts = [];
    if (r.feedback) {
      var fb = r.feedback;
      parts.push('<span class="hint">Feedback: ' + [fb.verdict ? escapeHtml(fb.verdict) : '', fb.edit ? (fb.edit === 'none' ? 'used unedited' : escapeHtml(fb.edit) + ' edits') : '', fb.note ? escapeHtml(fb.note) : ''].filter(Boolean).join(DOT) + '</span>');
    }
    if ((r.decisions || []).length) parts.push('<span class="hint">' + r.decisions.map(function (d) { return escapeHtml(d.tool) + (d.approved ? ' approved' : ' refused'); }).join(DOT) + '</span>');
    var saved = ((w.evals && w.evals.cases) || []).some(function (c) { return c.fromRun === r.run_id; });
    if (saved) parts.push('<span class="hint">An eval case</span>');
    return parts.length ? '<div class="wf-run-evidence">' + parts.join('') + '</div>' : '';
  }

  function renderWorkflowsHtml(name, workflows) {
    if (workflowPageId) {
      var page = workflows.filter(function (x) { return x.id === workflowPageId; });
      if (!page.length) return '<div class="wf-empty-state"><strong>No workflow ' + escapeHtml(workflowPageId) + ' on this agent</strong><p>It may have been removed.</p><a class="wf-new-btn" href="/agents/config?agent=' + encodeURIComponent(name) + '&tab=workflows">See its workflows</a></div>';
      workflows = page;
    }
    if (!workflows.length) {
      return '<div class="wf-empty-state"><strong>No workflows yet</strong><p>Say what this agent should do in a sentence or two, or start from an example, and it' + String.fromCharCode(8217) + 's planned and set up for you.</p><a class="wf-new-btn" href="/workflows/new?agent=' + encodeURIComponent(name) + '">Build a workflow</a></div>';
    }
    // Those that need someone first: waiting for a decision, then failed.
    var rank = function (w) { return workflowNeedsDecision(w) ? 0 : (workflowLastRun(w) || {}).status === 'error' ? 1 : 2; };
    var sorted = workflows.map(function (w, i) { return { w: w, i: i }; }).sort(function (a, b) { return rank(a.w) - rank(b.w) || a.i - b.i; }).map(function (x) { return x.w; });
    return '<div class="wf-list-box' + (workflowPageId ? ' wf-page-box' : '') + '">' + sorted.map(function (w) {
      var paramNames = Object.keys(w.parameters || {});
      var params = paramNames.map(function (p) {
        var spec = w.parameters[p];
        // One line to start, growing as an email or a thread is pasted in
        // (wireWorkflowCard sizes it).
        return '<label class="workflow-param">' + escapeHtml(p) + (spec.required ? '' : ' <span class="hint">(optional)</span>') +
          inputControlHtml(p, spec, spec.required) + '</label>';
      }).join('');
      // Recent runs, one line each, opening the case (where everything
      // about it is).
      var runs = (w.recentRuns || []).map(function (r) {
        var pill = r.status === 'done' ? '<span class="le-pill good">Done</span>'
          : r.status === 'error' ? '<span class="le-pill bad">Failed</span>'
          : r.status === 'awaiting_approval' ? '<span class="le-pill ask">Waiting</span>'
          : '<span class="le-pill accent">Running</span>';
        var values = r.params ? Object.keys(r.params).map(function (k) { return k + ': ' + r.params[k]; }).join(DOT) : '';
        var outcome = r.status === 'error' ? (r.error || '') : (r.result || '');
        var line = (values ? values + DOT : '') + outcome;
        return '<li class="wf-run-line">' + pill +
          '<a class="wf-run-link" href="' + inboxHref(r.run_id) + '"><span class="wf-run-when">' + escapeHtml(new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</span>' +
          '<span class="wf-run-text">' + escapeHtml(line.length > 160 ? line.slice(0, 160) + String.fromCharCode(8230) : line) + '</span></a>' +
          (r.versions && (r.versions.workflow || r.versions.brief) ? '<span class="hint">v' + (r.versions.workflow || r.versions.brief) + '</span>' : '') +
          runEvidenceHtml(w, r) + '</li>';
      }).join('');
      var last = workflowLastRun(w);
      var tab = workflowTabs[w.id] || 'activity';
      var open = openWorkflowId === w.id;
      var panel = function (key, html) { return '<div class="wf-panel" data-panel="' + key + '"' + (tab === key ? '' : ' hidden') + '>' + html + '</div>'; };
      var tabBtn = function (key, label) { return '<button type="button" role="tab" class="wf-tab" data-tab="' + key + '" aria-selected="' + (tab === key) + '">' + label + '</button>'; };
      if (workflowPageId) {
        var agentLabel = currentCfg && currentCfg.displayName ? currentCfg.displayName : name;
        document.title = w.title + ' ' + String.fromCharCode(183) + ' ' + agentLabel;
        return '<article class="workflow-card wf-page is-open" data-workflow="' + escapeHtml(w.id) + '">' +
          '<header class="wf-page-head">' +
            // A top bar like the other pages': where you are, and Edit.
            '<div class="wf-page-crumb-row"><button type="button" class="le-menu-btn" data-le-menu aria-label="Open navigation">&#9776;</button>' +
              '<div class="le-crumb"><a href="/workflows">Workflows</a><span class="le-crumb-sep" aria-hidden="true">/</span><a href="/agents/config?agent=' + encodeURIComponent(name) + '&tab=workflows">' + escapeHtml(agentLabel) + '</a><span class="le-crumb-sep" aria-hidden="true">/</span><span class="le-crumb-here">' + escapeHtml(w.title) + '</span></div>' +
              '<span class="wf-row-actions"><button type="button" class="workflow-edit le-btn-dark">Edit workflow</button></span></div>' +
            '<div class="wf-page-hero"><h1>' + escapeHtml(w.title) + '</h1>' +
            (w.description && w.description !== w.title ? '<p class="wf-page-desc">' + escapeHtml(w.description) + '</p>' : '') +
            '<div class="wf-page-meta">' +
              '<span class="wf-page-meta-item"><span class="wf-page-meta-k">Agent</span><a href="/agents/config?agent=' + encodeURIComponent(name) + '">' + escapeHtml(agentLabel) + '</a></span>' +
              '<span class="wf-page-meta-item"><span class="wf-page-meta-k">Starts</span><span class="wf-page-starts">' + workflowStartsSummary(w) + '</span></span>' +
              '<span class="wf-page-meta-item"><span class="wf-page-last">' + workflowLastRunHtml(last) + '</span></span>' +
              // Filled by loadWorkflowVersions.
              '<span class="wf-page-meta-item wf-page-version-item" hidden><span class="wf-page-meta-k">Version</span><span class="wf-page-version"></span></span>' +
              (w.jobs && w.jobs.length ? '<span class="wf-page-meta-item"><span class="wf-page-meta-k">For goal</span><span>' + w.jobs.map(function (j) { return '<a href="/goals?goal=' + encodeURIComponent(j.id) + '">' + escapeHtml(j.title) + '</a>'; }).join(', ') + '</span></span>' : '') +
            '</div></div>' +
          '</header>' +
          workflowDraftBannerHtml(w) +
          '<div class="wf-row-body wf-page-body">' +
            '<div class="wf-tabs" role="tablist">' + tabBtn('activity', 'Activity') + tabBtn('brief', 'Prompt') + tabBtn('triggers', 'Triggers') + tabBtn('messages', 'Messaging') + tabBtn('feedback', 'Feedback') + tabBtn('evaluation', 'Evaluation') + tabBtn('contract', 'Contract') + tabBtn('versions', 'Versions') + '</div>' +
            panel('brief', workflowBriefHtml(w)) +
            panel('activity', workflowActivityHtml(w, runs, name)) +
            panel('evaluation', workflowEvaluationHtml(w)) +
            panel('triggers', workflowTriggersHtml(w, name, params)) +
            panel('messages', workflowMessagesHtml(w, name)) +
            panel('contract', workflowContractHtml(w, name, params)) +
            panel('versions', workflowVersionsHtml()) +
            panel('feedback', workflowFeedbackHtml()) +
            '<div class="hint workflow-result"></div>' +
            '<div class="wf-row-foot"><span class="hint">ID <code>' + escapeHtml(w.id) + '</code>, used by the API, schedules and webhooks</span><button type="button" class="wf-remove workflow-forget" title="Its schedules and webhooks go; its instructions stay as a skill for Chat">Remove</button></div>' +
          '</div>' +
        '</article>';
      }
      return '<article class="workflow-card wf-row' + (open ? ' is-open' : '') + '" data-workflow="' + escapeHtml(w.id) + '">' +
        '<div class="wf-row-head" role="button" tabindex="0" aria-expanded="' + open + '">' +
          '<span class="wf-row-caret" aria-hidden="true"></span>' +
          '<div class="wf-row-main"><strong>' + escapeHtml(w.title) + '</strong>' +
            // The job(s) it does, linking back to each job's page.
            (w.jobs && w.jobs.length ? '<span class="wf-row-job">For goal: ' + w.jobs.map(function (j) { return '<a href="/goals?goal=' + encodeURIComponent(j.id) + '">' + escapeHtml(j.title) + '</a>'; }).join(', ') + '</span>' : '') + '</div>' +
          '<span class="wf-row-starts">' + workflowStartsSummary(w) + '</span>' +
          '<span class="wf-row-last">' + workflowLastRunHtml(last) + '</span>' +
          '<span class="wf-row-actions"><button type="button" class="workflow-triggers-open">Triggers</button><button type="button" class="workflow-edit">Edit</button></span>' +
        '</div>' +
        '<div class="wf-row-body"' + (open ? '' : ' hidden') + '>' +
          // What it does, in full, once it's open (the row shows just its name).
          (w.description && w.description !== w.title ? '<p class="wf-desc">' + escapeHtml(w.description) + '</p>' : '') +
          '<div class="wf-tabs" role="tablist">' + tabBtn('activity', 'Activity') + tabBtn('brief', 'Prompt') + tabBtn('triggers', 'Triggers') + tabBtn('messages', 'Messaging') + tabBtn('feedback', 'Feedback') + tabBtn('evaluation', 'Evaluation') + tabBtn('contract', 'Contract') + tabBtn('versions', 'Versions') + '</div>' +
          panel('contract', workflowContractHtml(w, name, params)) +
          panel('versions', workflowVersionsHtml()) +
          panel('feedback', workflowFeedbackHtml()) +
          panel('triggers', workflowTriggersHtml(w, name, params)) +
          panel('messages', workflowMessagesHtml(w, name)) +
          panel('brief', workflowBriefHtml(w)) +
          panel('activity', workflowActivityHtml(w, runs, name)) +
          panel('evaluation', workflowEvaluationHtml(w)) +
          '<div class="hint workflow-result"></div>' +
          '<div class="wf-row-foot"><span class="hint">Skill <code>' + escapeHtml(w.id) + '</code></span><button type="button" class="wf-remove workflow-forget" title="Its schedules and webhooks go; its instructions stay as a skill for Chat">Remove</button></div>' +
        '</div>' +
        '</article>';
    }).join('') + '</div>';
  }

  // The Overview's Workflows tile: how many, the next scheduled run, and
  // any waiting for a decision.
  function fillWorkflowsCard(workflows) {
    var value = detail.querySelector('#ovWorkflowsValue');
    var detailEl = detail.querySelector('#ovWorkflowsDetail');
    if (!value || !detailEl) return;
    value.textContent = String(workflows.length);
    var next = null;
    var waiting = 0;
    workflows.forEach(function (w) {
      (w.schedules || []).forEach(function (x) {
        if (x.waiting) waiting++;
        if (x.status === 'scheduled' && x.nextRunAt && (!next || x.nextRunAt < next)) next = x.nextRunAt;
      });
      (w.recentRuns || []).forEach(function (r) { if (r.status === 'awaiting_approval') waiting++; });
    });
    var parts = [];
    if (waiting) parts.push(waiting + ' waiting for a decision');
    if (next) parts.push('next run ' + new Date(next).toLocaleString());
    detailEl.textContent = parts.join(' \u00b7 ') || (workflows.length ? 'Run by hand, by an app or a webhook' : 'Build a workflow for this agent');
  }

  var workflowsRefreshTimer = null;
  // Set by a workflow's "Add a schedule", for the Schedules tab's form.
  var pendingScheduleWorkflow = null;
  // Set by a workflow's Edit on the Skills list: the workflow to open in
  // its editor once the Workflows tab has drawn it.
  var pendingWorkflowEdit = null;

  function openPendingWorkflowEdit() {
    if (!pendingWorkflowEdit) return;
    var card = detail.querySelector('.workflow-card[data-workflow="' + CSS.escape(pendingWorkflowEdit) + '"]');
    if (!card) return;
    pendingWorkflowEdit = null;
    openWorkflowEditor(currentName, card);
    card.scrollIntoView({ block: 'start' });
  }

  // Set by a schedule on a workflow card (or a #schedule-<id> link): the
  // Schedules tab's row to show.
  var pendingScheduleFocus = /^#schedule-/.test(location.hash) ? location.hash.slice('#schedule-'.length) : null;

  // Scrolls to that row and marks it for a moment, once the tab has drawn
  // it (it may still be loading).
  function focusScheduleRow(tries) {
    if (!pendingScheduleFocus) return;
    var row = detail.querySelector('#schedule-' + CSS.escape(pendingScheduleFocus));
    if (!row) {
      if ((tries || 0) < 40) setTimeout(function () { focusScheduleRow((tries || 0) + 1); }, 150);
      return;
    }
    pendingScheduleFocus = null;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('schedule-focus');
    setTimeout(function () { row.classList.remove('schedule-focus'); }, 2500);
  }
  var workflowsById = {};
  // Set while a workflow's editor is open, so the running-run refresh
  // doesn't redraw the card under someone typing.
  var workflowEditing = false;
  // Whether redrawing the cards now would lose something: a dialog open,
  // or a webhook secret or a run's values being typed.
  function workflowInputInUse() {
    if (document.querySelector('dialog[open]')) return true;
    var inputs = detail.querySelectorAll('.workflow-hooks input, .workflow-params textarea, .workflow-params input');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].value || inputs[i] === document.activeElement) return true;
    return false;
  }

  function loadWorkflowsSection(name) {
    var el = detail.querySelector('#workflowsContent');
    if (!el) return;
    // Keep the sidebar's workflow list in step (running or pending).
    if (window.leShell && window.leShell.reloadWorkflows) window.leShell.reloadWorkflows();
    if (workflowsRefreshTimer) { clearTimeout(workflowsRefreshTimer); workflowsRefreshTimer = null; }
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/workflows').then(function (r) {
      if (currentName !== name) return;
      if (!r.ok) { el.innerHTML = '<p class="error">Could not load workflows: ' + escapeHtml(r.body.error || 'unknown error') + '</p>'; return; }
      var workflows = r.body.workflows || [];
      workflowsMeta = { policies: r.body.policies || '', agentModel: r.body.agentModel || '', messaging: r.body.messaging || null, agentTools: r.body.agentTools || null, limits: r.body.limits || null };
      fillWorkflowsCard(workflows);
      leShell.setCount('workflows', workflows.length);
      workflowsById = {};
      workflows.forEach(function (w) { workflowsById[w.id] = w; });
      el.innerHTML = renderWorkflowsHtml(name, workflows);
      var cards = el.querySelectorAll('.workflow-card');
      // Each card lists its webhooks as it's wired, a waiting one's setup
      // steps included.
      for (var i = 0; i < cards.length; i++) wireWorkflowCard(name, cards[i]);
      openPendingWorkflowEdit();
      // Keep a running run's status current while the Overview is open.
      var running = workflows.some(function (w) { return (w.recentRuns || []).some(function (x) { return x.status === 'running'; }) || (w.evals && w.evals.running); });
      if (running && currentTab === 'workflows') workflowsRefreshTimer = setTimeout(function () { if (!workflowEditing && !workflowInputInUse()) loadWorkflowsSection(name); }, 3000);
    });
  }

  // ---- An input's type (core/input-schema.ts), as the editor offers it:
  // a type, or text with a format. "" is plain text.
  var INPUT_KINDS = [['', 'Text'], ['string:email', 'Email'], ['string:date', 'Date'], ['string:uri', 'Link'], ['number', 'Number'], ['integer', 'Whole number'], ['boolean', 'Yes or no'], ['array', 'List (JSON)'], ['object', 'Object (JSON)']];
  function inputKindOf(spec) {
    if (!spec || !spec.type || spec.type === 'string') return spec && spec.format ? 'string:' + spec.format : '';
    return spec.type;
  }
  // An input's type and limits in words, for the contract.
  function inputTypeText(spec) {
    var kind = inputKindOf(spec);
    var label = INPUT_KINDS.filter(function (k) { return k[0] === kind; })[0];
    var parts = [];
    if (kind) parts.push(label ? label[1].toLowerCase() : kind);
    if (spec.enum) parts.push('one of ' + spec.enum.join(', '));
    if (spec.minimum != null) parts.push('at least ' + spec.minimum);
    if (spec.maximum != null) parts.push('at most ' + spec.maximum);
    if (spec.pattern) parts.push('matching ' + spec.pattern);
    if (spec.default !== undefined) parts.push('default ' + (typeof spec.default === 'string' ? spec.default : JSON.stringify(spec.default)));
    return parts.join(', ');
  }
  // The field a run's value is typed into: a choice for allowed values or
  // yes/no, a number or a date picker, else a box that grows.
  function inputControlHtml(fieldName, spec, required) {
    var req = required ? ' required' : '';
    var ph = escapeHtml(spec.description || '');
    var dflt = spec.default !== undefined ? (typeof spec.default === 'string' ? spec.default : JSON.stringify(spec.default)) : '';
    var opt = function (v, label, sel) { return '<option value="' + escapeHtml(v) + '"' + (sel ? ' selected' : '') + '>' + escapeHtml(label) + '</option>'; };
    if (spec.enum && spec.enum.length) {
      return '<select name="' + escapeHtml(fieldName) + '"' + req + '>' + opt('', required ? 'Choose' + String.fromCharCode(8230) : '(none)', !dflt) +
        spec.enum.map(function (v) { return opt(String(v), String(v), String(v) === dflt); }).join('') + '</select>';
    }
    if (spec.type === 'boolean') return '<select name="' + escapeHtml(fieldName) + '"' + req + '>' + opt('', required ? 'Choose' + String.fromCharCode(8230) : '(none)', !dflt) + opt('true', 'Yes', dflt === 'true') + opt('false', 'No', dflt === 'false') + '</select>';
    if (spec.type === 'number' || spec.type === 'integer') return '<input type="number" name="' + escapeHtml(fieldName) + '"' + req + (spec.type === 'integer' ? ' step="1"' : ' step="any"') + (spec.minimum != null ? ' min="' + spec.minimum + '"' : '') + (spec.maximum != null ? ' max="' + spec.maximum + '"' : '') + ' placeholder="' + ph + '" value="' + escapeHtml(dflt) + '">';
    if (spec.format === 'date') return '<input type="date" name="' + escapeHtml(fieldName) + '"' + req + ' value="' + escapeHtml(dflt) + '">';
    return '<textarea rows="1" name="' + escapeHtml(fieldName) + '"' + req + ' placeholder="' + ph + '">' + escapeHtml(dflt) + '</textarea>';
  }

  // ---- The workflow editor: its title, its instructions (the skill body)
  // and the values a run is given. What starts it is on the card.
  function workflowParamRowHtml(pname, spec) {
    var kind = inputKindOf(spec);
    var dflt = spec && spec.default !== undefined ? (typeof spec.default === 'string' ? spec.default : JSON.stringify(spec.default)) : '';
    // Limits the editor has no field for (a pattern, a minimum…), kept as
    // they are when the row is saved.
    var kept = {};
    ['pattern', 'minimum', 'maximum', 'minLength', 'maxLength'].forEach(function (k) { if (spec && spec[k] !== undefined) kept[k] = spec[k]; });
    return '<div class="workflow-param-row" data-kept="' + escapeHtml(JSON.stringify(kept)) + '">' +
      '<input class="wp-name" aria-label="Parameter name" placeholder="order_number" value="' + escapeHtml(pname || '') + '">' +
      '<input class="wp-desc" aria-label="What it is" placeholder="What it is, e.g. The order to check" value="' + escapeHtml((spec && spec.description) || '') + '">' +
      '<select class="wp-type" aria-label="Type">' + INPUT_KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>' +
      '<label class="http-tool-inline-label"><input type="checkbox" class="wp-required"' + (spec && spec.required ? ' checked' : '') + '> Required</label>' +
      '<button type="button" class="delete-btn wp-remove">Remove</button>' +
      '<div class="wp-limits"><input class="wp-enum" aria-label="Allowed values" placeholder="Allowed values, comma-separated (optional)" value="' + escapeHtml(spec && spec.enum ? spec.enum.join(', ') : '') + '">' +
        '<input class="wp-default" aria-label="Default" placeholder="Default (optional)" value="' + escapeHtml(dflt) + '"></div></div>';
  }
  // A row's input, as saved: its description, whether it's required, and
  // its type, allowed values and default. The server checks them.
  function paramFromRow(row) {
    var kind = row.querySelector('.wp-type').value;
    var p = { description: row.querySelector('.wp-desc').value.trim(), required: row.querySelector('.wp-required').checked };
    if (kind.indexOf('string:') === 0) p.format = kind.slice(7);
    else if (kind) p.type = kind;
    var numeric = p.type === 'number' || p.type === 'integer';
    var allowed = row.querySelector('.wp-enum').value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    if (allowed.length) p.enum = numeric ? allowed.map(Number) : allowed;
    var d = row.querySelector('.wp-default').value.trim();
    if (d) p['default'] = d;
    // The limits it had, where they still fit its type.
    var kept = {};
    try { kept = JSON.parse(row.getAttribute('data-kept') || '{}'); } catch (e) {}
    Object.keys(kept).forEach(function (k) {
      var forNumbers = k === 'minimum' || k === 'maximum';
      if (forNumbers ? numeric : !p.type) p[k] = kept[k];
    });
    return p;
  }

  ${WORKFLOW_SECTIONS_SCRIPT}

  function workflowEditorHtml(w) {
    var rows = Object.keys(w.parameters || {}).map(function (p) { return workflowParamRowHtml(p, w.parameters[p]); }).join('');
    return '<form class="add-source workflow-editor-form">' +
      '<label>Title<input name="title" maxlength="120" value="' + escapeHtml(w.title) + '">' +
        '<span class="hint">ID: <code>' + escapeHtml(w.id) + '</code>, used by the API, schedules and webhooks; it doesn' + String.fromCharCode(8217) + 't change when you edit.</span></label>' +
      '<label>Description <span class="hint">(one line on what this workflow does; the agent uses it to recognise the workflow when you ask in Chat)</span>' +
        '<input name="description" maxlength="500" required value="' + escapeHtml(w.description) + '"></label>' +
      '<h4 class="wf-editor-part">Prompt <span class="hint">what the agent reads on every run</span></h4>' +
      '<div class="body-field"><div class="wp-instructions-head"><label for="wpInstructions">Instructions <span class="hint">(everything the agent needs for this job: what to get done, the rules it keeps, and your policies, special cases and examples. It handles each case on its own judgment, so describe the job rather than every step. Read in full on every run; $name puts in a parameter&#39;s value. Chat uses them too.)</span></label>' +
        '<button type="button" class="wp-preview">Preview</button></div>' +
        '<div class="wp-preview-box" hidden><div class="hint">What a run starts with, with sample values (not saved):</div><pre class="wp-preview-text"></pre></div>' +
        '<textarea id="wpInstructions" name="instructions" maxlength="30000" rows="12" required>' + escapeHtml(w.instructions) + '</textarea></div>' +
      '<p class="hint wp-long-note">Each run lists its inputs above the instructions, long ones like an email or a thread in their own blocks, so refer to those by name (the customer' + String.fromCharCode(8217) + 's email, above) instead of writing $name. Short ones, like an order number, can be written as $name.</p>' +
      '<div class="wp-sections"><span class="hint">Add a section:</span>' +
        workflowSectionButtonsHtml() + '</div>' +
      '<h4 class="wf-editor-part">Contract <span class="hint">what the system holds it to</span></h4>' +
      '<div class="body-field">Parameters <span class="hint">(values a run is given; apps send them as params)</span>' +
        '<div class="workflow-param-rows">' + rows + '</div>' +
        '<button type="button" class="wp-add" style="align-self:flex-start">Add parameter</button></div>' +
      '<label>Result <span class="hint">(optional: what its final reply must be, e.g. The draft only, then a line Flag: reason if a person must act. Empty: a reply in its own words.)</span>' +
        '<textarea name="output" rows="2" maxlength="2000">' + escapeHtml(w.output || '') + '</textarea></label>' +
      '<label>Output schema <span class="hint">(optional: a JSON Schema its result must match, for apps and the next workflow in a chain. Each run' + String.fromCharCode(8217) + 's result is checked; one that doesn' + String.fromCharCode(8217) + 't match is sent back to the agent to fix, twice at most, then the run fails.)</span>' +
        '<textarea name="outputSchema" class="wp-schema" rows="6" spellcheck="false" placeholder="' + escapeHtml('{ "type": "object", "properties": { "summary": { "type": "string" }, "priority": { "enum": ["low", "high"] } }, "required": ["summary", "priority"] }') + '">' + escapeHtml(w.outputSchema ? JSON.stringify(w.outputSchema, null, 2) : '') + '</textarea></label>' +
      '<div class="body-field">Model <span class="hint">(optional: a model for this workflow only; empty uses the agent' + String.fromCharCode(8217) + 's' + (workflowsMeta.agentModel ? ', ' + escapeHtml(workflowsMeta.agentModel) : '') + ')</span>' +
        '<div class="wp-model-row"><select name="modelProvider" aria-label="Provider"><option value="">The agent' + String.fromCharCode(8217) + 's model</option>' +
          ['openai', 'anthropic', 'gemini', 'deepseek', 'kimi', 'glm', 'xai', 'meta'].map(function (p) { return '<option value="' + p + '"' + (w.model && w.model.provider === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
        '</select><input name="modelName" aria-label="Model name" placeholder="e.g. gpt-6.1-sol" value="' + escapeHtml((w.model && w.model.model) || '') + '"></div></div>' +
      '<p class="hint workflow-editor-check" style="margin:0"></p>' +
      '<div class="hint workflow-editor-result"></div>' +
      // Save and publish shows once the workspace's Publishing setting is
      // known not to require review (openWorkflowEditor).
      '<label class="wp-note-field" hidden>Note <span class="hint">(optional: what changed and why, kept with the version when you publish)</span><input name="publishNote" maxlength="500" placeholder="e.g. Ask for the order number before looking it up"></label>' +
      '<div class="ed-actions"><span class="hint wp-save-hint">Runs keep using the published workflow until you publish.</span><button type="button" class="wp-cancel">Cancel</button><button type="submit" class="primary wp-save-draft">Save as draft</button><button type="submit" class="primary wp-save-publish" hidden>Save and publish</button></div></form>';
  }

  // Placeholders the instructions use that no parameter declares, and
  // declared parameters nothing uses.
  function workflowPlaceholderCheck(w, form) {
    var used = {};
    var pattern = new RegExp('[$]([a-z_][a-z0-9_]*)', 'g');
    var text = form.querySelector('[name="instructions"]').value;
    var m;
    while ((m = pattern.exec(text))) used[m[1]] = true;
    var declared = {};
    var names = form.querySelectorAll('.wp-name');
    for (var i = 0; i < names.length; i++) if (names[i].value.trim()) declared[names[i].value.trim()] = true;
    var notes = [];
    var missing = Object.keys(used).filter(function (n) { return !declared[n]; });
    var unused = Object.keys(declared).filter(function (n) { return !used[n]; });
    if (missing.length) notes.push('Uses ' + missing.map(function (n) { return '$' + n; }).join(', ') + ', which ' + (missing.length > 1 ? 'aren' : 'isn') + String.fromCharCode(8217) + 't a parameter: add ' + (missing.length > 1 ? 'them' : 'it') + ', or the text stays as written.');
    if (unused.length) notes.push(unused.join(', ') + ' ' + (unused.length > 1 ? 'aren' : 'isn') + String.fromCharCode(8217) + 't written in the instructions: each run adds ' + (unused.length > 1 ? 'them' : 'it') + ' with the inputs, above the instructions.');
    form.querySelector('.workflow-editor-check').textContent = notes.join(' ');
  }

  // A workflow with its draft's edits over it, for the editor.
  function withDraftFields(w) {
    if (!w.draft) return w;
    var f = w.draft.fields || {};
    var out = {};
    Object.keys(w).forEach(function (k) { out[k] = w[k]; });
    ['title', 'description', 'instructions', 'parameters', 'output', 'outputSchema', 'model'].forEach(function (k) {
      if (f[k] !== undefined) out[k] = f[k] === null ? undefined : f[k];
    });
    return out;
  }

  // A draft not yet published: who saved it and when, and what to do.
  function workflowDraftBannerHtml(w) {
    if (!w.draft) return '';
    var d = w.draft;
    var at = new Date(d.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<div class="wf-draft" role="status"><span class="le-pill warn">Draft</span>' +
      '<span>Not published' + (d.savedBy ? ': saved by ' + escapeHtml(d.savedBy) : ': saved') + ', ' + escapeHtml(at) + '. Runs use the published workflow until you publish it.</span>' +
      '<span class="wf-draft-actions"><button type="button" class="primary wf-draft-publish">Review and publish</button><button type="button" class="wf-draft-edit">Edit draft</button><button type="button" class="delete-btn wf-draft-discard">Discard</button></span></div>';
  }

  // Its draft's banner: review and publish, edit it, or discard it.
  function wireDraftBanner(name, card) {
    var id = card.dataset.workflow;
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(id);
    var pub = card.querySelector('.wf-draft-publish');
    if (pub) pub.addEventListener('click', function () { openPublishDialog(name, workflowsById[id]); });
    var editDraft = card.querySelector('.wf-draft-edit');
    if (editDraft) editDraft.addEventListener('click', function () { openWorkflowEditor(name, card); });
    var discard = card.querySelector('.wf-draft-discard');
    if (discard) discard.addEventListener('click', function () {
      if (discard.getAttribute('data-confirming') !== '1') { discard.setAttribute('data-confirming', '1'); discard.textContent = 'Click again to discard'; return; }
      discard.disabled = true;
      fetchJsonRetryOnce(base + '/draft', { method: 'DELETE' }).then(function () { loadWorkflowsSection(name); });
    });
  }
  // After a change made in place (a webhook's URL is on screen, so the
  // card isn't redrawn): the draft as it is now, and its banner.
  function refreshDraft(name, card) {
    var id = card.dataset.workflow;
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(id) + '/draft').then(function (r) {
      if (!r.ok || !workflowsById[id]) return;
      if (r.body.draft) workflowsById[id].draft = r.body.draft;
      else delete workflowsById[id].draft;
      var old = card.querySelector('.wf-draft');
      var html = workflowDraftBannerHtml(workflowsById[id]);
      if (old) old.outerHTML = html || '';
      else if (html) {
        var body = card.querySelector('.wf-row-body');
        if (body) body.insertAdjacentHTML('beforebegin', html);
      }
      wireDraftBanner(name, card);
    });
  }

  // Review and publish: what the draft changes in the published workflow,
  // the version it will be, a note kept with it, then Publish.
  function openPublishDialog(name, w) {
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id);
    var holder = document.createElement('div');
    holder.innerHTML = editDialogHtml('<h3>Publish changes</h3>', '<p>' + escapeHtml(w.title) + String.fromCharCode(8217) + 's draft, against the published workflow.</p>', '<div class="wf-publish"><p class="hint">Loading' + String.fromCharCode(8230) + '</p></div>');
    var dialog = holder.firstChild;
    dialog.classList.add('workflow-publish-dialog');
    document.body.appendChild(dialog);
    var body = dialog.querySelector('.wf-publish');
    var close = function () { if (dialog.open) dialog.close(); };
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.addEventListener('click', function (ev) { if (ev.target === dialog) close(); });
    dialog.querySelector('.hd-close').addEventListener('click', close);
    dialog.showModal();
    fetchJsonRetryOnce(base + '/draft', { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) { body.innerHTML = '<p class="error">' + escapeHtml(r.body.error || 'Could not load the draft') + '</p>'; return; }
      var v = r.body;
      if (!v.draft) { body.innerHTML = '<p class="hint">There' + String.fromCharCode(8217) + 's no draft: it was published or discarded.</p>'; return; }
      if (!v.changes.length) {
        body.innerHTML = '<p>The draft is the same as the published workflow: there' + String.fromCharCode(8217) + 's nothing to publish.</p><div class="ed-actions"><button type="button" class="delete-btn wf-pub-discard">Discard the draft</button></div>';
        body.querySelector('.wf-pub-discard').addEventListener('click', function () {
          fetchJsonRetryOnce(base + '/draft', { method: 'DELETE' }).then(function () { close(); loadWorkflowsSection(name); });
        });
        return;
      }
      body.innerHTML =
        '<p class="wf-pub-version">' + (v.current ? 'Publishing makes this <strong>version ' + v.next + '</strong>, replacing version ' + v.current + ' for every run from now on.' : 'Publishing makes this the version every run uses from now on.') + '</p>' +
        (v.stale ? '<p class="wf-pub-stale">The published workflow changed since this draft began (it was version ' + v.draft.basedOn + '). Publishing replaces those changes with the draft' + String.fromCharCode(8217) + 's: check below.</p>' : '') +
        '<h4>What' + String.fromCharCode(8217) + 's changed</h4>' + changeDetailsHtml({ changes: v.changes }) +
        '<label>Note <span class="hint">(optional: what changed and why, kept with the version)</span><textarea class="wf-pub-note" rows="2" maxlength="500" placeholder="e.g. Ask for the order number before looking it up">' + (v.draft.restoredFrom ? 'Restored version ' + v.draft.restoredFrom : '') + '</textarea></label>' +
        '<div class="ed-actions"><span class="hint wf-pub-result" role="status"></span><button type="button" class="wf-pub-cancel">Cancel</button><button type="button" class="primary wf-pub-go">Publish version ' + (v.next || '') + '</button></div>';
      body.querySelector('.wf-pub-cancel').addEventListener('click', close);
      var go = body.querySelector('.wf-pub-go');
      go.addEventListener('click', function () {
        go.disabled = true;
        var result = body.querySelector('.wf-pub-result');
        result.textContent = 'Publishing' + String.fromCharCode(8230);
        fetchJsonRetryOnce(base + '/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: body.querySelector('.wf-pub-note').value }) }).then(function (p) {
          if (!p.ok) { go.disabled = false; result.textContent = p.body.error || 'Could not publish'; return; }
          body.innerHTML = '<p class="wf-pub-done"><span class="le-pill good">Published</span> Version ' + p.body.version + ' is live: every run from now on uses it.</p>' +
            '<div class="ed-actions"><button type="button" class="primary wf-pub-close">Done</button></div>';
          body.querySelector('.wf-pub-close').addEventListener('click', close);
          loadWorkflowsSection(name);
        });
      });
    });
  }

  // Whether this workspace requires review before publishing (Settings,
  // Publishing): then changes are only saved as drafts, published from
  // Review and publish; otherwise Save and publish does both in one step.
  function reviewRequired() {
    return Promise.resolve(window.leShell && leShell.settings ? leShell.settings() : null).then(function (st) { return Boolean(st && st.requireReview); });
  }
  // Shows the one-step publish buttons in root unless review is required.
  function offerPublish(root) {
    reviewRequired().then(function (required) {
      if (required) return;
      var list = root.querySelectorAll('[data-publish-offer]');
      for (var i = 0; i < list.length; i++) list[i].hidden = false;
    });
  }
  // Publishes the draft just saved. A draft the same as the published
  // workflow isn't kept (or is discarded here): there was nothing to publish.
  function publishSavedDraft(wfBase, note) {
    return fetchJsonRetryOnce(wfBase + '/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: note || '' }) }).then(function (p) {
      if (!p.ok && p.body.code === 'no_draft') return { ok: true, body: {} };
      if (!p.ok && p.body.code === 'unchanged') return fetchJsonRetryOnce(wfBase + '/draft', { method: 'DELETE' }).then(function () { return { ok: true, body: {} }; });
      if (!p.ok) p.body.error = (p.body.error || 'Could not publish') + ' Your changes are saved as a draft.';
      return p;
    });
  }

  function openWorkflowEditor(name, card) {
    var published = workflowsById[card.dataset.workflow];
    if (!published) return;
    // With a draft, the editor picks up where it was left.
    var w = withDraftFields(published);
    workflowEditing = true;
    // In a dialog: the editor's code holds its own form, so it needn't sit
    // in the card. Closing it any way (Esc, the backdrop, x, Cancel)
    // discards the edits.
    var dialog = document.createElement('dialog');
    dialog.innerHTML = editDialogHtml('<h3>' + (published.draft ? 'Edit draft' : 'Edit workflow') + '</h3>', '<p>Its title, what it' + String.fromCharCode(8217) + 's for, what the agent follows (what to do, its rules, policies, special cases and examples) and the values each run is given.</p>', workflowEditorHtml(w));
    dialog = dialog.firstChild;
    dialog.classList.add('workflow-editor-dialog');
    document.body.appendChild(dialog);
    var form = dialog.querySelector('form');
    var rows = form.querySelector('.workflow-param-rows');
    var result = form.querySelector('.workflow-editor-result');
    function check() { workflowPlaceholderCheck(w, form); }
    function close() { workflowEditing = false; if (dialog.open) dialog.close(); }
    dialog.addEventListener('close', function () { workflowEditing = false; dialog.remove(); });
    dialog.addEventListener('click', function (ev) { if (ev.target === dialog) close(); });
    dialog.querySelector('.hd-close').addEventListener('click', close);
    dialog.showModal();
    rows.addEventListener('click', function (ev) {
      if (ev.target.classList.contains('wp-remove')) { ev.target.closest('.workflow-param-row').remove(); check(); }
    });
    form.addEventListener('input', check);
    form.querySelector('.wp-add').addEventListener('click', function () {
      rows.insertAdjacentHTML('beforeend', workflowParamRowHtml('', null));
      rows.lastElementChild.querySelector('.wp-name').focus();
    });
    form.querySelector('.wp-sections').addEventListener('click', function (ev) {
      if (addWorkflowSection(form.instructions, ev.target.dataset && ev.target.dataset.section)) check();
    });
    var previewBox = form.querySelector('.wp-preview-box');
    function showPreview() {
      var parameters = {};
      var list = rows.querySelectorAll('.workflow-param-row');
      for (var i = 0; i < list.length; i++) {
        var pname = list[i].querySelector('.wp-name').value.trim();
        if (pname) parameters[pname] = { description: list[i].querySelector('.wp-desc').value.trim() };
      }
      var out = form.querySelector('.wp-preview-text');
      previewBox.hidden = false;
      out.textContent = 'Loading' + String.fromCharCode(8230);
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id) + '/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: form.title.value, instructions: form.instructions.value, parameters: parameters, output: form.output.value, outputSchema: form.outputSchema.value }),
      }).then(function (r) {
        out.textContent = r.ok ? r.body.message : (r.body.error || 'Could not preview');
      });
    }
    form.querySelector('.wp-preview').addEventListener('click', showPreview);
    // A preview shown goes stale as the instructions change: hide it.
    form.addEventListener('input', function () { previewBox.hidden = true; });
    form.querySelector('.wp-cancel').addEventListener('click', close);
    // Save and publish, in one step, unless the workspace requires review
    // before publishing (Settings, Publishing): then a change is saved as a
    // draft and published from Review and publish.
    var draftBtn = form.querySelector('.wp-save-draft');
    var publishBtn = form.querySelector('.wp-save-publish');
    var publishing = false;
    draftBtn.addEventListener('click', function () { publishing = false; });
    publishBtn.addEventListener('click', function () { publishing = true; });
    reviewRequired().then(function (required) {
      if (required) {
        form.querySelector('.wp-save-hint').textContent = 'This workspace requires review: runs keep using the published workflow until the draft is reviewed and published.';
        return;
      }
      publishBtn.hidden = false;
      draftBtn.classList.remove('primary');
      form.querySelector('.wp-note-field').hidden = false;
      form.querySelector('.wp-save-hint').textContent = published.draft
        ? 'Publishing includes everything in the draft.'
        : 'Save as draft to publish later; until then runs keep the published version.';
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (ev.submitter) publishing = ev.submitter === publishBtn;
      var parameters = {};
      var problem = '';
      var list = rows.querySelectorAll('.workflow-param-row');
      for (var i = 0; i < list.length; i++) {
        var pname = list[i].querySelector('.wp-name').value.trim();
        if (!pname) continue;
        if (!/^[a-z_][a-z0-9_]*$/.test(pname)) { problem = 'Parameter "' + pname + '": use lowercase letters, digits and _, starting with a letter, e.g. order_number.'; break; }
        if (parameters[pname]) { problem = 'Parameter "' + pname + '" is listed twice.'; break; }
        parameters[pname] = paramFromRow(list[i]);
      }
      if (!problem && form.outputSchema.value.trim()) {
        try { JSON.parse(form.outputSchema.value); } catch (e) { problem = 'The output schema isn' + String.fromCharCode(8217) + 't valid JSON: ' + e.message; }
      }
      if (problem) { result.textContent = problem; return; }
      var wfBase = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id);
      draftBtn.disabled = publishBtn.disabled = true;
      var done = function (message) {
        draftBtn.disabled = publishBtn.disabled = false;
        if (message) { result.textContent = message; return; }
        close();
        loadWorkflowsSection(name);
      };
      result.textContent = (publishing ? 'Publishing' : 'Saving the draft') + String.fromCharCode(8230);
      fetchJsonRetryOnce(wfBase + '/draft', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: form.title.value, description: form.description.value, instructions: form.instructions.value, parameters: parameters, output: form.output.value, outputSchema: form.outputSchema.value, model: form.modelProvider.value && form.modelName.value.trim() ? { provider: form.modelProvider.value, model: form.modelName.value.trim() } : null, note: form.publishNote.value }),
      }).then(function (r) {
        if (!r.ok) return done(r.body.error || 'Could not save');
        if (!publishing) return done();
        return publishSavedDraft(wfBase, form.publishNote.value).then(function (p) { done(p.ok ? '' : p.body.error); });
      });
    });
    check();
    form.title.focus();
  }

  // ---- A workflow's webhook triggers (core/workflow-triggers.ts): secret
  // URLs an outside service posts its events to, to start a run.
  var HOOK_SENDERS = { stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', standard: 'Standard Webhooks', custom: 'your app' };
  var ARROW = String.fromCharCode(8594);
  // Where each sender takes the URL, and what it calls the secret.
  function hookSetupSteps(t) {
    var events = t.filter && t.filter.path === 'type' ? t.filter.values : (t.filter && t.filter.path === 'topic' ? t.filter.values : []);
    var pick = events.length ? ' and choose ' + (events.length === 1 ? 'the event ' : 'the events ') + events.map(function (e) { return '<code>' + escapeHtml(e) + '</code>'; }).join(', ') : '';
    switch (t.verify && t.verify.sender) {
      case 'stripe': return { where: 'In Stripe, open Developers ' + ARROW + ' Webhooks ' + ARROW + ' Add endpoint. Paste the URL' + pick + '.', secret: 'Stripe then shows a signing secret starting with <code>whsec_</code>. Paste it here:' };
      case 'github': return { where: 'In GitHub, open the repository' + String.fromCharCode(8217) + 's Settings ' + ARROW + ' Webhooks ' + ARROW + ' Add webhook. Paste the URL, set Content type to <code>application/json</code>, and make up a secret' + pick + '.', secret: 'Paste the same secret you gave GitHub:' };
      case 'shopify': return { where: 'In Shopify, open Settings ' + ARROW + ' Notifications ' + ARROW + ' Webhooks ' + ARROW + ' Create webhook. Paste the URL' + pick + '.', secret: 'Shopify shows the key its webhooks are signed with under the list of webhooks. Paste it here:' };
      case 'standard': return { where: 'In the sender' + String.fromCharCode(8217) + 's webhook settings, add an endpoint with the URL' + pick + '.', secret: 'It then shows a signing secret (often starting with <code>whsec_</code>). Paste it here:' };
      default: return { where: 'In your app' + String.fromCharCode(8217) + 's webhook settings, paste the URL' + pick + '.', secret: 'Paste the secret your app signs requests with:' };
    }
  }

  // Where a webhook stands in its workflow's draft, if anywhere.
  function hookDraftState(t) {
    var w = workflowsById[t.workflow_id];
    var hooks = w && w.draft && w.draft.webhooks;
    if (t.draft) return 'added';
    if (!hooks) return '';
    if ((hooks.remove || []).indexOf(t.trigger_id) !== -1) return 'removed';
    if (hooks.update && hooks.update[t.trigger_id]) return 'changed';
    return '';
  }
  function hookRowHtml(t, shownUrl) {
    var state = hookDraftState(t);
    if (state === 'removed') {
      return '<div class="workflow-hook" data-trigger="' + escapeHtml(t.trigger_id) + '"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline"><s><strong>' + escapeHtml(t.name) + '</strong></s>' +
        '<span class="le-pill warn">Removed in the draft</span><button type="button" class="hook-undo">Undo</button>' +
        '<span hidden><button class="hook-edit"></button><button class="hook-rotate"></button><button class="hook-delete"></button></span></div></div>';
    }
    var draftPill = state === 'added' ? ' <span class="le-pill warn">Not live until published</span>' : state === 'changed' ? ' <span class="le-pill warn">Changed in the draft</span>' : '';
    var rules = [];
    if (t.verify) rules.push(t.verify.sender === 'custom'
      ? 'checks the signature in ' + escapeHtml(t.verify.header || '(header not set yet)') + ' (' + escapeHtml(t.verify.algorithm || 'sha256') + ', ' + escapeHtml(t.verify.encoding || 'hex') + ')'
      : 'checks the ' + escapeHtml(HOOK_SENDERS[t.verify.sender] || t.verify.sender) + ' signature');
    if (t.filter) rules.push('only when ' + escapeHtml(t.filter.path) + ' is ' + t.filter.values.map(escapeHtml).join(' or '));
    if (t.mapping) rules.push(Object.keys(t.mapping).map(function (p) { return escapeHtml(p) + ' ' + String.fromCharCode(8592) + ' ' + escapeHtml(t.mapping[p]); }).join(', '));
    if (t.payload_param) rules.push('the whole payload goes to ' + escapeHtml(t.payload_param));
    if (t.chat_notice) rules.push('posts a notice to the messaging app when it starts');
    if (t.callback_url) rules.push('sends run updates to ' + escapeHtml(t.callback_url));
    if (t.decisions_to === 'callback') rules.push('approvals and questions go there too, not to the messaging app');
    // Made by the workflow planner without its secret: it turns on once
    // the sender's signing secret is added.
    var needsSecret = t.verify && !t.verify.secret_set;
    var setup = needsSecret ? hookSetupSteps(t) : null;
    return '<div class="workflow-hook" data-trigger="' + escapeHtml(t.trigger_id) + '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><strong>' + escapeHtml(t.name) + '</strong>' +
        '<code class="hint">/hooks/workflows/' + escapeHtml(t.token_hint) + '</code>' + (needsSecret ? ' <span class="le-pill warn">Needs its signing secret</span>' : t.enabled ? '' : ' <span class="le-pill">Off</span>') + draftPill + '</div>' +
      (rules.length ? '<p class="hint" style="margin:2px 0">' + rules.join(' ' + String.fromCharCode(183) + ' ') + '</p>' : '') +
      (needsSecret
        // Set up and waiting: the steps that turn it on, in order.
        ? '<ol class="hook-steps">' +
            '<li><strong>Copy its URL.</strong> ' + (shownUrl
              ? hookUrlHtml(shownUrl)
              : '<span class="hint">It was shown once, when it was made. Lost it? <em>New URL</em> below makes another.</span>') + '</li>' +
            '<li>' + setup.where + '</li>' +
            '<li>' + setup.secret +
              '<div class="workflow-param-row" style="margin:4px 0">' +
                (t.verify.sender === 'custom' && !t.verify.header ? '<input class="hook-secret-header" placeholder="Signature header, e.g. X-Signature">' : '') +
                '<input class="hook-secret-input" type="password" autocomplete="off" placeholder="' + escapeHtml(t.verify.sender === 'custom' ? 'The secret your app signs with' : 'The signing secret ' + (HOOK_SENDERS[t.verify.sender] || 'the sender') + ' shows') + '" style="flex:1">' +
                '<button type="button" class="primary hook-secret-save">Add and turn on</button></div></li>' +
          '</ol>'
        : (shownUrl ? hookUrlHtml(shownUrl) : '')) +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
        '<button type="button" class="hook-edit">Edit</button>' +
        (needsSecret ? '' : '<button type="button" class="hook-toggle">' + (t.enabled ? 'Turn off' : 'Turn on') + '</button>') +
        '<button type="button" class="hook-rotate">New URL</button>' +
        '<button type="button" class="delete-btn hook-delete">Delete</button></div></div>';
  }

  // The add-webhook dialog's form: where the events come from, which ones,
  // what the workflow gets from each, and what happens after each run.
  // With t, the same form changes that webhook (filled in by
  // fillHookForm); its URL stays the same.
  function hookFormHtml(w, t) {
    var params = Object.keys(w.parameters || {});
    var RSQ = String.fromCharCode(8217);
    var field = function (label, input, hint, attrs) {
      return '<div class="hd-field"' + (attrs || '') + '><label class="hd-label">' + label + input + '</label>' + (hint ? '<p class="hd-hint">' + hint + '</p>' : '') + '</div>';
    };
    return '<form class="hook-form hd">' +
      '<header class="hd-head"><div><h3>' + (t ? 'Edit webhook' : 'Add a webhook') + '</h3>' +
        (t
          ? '<p>Changes apply from the next call. Its URL stays the same, so nothing changes in the sending app.</p></div>'
          : '<p>Another app calls a private URL when something happens, and each call starts a run of ' + String.fromCharCode(8220) + escapeHtml(w.title || w.id) + String.fromCharCode(8221) + '.</p></div>') +
        '<button type="button" class="hd-close hook-dialog-close" aria-label="Close">&times;</button></header>' +
      '<div class="hd-body">' +
        '<section class="hd-section"><h4>Source</h4>' +
          field('Where it comes from',
            '<select name="sender"><option value="stripe">Stripe</option><option value="github">GitHub</option><option value="shopify">Shopify</option>' +
              '<option value="standard">Standard Webhooks (Clerk, Resend, OpenAI, Svix)</option><option value="custom">Another service that signs its requests</option>' +
              '<option value="">Any app: the secret URL is enough</option></select>',
            'A known sender' + RSQ + 's signature is checked, so only it can start runs.') +
          '<div class="hd-field hook-custom" hidden><span class="hd-label">How it signs</span>' +
            '<div class="hd-sig"><input name="sig_header" placeholder="Header, e.g. Linear-Signature" aria-label="Signature header">' +
              '<select name="sig_algorithm" aria-label="Hash"><option value="sha256">SHA-256</option><option value="sha1">SHA-1</option><option value="sha512">SHA-512</option></select>' +
              '<select name="sig_encoding" aria-label="Written as"><option value="hex">hex</option><option value="base64">base64</option></select></div>' +
            '<input name="sig_prefix" placeholder="Prefix before the signature, e.g. sha256= (if any)" aria-label="Signature prefix">' +
            '<p class="hd-hint">From its webhook docs: an HMAC of the request body, sent in a header.</p></div>' +
          '<div class="hd-field hook-secret" hidden><label class="hd-label">Signing secret <span class="hd-optional">(optional now)</span><input name="secret" autocomplete="off" placeholder="whsec_' + String.fromCharCode(8230) + '"></label>' +
            '<p class="hd-hint">Most senders show it only after you give them the URL. Leave it empty and add it in the next step.</p></div>' +
        '</section>' +
        '<section class="hd-section"><h4>Events</h4>' +
          '<div class="hd-field"><span class="hd-label">Run only when <span class="hd-optional">(optional)</span></span>' +
            '<div class="hd-row"><input name="filter_path" placeholder="type" aria-label="Field in the payload"><input name="filter_values" placeholder="charge.dispute.created, charge.dispute.updated" aria-label="Values that start a run"></div>' +
            '<p class="hd-hint">A field in what the app sends, and the values that start a run. Everything else is skipped.</p></div>' +
          field('Name <span class="hd-optional">(optional)</span>', '<input name="name" maxlength="80" placeholder="Stripe events">', 'Filled in from the source and events if you leave it empty.') +
        '</section>' +
        '<section class="hd-section"><h4>Workflow inputs</h4>' +
          (params.length
            ? '<div class="hd-field"><span class="hd-label">From each call</span><div class="hd-map">' +
                params.map(function (p) { return '<code>' + escapeHtml(p) + '</code><input name="map:' + escapeHtml(p) + '" placeholder="data.object.id" aria-label="Where ' + escapeHtml(p) + ' comes from">'; }).join('') + '</div>' +
                '<p class="hd-hint">A dot path into the JSON the app sends, such as <code>data.object.id</code>.</p></div>' +
              field('Or give the whole payload to', '<select name="payload_param"><option value="">(none)</option>' + params.map(function (p) { return '<option>' + escapeHtml(p) + '</option>'; }).join('') + '</select>', '')
            : '<p class="hd-hint">This workflow takes no inputs, so what the app sends isn' + RSQ + 't passed on. Add one with Edit to use it.</p>') +
        '</section>' +
        '<p class="hd-hint">Where its runs' + RSQ + ' updates, approvals and questions go is set once for the workflow, in its Messaging tab.</p>' +
      '</div>' +
      '<footer class="hd-foot"><span class="hook-form-result" role="status"></span>' +
        '<div class="hd-actions"><button type="button" class="hook-dialog-cancel">Cancel</button><button type="submit" class="primary">' + (t ? 'Save' : 'Create webhook') + '</button></div></footer>' +
      '</form>';
  }

  // A webhook's saved settings, in the form. Its secret is never shown:
  // left empty, the saved one is kept.
  function fillHookForm(form, t) {
    form.sender.value = t.verify ? t.verify.sender : '';
    if (t.verify && t.verify.sender === 'custom') {
      form.sig_header.value = t.verify.header || '';
      form.sig_algorithm.value = t.verify.algorithm || 'sha256';
      form.sig_encoding.value = t.verify.encoding || 'hex';
      form.sig_prefix.value = t.verify.prefix || '';
    }
    if (t.verify && t.verify.secret_set) {
      form.secret.placeholder = 'Saved. Leave empty to keep it';
      var hint = form.querySelector('.hook-secret .hd-hint');
      if (hint) hint.textContent = 'Paste a new one only if the sender gave you a new secret.';
    }
    if (t.filter) { form.filter_path.value = t.filter.path; form.filter_values.value = t.filter.values.join(', '); }
    form.name.value = t.name || '';
    Object.keys(t.mapping || {}).forEach(function (p) { var input = form.querySelector('input[name="map:' + p + '"]'); if (input) input.value = t.mapping[p]; });
    if (form.payload_param && t.payload_param) form.payload_param.value = t.payload_param;
  }

  // existing: a webhook to change instead of making one; onDone then gets
  // only its new settings.
  function openHookFormDialog(w, base, onCreated, existing) {
    var dialog = document.createElement('dialog');
    dialog.className = 'le-dialog hook-dialog';
    dialog.innerHTML = hookFormHtml(w, existing);
    document.body.appendChild(dialog);
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.addEventListener('click', function (ev) { if (ev.target === dialog) dialog.close(); });
    dialog.querySelector('.hook-dialog-close').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.hook-dialog-cancel').addEventListener('click', function () { dialog.close(); });

    var form = dialog.querySelector('.hook-form');
    var secretField = form.querySelector('.hook-secret');
    var customField = form.querySelector('.hook-custom');
    // The name it gets when none is given: "Stripe: charge.dispute.created".
    function defaultName() {
      var who = form.sender.value === 'custom' || !form.sender.value ? 'Webhook' : (HOOK_SENDERS[form.sender.value] || 'Webhook');
      var events = form.filter_values.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      return events.length ? who + ': ' + events.join(', ') : (who === 'Webhook' ? who : who + ' events');
    }
    function senderChanged() {
      secretField.hidden = !form.sender.value;
      customField.hidden = form.sender.value !== 'custom';
      form.name.placeholder = defaultName();
    }
    form.sender.addEventListener('change', senderChanged);
    form.filter_values.addEventListener('input', function () { form.name.placeholder = defaultName(); });
    if (existing) fillHookForm(form, existing);
    senderChanged();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var result = form.querySelector('.hook-form-result');
      var body = { name: form.name.value.trim() || defaultName() };
      if (form.sender.value) body.verify = { sender: form.sender.value, secret: form.secret.value.trim() };
      // No secret yet (most senders only show it once they have the URL):
      // made turned off, with steps to finish it. A change keeps the saved
      // secret, unless the sender changed and there is none for it.
      var keepsSecret = existing && existing.verify && existing.verify.secret_set && existing.verify.sender === form.sender.value;
      if (form.sender.value && !form.secret.value.trim()) { delete body.verify.secret; if (!keepsSecret) body.enabled = false; }
      if (form.sender.value === 'custom') {
        body.verify.header = form.sig_header.value.trim();
        body.verify.algorithm = form.sig_algorithm.value;
        body.verify.encoding = form.sig_encoding.value;
        if (form.sig_prefix.value.trim()) body.verify.prefix = form.sig_prefix.value.trim();
      }
      var values = form.filter_values.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      if (form.filter_path.value.trim() || values.length) body.filter = { path: form.filter_path.value.trim(), values: values };
      var mapping = {};
      var inputs = form.querySelectorAll('input[name^="map:"]');
      for (var j = 0; j < inputs.length; j++) if (inputs[j].value.trim()) mapping[inputs[j].name.slice(4)] = inputs[j].value.trim();
      if (Object.keys(mapping).length) body.mapping = mapping;
      if (form.payload_param && form.payload_param.value) body.payload_param = form.payload_param.value;
      // A change says what's cleared too; a setting left out is kept (its
      // own message settings, from before: the Messaging tab clears them).
      if (existing) {
        ['verify', 'filter', 'mapping'].forEach(function (k) { if (!(k in body)) body[k] = null; });
        if (!('payload_param' in body)) body.payload_param = '';
      }
      var failed = existing ? 'Could not save it' : 'Could not make it';
      result.textContent = (existing ? 'Saving' : 'Making it') + String.fromCharCode(8230);
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      var request = existing
        ? fetchJsonRetryOnce(base + '/' + encodeURIComponent(existing.trigger_id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        : fetchJsonRetryOnce(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      request.then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || failed; submit.disabled = false; return; }
        dialog.close();
        onCreated(r.body.url, r.body.trigger && r.body.trigger.trigger_id, r.body.trigger);
      }).catch(function (err) {
        result.textContent = err && err.message ? err.message : failed;
        submit.disabled = false;
      });
    });
    dialog.showModal();
    form.sender.focus();
  }

  function hookUrlHtml(url) {
    return '<div class="hook-url"><span class="hint">Shown only this once; make a new one if it' + String.fromCharCode(8217) + 's lost.</span>' +
      '<input readonly value="' + escapeHtml(url) + '" onclick="this.select()"></div>';
  }

  // A workflow's webhooks, listed in its Webhook tile: each with its setup
  // steps while it waits for the sender's secret, and a way to add another.
  // With none, the tile shows just "Add a webhook". shown: a webhook just
  // made, whose URL appears in its first step.
  function loadWorkflowHooks(name, card, shown) {
    var w = workflowsById[card.dataset.workflow];
    var box = card.querySelector('.workflow-hooks');
    var addBox = card.querySelector('.workflow-hooks-add');
    if (!w || !box) return;
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id) + '/triggers';
    // A webhook made or changed in a draft before webhooks went live at once.
    var draftBase = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id) + '/draft/webhooks';
    var hooksById = {};
    function render(shownUrl, shownId) {
      if (!box.innerHTML) box.innerHTML = '<p class="hint" style="margin:0">Loading' + String.fromCharCode(8230) + '</p>';
      fetchJsonRetryOnce(base).then(function (r) {
        if (!r.ok) { box.innerHTML = '<p class="error">' + escapeHtml(r.body.error || 'Could not load webhooks') + '</p>'; return; }
        var list = r.body.triggers || [];
        hooksById = {};
        list.forEach(function (t) { hooksById[t.trigger_id] = t; });
        // Keep the card's summary in step with what was just changed.
        // A webhook made in the draft doesn't start runs yet.
        var live = list.filter(function (t) { return !t.draft; });
        w.webhooks = live.filter(function (t) { return t.enabled; }).length;
        w.webhooksWaiting = live.filter(function (t) { return !t.enabled && t.verify && !t.verify.secret_set; }).length;
        w.webhooksOff = live.length - w.webhooks - w.webhooksWaiting;
        var startsCell = card.querySelector('.wf-row-starts');
        if (startsCell) startsCell.innerHTML = workflowStartsSummary(w);
        // One waiting for its secret, or just made: open the Run options
        // row it's in, so its steps show.
        var row = box.closest('details');
        if (row && (shownId || w.webhooksWaiting)) row.open = true;
        var none = card.querySelector('.wf-hooks-none');
        if (none) none.hidden = list.length > 0;
        var setupPending = list.some(function (t) { return t.verify && !t.verify.secret_set; });
        // Finish a planned webhook's setup before offering a second one:
        // + Webhook beside + Schedule waits until then.
        if (addBox) addBox.hidden = setupPending;
        box.innerHTML = list.map(function (t) { return hookRowHtml(t, t.trigger_id === shownId ? shownUrl : null); }).join('') +
          (setupPending ? '<p class="hint" style="margin:8px 0 0">Finish setting up the webhook above before adding another.</p>' : '');
        wire();
      });
    }
    function act(id, path, opts) {
      return fetchJsonRetryOnce(base + '/' + encodeURIComponent(id) + path, opts).then(function (r) {
        if (!r.ok) { alert(r.body.error || 'That didn' + String.fromCharCode(8217) + 't work'); return; }
        render(r.body.url, id);
      });
    }
    function wire() {
      var rows = box.querySelectorAll('.workflow-hook');
      for (var i = 0; i < rows.length; i++) {
        (function (row) {
          var id = row.dataset.trigger;
          // A webhook is how the workflow starts, not what it does, so every
          // change to it is live at once (and in Audit), with no draft.
          row.querySelector('.hook-edit').addEventListener('click', function () {
            if (hooksById[id]) openHookFormDialog(w, base, function () { render(null, null); }, hooksById[id]);
          });
          var undo = row.querySelector('.hook-undo');
          if (undo) undo.addEventListener('click', function () {
            fetchJsonRetryOnce(draftBase + '/' + encodeURIComponent(id) + '/restore', { method: 'POST' }).then(function () { render(null, null); refreshDraft(name, card); });
          });
          var toggle = row.querySelector('.hook-toggle');
          if (toggle) toggle.addEventListener('click', function (ev) {
            act(id, '', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: ev.currentTarget.textContent === 'Turn on' }) });
          });
          var saveSecret = row.querySelector('.hook-secret-save');
          if (saveSecret) saveSecret.addEventListener('click', function () {
            var t = hooksById[id];
            var secret = row.querySelector('.hook-secret-input').value.trim();
            if (!secret || !t) return;
            var verify = { sender: t.verify.sender, secret: secret };
            if (t.verify.sender === 'custom') {
              var headerInput = row.querySelector('.hook-secret-header');
              verify.header = headerInput ? headerInput.value.trim() : t.verify.header;
              verify.algorithm = t.verify.algorithm || 'sha256';
              verify.encoding = t.verify.encoding || 'hex';
              if (t.verify.prefix) verify.prefix = t.verify.prefix;
            }
            act(id, '', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verify: verify, enabled: true }) });
          });
          row.querySelector('.hook-rotate').addEventListener('click', function (ev) {
            var btn = ev.currentTarget;
            if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again: the old URL stops working'; return; }
            act(id, '/rotate', { method: 'POST' });
          });
          row.querySelector('.hook-delete').addEventListener('click', function (ev) {
            var btn = ev.currentTarget;
            if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to delete'; return; }
            fetchJsonRetryOnce(base + '/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
              if (!r.ok) { alert(r.body.error || 'That didn' + String.fromCharCode(8217) + 't work'); return; }
              loadWorkflowsSection(name);
            });
          });
        })(rows[i]);
      }
    }
    render(shown ? shown.url : null, shown ? shown.id : null);
  }

  // The Versions tab: each version of the workflow (its name, inputs,
  // model, tools, triggers, success criteria, instructions and result
  // format) as a card, newest first, with who saved it, when and why.
  // View shows it in full, Compare what changed from the version before
  // it, and Restore makes it the workflow's draft, to review and publish
  // as the next version. Filled by loadWorkflowVersions.
  // The Feedback tab: what people said about this workflow's results,
  // from the Inbox, a messaging app's links, an email or another platform
  // (each piece says where), and Self-Improve: changes to its prompt and
  // new success criteria suggested from that feedback, to review and add
  // to its draft. Filled by loadWorkflowFeedback.
  function workflowFeedbackHtml() {
    return '<div class="wf-fb"><p class="hint" style="margin:0">Loading' + String.fromCharCode(8230) + '</p></div>';
  }

  var FB_SOURCES = { inbox: 'Inbox', console: 'Console', slack: 'Slack', telegram: 'Telegram', lark: 'Lark', email: 'Email', webhook: 'Your app (callback)', link: 'Link', api: 'API', unknown: 'Earlier' };

  function feedbackItemHtml(i, name) {
    var verdict = i.verdict === 'good' ? '<span class="le-pill good">Good</span>' : i.verdict === 'bad' ? '<span class="le-pill bad">Needs work</span>' : '';
    var edit = i.edit === 'heavy' ? '<span class="le-pill warn">Changed a lot</span>' : i.edit === 'light' ? '<span class="le-pill neutral">Changed a little</span>' : i.edit === 'none' ? '<span class="le-pill neutral">Used as is</span>' : '';
    var when = new Date(i.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<li class="wf-fb-item"><div class="wf-fb-item-head">' + verdict + edit +
        '<span class="wf-fb-src">' + escapeHtml(FB_SOURCES[i.source || 'unknown'] || i.source) + '</span>' +
        (i.by ? '<span class="hint" style="margin-left:0">' + escapeHtml(i.by) + '</span>' : '') +
        '<span class="hint">' + escapeHtml(when) + (i.workflowVersion ? DOT + 'v' + i.workflowVersion : '') + DOT + '<a href="#" class="wf-link wf-fb-trace" data-run="' + escapeHtml(i.runId) + '">trace</a></span></div>' +
      (i.note ? '<p class="wf-fb-note">' + String.fromCharCode(8220) + escapeHtml(i.note) + String.fromCharCode(8221) + '</p>' : '') +
      (i.inputs ? '<span class="hint">' + escapeHtml(i.inputs) + '</span>' : '') +
      '<details><summary>' + (i.final ? 'Its result, and what was used instead' : 'Its result') + '</summary><div class="wf-fb-pair"' + (i.final ? '' : ' style="grid-template-columns:minmax(0,1fr)"') + '>' +
        '<pre>' + escapeHtml(i.result || '(none)') + '</pre>' + (i.final ? '<pre>' + escapeHtml(i.final) + '</pre>' : '') + '</div></details></li>';
  }

  function loadWorkflowFeedback(name, card, base) {
    var box = card.querySelector('.wf-fb');
    if (!box) return;
    var id = card.dataset.workflow;
    fetchJsonRetryOnce(base + '/feedback').then(function (r) {
      if (!r.ok) { box.innerHTML = '<p class="error">Could not load its feedback: ' + escapeHtml(r.body.error || 'unknown error') + '</p>'; return; }
      var f = r.body;
      var w = workflowsById[id] || {};
      var toChat = (w.delivery && w.delivery.result_to_chat) || (w.schedules || []).some(function (x) { return x.notify && x.status !== 'cancelled'; });
      var srcs = Object.keys(f.sources || {}).map(function (k) { return '<span class="wf-fb-src">' + escapeHtml(FB_SOURCES[k] || k) + ' ' + f.sources[k] + '</span>'; }).join('');
      var stat = function (cls, n, label) { return '<div class="wf-fb-stat ' + cls + '"><b>' + n + '</b><span>' + label + '</span></div>'; };
      box.innerHTML =
        '<section class="wf-section"><div class="wf-sub-row"><h4 class="wf-sub">What people said</h4><span class="hint">Last ' + f.days + ' days</span></div>' +
          '<div class="wf-fb-stats">' + stat('', f.total + '<span class="hint" style="font-size:13px;font-weight:400"> of ' + f.runs + '</span>', 'runs got feedback') + stat('good', f.good, 'Good') + stat('bad', f.bad, 'Needs work') + stat('', f.edited, 'Changed before use') + '</div>' +
          (srcs ? '<div class="wf-fb-sources">From ' + srcs + '</div>' : '') + '</section>' +
        '<section class="wf-fb-improve"><h3>Improve this workflow</h3>' +
          '<p>Reads the results people marked <b>needs work</b>, changed, or commented on, and suggests changes to the prompt and new success criteria. Nothing changes until you add them to the draft and publish it.</p>' +
          '<div class="wf-fb-improve-bar"><button type="button" class="le-btn-dark wf-fb-go"' + (f.actionable ? '' : ' disabled') + '>Suggest improvements</button>' +
            '<span class="hint">' + (f.actionable ? f.actionable + ' piece' + (f.actionable === 1 ? '' : 's') + ' of feedback to learn from' : 'Nothing to learn from yet: mark a result as needs work, change it, or add a note.') + '</span></div>' +
          '<div class="wf-fb-sugg" hidden></div></section>' +
        '<section class="wf-section"><h4 class="wf-sub">Feedback</h4>' +
          (f.items.length ? '<ul class="wf-fb-list">' + f.items.map(function (i) { return feedbackItemHtml(i, name); }).join('') + '</ul>' : '<p class="hint" style="margin:0">None yet.</p>') + '</section>' +
        '<section class="wf-section"><h4 class="wf-sub">Where feedback comes from</h4><div class="wf-fb-ways">' +
          '<div class="wf-fb-way"><b>Inbox</b><span>Under each finished run' + RSQ + 's conversation: Good or Needs work, a note, and the result as it should have been.</span></div>' +
          '<div class="wf-fb-way"><b>Messaging apps</b><span>' + (toChat ? 'Each result posted to chat ends with Good and Needs work links.' : 'Turn on ' + String.fromCharCode(8220) + 'result to chat' + String.fromCharCode(8221) + ' in Messaging, and each result posted ends with Good and Needs work links.') + '</span></div>' +
          '<div class="wf-fb-way"><b>Other platforms</b><span>Each finished run' + RSQ + 's callback has a <code>feedback_url</code> to post to.</span>' +
            '<span>Or with an API key:</span><pre>POST /agents/' + escapeHtml(name) + '/runs/&lt;runId&gt;/feedback' + String.fromCharCode(10) + '{ "verdict": "bad", "note": "...", "final": "...", "source": "api", "by": "jane@acme.com" }</pre></div>' +
        '</div></section>';
      var trace = function (ev) {
        var a = ev.target.closest('.wf-fb-trace');
        if (!a) return;
        ev.preventDefault();
        showWorkflowTab(card, 'activity');
        openRunTrace(name, card, a.getAttribute('data-run'));
      };
      box.addEventListener('click', trace);
      var go = box.querySelector('.wf-fb-go');
      if (go) go.addEventListener('click', function () { suggestImprovements(name, card, base, box); });
    });
  }

  // Self-Improve: ask for suggestions, show them (each change and why, the
  // prompt's diff, new criteria to tick, questions only a person can
  // answer), and add what's chosen to the draft.
  function suggestImprovements(name, card, base, box) {
    var go = box.querySelector('.wf-fb-go');
    var panel = box.querySelector('.wf-fb-sugg');
    go.disabled = true;
    go.textContent = 'Reading the feedback' + String.fromCharCode(8230);
    panel.hidden = false;
    panel.innerHTML = '<p class="hint" style="margin:0">This takes a minute: the model reads each result and what people said about it.</p>';
    fetchJsonRetryOnce(base + '/improve', { method: 'POST' }).then(function (r) {
      go.disabled = false;
      go.textContent = 'Suggest again';
      if (!r.ok) { panel.innerHTML = '<p class="error">' + escapeHtml(r.body.error || 'Could not suggest improvements') + '</p>'; return; }
      var sg = r.body;
      var changed = sg.instructions !== sg.from.instructions;
      if (!changed && !sg.criteria.length) {
        panel.innerHTML = '<p style="margin:0"><span class="le-pill good">No changes needed</span> ' + escapeHtml(sg.summary || 'The feedback doesn' + RSQ + 't call for changes to the prompt.') + '</p>';
        return;
      }
      panel.innerHTML =
        (sg.summary ? '<p style="margin:0;color:var(--ink)">' + escapeHtml(sg.summary) + '</p>' : '') +
        (sg.changes.length ? '<h4>// Suggested changes</h4><ul class="wf-fb-changes">' + sg.changes.map(function (c) { return '<li><strong>' + escapeHtml(c.what) + '</strong>' + (c.why ? '<span>' + escapeHtml(c.why) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '') +
        (changed ? '<h4>// The prompt, changed' + (sg.from.drafted ? ' (from its draft)' : '') + '</h4>' + versionDiffHtml(sg.from.instructions, sg.instructions) +
          '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" class="wf-fb-take-prompt" checked> Add these prompt changes</label>' : '') +
        (sg.criteria.length ? '<h4>// New success criteria</h4><div class="wf-fb-crits">' + sg.criteria.map(function (c, i) { return '<label><input type="checkbox" data-crit="' + i + '" checked> <span>' + escapeHtml(c.text) + ' <span class="hint">(' + escapeHtml(critKindText(c)) + ')</span></span></label>'; }).join('') + '</div>' : '') +
        (sg.open.length ? '<h4>// Only you can answer</h4><ul class="wf-fb-open">' + sg.open.map(function (q) { return '<li>' + escapeHtml(q) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="wf-fb-improve-bar"><button type="button" class="wf-fb-add">Add to draft</button><button type="button" class="le-btn-dark wf-fb-add wf-fb-add-publish" data-publish-offer hidden>Add and publish</button><span class="hint wf-fb-add-status">Then Evaluate to check it does better.</span></div>' +
        '<p class="hint" style="margin:0">Suggested by ' + escapeHtml(sg.model) + ' from ' + sg.basedOn + ' piece' + (sg.basedOn === 1 ? '' : 's') + ' of feedback.</p>';
      offerPublish(panel);
      var addButtons = panel.querySelectorAll('.wf-fb-add');
      for (var ab = 0; ab < addButtons.length; ab++) addButtons[ab].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var andPublish = btn.classList.contains('wf-fb-add-publish');
        var status = panel.querySelector('.wf-fb-add-status');
        var takePrompt = changed && panel.querySelector('.wf-fb-take-prompt') && panel.querySelector('.wf-fb-take-prompt').checked;
        var picked = sg.criteria.filter(function (c, i) { var b = panel.querySelector('[data-crit="' + i + '"]'); return b && b.checked; });
        if (!takePrompt && !picked.length) { status.textContent = 'Tick at least one change to add.'; return; }
        for (var d = 0; d < addButtons.length; d++) addButtons[d].disabled = true;
        status.textContent = (andPublish ? 'Publishing' : 'Adding') + String.fromCharCode(8230);
        var id = card.dataset.workflow;
        var w = withDraftFields(workflowsById[id]);
        // The whole editor form, as the workflow stands in its draft, with
        // the prompt changed: the draft keeps everything else as it is.
        var steps = [];
        if (takePrompt) steps.push(function () {
          return fetchJsonRetryOnce(base + '/draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            title: w.title, description: w.description, instructions: sg.instructions, parameters: w.parameters || {},
            output: w.output || '', outputSchema: w.outputSchema ? JSON.stringify(w.outputSchema, null, 2) : '', model: w.model || null,
          }) });
        });
        if (picked.length) steps.push(function () {
          return fetchJsonRetryOnce(base + '/draft').then(function (d) {
            var now = d.ok && d.body.draft && d.body.draft.criteria ? d.body.draft.criteria : ((w.evals && w.evals.criteria) || []);
            var list = now.map(function (c) { return { text: c.text, kind: c.kind, value: c.value }; }).concat(picked.map(function (c) { return { text: c.text, kind: c.kind, value: c.value }; }));
            return fetchJsonRetryOnce(base + '/draft/criteria', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ criteria: list }) });
          });
        });
        steps.reduce(function (p, step) {
          return p.then(function (prev) { if (prev && !prev.ok) return prev; return step(); });
        }, Promise.resolve(null)).then(function (last) {
          return last && last.ok && andPublish ? publishSavedDraft(base, ('Self-Improve: ' + (sg.summary || 'changes from feedback')).slice(0, 480)) : last;
        }).then(function (last) {
          if (last && !last.ok) { for (var e = 0; e < addButtons.length; e++) addButtons[e].disabled = false; status.textContent = last.body.error || 'Could not add them'; return; }
          for (var h = 0; h < addButtons.length; h++) addButtons[h].hidden = addButtons[h] !== btn;
          if (andPublish) {
            btn.textContent = 'Published';
            status.innerHTML = 'Every run from now on uses it. Run Evaluate to check it does better.';
            loadWorkflowsSection(name);
            return;
          }
          btn.textContent = 'Added to the draft';
          status.innerHTML = 'Review and publish the draft (at the top) to make it live, then run Evaluate to check it does better.';
          refreshDraft(name, card);
        });
      });
    });
  }

  function workflowVersionsHtml() {
    return '<div class="wf-versions"><p class="hint" style="margin:0">Loading' + String.fromCharCode(8230) + '</p></div>';
  }

  function loadWorkflowVersions(name, card, base) {
    var box = card.querySelector('.wf-versions');
    var meta = card.querySelector('.wf-page-version');
    fetch(base + '/versions', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) {
          if (box) box.innerHTML = '<p class="hint" style="margin:0">This workspace keeps no versions.</p>';
          var unkept = card.querySelector('.wf-contract-version');
          if (unkept) unkept.textContent = 'not numbered: this workspace keeps no versions';
          return;
        }
        var versions = data.versions || [];
        var current = versions.filter(function (v) { return v.number === data.current; })[0] || versions[0];
        var contractVersion = card.querySelector('.wf-contract-version');
        if (contractVersion) contractVersion.innerHTML = current ? '<strong>v' + current.number + '</strong>' : 'not numbered yet';
        if (meta && current) {
          var draft = workflowsById[card.dataset.workflow] && workflowsById[card.dataset.workflow].draft;
          meta.innerHTML = '<a href="' + workflowPageHref(name, card.dataset.workflow, 'versions') + '">v' + current.number + '</a>' + (draft ? ' <span class="hint">+ draft</span>' : '');
          meta.querySelector('a').addEventListener('click', function (ev) { ev.preventDefault(); showWorkflowTab(card, 'versions'); });
          meta.parentNode.hidden = false;
        }
        if (box) renderWorkflowVersions(name, card, box, base, data);
      })
      .catch(function () {});
  }

  function versionWhen(v) {
    return new Date(v.at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Two texts line by line (longest common subsequence): each line kept,
  // added or removed, in order. A very long pair is told by which lines
  // each has that the other hasn't.
  function versionLineDiff(before, after) {
    var NL = String.fromCharCode(10);
    var a = before.split(NL);
    var b = after.split(NL);
    var out = [];
    if (a.length * b.length > 4000000) {
      var inA = {}, inB = {};
      a.forEach(function (l) { inA[l] = true; });
      b.forEach(function (l) { inB[l] = true; });
      a.forEach(function (l) { if (!inB[l]) out.push({ t: '-', l: l }); });
      b.forEach(function (l) { out.push({ t: inA[l] ? ' ' : '+', l: l }); });
      return out;
    }
    var t = [];
    for (var i = a.length; i >= 0; i--) {
      t[i] = [];
      for (var j = b.length; j >= 0; j--) t[i][j] = i === a.length || j === b.length ? 0 : a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
    i = 0; j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { out.push({ t: ' ', l: a[i] }); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) out.push({ t: '-', l: a[i++] });
      else out.push({ t: '+', l: b[j++] });
    }
    while (i < a.length) out.push({ t: '-', l: a[i++] });
    while (j < b.length) out.push({ t: '+', l: b[j++] });
    return out;
  }

  // The diff with three lines of context around each change; the
  // unchanged stretches between are folded into a line saying how many.
  function versionDiffHtml(before, after) {
    var lines = versionLineDiff(before, after);
    if (!lines.some(function (x) { return x.t !== ' '; })) return '<p class="hint" style="margin:0">Nothing changed from the version before.</p>';
    var near = lines.map(function () { return false; });
    lines.forEach(function (x, k) {
      if (x.t === ' ') return;
      for (var d = Math.max(0, k - 3); d <= Math.min(lines.length - 1, k + 3); d++) near[d] = true;
    });
    var html = '';
    var skipped = 0;
    var MINUS = String.fromCharCode(8722);
    lines.forEach(function (x, k) {
      if (!near[k]) { skipped++; return; }
      if (skipped) { html += '<div class="chg-gap">' + skipped + ' unchanged line' + (skipped === 1 ? '' : 's') + '</div>'; skipped = 0; }
      var cls = x.t === '+' ? 'chg-ins' : x.t === '-' ? 'chg-del' : 'chg-same';
      html += '<div class="' + cls + '">' + (x.t === '+' ? '+' : x.t === '-' ? MINUS : ' ') + ' ' + escapeHtml(x.l) + '</div>';
    });
    if (skipped) html += '<div class="chg-gap">' + skipped + ' unchanged line' + (skipped === 1 ? '' : 's') + '</div>';
    return '<div class="chg-lines">' + html + '</div>';
  }

  // A version laid out like the workflow itself: its name, prompt,
  // inputs, result, model, tools, triggers and success criteria. A
  // version from when only the brief was numbered has just its prompt
  // and result format; one with nothing read back shows its text.
  var PERMISSIONS = { allow: 'runs on its own', ask: 'asks you first', deny: 'never runs' };
  function versionFull(v) { return Boolean(v.fields && v.fields.title !== undefined); }
  function versionInputsHtml(params) {
    var names = Object.keys(params || {});
    if (!names.length) return '<span class="hint">None: every run is the same</span>';
    return names.map(function (n) {
      var spec = params[n] || {};
      var typed = inputTypeText(spec);
      return '<div><code>' + escapeHtml(n) + '</code>' + (spec.required ? ' (required)' : '') + (typed ? ' ' + escapeHtml(typed) : '') + (spec.description ? ' <span class="hint">' + escapeHtml(spec.description) + '</span>' : '') + '</div>';
    }).join('');
  }
  function versionModelText(m) { return m ? m.provider + ' ' + m.model : 'The agent' + RSQ + 's model'; }
  function versionToolHtml(t) {
    return '<div><code>' + escapeHtml(t.name) + '</code> <span class="wf-cb-decision ' + escapeHtml(t.permission) + '">' + escapeHtml(PERMISSIONS[t.permission] || t.permission) + '</span></div>';
  }
  function versionCritText(c) { return c.text + ' (' + critKindText(c) + ')'; }
  function versionDetailHtml(v) {
    var f = v.fields;
    if (!f) return '<div class="workflow-steps-text">' + escapeHtml(v.content) + '</div>';
    var row = function (k, html) { return '<div class="wf-vd-k">' + k + '</div><div class="wf-vd-v">' + html + '</div>'; };
    var list = function (items, empty, fn) { return items && items.length ? items.map(fn).join('') : '<span class="hint">' + empty + '</span>'; };
    var rows = '';
    if (versionFull(v)) rows += row('Name', '<strong>' + escapeHtml(f.title) + '</strong>' + (f.description ? '<div class="hint">' + escapeHtml(f.description) + '</div>' : ''));
    rows += row('Prompt', '<div class="workflow-steps-text">' + escapeHtml(f.instructions || '') + '</div>');
    if (versionFull(v)) rows += row('Inputs', versionInputsHtml(f.parameters));
    rows += row('Result', (f.output ? '<div class="workflow-steps-text">' + escapeHtml(f.output) + '</div>' : '<span class="hint">No result format set</span>') +
      (f.outputSchema ? '<details class="wf-schema"><summary>Output schema</summary><pre>' + escapeHtml(JSON.stringify(f.outputSchema, null, 2)) + '</pre></details>' : ''));
    if (versionFull(v)) rows += row('Model', escapeHtml(versionModelText(f.model)));
    if (f.tools) rows += row('Tools', list(f.tools, 'None named in its prompt', versionToolHtml));
    if (f.criteria) rows += row('Success criteria', list(f.criteria, 'None', function (c) { return '<div>' + escapeHtml(versionCritText(c)) + '</div>'; }));
    return '<div class="wf-vd">' + rows + '</div>' + (versionFull(v) ? '' : '<p class="hint" style="margin:6px 0 0">An early version: only its prompt and result format were kept.</p>');
  }

  // What changed from one version to the next, part by part: a name or
  // model from and to; the prompt, result format and output schema line
  // by line; inputs, tools, triggers and success criteria added, removed
  // or changed. A part the older version didn't record isn't compared.
  function versionCompareHtml(prev, v) {
    var a = prev.fields, b = v.fields;
    var intro = '<p class="hint" style="margin:0">What changed from version ' + prev.number + ' to version ' + v.number + '.</p>';
    if (!a || !b) return intro + versionDiffHtml(prev.content, v.content);
    var MINUS = String.fromCharCode(8722), ARROW = ' ' + String.fromCharCode(8594) + ' ';
    var parts = [];
    var add = function (label, html, summary) { parts.push({ label: label, html: html, summary: summary }); };
    var fromTo = function (x, y) { return '<del>' + escapeHtml(x || '(none)') + '</del>' + ARROW + '<ins>' + escapeHtml(y || '(none)') + '</ins>'; };
    var lines = function (x, y) {
      var d = versionLineDiff(x || '', y || '');
      var plus = d.filter(function (l) { return l.t === '+' && l.l.trim(); }).length, minus = d.filter(function (l) { return l.t === '-' && l.l.trim(); }).length;
      return plus + ' line' + (plus === 1 ? '' : 's') + ' added, ' + minus + ' removed';
    };
    var setDiff = function (xs, ys, key, show) {
      var ka = xs.map(key), kb = ys.map(key);
      var out = [];
      ys.forEach(function (y, i) { if (ka.indexOf(kb[i]) === -1) out.push('<div class="chg-ins">+ ' + show(y) + '</div>'); });
      xs.forEach(function (x, i) { if (kb.indexOf(ka[i]) === -1) out.push('<div class="chg-del">' + MINUS + ' ' + show(x) + '</div>'); });
      return out;
    };
    var full = versionFull(prev) && versionFull(v);
    if (full && (a.title !== b.title || (a.description || '') !== (b.description || ''))) {
      add('Name', (a.title !== b.title ? '<div>' + fromTo(a.title, b.title) + '</div>' : '') + ((a.description || '') !== (b.description || '') ? '<div>' + fromTo(a.description, b.description) + '</div>' : ''), a.title !== b.title ? 'renamed' : 'description changed');
    }
    if ((a.instructions || '') !== (b.instructions || '')) add('Prompt', versionDiffHtml(a.instructions || '', b.instructions || ''), lines(a.instructions, b.instructions));
    if (full) {
      var pa = a.parameters || {}, pb = b.parameters || {};
      var inputs = [];
      Object.keys(pb).forEach(function (n) { if (!(n in pa)) inputs.push('<div class="chg-ins">+ <code>' + escapeHtml(n) + '</code>' + (pb[n].required ? ' (required)' : '') + '</div>'); });
      Object.keys(pa).forEach(function (n) { if (!(n in pb)) inputs.push('<div class="chg-del">' + MINUS + ' <code>' + escapeHtml(n) + '</code></div>'); });
      Object.keys(pb).forEach(function (n) {
        if (!(n in pa) || JSON.stringify(pa[n]) === JSON.stringify(pb[n])) return;
        var said = function (spec) { return [spec.required ? 'required' : 'optional', inputTypeText(spec), spec.description || ''].filter(Boolean).join(', '); };
        inputs.push('<div><code>' + escapeHtml(n) + '</code>: ' + fromTo(said(pa[n]), said(pb[n])) + '</div>');
      });
      if (inputs.length) add('Inputs', inputs.join(''), inputs.length + ' changed');
    }
    if ((a.output || '') !== (b.output || '')) add('Result format', versionDiffHtml(a.output || '', b.output || ''), lines(a.output, b.output));
    if (a.criteria !== undefined && b.criteria !== undefined && JSON.stringify(a.outputSchema || null) !== JSON.stringify(b.outputSchema || null)) {
      var sa = a.outputSchema ? JSON.stringify(a.outputSchema, null, 2) : '', sb = b.outputSchema ? JSON.stringify(b.outputSchema, null, 2) : '';
      add('Output schema', versionDiffHtml(sa, sb), !sa ? 'added' : !sb ? 'removed' : lines(sa, sb));
    }
    if (full && versionModelText(a.model) !== versionModelText(b.model)) add('Model', fromTo(versionModelText(a.model), versionModelText(b.model)), versionModelText(b.model));
    if (a.tools && b.tools) {
      var tools = setDiff(a.tools, b.tools, function (t) { return t.name; }, function (t) { return '<code>' + escapeHtml(t.name) + '</code> ' + escapeHtml(PERMISSIONS[t.permission] || t.permission); });
      b.tools.forEach(function (t) {
        var was = a.tools.filter(function (x) { return x.name === t.name; })[0];
        if (was && was.permission !== t.permission) tools.push('<div><code>' + escapeHtml(t.name) + '</code>: ' + fromTo(PERMISSIONS[was.permission] || was.permission, PERMISSIONS[t.permission] || t.permission) + '</div>');
      });
      if (tools.length) add('Tools', tools.join(''), tools.length + ' changed');
    }
    if (a.criteria && b.criteria) {
      var crit = setDiff(a.criteria, b.criteria, function (c) { return c.kind + '|' + (c.value || '') + '|' + c.text; }, function (c) { return escapeHtml(versionCritText(c)); });
      if (crit.length) add('Success criteria', crit.join(''), crit.length + ' changed');
    }
    var unrecorded = !full ? '<p class="hint" style="margin:0">Version ' + (versionFull(prev) ? v.number : prev.number) + ' kept only its prompt and result format, so only those are compared.</p>' : '';
    if (!parts.length) return intro + unrecorded + '<p class="hint" style="margin:0">Nothing it holds changed' + (v.reason ? ': ' + escapeHtml(v.reason) : '') + '.</p>';
    return intro + unrecorded +
      '<ul class="wf-vc-summary">' + parts.map(function (p) { return '<li><strong>' + p.label + '</strong> <span class="hint">' + escapeHtml(p.summary) + '</span></li>'; }).join('') + '</ul>' +
      parts.map(function (p) { return '<section class="wf-vc-part"><h5>' + p.label + '</h5><div class="chg-lines wf-vc-body">' + p.html + '</div></section>'; }).join('');
  }

  function renderWorkflowVersions(name, card, box, base, data) {
    var versions = data.versions || [];
    if (!versions.length) { box.innerHTML = '<p class="hint" style="margin:0">No versions yet: the first is numbered when it' + RSQ + 's first run or published.</p>'; return; }
    var current = versions.filter(function (v) { return v.number === data.current; })[0] || versions[0];
    var byNumber = {};
    versions.forEach(function (v) { byNumber[v.number] = v; });
    // The version before each: the next older one kept.
    var previous = function (v) {
      var older = versions.filter(function (x) { return x.number < v.number; });
      return older.length ? older[0] : null;
    };
    var hasDraft = Boolean(workflowsById[card.dataset.workflow] && workflowsById[card.dataset.workflow].draft);
    box.innerHTML = '<p class="hint" style="margin:0">Every published change is numbered and kept. Restoring one makes it the draft' + (hasDraft ? ' (replacing what the draft changes in the prompt, inputs, model, result format and success criteria)' : '') + ': review it, then publish it as version ' + (versions[0].number + 1) + '.</p>' +
      '<ol class="wf-version-cards">' + versions.map(function (v) {
        var isCurrent = v.number === current.number;
        var prev = previous(v);
        var about = [v.by ? 'by ' + escapeHtml(v.by) : '', escapeHtml(versionWhen(v))].filter(Boolean).join(DOT);
        return '<li class="wf-version-card' + (isCurrent ? ' is-current' : '') + '" data-version="' + v.number + '">' +
          '<div class="wf-version-head"><strong>Version ' + v.number + '</strong>' +
            (isCurrent ? '<span class="le-pill good">In use</span>' : '') +
            '<span class="hint">' + about + '</span>' +
            '<span class="wf-version-actions">' +
              '<button type="button" class="wf-version-view" aria-pressed="false">View</button>' +
              (prev ? '<button type="button" class="wf-version-compare" aria-pressed="false" title="What changed from version ' + prev.number + '">Compare</button>' : '') +
              (isCurrent ? '' : '<button type="button" class="wf-version-restore">Restore</button>') +
            '</span></div>' +
          (v.reason ? '<p class="wf-version-reason">' + escapeHtml(v.reason) + '</p>' : '') +
          '<div class="wf-version-text" hidden></div>' +
          '<div class="wf-version-diff" hidden></div>' +
          '<span class="hint wf-version-status" role="status"></span>' +
        '</li>';
      }).join('') + '</ol>';
    box.querySelector('.wf-version-cards').addEventListener('click', function (ev) {
      var item = ev.target.closest('li[data-version]');
      var btn = ev.target.closest('button');
      if (!item || !btn) return;
      var v = byNumber[item.getAttribute('data-version')];
      var text = item.querySelector('.wf-version-text');
      var diff = item.querySelector('.wf-version-diff');
      var viewBtn = item.querySelector('.wf-version-view');
      var compareBtn = item.querySelector('.wf-version-compare');
      // View and Compare show one at a time.
      var show = function (which) {
        text.hidden = which !== 'view';
        diff.hidden = which !== 'compare';
        viewBtn.setAttribute('aria-pressed', String(which === 'view'));
        viewBtn.textContent = which === 'view' ? 'Hide' : 'View';
        if (compareBtn) {
          compareBtn.setAttribute('aria-pressed', String(which === 'compare'));
          compareBtn.textContent = which === 'compare' ? 'Hide changes' : 'Compare';
        }
      };
      if (btn.classList.contains('wf-version-view')) {
        if (!text.innerHTML) text.innerHTML = versionDetailHtml(v);
        show(text.hidden ? 'view' : null);
        return;
      }
      if (btn.classList.contains('wf-version-compare')) {
        if (!diff.hidden) { show(null); return; }
        var prev = previous(v);
        if (!diff.innerHTML) diff.innerHTML = versionCompareHtml(prev, v);
        show('compare');
        return;
      }
      if (btn.classList.contains('wf-version-restore')) {
        if (btn.getAttribute('data-confirming') !== '1') { btn.setAttribute('data-confirming', '1'); btn.textContent = 'Click again to restore as a draft'; return; }
        btn.disabled = true;
        var status = item.querySelector('.wf-version-status');
        status.textContent = 'Making a draft from version ' + v.number + String.fromCharCode(8230);
        fetchJsonRetryOnce(base + '/versions/' + v.number + '/restore', { method: 'POST' }).then(function (r) {
          if (!r.ok) { status.textContent = r.body.error || 'That did not work'; btn.disabled = false; return; }
          if (!r.body.draft || !r.body.changes.length) {
            status.textContent = 'Version ' + v.number + ' is the same as the published workflow: there' + RSQ + 's nothing to restore.';
            btn.disabled = false;
            btn.removeAttribute('data-confirming');
            btn.textContent = 'Restore';
            return;
          }
          var id = card.dataset.workflow;
          if (workflowsById[id]) workflowsById[id].draft = r.body.draft;
          workflowTabs[id] = 'versions';
          loadWorkflowsSection(name);
          // Straight to the review: what it changes, then Publish.
          openPublishDialog(name, workflowsById[id] || { id: id, title: '' });
        });
      }
    });
  }

  function wireWorkflowCard(name, card) {
    var id = card.dataset.workflow;
    var result = card.querySelector('.workflow-result');
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(id);
    // A row in the list opens the workflow's own page.
    var head = card.querySelector('.wf-row-head');
    if (head) {
      head.addEventListener('click', function (ev) {
        if (ev.target.closest('button, a')) return;
        location.href = workflowPageHref(name, id);
      });
      head.addEventListener('keydown', function (ev) {
        if (ev.target !== head || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        location.href = workflowPageHref(name, id);
      });
    }
    var tabs = card.querySelectorAll('.wf-tab');
    for (var t = 0; t < tabs.length; t++) tabs[t].addEventListener('click', function (ev) { showWorkflowTab(card, ev.currentTarget.dataset.tab); });
    loadWorkflowVersions(name, card, base);
    wireDraftBanner(name, card);
    loadWorkflowHealth(card, base);
    loadCandidates(name, card, base);
    loadWorkflowRuns(name, card, base);
    loadWorkflowFeedback(name, card, base);
    if (openTraces[id] && card.querySelector('.wf-trace')) openRunTrace(name, card, openTraces[id].run);
    card.querySelector('.workflow-edit').addEventListener('click', function () { openWorkflowEditor(name, card); });
    // Opens the workflow's page on its Triggers tab.
    var triggersBtn = card.querySelector('.workflow-triggers-open');
    if (triggersBtn) triggersBtn.addEventListener('click', function () { location.href = workflowPageHref(name, id, 'triggers'); });
    // Messages: where every run's updates and decisions go.
    var msgForm = card.querySelector('.wf-msg-form');
    if (msgForm) {
      var msgResult = msgForm.querySelector('.wf-msg-result');
      var decideChat = msgForm.msgDecisionsChat || null;
      var decideNote = msgForm.querySelector('.wf-msg-decide-note');
      var hasChat = Boolean(decideChat);
      // Your app's column follows its address; approvals and questions
      // can leave the chat app only for an address that's given, and
      // your app hears of a run starting only when it answers them.
      var syncMsgForm = function () {
        var url = msgForm.msgUrl.value.trim();
        var toApp = Boolean(url) && (!hasChat || !decideChat.checked);
        if (decideChat) {
          decideChat.disabled = !url;
          if (!url) decideChat.checked = true;
        }
        msgForm.querySelectorAll('.wf-msg-appcell').forEach(function (cell) {
          var input = cell.querySelector('input');
          var on = Boolean(url) && (cell.dataset.app !== 'start' || toApp);
          input.checked = on;
          cell.classList.toggle('is-off', !url);
        });
        decideNote.textContent = !url
          ? (hasChat ? 'Add your app' + String.fromCharCode(8217) + 's address to answer approvals and questions there instead.' : 'With no messaging app, approvals and questions wait in the Inbox.')
          : toApp ? 'Your app answers approvals and questions (through the API), and gets a note when each run starts.' + (hasChat ? ' Nothing goes to chat for them.' : '')
          : 'Approvals and questions are answered in chat; your app is told about them too.';
      };
      msgForm.msgUrl.addEventListener('input', syncMsgForm);
      if (decideChat) decideChat.addEventListener('change', syncMsgForm);
      if (msgForm.msgNoticeOn) msgForm.msgNoticeOn.addEventListener('change', function () {
        var notice = msgForm.querySelector('.wf-msg-notice');
        notice.hidden = !msgForm.msgNoticeOn.checked;
        if (msgForm.msgNoticeOn.checked) msgForm.msgNotice.focus();
      });
      syncMsgForm();
      var reloadOnMessages = function () { workflowTabs[id] = 'messages'; loadWorkflowsSection(name); };
      msgForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var url = msgForm.msgUrl.value.trim();
        var body = {};
        if (url) body.callback_url = url;
        if (url && (!decideChat || !decideChat.checked)) body.decisions = 'callback';
        if (msgForm.msgNoticeOn && msgForm.msgNoticeOn.checked && msgForm.msgNotice.value.trim()) body.chat_notice = msgForm.msgNotice.value.trim();
        if (msgForm.msgResult && msgForm.msgResult.checked) body.result_to_chat = true;
        msgResult.textContent = 'Saving' + String.fromCharCode(8230);
        fetchJsonRetryOnce(base + '/messages', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
          if (!r.ok) { msgResult.textContent = r.body.error || 'Could not save'; return; }
          reloadOnMessages();
        });
      });
      var clearButtons = msgForm.querySelectorAll('.wf-msg-clear-hook');
      for (var cb = 0; cb < clearButtons.length; cb++) {
        clearButtons[cb].addEventListener('click', function (ev) {
          var tid = ev.currentTarget.dataset.trigger;
          fetchJsonRetryOnce(base + '/triggers/' + encodeURIComponent(tid), {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ callback_url: null, decisions: null, chat_notice: null, result_to_chat: false }),
          }).then(function (r) {
            if (!r.ok) { msgResult.textContent = r.body.error || 'Could not change the webhook'; return; }
            reloadOnMessages();
          });
        });
      }
    }
    // Evidence: save a run as an eval case, change or remove a case, run them.
    var body = card.querySelector('.wf-row-body');
    // Criteria: the editor's rows, drafting from the brief, saving.
    var critForm = card.querySelector('.wf-crit-form');
    var critStatus = card.querySelector('.wf-crit-status');
    body.addEventListener('change', function (ev) {
      var kind = ev.target.closest('[data-crit-kind]');
      if (!kind) return;
      var value = kind.closest('.wf-crit-row').querySelector('[data-crit-value]');
      value.hidden = kind.value === 'judge' || kind.value === 'reference';
      value.placeholder = kind.value.indexOf('tool') === 0 ? 'tool name' : 'exact text';
    });
    body.addEventListener('click', function (ev) {
      var cbtn = ev.target.closest('.wf-crit-edit, .wf-crit-add, .wf-crit-remove, .wf-crit-cancel, .wf-crit-draft, .wf-crit-save');
      if (!cbtn || !critForm) return;
      var rows = critForm.querySelector('.wf-crit-rows');
      if (cbtn.classList.contains('wf-crit-edit')) {
        critForm.hidden = false;
        cbtn.hidden = true;
        offerPublish(critForm);
        if (!rows.children.length) rows.insertAdjacentHTML('beforeend', critRowHtml({ kind: 'judge' }));
        return;
      }
      if (cbtn.classList.contains('wf-crit-add')) { rows.insertAdjacentHTML('beforeend', critRowHtml({ kind: 'judge' })); return; }
      if (cbtn.classList.contains('wf-crit-remove')) { cbtn.closest('.wf-crit-row').remove(); return; }
      if (cbtn.classList.contains('wf-crit-cancel')) { workflowTabs[id] = 'evaluation'; loadWorkflowsSection(name); return; }
      cbtn.disabled = true;
      if (cbtn.classList.contains('wf-crit-draft')) {
        critStatus.textContent = 'Drafting from the brief' + String.fromCharCode(8230);
        fetchJsonRetryOnce(base + '/evals/criteria/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(function (r) {
          cbtn.disabled = false;
          if (!r.ok) { critStatus.textContent = r.body.error || 'Couldn' + String.fromCharCode(8217) + 't draft them.'; return; }
          rows.innerHTML = r.body.criteria.map(critRowHtml).join('');
          critStatus.textContent = 'Drafted ' + r.body.criteria.length + ': edit or remove any, then save.';
        });
        return;
      }
      var list = Array.prototype.map.call(rows.querySelectorAll('.wf-crit-row'), function (row) {
        return { id: row.dataset.critId || undefined, kind: row.querySelector('[data-crit-kind]').value, text: row.querySelector('[data-crit-text]').value, value: row.querySelector('[data-crit-value]').value };
      }).filter(function (c) { return c.text.trim() || c.value.trim(); });
      // Saved to the draft: published with the rest of it, now with Save
      // and publish, or later from Review and publish.
      var andPublish = cbtn.classList.contains('wf-crit-publish');
      fetchJsonRetryOnce(base + '/draft/criteria', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ criteria: list }) }).then(function (r) {
        return r.ok && andPublish ? publishSavedDraft(base, 'Changed the success criteria') : r;
      }).then(function (r) {
        cbtn.disabled = false;
        if (!r.ok) { critStatus.textContent = r.body.error || 'That didn' + String.fromCharCode(8217) + 't save.'; return; }
        workflowTabs[id] = 'evaluation';
        loadWorkflowsSection(name);
      });
    });
    body.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.wf-save-case, .wf-case-remove, .wf-case-save, .wf-evals-run');
      if (!btn) return;
      var caseEl = btn.closest('[data-case]');
      var request;
      if (btn.classList.contains('wf-save-case')) request = [base + '/evals/cases', { method: 'POST', body: { runId: btn.dataset.run } }];
      else if (btn.classList.contains('wf-case-remove')) {
        if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
        request = [base + '/evals/cases/' + encodeURIComponent(caseEl.dataset.case), { method: 'DELETE' }];
      } else if (btn.classList.contains('wf-case-save')) request = [base + '/evals/cases/' + encodeURIComponent(caseEl.dataset.case), { method: 'PUT', body: { reference: caseEl.querySelector('.wf-case-ref').value } }];
      else request = [base + '/evals/run', { method: 'POST', body: {} }];
      btn.disabled = true;
      var opts = { method: request[1].method, headers: { 'content-type': 'application/json' } };
      if (request[1].body) opts.body = JSON.stringify(request[1].body);
      fetchJsonRetryOnce(request[0], opts).then(function (r) {
        if (!r.ok) { btn.disabled = false; result.textContent = r.body.error || 'That didn' + String.fromCharCode(8217) + 't work.'; return; }
        workflowTabs[id] = 'evaluation';
        loadWorkflowsSection(name);
      });
    });
    // A schedule opens its own row in the Schedules tab.
    var scheduleLinks = card.querySelectorAll('.workflow-schedule-link');
    for (var sl = 0; sl < scheduleLinks.length; sl++) {
      scheduleLinks[sl].addEventListener('click', function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
        ev.preventDefault();
        pendingScheduleFocus = ev.currentTarget.dataset.task;
        switchTab('schedules');
        focusScheduleRow();
      });
    }
    // + Webhook, beside + Schedule: straight to the form; once made, it's
    // listed in the trigger row with its setup steps.
    card.querySelector('.workflow-hooks-btn').addEventListener('click', function () {
      var w = workflowsById[id];
      if (!w) return;
      // Live at once: its URL now, to set up in the sending app.
      openHookFormDialog(w, base + '/triggers', function (url, triggerId) {
        loadWorkflowHooks(name, card, { url: url, id: triggerId });
      });
    });
    var wf = workflowsById[id];
    if (wf && (wf.webhooks || wf.webhooksWaiting || wf.webhooksOff)) loadWorkflowHooks(name, card);
    // Add a schedule: the Schedules tab's form, with this workflow chosen.
    card.querySelector('.workflow-add-schedule').addEventListener('click', function () {
      pendingScheduleWorkflow = id;
      switchTab('schedules');
    });
    // Undoing a removal drafted before schedules went live at once.
    var draftScheduleBtns = card.querySelectorAll('.workflow-schedule-draft');
    for (var dsb = 0; dsb < draftScheduleBtns.length; dsb++) {
      draftScheduleBtns[dsb].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        var path = base + '/draft/schedules/' + encodeURIComponent(btn.dataset.id);
        (btn.dataset.action === 'restore' ? fetchJsonRetryOnce(path + '/restore', { method: 'POST' }) : fetchJsonRetryOnce(path, { method: 'DELETE' })).then(function () { loadWorkflowsSection(name); });
      });
    }
    var scheduleBtns = card.querySelectorAll('.workflow-schedule-action');
    for (var sb = 0; sb < scheduleBtns.length; sb++) {
      scheduleBtns[sb].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var action = btn.dataset.action;
        if (action === 'cancel' && btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
        btn.disabled = true;
        // Schedules are live at once (and in Audit): removing one cancels it.
        var request = fetchJsonRetryOnce('/schedules/' + encodeURIComponent(btn.dataset.id) + '/' + action, { method: 'POST' });
        request.then(function () {
          loadWorkflowsSection(name);
          // The Schedules tab's count, and the Overview's tile.
          fillOverviewCards(name);
        });
      });
    }
    card.querySelector('.workflow-run').addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var params = {};
      var inputs = card.querySelectorAll('.workflow-params textarea, .workflow-params input, .workflow-params select');
      for (var i = 0; i < inputs.length; i++) {
        var value = inputs[i].value.trim();
        if (!value && inputs[i].required) { result.textContent = 'Fill in ' + inputs[i].name + ' first.'; inputs[i].focus(); return; }
        if (value) params[inputs[i].name] = value;
      }
      btn.disabled = true;
      result.textContent = 'Starting' + String.fromCharCode(8230);
      fetchJsonRetryOnce(base + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ params: params, source: 'console' }) }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { result.textContent = r.body.error || 'Could not start it.'; return; }
        var started = workflowsById[id];
        result.innerHTML = 'Started. Questions and approvals go to ' + workflowDecisionsTo(started || {}) + '; follow it in Activity.' + (started && started.delivery && started.delivery.result_to_chat ? ' The result will also be posted to the messaging app when it finishes.' : '') +
          (r.body.warnings ? ' ' + escapeHtml(r.body.warnings.join(' ')) : '');
        setTimeout(function () { loadWorkflowsSection(name); }, 800);
      });
    });
    card.querySelector('.workflow-forget').addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
      fetchJsonRetryOnce(base, { method: 'DELETE' }).then(function () { loadWorkflowsSection(name); });
    });
  }

  function fillOverviewCards(name) {
    Promise.all([
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/notifier'),
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/pending'),
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/schedules'),
    ]).then(function (results) {
      if (currentName !== name) return;
      var set = function (id, html) { var el = detail.querySelector('#' + id); if (el) el.innerHTML = html; };
      var n = results[0].ok ? results[0].body : null;
      showMessagingCount(n);
      var pending = (results[1].ok && results[1].body.pending) || [];
      var connected = n && (n.source === 'file' || n.source === 'code' || n.source === 'default');
      set('ovMessagingValue', !n ? '&mdash;' : connected ? escapeHtml(APP_NAMES[n.channel] || n.channel) + (n.source === 'default' ? ' (default)' : '') : 'Not connected');
      var messagingDetail = [];
      if (pending.length) messagingDetail.push(pending.length + ' waiting for a decision');
      if (n && connected && n.channel === 'slack' && n.plan !== 'free' && (!n.file || n.file.conversations !== false)) messagingDetail.push('answers replies in threads');
      if (n && !connected) messagingDetail.push(n.missingSecret ? 'Saved, but its secret isn' + String.fromCharCode(8217) + 't set' : 'Send approvals and questions to Telegram, Slack, Lark, email or a webhook');
      if (!messagingDetail.length && n) messagingDetail.push('Sends ' + escapeHtml((n.events || []).join(', ')));
      set('ovMessagingDetail', messagingDetail.join(' \u00b7 '));
      showPendingCount(pending.length);

      var tasks = (results[2].ok && results[2].body.tasks) || [];
      var active = tasks.filter(function (t) { return t.status !== 'cancelled' && t.status !== 'done'; });
      var waiting = active.filter(function (t) { return t.status === 'awaiting_approval'; }).length;
      var next = active.map(function (t) { return t.next_run_at; }).filter(Boolean).sort()[0];
      set('ovSchedulesValue', String(active.length));
      leShell.setCount('schedules', active.length);
      var schedulesDetail = [];
      if (waiting) schedulesDetail.push(waiting + ' waiting for approval');
      if (next) schedulesDetail.push('Next run ' + escapeHtml(new Date(next).toLocaleString()));
      set('ovSchedulesDetail', schedulesDetail.join(' \u00b7 ') || (active.length ? 'None due' : 'Run this agent on a timer'));
    });
  }

  // An edit form in a dialog, written in place, so its handlers find its
  // fields where they always did and a save that redraws the section takes
  // the dialog with it. titleHtml is the header (an h3, which may carry an
  // id the form's code retitles); its Cancel carries data-dialog-cancel.
  function editDialogHtml(titleHtml, leadHtml, formHtml) {
    return '<dialog class="le-dialog edit-dialog"><div class="hd">' +
      '<header class="hd-head"><div>' + titleHtml + (leadHtml || '') + '</div><button type="button" class="hd-close" aria-label="Close">&times;</button></header>' +
      '<div class="ed-body">' + formHtml + '</div></div></dialog>';
  }

  // Opens the dialog an edit form sits in. Esc, the backdrop and the close
  // button press the form's own Cancel, so the page puts itself back as
  // its Cancel always did.
  function openEditDialog(form) {
    var dialog = form && form.closest('dialog.edit-dialog');
    if (!dialog) return;
    if (!dialog.dataset.wired) {
      dialog.dataset.wired = '1';
      var cancel = dialog.querySelector('[data-dialog-cancel]');
      var byCancel = false;
      if (cancel) cancel.addEventListener('click', function () { byCancel = true; if (dialog.open) dialog.close(); });
      dialog.querySelector('.hd-close').addEventListener('click', function () { dialog.close(); });
      dialog.addEventListener('click', function (ev) { if (ev.target === dialog) dialog.close(); });
      dialog.addEventListener('close', function () {
        if (!byCancel && cancel) cancel.click();
        byCancel = false;
      });
    }
    if (!dialog.open) dialog.showModal();
  }

  function renderOverviewHtml(cfg) {
    // The name people see; the id is fixed (its folder, API address and
    // saved records all use it).
    var nameSection =
      '<h3>Name <button type="button" class="edit-btn" id="editDisplayNameBtn">Edit</button></h3>' +
      '<p class="ov-name"><span id="displayNameDisplay">' + escapeHtml(cfg.displayName || cfg.name) + '</span>' +
        ' <span class="muted">&middot; id <code>' + escapeHtml(cfg.name) + '</code></span></p>' +
      editDialogHtml('<h3>Edit name</h3>', '<p>The name shown in the sidebar and at the top of its pages. Its id, <code>' + escapeHtml(cfg.name) + '</code>, stays the same: its API address and saved runs use it.</p>',
        '<form class="add-source" id="displayNameForm" style="display:none">' +
          '<label>Name<input type="text" name="displayName" maxlength="60" placeholder="' + escapeHtml(cfg.name) + '" value="' + escapeHtml(cfg.displayName || '') + '"></label>' +
          '<p class="hint" style="margin:0">Leave it empty to show the id.</p>' +
          '<div class="error" id="displayNameError"></div>' +
          '<div class="ed-actions"><button type="button" data-dialog-cancel>Cancel</button><button type="submit" class="primary">Save</button></div>' +
        '</form>');

    var systemPromptSection =
      '<h3>Instructions <button type="button" class="edit-btn" id="editSystemPromptBtn">Edit</button></h3>' +
      '<pre id="systemPromptDisplay">' + escapeHtml(cfg.systemPrompt) + '</pre>' +
      editDialogHtml('<h3>Edit instructions</h3>', '<p>What the agent reads on every run: who it is and the rules it always follows.</p>',
        '<form class="add-source" id="systemPromptForm" style="display:none">' +
          '<textarea name="systemPrompt" class="ed-tall">' + escapeHtml(cfg.systemPrompt) + '</textarea>' +
          '<div class="error" id="systemPromptError"></div>' +
          '<div class="ed-actions"><button type="button" id="cancelSystemPromptBtn" data-dialog-cancel>Cancel</button><button type="submit" class="primary">Save</button></div>' +
        '</form>');

    // Only editable when cfg.model is the resolved {provider, model,
    // maxTokens} object — a custom createModelCall (the string case) has
    // no config.model at all for agent-file-admin.ts's editAgentFile to
    // find and edit; see its own doc comment for why it refuses rather
    // than guessing at that case.
    var modelSection;
    if (typeof cfg.model === 'string') {
      modelSection = '<h3>Model</h3><p class="muted">' + escapeHtml(cfg.model) + '</p>';
    } else {
      modelSection =
        '<h3>Model <button type="button" class="edit-btn" id="editModelBtn">Edit</button></h3>' +
        '<dl class="kv" id="modelDisplay">' +
          '<dt>Provider</dt><dd>' + escapeHtml(providerName(cfg.model.provider)) + '</dd>' +
          '<dt>Model</dt><dd>' + escapeHtml(cfg.model.model || '(provider default)') + '</dd>' +
          '<dt>Longest reply</dt><dd>' + escapeHtml(cfg.model.maxTokens != null ? Number(cfg.model.maxTokens).toLocaleString() + ' tokens' : 'The provider' + String.fromCharCode(8217) + 's default') + '</dd>' +
          // Unset is low for OpenAI's reasoning models (core/model-calls/openai-model-call.ts).
          '<dt>Reasoning effort</dt><dd>' + escapeHtml(cfg.model.reasoningEffort ||
            (cfg.model.provider === 'openai' && /^(gpt-[5-9]|o[0-9])/i.test(cfg.model.model || '') ? 'low (default)'
              : REASONING_PROVIDERS.indexOf(cfg.model.provider) !== -1 ? 'The model' + String.fromCharCode(8217) + 's default' : 'Not supported by this provider')) + '</dd>' +
        '</dl>' +
        editDialogHtml('<h3>Edit model</h3>', '<p>The model this agent uses, and how much it may write and think.</p>',
        '<form class="add-source" id="modelForm" style="display:none">' +
          '<label>Provider' +
            '<select name="provider">' +
              ['openai', 'anthropic', 'gemini', 'meta', 'xai', 'deepseek', 'kimi', 'glm'].map(function (p) {
                return '<option value="' + p + '"' + (p === cfg.model.provider ? ' selected' : '') + '>' + p + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<label>Model name <span class="hint">(choose Other&hellip; to type a model not in the list)</span>' +
            '<input type="text" name="modelName" value="' + escapeHtml(cfg.model.model || '') + '">' +
          '</label>' +
          '<label>Max tokens <span class="hint">(blank for provider default)</span>' +
            '<input type="number" name="maxTokens" min="1" step="1" value="' + (cfg.model.maxTokens != null ? escapeHtml(cfg.model.maxTokens) : '') + '">' +
          '</label>' +
          '<label id="reasoningEffortField">Reasoning effort <span class="hint">(how much the model thinks before answering: none turns it off, unset uses the model\\\'s default, and low for OpenAI\\\'s reasoning models)</span>' +
            '<select name="reasoningEffort">' +
              ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(function (v) {
                return '<option value="' + v + '"' + (v === (cfg.model.reasoningEffort || '') ? ' selected' : '') + '>' + (v || '(unset)') + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<div class="error" id="modelError"></div>' +
          '<div class="ed-actions"><button type="button" id="cancelModelBtn" data-dialog-cancel>Cancel</button><button type="submit" class="primary">Save</button></div>' +
        '</form>');
    }

    var mascotTpl = document.getElementById('ovMascot');
    return '<div class="ov-hero"><div class="ov-hero-text"><h2 class="le-display">' + escapeHtml(cfg.displayName || cfg.name) + '</h2>' +
        (cfg.systemPrompt ? '<p class="ov-hero-sub">' + escapeHtml(cfg.systemPrompt) + '</p>' : '') + '</div>' + (mascotTpl ? mascotTpl.innerHTML : '') + '</div>' +
      renderOverviewCards(cfg) +
      '<h3 class="ov-section-title">Settings</h3>' +
      '<div class="le-grid ov-settings">' +
      '<section>' + nameSection + '</section>' +
      '<section>' + modelSection + '</section>' +
      '<section class="ov-wide">' + systemPromptSection + '</section>' +
      '<section class="ov-wide"><h3>Limits <button type="button" class="edit-btn" id="editLimitsBtn">Edit</button></h3>' +
        '<dl class="kv kv-wide" id="limitsDisplay">' +
          '<dt>Model turns per run</dt><dd>' + escapeHtml(cfg.maxTurns) + ' <span class="hint">then the run stops</span></dd>' +
          '<dt>Conversation size</dt><dd>' + escapeHtml(Number(cfg.contextBudgetTokens).toLocaleString()) + ' tokens <span class="hint">older steps are summarised beyond this</span></dd>' +
          '<dt>Skill list size</dt><dd>' + escapeHtml(Number(cfg.skillIndexBudgetTokens).toLocaleString()) + ' tokens <span class="hint">for the names and descriptions of its skills</span></dd>' +
        '</dl>' +
        editDialogHtml('<h3>Edit limits</h3>', '<p>How long a run may go on, and how much of its conversation it keeps.</p>',
        '<form class="add-source" id="limitsForm" style="display:none">' +
          '<label>Model turns per run <span class="hint">(the most model calls in one chat turn or workflow run; then it stops)</span>' +
            '<input type="number" name="maxTurns" min="1" step="1" value="' + escapeHtml(cfg.maxTurns) + '">' +
          '</label>' +
          '<label>Conversation size <span class="hint">(tokens; beyond this, older steps are summarised)</span>' +
            '<input type="number" name="contextBudgetTokens" min="1" step="1" value="' + escapeHtml(cfg.contextBudgetTokens) + '">' +
          '</label>' +
          '<label>Skill list size <span class="hint">(tokens for the names and descriptions of its skills, which it always reads)</span>' +
            '<input type="number" name="skillIndexBudgetTokens" min="1" step="1" value="' + escapeHtml(cfg.skillIndexBudgetTokens) + '">' +
          '</label>' +
          '<div class="error" id="limitsError"></div>' +
          '<div class="ed-actions"><button type="button" id="cancelLimitsBtn" data-dialog-cancel>Cancel</button><button type="submit" class="primary">Save</button></div>' +
        '</form>') +
      '</section></div>';
  }

  // Wires the Instructions / Model / Limits Edit buttons rendered by
  // renderOverviewHtml above — called every time that HTML gets (re)set
  // (renderDetail, refreshOverviewPanel, refreshSkillsDependentPanels),
  // same pattern every other tab's own wireXHandlers already follows.
  // PUT /agents/:name persists via agent-file-admin.ts's editAgentFile
  // (see its own doc comment for why some agents' index.ts files can't
  // be safely edited this way at all — no editModelBtn is rendered for
  // those in the first place) and applies the change live; the response
  // is the freshly-resolved config, so this re-renders the whole
  // Overview panel from it directly instead of a second GET.
  // Advanced > Delete this agent: typing its name enables the button.
  function renderDeleteAgentHtml(cfg) {
    return '<div class="agent-delete">' +
      '<p class="muted" style="margin:0">Deletes <strong>' + escapeHtml(cfg.displayName || cfg.name) + '</strong> and everything in its folder: its instructions, workflows, skills, tools, apps, permission rules, messaging and keys. Its schedules and webhooks stop. Past runs and chats are kept. This can&#39;t be undone.</p>' +
      '<div class="agent-delete-row"><label for="deleteAgentName">Type <code>' + escapeHtml(cfg.name) + '</code> to confirm</label>' +
        '<input id="deleteAgentName" type="text" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="delete-btn" id="deleteAgentBtn" disabled>Delete agent</button></div>' +
      '<p class="hint" id="deleteAgentStatus" style="margin:0"></p></div>';
  }
  function wireDeleteAgent(name) {
    var input = detail.querySelector('#deleteAgentName');
    var btn = detail.querySelector('#deleteAgentBtn');
    var status = detail.querySelector('#deleteAgentStatus');
    if (!input || !btn) return;
    input.addEventListener('input', function () { btn.disabled = input.value.trim() !== name; });
    btn.addEventListener('click', function () {
      if (input.value.trim() !== name) return;
      btn.disabled = true;
      input.disabled = true;
      status.className = 'hint';
      status.textContent = 'Deleting' + String.fromCharCode(8230);
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name), { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: name }) })
        .then(function (r) {
          if (!r.ok) throw new Error((r.body && r.body.error) || 'Could not delete it.');
          location.href = '/agents';
        })
        .catch(function (err) {
          status.className = 'hint status-error';
          status.textContent = err.message;
          input.disabled = false;
          btn.disabled = input.value.trim() !== name;
        });
    });
  }

  function wireOverviewHandlers(name) {
    var overviewPanel = detail.querySelector('[data-tab-panel="overview"]');
    if (!overviewPanel) return;

    var editDisplayNameBtn = overviewPanel.querySelector('#editDisplayNameBtn');
    if (editDisplayNameBtn) {
      var displayNameForm = overviewPanel.querySelector('#displayNameForm');
      var displayNameError = overviewPanel.querySelector('#displayNameError');
      editDisplayNameBtn.addEventListener('click', function () {
        displayNameForm.style.display = '';
        openEditDialog(displayNameForm);
        displayNameForm.querySelector('input').select();
      });
      displayNameForm.querySelector('[data-dialog-cancel]').addEventListener('click', function () {
        displayNameForm.style.display = 'none';
        displayNameError.textContent = '';
      });
      displayNameForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        displayNameError.textContent = '';
        var submitBtn = displayNameForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: displayNameForm.querySelector('input[name="displayName"]').value }),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            currentCfg = result.body;
            overviewPanel.innerHTML = renderOverviewHtml(result.body);
            fillOverviewCards(currentName);
            wireOverviewHandlers(name);
            leShell.setDisplayName(name, result.body.displayName || '');
          })
          .catch(function (err) {
            displayNameError.textContent = err.message;
            submitBtn.disabled = false;
          });
      });
    }

    var editSystemPromptBtn = overviewPanel.querySelector('#editSystemPromptBtn');
    if (editSystemPromptBtn) {
      var systemPromptDisplay = overviewPanel.querySelector('#systemPromptDisplay');
      var systemPromptForm = overviewPanel.querySelector('#systemPromptForm');
      var systemPromptError = overviewPanel.querySelector('#systemPromptError');

      editSystemPromptBtn.addEventListener('click', function () {
        systemPromptForm.style.display = '';
        openEditDialog(systemPromptForm);
        systemPromptForm.querySelector('textarea').focus();
      });
      overviewPanel.querySelector('#cancelSystemPromptBtn').addEventListener('click', function () {
        systemPromptForm.style.display = 'none';
        systemPromptDisplay.style.display = '';
        editSystemPromptBtn.style.display = '';
        systemPromptError.textContent = '';
      });
      systemPromptForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        systemPromptError.textContent = '';
        var value = systemPromptForm.querySelector('textarea[name="systemPrompt"]').value;
        var submitBtn = systemPromptForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ systemPrompt: value }),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            currentCfg = result.body;
            overviewPanel.innerHTML = renderOverviewHtml(result.body);
            fillOverviewCards(currentName);
            wireOverviewHandlers(name);
          })
          .catch(function (err) {
            systemPromptError.textContent = err.message;
            submitBtn.disabled = false;
          });
      });
    }

    var editModelBtn = overviewPanel.querySelector('#editModelBtn');
    if (editModelBtn) {
      var modelDisplay = overviewPanel.querySelector('#modelDisplay');
      var modelForm = overviewPanel.querySelector('#modelForm');
      var modelError = overviewPanel.querySelector('#modelError');

      // Only OpenAI and Anthropic models take a reasoning effort: the
      // field shows for those, and is cleared for any other provider so
      // it's never saved with one.
      var providerSelect = modelForm.querySelector('select[name="provider"]');
      var reasoningField = modelForm.querySelector('#reasoningEffortField');
      function syncReasoningField() {
        var supported = REASONING_PROVIDERS.indexOf(providerSelect.value) !== -1;
        reasoningField.style.display = supported ? '' : 'none';
        if (!supported) reasoningField.querySelector('select').value = '';
      }
      providerSelect.addEventListener('change', syncReasoningField);
      editModelBtn.addEventListener('click', function () {
        syncReasoningField();
        modelForm.style.display = '';
        openEditDialog(modelForm);
        // Only providers with a key saved can be chosen; the agent's
        // current one stays selectable either way. Then the model dropdown.
        var currentProvider = modelForm.querySelector('select[name="provider"] option[selected]');
        leShell.loadProviderKeys().then(function (keys) {
          leShell.applyProviderKeys(modelForm, keys, currentProvider && currentProvider.value);
          leShell.wireModelPicker(modelForm);
        });
      });
      overviewPanel.querySelector('#cancelModelBtn').addEventListener('click', function () {
        modelForm.style.display = 'none';
        modelDisplay.style.display = '';
        editModelBtn.style.display = '';
        modelError.textContent = '';
      });
      modelForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        modelError.textContent = '';
        var data = new FormData(modelForm);
        var submitBtn = modelForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        var body = { model: { provider: data.get('provider') } };
        var modelName = data.get('modelName');
        if (modelName && modelName.trim()) body.model.model = modelName;
        var maxTokens = data.get('maxTokens');
        if (maxTokens && String(maxTokens).trim()) body.model.maxTokens = parseInt(maxTokens, 10);
        var reasoningEffort = data.get('reasoningEffort');
        if (reasoningEffort) body.model.reasoningEffort = reasoningEffort;
        fetchJsonRetryOnce('/agents/' + encodeURIComponent(name), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            currentCfg = result.body;
            overviewPanel.innerHTML = renderOverviewHtml(result.body);
            fillOverviewCards(currentName);
            wireOverviewHandlers(name);
          })
          .catch(function (err) {
            modelError.textContent = err.message;
            submitBtn.disabled = false;
          });
      });
    }

    var editLimitsBtn = overviewPanel.querySelector('#editLimitsBtn');
    if (editLimitsBtn) {
      var limitsDisplay = overviewPanel.querySelector('#limitsDisplay');
      var limitsForm = overviewPanel.querySelector('#limitsForm');
      var limitsError = overviewPanel.querySelector('#limitsError');

      editLimitsBtn.addEventListener('click', function () {
        limitsForm.style.display = '';
        openEditDialog(limitsForm);
      });
      overviewPanel.querySelector('#cancelLimitsBtn').addEventListener('click', function () {
        limitsForm.style.display = 'none';
        limitsDisplay.style.display = '';
        editLimitsBtn.style.display = '';
        limitsError.textContent = '';
      });
      limitsForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        limitsError.textContent = '';
        var data = new FormData(limitsForm);
        var submitBtn = limitsForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        var body = {
          maxTurns: Number(data.get('maxTurns')),
          contextBudgetTokens: Number(data.get('contextBudgetTokens')),
          skillIndexBudgetTokens: Number(data.get('skillIndexBudgetTokens')),
        };
        fetch('/agents/' + encodeURIComponent(name), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            currentCfg = result.body;
            overviewPanel.innerHTML = renderOverviewHtml(result.body);
            fillOverviewCards(currentName);
            wireOverviewHandlers(name);
          })
          .catch(function (err) {
            limitsError.textContent = err.message;
            submitBtn.disabled = false;
          });
      });
    }
  }

  // ---- Overview's own Actauth section: read-only, from cfg.permissions
  // (already resolved by run-agent.ts's own loadRules — 3-segment
  // scopePattern, "when" conditions included). The dedicated Actauth tab
  // below is a *different* view: editable, and reading/writing the raw
  // 2-segment scope actauth.yml itself has, via a separately-fetched
  // GET /agents/:name/actauth — see renderActauthTabPlaceholder. Keeping
  // these two independent avoids a scope-format mismatch: round-tripping
  // cfg.permissions' own expanded 3-segment scopePattern back through an
  // edit would permanently "expand" a hand-authored 2-segment rule the
  // moment anyone touched it. ----

  function renderRules(permissions) {
    var header = '<dl class="kv">' +
      '<dt>Source</dt><dd>' + escapeHtml(permissions.source) + '</dd>' +
      '<dt>Default decision</dt><dd class="' + decisionClass(permissions.defaultDecision) + '">' + escapeHtml(permissions.defaultDecision) + '</dd>' +
      '</dl>';
    if (!permissions.rules.length) return header + '<p class="muted">No explicit rules — every tool call falls through to the default decision above.</p>';
    var rows = permissions.rules.map(function (r) {
      return '<tr>' +
        '<td><code>' + escapeHtml(r.scopePattern) + '</code></td>' +
        '<td><code>' + escapeHtml(r.tool) + '</code></td>' +
        '<td class="' + decisionClass(r.decision) + '">' + escapeHtml(r.decision) + '</td>' +
        '<td>' + (r.when ? '<pre>' + escapeHtml(JSON.stringify(r.when, null, 2)) + '</pre>' : '') + '</td>' +
        '</tr>';
    }).join('');
    return header + '<table style="margin-top:10px"><thead><tr><th>Scope</th><th>Tool</th><th>Decision</th><th>When</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ---- Actauth tab: editable — add/edit/delete rules and set
  // default_decision via actauth-admin.ts, working directly against the
  // file's own raw scope strings (see the comment above). Lazily loaded
  // the same way Gateway Tools is (see loadActauthTab/actauthLoadedFor):
  // not because reading it is expensive here (it's a plain file read,
  // unlike describeGatewayTools' live reconnects), just to avoid a
  // redundant fetch on every agent switch for a tab that isn't always
  // opened. ----

  function renderActauthTabPlaceholder() {
    return '<div id="pendingNote"></div>' +
      '<section id="actauthSection"><div id="actauthContent"><p class="hint">Loading&hellip;</p></div></section>';
  }

  // The Messaging tab: the decisions still waiting, where approval
  // requests and questions go, and whether the agent answers replies
  // there. Filled by loadApprovalsSection.
  function renderMessagingTabPlaceholder() {
    return '<div id="pendingContent"></div>' +
      '<div id="approvalsContent"><p class="hint">Loading&hellip;</p></div>';
  }

  // The Messaging tab's count, like the other tabs': the messaging apps
  // it's connected to (a notifier in its code, or the server's default,
  // counts as one when none is saved).
  function showMessagingCount(n) {
    if (!n) return;
    var saved = (n.connections || []).length;
    leShell.setCount('messaging', saved || (n.source === 'code' || n.source === 'default' ? 1 : 0));
  }

  // How many decisions are waiting: an amber badge beside the Messaging
  // tab's count, seen from every tab, and a line at the top of Permissions.
  function showPendingCount(n) {
    var link = detail.querySelector('.le-tab[data-tab="messaging"]');
    var badge = link && link.querySelector('.le-pending');
    if (link && n && !badge) { badge = document.createElement('span'); badge.className = 'le-pending'; link.appendChild(badge); }
    if (badge) {
      if (n) { badge.textContent = String(n); badge.title = (n === 1 ? '1 request is' : n + ' requests are') + ' waiting for a decision'; }
      else badge.remove();
    }
    var note = detail.querySelector('#pendingNote');
    if (note) {
      note.innerHTML = n
        ? '<div class="approvals-nudge">' + (n === 1 ? '1 request is' : n + ' requests are') + ' waiting for a decision. <a href="?tab=messaging" data-tab="messaging">See Messaging</a></div>'
        : '';
    }
  }

  function refreshPendingCount(name) {
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/pending').then(function (r) {
      if (currentName === name && r.ok) showPendingCount((r.body.pending || []).length);
    });
  }

  // A decision in words, as on the homepage: Allow, Ask me (wait for a
  // person) or Never.
  var DECISION_LABELS = { allow: 'Allow', ask: 'Ask me', deny: 'Never' };

  // Three buttons for a decision; the pressed one is current. attrs
  // says what the switch sets (a rule, or the default decision).
  function decisionSwitch(current, label, attrs) {
    return '<div class="decision-switch" role="group" aria-label="' + escapeHtml(label) + '" ' + attrs + '>' +
      ['allow', 'ask', 'deny'].map(function (d) {
        return '<button type="button" data-decision="' + d + '" aria-pressed="' + (current === d ? 'true' : 'false') + '">' + DECISION_LABELS[d] + '</button>';
      }).join('') + '</div>';
  }

  function renderActauthRuleRow(r) {
    var actionsHtml = r.name
      ? '<button type="button" class="edit-rule-btn" data-name="' + escapeHtml(r.name) + '">Edit</button> ' +
        '<button type="button" class="delete-btn delete-rule-btn" data-name="' + escapeHtml(r.name) + '" title="Remove this rule" aria-label="Remove this rule">Delete</button>'
      // A rule with no "name" in the YAML has nothing this tab's
      // update/removeActauthRule (both keyed by name) can address — left
      // visible, but not editable here.
      : '<span class="hint">unnamed — edit actauth.yml directly</span>';
    // Advanced's rule editor: every rule in full, name and scope included.
    return '<tr>' +
      '<td><code>' + escapeHtml(r.name || '') + '</code></td>' +
      '<td><code>' + escapeHtml(r.scope) + '</code></td>' +
      '<td>' + abilityCellHtml(r) + '</td>' +
      '<td><code>' + escapeHtml(r.tool) + '</code></td>' +
      '<td>' + (r.name
        ? decisionSwitch(r.decision, 'Decision for ' + r.name, 'data-rule="' + escapeHtml(r.name) + '"')
        : '<span class="le-pill ' + escapeHtml(r.decision) + '">' + escapeHtml(DECISION_LABELS[r.decision] || r.decision) + '</span>') + '</td>' +
      '<td>' + actionsHtml + '</td>' +
      '</tr>';
  }

  // The App/Ability column: an app by its name (Stripe), an ability by
  // its package name.
  function abilityCellHtml(x) {
    if (x.app) return '<span title="' + escapeHtml(x.ability || '') + '">' + escapeHtml(x.app) + '</span>';
    return x.ability ? '<code>' + escapeHtml(x.ability) + '</code>' : '<span class="hint">The agent' + String.fromCharCode(8217) + 's own</span>';
  }

  // The Permissions tab: every tool the agent has, each with its ability
  // and Allow / Ask me / Never (saved at once: its rule for everyone is
  // updated, or added), then the decision when no rule matches. Rules in
  // full (scopes, names, adding and removing) are in Advanced.
  function renderPermissionsHtml(cfg) {
    var tools = cfg.tools || [];
    var rows = tools.map(function (t) {
      var decision = t.editable
        ? decisionSwitch(t.decision, 'Decision for ' + t.tool, 'data-tool="' + escapeHtml(t.tool) + '"')
        : '<span class="le-pill ' + escapeHtml(t.decision) + '">' + escapeHtml(DECISION_LABELS[t.decision] || t.decision) + '</span>';
      var note = t.isDefault ? 'default' : t.scopeNote;
      return '<tr>' +
        '<td><code>' + escapeHtml(t.tool) + '</code></td>' +
        '<td>' + abilityCellHtml(t) + '</td>' +
        '<td>' + decision + (note ? ' <span class="hint">' + escapeHtml(note) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join('');
    return '<p class="muted" style="margin:0 0 20px">Decide which tool calls run on their own (Allow), which wait for a person (Ask me), and which never run (Never). Click to change; it&#39;s saved at once. Scoped rules, adding and removing rules are in <a href="?tab=advanced" data-tab="advanced">Advanced</a>.</p>' +
      '<section><h3>Tools (' + tools.length + ')</h3>' +
        (tools.length
          ? '<div class="le-table-wrap"><table class="actauth-rules"><thead><tr><th>Tool</th><th>From</th><th>Permission</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="hint">This agent has no tools yet. Install an ability, or add a tool in Advanced.</p>') +
        '<p class="error" id="toolsDecisionError" style="margin:6px 0 0"></p></section>' +
      '<section><h3>When no rule matches</h3>' +
        decisionSwitch(cfg.defaultDecision, 'Decision when no rule matches', 'id="defaultDecisionSwitch"') +
        '<p class="hint" style="margin:6px 0 0">For a tool with no rule (shown as default above), and any call no rule covers.</p>' +
        '<p class="error" id="defaultDecisionError" style="margin:4px 0 0"></p></section>';
  }

  // Advanced's Permission rules: every rule in actauth.yml, with its name
  // and scope, to edit, remove or add.
  function renderRulesEditorHtml(cfg) {
    var rulesHtml = cfg.rules.length
      ? '<div class="le-table-wrap"><table class="actauth-rules actauth-rules-full"><thead><tr><th>Name</th><th>Who (tenant / environment)</th><th>App/Ability</th><th>Tool</th><th>Decision</th><th></th></tr></thead><tbody>' +
        cfg.rules.map(renderActauthRuleRow).join('') + '</tbody></table></div>'
      : '<p class="hint">No rules yet: every tool call gets the decision for when no rule matches.</p>';
    return '<p class="muted" style="margin:0 0 12px">Every rule in <code>actauth.yml</code>. The first rule that matches a call decides it; Who narrows a rule to a tenant and environment (<code>*/*</code> is everyone).</p>' +
      rulesHtml + '<p class="error" id="rulesError" style="margin:6px 0 0"></p>' +
      '<div style="margin-top:16px"><button type="button" class="open-rule-form">Add a rule</button></div>' +
      editDialogHtml('<h3 id="ruleFormHeading">Add a rule</h3>', '<p>The first rule that matches a call decides it.</p>',
        '<form class="add-source" id="ruleForm">' +
          '<label>Name' +
            '<input name="name" id="ruleNameInput" required placeholder="my-rule-name">' +
          '</label>' +
          '<label>Who <span class="hint">(tenant/environment, e.g. "default/production" or "*/*" for everyone)</span>' +
            '<input name="scope" id="ruleScopeInput" required placeholder="default/production">' +
          '</label>' +
          '<label>Tool' +
            '<input name="tool" id="ruleToolInput" required placeholder="write_file">' +
          '</label>' +
          '<label>Decision' +
            '<select name="decision" id="ruleDecisionInput">' +
              '<option value="allow">Allow</option>' +
              '<option value="ask" selected>Ask me</option>' +
              '<option value="deny">Never</option>' +
            '</select>' +
          '</label>' +
          '<div id="ruleFormError" class="error"></div>' +
          '<div class="ed-actions"><button type="button" id="ruleCancelBtn" data-dialog-cancel style="display:none">Cancel</button><button type="submit" id="ruleSubmitBtn" class="primary">Add</button></div>' +
        '</form>') + '</section>';
  }

  // ---- Messaging tab: the decisions still waiting (GET .../pending),
  // where "ask" decisions go when nobody is in Chat, and whether the
  // agent answers replies there (web/notifier-admin.ts behind
  // GET/PUT/DELETE .../notifier), plus recent deliveries. Reloaded every
  // time the tab opens, so the waiting list is current. ----

  var lastNotifier = null;
  var NOTIFIER_EVENTS = [
    ['approval', 'Approvals'], ['question', 'Questions'], ['run_finish', 'Run finished'], ['run_start', 'Run started']
  ];

  function approvalsContentEl() {
    return detail.querySelector('#approvalsContent');
  }

  function renderPendingTable(pending) {
    if (!pending.length) return '<p class="hint">Nothing is waiting for a decision.</p>';
    return '<div class="le-table-wrap"><table><thead><tr><th>Waiting</th><th>Details</th><th>Session</th><th></th></tr></thead><tbody>' +
      pending.map(function (p) {
        var details = p.kind === 'question'
          ? escapeHtml((p.args && p.args.question) || p.reason)
          : '<code>' + escapeHtml(p.tool) + '</code> <span class="hint">' + escapeHtml(JSON.stringify(p.args)) + '</span>';
        var actions = p.kind === 'question'
          ? '<form class="pending-answer" data-id="' + escapeHtml(p.pendingId) + '" style="display:flex;gap:6px"><input name="answer" placeholder="Answer" required style="min-width:0"><button type="submit">Answer</button></form>'
          : '<div style="display:flex;gap:6px"><button type="button" class="primary pending-decide" data-id="' + escapeHtml(p.pendingId) + '" data-decision="approve">Approve</button>' +
            '<button type="button" class="pending-decide" data-id="' + escapeHtml(p.pendingId) + '" data-decision="deny">Deny</button></div>';
        if (p.decidePath) {
          actions += '<button type="button" class="pending-copy" data-path="' + escapeHtml(p.decidePath) + '" title="A link anyone can open to decide, no login needed" style="margin-top:6px">Copy link</button>';
        }
        return '<tr><td><span class="le-pill ' + (p.kind === 'question' ? 'accent' : 'ask') + '">' + (p.kind === 'question' ? 'question' : 'approval') + '</span>' +
          (p.createdAt ? '<div class="hint">' + escapeHtml(new Date(p.createdAt).toLocaleString()) + '</div>' : '') + '</td>' +
          '<td>' + details + '</td><td><code>' + escapeHtml(p.sessionId) + '</code></td><td>' + actions + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // The Messaging tab lists one section per app; each is set up and
  // saved on its own. A webhook always sends once set up; of the
  // messaging apps, only the primary one does.
  var CHANNEL_TITLES = { webhook: 'Webhook', telegram: 'Telegram', slack: 'Slack', lark: 'Lark / Feishu', email: 'Email' };
  // Each app's icon (web/messaging-icons.ts).
  var CHANNEL_ICONS = ${JSON.stringify(MESSAGING_ICONS)};
  var CHANNEL_BLURBS = {
    webhook: 'Your own app receives each request as a signed POST.',
    telegram: 'A Telegram bot posts requests to a group, channel or person.',
    slack: 'A Slack app posts requests to a channel, with buttons and replies in threads.',
    lark: 'A Lark or Feishu app posts requests to a chat.',
    email: 'Requests are emailed through Resend, SendGrid or Postmark.'
  };

  function connectionFor(n, channel) {
    var list = n.connections || [];
    for (var i = 0; i < list.length; i++) if (list[i].channel === channel) return list[i];
    return null;
  }

  function renderNotifierStatus(n) {
    if (n.source === 'code') return 'Set in this agent&#39;s <code>index.ts</code> (<code>httpNotifier</code>, ' + escapeHtml(n.channel) + '). Edit it there; code always wins over the connections below.';
    var rule = ' A webhook always sends once set up; of Telegram, Slack, Lark and email, only the primary one does.';
    var active = n.active || [];
    var sending = active.filter(function (a) { return !a.missingSecret; }).map(function (a) {
      return a.channel === 'webhook' ? 'your <strong>webhook</strong>' : '<strong>' + escapeHtml(CHANNEL_TITLES[a.channel] || a.channel) + '</strong> (primary)';
    });
    var waiting = active.filter(function (a) { return a.missingSecret; }).map(function (a) {
      return escapeHtml(CHANNEL_TITLES[a.channel] || a.channel) + ' is waiting for its secret (<code>' + escapeHtml(a.missingSecret) + '</code>)';
    });
    var appsSaved = (n.connections || []).some(function (c) { return c.channel !== 'webhook'; });
    var noPrimary = appsSaved && !n.primary ? ' No messaging app is primary: make one primary below.' : '';
    var html = sending.length ? 'Sending to ' + sending.join(' and ') + '.' : '';
    if (waiting.length) html += (html ? ' ' : '') + waiting.join('; ') + '.';
    if (html) return html + noPrimary + rule;
    var fallback = n.source === 'default' ? ' Until then the project-wide default webhook (<code>LOOPENGINE_DEFAULT_WEBHOOK_URL</code>, ' + escapeHtml(n.defaultWebhookUrl) + ') is used.' : ' Until then nobody is notified.';
    if (appsSaved) return '<strong>Nothing is sending.</strong>' + noPrimary + fallback + rule;
    return '<strong>Nowhere yet.</strong> Set up an app below; the first messaging app you save becomes primary.' + fallback + rule;
  }

  // Slack and Telegram: whether replies to a request are answered. On
  // unless turned off; locked on LoopEngine Cloud's free plan.
  function renderConversationsField(n, f, app) {
    var free = n.plan === 'free';
    var on = !free && f.conversations !== false;
    var where = app === 'telegram' ? 'Answer replies to a request' : 'Answer replies in a request&#39;s thread';
    return '<div class="body-field" style="margin:4px 0 0">' +
      '<label class="tool-picker-item" style="border:0;padding:0;justify-content:flex-start"><input type="checkbox" name="conversations" id="' + app + 'Conversations"' + (on ? ' checked' : '') + (free ? ' disabled' : '') + '> ' +
      where + (free ? ' <span class="le-pill accent">Pro</span>' : '') + '</label>' +
      '<p class="hint" style="margin:2px 0 0">' + (free
        ? 'Talking a request through in ' + CHANNEL_TITLES[app] + ' needs LoopEngine Pro. Approve and Deny buttons work on every plan.'
        : (app === 'telegram'
          ? 'People can reply to a request to ask the agent about it, and it answers there. Approvers (below) can also decide it that way.'
          : 'People can ask the agent about a request in its thread, and it answers there. Approvers (below) can also decide it there.')) + '</p></div>';
  }

  // Slack and Telegram: whether a DM to the bot, or a mention of it,
  // runs the agent. Off unless turned on; locked on the free plan.
  function renderJobsField(n, f, app) {
    var free = n.plan === 'free';
    var on = !free && f.jobs === true;
    var how = app === 'telegram'
      ? 'A private chat with the bot, or @mentioning it in a group, runs the agent on that message, and it answers with a reply. Replying to its answer carries the run on. In a group the bot only sees mentions when it&#39;s an admin or its privacy mode is off (@BotFather, /setprivacy); replies to its messages always reach it.'
      : 'A DM to the bot, or @mentioning it in a channel, runs the agent on that message, and it answers in a thread. Replies in the thread carry the run on.';
    return '<div class="body-field" style="margin:4px 0 0">' +
      '<label class="tool-picker-item" style="border:0;padding:0;justify-content:flex-start"><input type="checkbox" name="jobs" id="' + app + 'Jobs"' + (on ? ' checked' : '') + (free ? ' disabled' : '') + '> ' +
      'Start runs from messages' + (free ? ' <span class="le-pill accent">Pro</span>' : '') + '</label>' +
      '<p class="hint" style="margin:2px 0 0">' + (free ? 'Starting runs from ' + CHANNEL_TITLES[app] + ' needs LoopEngine Pro.' : how + ' Only approvers (below) can start runs; with none listed, anyone in its ' + (app === 'telegram' ? 'chat' : 'channel') + ' can, but not by direct message. A request it needs approved waits in the same thread.') + '</p></div>';
  }

  // A secret's state at a glance: a pill by the label, and a placeholder
  // saying whether typing replaces a saved one. Its value is never shown.
  function secretPill(isSet) {
    return isSet ? '<span class="le-pill good">Saved</span>' : '<span class="le-pill warn">Not set</span>';
  }
  // The field's name and its pill on one line (form labels stack their
  // children, which would stretch the pill across the row).
  function secretHead(name, isSet) {
    return '<span style="display:flex;align-items:center;gap:8px">' + name + secretPill(isSet) + '</span>';
  }
  function secretPlaceholder(isSet, missing) {
    return isSet ? 'Saved ' + String.fromCharCode(8212) + ' type a new one only to replace it' : missing;
  }
  var SECRET_HINTS = {
    slack: 'xoxb-' + String.fromCharCode(8230) + ' from OAuth & Permissions',
    webhook: 'A long random string, or Generate',
    telegram: 'The token @BotFather gave you, like 123456:ABC' + String.fromCharCode(8230),
    lark: 'App Secret from the Lark developer console',
    email: 'An API key from your email provider'
  };
  function secretField(n, channel, label) {
    var isSet = n.secretsSet && n.secretsSet[channel];
    return '<label>' + secretHead(label, isSet) + '<span class="hint">(stored in this agent&#39;s env as ' + escapeHtml(n.secretVars[channel]) + ')</span>' +
      '<span style="display:flex;gap:6px"><input type="password" name="secret" autocomplete="off" style="flex:1;min-width:0" placeholder="' + escapeHtml(secretPlaceholder(isSet, SECRET_HINTS[channel] || '')) + '">' +
      (channel === 'webhook' ? '<button type="button" class="notifier-generate">Generate</button>' : '') + '</span></label>';
  }

  // The settings only this app has.
  function renderChannelFields(n, channel, f) {
    if (channel === 'webhook') {
      return '<label>Webhook URL<input type="url" name="url" placeholder="https://your-app.example.com/hooks/loopengine" value="' + escapeHtml(f.url || '') + '"></label>' + secretField(n, 'webhook', 'Signing secret') +
        '<p class="hint" style="margin:0">Your app checks the <code>X-Actauth-Signature</code> header (HMAC-SHA256 of the body with the signing secret). Each payload carries a <code>decideUrl</code> it can simply forward to a person, or it can decide itself by sending <code>{"decision":"approve"}</code> or <code>{"decision":"deny"}</code> to <code>resolveUrl</code>.</p>';
    }
    if (channel === 'telegram') {
      return '<details class="slack-step"' + (n.secretsSet && n.secretsSet.telegram ? '' : ' open') + '><summary>Create the Telegram bot (once)</summary>' +
          '<ol class="hint" style="margin:6px 0;padding-left:18px">' +
            '<li>Message <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a>, send /newbot and follow the steps. Paste the token it gives you below.</li>' +
            '<li>Add the bot to the group or channel that should get requests (as an admin, for a channel), or start a chat with it yourself.</li>' +
            '<li>Find the chat id: send a message there, then open https://api.telegram.org/bot&lt;token&gt;/getUpdates and copy <code>chat.id</code>. A public channel can use @its-name instead.</li>' +
          '</ol></details>' +
        secretField(n, 'telegram', 'Bot token') +
        '<label>Chat ID <span class="hint">(a group or channel id like -1001234567890, or @channelname)</span><input name="chatId" placeholder="-1001234567890" value="' + escapeHtml(f.chatId || '') + '"></label>' +
        '<div class="body-field" style="margin:0">Replies and buttons' +
          '<p class="hint" style="margin:2px 0 6px">' + (n.telegram && n.telegram.webhookSet
            ? 'Telegram sends the bot&#39;s messages and button clicks to this server, so requests have Approve and Deny buttons and replies reach the agent.'
            : 'Each message links to a page where the person approves, denies or answers. Connect the bot to this server (save the bot token first) to add Approve and Deny buttons and let people reply.') + '</p>' +
          '<span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" id="telegramWebhookSet"' + (n.secretsSet && n.secretsSet.telegram ? '' : ' disabled') + '>' + (n.telegram && n.telegram.webhookSet ? 'Connect again' : 'Connect the bot') + '</button>' +
          (n.telegram && n.telegram.webhookSet ? '<button type="button" id="telegramWebhookCheck">Check connection</button>' : '') + '</span>' +
          '<div class="hint" id="telegramWebhookResult"></div></div>' +
        renderConversationsField(n, f, 'telegram') +
        renderJobsField(n, f, 'telegram');
    }
    if (channel === 'slack') {
      return '<details class="slack-step"' + (n.secretsSet && n.secretsSet.slack ? '' : ' open') + '><summary>Create the Slack app (once)</summary>' +
          '<ol class="hint" style="margin:6px 0;padding-left:18px">' +
            '<li>Open <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noopener">Slack apps</a> &rarr; Create New App &rarr; From a manifest, and pick your workspace.</li>' +
            '<li>Paste the manifest below, create the app, then Install to Workspace.</li>' +
            '<li>Copy the <strong>Bot User OAuth Token</strong> (starts with xoxb-) from OAuth &amp; Permissions into the field below.</li>' +
          '</ol>' +
          '<textarea id="slackManifest" readonly rows="8" style="font-family:var(--font-mono);font-size:11.5px"></textarea>' +
          '<button type="button" id="slackManifestCopy" style="margin-top:6px">Copy manifest</button>' +
        '</details>' +
        secretField(n, 'slack', 'Bot token') +
        '<label>Channel <span class="hint">(invite the bot to a private channel first: /invite @its-name)</span>' +
          '<span style="display:flex;gap:6px"><select id="slackChannelSelect" style="flex:1;min-width:0"><option value="">' + (f.channelId ? 'Saved: ' + escapeHtml(f.channelId) : 'Load channels to pick one') + '</option></select>' +
          '<button type="button" id="slackLoadChannels">Load channels</button></span></label>' +
        '<label>Channel ID <span class="hint">(filled in when you pick a channel)</span><input name="channelId" placeholder="C0123ABC456" value="' + escapeHtml(f.channelId || '') + '"></label>' +
        '<label>' + secretHead('Signing secret', n.slack && n.slack.signingSecretSet) + '<span class="hint">(from Basic Information ' + String.fromCharCode(8594) + ' App Credentials; ' +
          (n.slack && n.slack.signingSecretSet ? 'buttons and replies in Slack are on' : 'needed for buttons and replies in Slack; without it, messages only carry the approval link') + ')</span>' +
          '<input type="password" name="signingSecret" autocomplete="off" placeholder="' + escapeHtml(secretPlaceholder(n.slack && n.slack.signingSecretSet, 'Paste the Signing Secret')) + '"></label>' +
        '<p class="hint" style="margin:0">Buttons send their clicks to <code id="slackInteractivityUrl"></code> (the manifest already points there).</p>' +
        renderConversationsField(n, f, 'slack') +
        renderJobsField(n, f, 'slack') +
        '<p class="hint" style="margin:0" id="slackEventsNote"></p>';
    }
    if (channel === 'lark') {
      return '<label>App ID<input name="appId" value="' + escapeHtml(f.appId || '') + '"></label><label>Chat ID<input name="chatId" value="' + escapeHtml(f.chatId || '') + '"></label>' + secretField(n, 'lark', 'App secret');
    }
    return '<label>Email addresses <span class="hint">(who gets the requests; separate several with commas)</span><input name="emailTo" placeholder="ops@example.com, lead@example.com" value="' + escapeHtml(f.to || '') + '"></label>' +
      '<label>Sent by <span class="hint">(your email provider must allow sending from this address)</span><input name="emailFrom" placeholder="LoopEngine &lt;approvals@example.com&gt;" value="' + escapeHtml(f.from || '') + '"></label>' +
      '<label>Email provider<select name="emailProvider">' +
        [['resend', 'Resend'], ['sendgrid', 'SendGrid'], ['postmark', 'Postmark']].map(function (p) { return '<option value="' + p[0] + '"' + (f.provider === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') +
      '</select></label>' +
      secretField(n, 'email', 'API key') +
      '<p class="hint" style="margin:0">Each email links to a page where the person approves, denies, edits or answers, with no login. The link address below must be one they can open.</p>';
  }

  // A messaging app's form says whether it's the primary one, or offers
  // to make it primary on Save (ticked already when none is). The webhook
  // has neither: it always sends.
  function renderPrimaryField(n, channel, saved, isPrimary) {
    if (channel === 'webhook') return '';
    if (isPrimary) return '<p class="hint" style="margin:0"><span class="le-pill accent">Primary</span> This is the primary messaging app. To switch, tick &ldquo;Make this the primary messaging app&rdquo; in another app&#39;s section and save it.</p>';
    return '<div class="body-field" style="margin:0">' +
      '<label class="tool-picker-item" style="border:0;padding:0;justify-content:flex-start"><input type="checkbox" name="makePrimary"' + (n.primary ? '' : ' checked') + '> Make this the primary messaging app</label>' +
      '<p class="hint" style="margin:2px 0 0">' + (n.primary
        ? 'Only the primary messaging app sends; now that&#39;s ' + escapeHtml(CHANNEL_TITLES[n.primary] || n.primary) + '. ' + (saved ? 'Send test works either way.' : 'Leave this off to save ' + escapeHtml(CHANNEL_TITLES[channel] || channel) + ' for later.')
        : 'No messaging app is primary yet, so saving this one makes it primary.') + '</p></div>';
  }

  // Which bot each saved app connects as (@username on Telegram, the bot
  // and its workspace on Slack), next to the app's name once the apps
  // answer, so a slow one doesn't hold up the tab.
  function showMessagingIdentities(name, content) {
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/notifier/identities').then(function (r) {
      if (currentName !== name || !r.ok) return;
      var label = {
        telegram: r.body.telegram && '@' + r.body.telegram.username,
        slack: r.body.slack && r.body.slack.bot + (r.body.slack.team ? ' in ' + r.body.slack.team : ''),
      };
      Object.keys(label).forEach(function (channel) {
        var title = label[channel] && content.querySelector('details.msg-conn[data-channel="' + channel + '"] .msg-conn-title');
        if (!title || title.querySelector('.msg-conn-bot')) return;
        title.insertAdjacentHTML('beforeend', '<span class="msg-conn-bot">' + escapeHtml(label[channel]) + '</span>');
      });
    }).catch(function () { /* the tab works without the names */ });
  }

  // One app's section: its status in the summary, then its own form.
  function renderConnectionSection(n, channel) {
    var saved = connectionFor(n, channel);
    var f = saved || { channel: channel, events: ['approval', 'question'] };
    var isPrimary = n.primary === channel;
    var isWebhook = channel === 'webhook';
    var secretSet = n.secretsSet && n.secretsSet[channel];
    var pills = isPrimary ? '<span class="le-pill accent">Primary</span>' : isWebhook && saved ? '<span class="le-pill accent">Always on</span>' : '';
    pills += saved ? (secretSet ? ' <span class="le-pill good">Saved</span>' : ' <span class="le-pill warn">Secret not set</span>') : ' <span class="le-pill">Not set up</span>';
    var events = f.events || [];
    function eventBox(e) {
      return '<label class="tool-picker-item" style="border:0;padding:0;justify-content:flex-start"><input type="checkbox" name="events" value="' + e[0] + '"' + (events.indexOf(e[0]) !== -1 ? ' checked' : '') + '> ' + e[1] + '</label>';
    }
    var locked = n.canSave === false;
    // Every section starts closed; loadApprovalsSection reopens the ones
    // that were open before a save redrew the tab.
    var inUse = isPrimary || (isWebhook && saved);
    return '<details class="msg-conn' + (inUse ? ' is-primary' : '') + '" data-channel="' + channel + '">' +
      '<summary><span class="msg-conn-title">' + (CHANNEL_ICONS[channel] || '') + escapeHtml(CHANNEL_TITLES[channel] || channel) + '</span>' + pills +
        '<span class="hint msg-conn-blurb">' + escapeHtml(CHANNEL_BLURBS[channel] || '') + '</span></summary>' +
      '<form class="add-source notifier-form" data-channel="' + channel + '" style="max-width:560px">' +
        renderChannelFields(n, channel, f) +
        '<label>Link address <span class="hint">(messages link here so people can approve without logging in; use an address they can reach)</span>' +
          '<input type="url" name="publicUrl" class="notifier-public-url" value="' + escapeHtml(n.publicUrl || f.publicUrl || location.origin) + '"' + (n.publicUrl ? ' disabled title="Set by LOOPENGINE_PUBLIC_URL"' : '') + '></label>' +
        '<div class="body-field">Send' +
          '<div style="display:flex;gap:14px;flex-wrap:wrap">' + NOTIFIER_EVENTS.slice(0, 2).map(eventBox).join('') + '</div>' +
          '<details' + (events.indexOf('run_finish') !== -1 || events.indexOf('run_start') !== -1 ? ' open' : '') + '><summary>More events</summary>' +
          '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">' + NOTIFIER_EVENTS.slice(2).map(eventBox).join('') + '</div>' +
          '<p class="hint" style="margin:4px 0 0">Run finished tells your app the agent&#39;s final reply once a decision lets it finish.</p></details></div>' +
        renderPrimaryField(n, channel, saved, isPrimary) +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit"' + (locked ? ' disabled' : '') + '>' + (saved ? 'Save' : 'Save ' + escapeHtml(CHANNEL_TITLES[channel] || channel)) + '</button>' +
          (saved ? '<button type="button" class="notifier-test">Send test</button>' : '') +
          (saved ? '<button type="button" class="delete-btn notifier-remove"' + (locked ? ' disabled' : '') + '>Remove</button>' : '') + '</div>' +
        (isWebhook ? '<p class="hint" style="margin:0">A webhook always sends once saved, alongside the primary messaging app.</p>' : '') +
        '<div class="hint notifier-result"></div>' +
      '</form>' +
      // Who can decide and give jobs here: part of this app's settings.
      (channel === 'slack' || channel === 'telegram' ? renderApproversHtml(n, channel) : '') +
      '</details>';
  }

  function renderConnectionsHtml(n) {
    return (n.canSave === false ? leShell.adminNote('Saving needs <code>LOOPENGINE_ADMIN_AUTH</code> set on the server, because this stores a secret. Add <code>LOOPENGINE_ADMIN_AUTH=user:pass</code> to <code>.env</code> and restart.') : '') +
      '<div class="msg-conns">' + (n.channels || ['slack', 'telegram', 'lark', 'email', 'webhook']).map(function (c) { return renderConnectionSection(n, c); }).join('') + '</div>';
  }

  function renderDeliveries(list) {
    if (!list.length) return '<p class="hint">No deliveries since the server started.</p>';
    return '<div class="le-table-wrap"><table><thead><tr><th>When</th><th>What</th><th>Attempt</th><th>Result</th></tr></thead><tbody>' +
      list.slice(0, 15).map(function (d) {
        return '<tr><td>' + escapeHtml(new Date(d.at).toLocaleTimeString()) + '</td><td>' + escapeHtml(d.kind) + '</td><td>' + d.attempt + '</td>' +
          '<td>' + (d.ok ? '<span class="le-pill good">' + (d.status || 'ok') + '</span>' : '<span class="le-pill bad">' + escapeHtml(d.error || 'failed') + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Tools that can stop for approval: a rule that asks, or "ask" as the
  // decision when no rule matches.
  function askingTools() {
    var perms = currentCfg && currentCfg.permissions;
    if (!perms) return [];
    var tools = [];
    perms.rules.forEach(function (r) { if (r.decision === 'ask' && tools.indexOf(r.tool) === -1) tools.push(r.tool); });
    if (perms.defaultDecision === 'ask') tools.push('any tool without a rule');
    return tools;
  }

  // The top of the tab: a nudge when approvals over HTTP would reach
  // nobody, and whatever is waiting right now.
  function renderPendingHtml(pending, n) {
    var html = '';
    var tools = askingTools();
    if (tools.length && n && n.source === 'none') {
      html += '<div class="approvals-nudge"><strong>Approval requests aren&#39;t sent anywhere yet.</strong> ' +
        escapeHtml(tools.slice(0, 3).join(', ')) + (tools.length > 3 ? ' and more' : '') + ' can stop for approval, but when an app calls this agent over HTTP nobody is notified. ' +
        'Choose where they go below.</div>';
    }
    if (pending.length) html += '<section><h3>Waiting for a decision (' + pending.length + ')</h3>' + renderPendingTable(pending) + '</section>';
    return html;
  }

  // Slack and Telegram: the people who can decide by replying to a
  // request, whose button clicks count once any are listed, and who can
  // give the agent jobs. Shown once that app's connection is saved.
  function renderApproversHtml(n, app) {
    var conn = connectionFor(n, app);
    if (n.source === 'code' || !conn) return '';
    var title = CHANNEL_TITLES[app];
    var approvers = conn.approvers || [];
    var rows = approvers.map(function (a) {
      return '<tr><td>' + escapeHtml(a.name || a.user) + '</td><td><code>' + escapeHtml(a.user) + '</code></td>' +
        '<td><button type="button" class="delete-btn approver-remove" data-user="' + escapeHtml(a.user) + '"' + (n.canSave === false ? ' disabled' : '') + '>Remove</button></td></tr>';
    }).join('');
    var where = app === 'telegram' ? 'by replying to it' : 'by replying in its thread';
    return '<section class="approvers-section" data-app="' + app + '" style="max-width:560px;margin-top:18px;padding-top:14px;border-top:1px solid var(--le-line, #e5e7eb)"><h4 style="margin:0 0 6px">Approvers</h4>' +
      (n.primary !== app ? '<p class="hint" style="margin:0 0 8px">' + title + ' isn&#39;t primary, so requests aren&#39;t sent there until it is. Runs started there still use this list.</p>' : '') +
      '<p class="muted" style="margin:0 0 10px">People who can approve, deny, change or answer a request ' + where + ', like &ldquo;yes, go ahead&rdquo; or &ldquo;make it $40&rdquo;. A plain &ldquo;yes&rdquo; runs it; a reply that&#39;s less clear (&ldquo;sure, send it&rdquo;, &ldquo;yes but check the amount&rdquo;) shows exactly what will run with a Confirm button first, and a change is shown to approve first. Once anyone is listed, only approvers&#39; button clicks count, and only approvers can give the agent jobs. Anyone can still ask about a request.</p>' +
      (approvers.length
        ? '<div class="le-table-wrap" style="max-width:560px"><table><thead><tr><th>Name</th><th>' + title + ' ID</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="hint">No approvers yet. Until you add someone, anyone can use the buttons, and deciding by reply is off.</p>') +
      (n.canSave === false
        ? leShell.adminNote('Changing approvers needs <code>LOOPENGINE_ADMIN_AUTH</code> set on the server.')
        : '<p style="margin:10px 0 0"><button type="button" class="approvers-load">' + (app === 'telegram' ? 'Add people who messaged the bot' : 'Add people from the channel') + '</button></p>' +
          (app === 'telegram' ? '<p class="hint" style="margin:6px 0 0">Telegram can&#39;t list a chat&#39;s members, so people show up here once they&#39;ve written to the bot (a private message to it is enough), or add someone by their numeric user id:</p>' +
            '<span style="display:flex;gap:6px;max-width:560px;margin-top:6px"><input class="approver-manual-id" placeholder="User id, like 123456789" style="flex:1;min-width:0"><input class="approver-manual-name" placeholder="Name" style="flex:1;min-width:0"><button type="button" class="approver-manual-add">Add</button></span>' : '') +
          '<div class="approvers-picker"></div>') +
      '<div class="hint approvers-result"></div></section>';
  }

  function wireApproversHandlers(name, n) {
    var sections = detail.querySelectorAll('.approvers-section');
    for (var s = 0; s < sections.length; s++) wireApproversSection(name, n, sections[s]);
  }

  function wireApproversSection(name, n, section) {
    var app = section.dataset.app;
    var result = section.querySelector('.approvers-result');
    var conn = connectionFor(n, app);
    var current = (conn && conn.approvers) || [];
    function save(list, message) {
      result.textContent = 'Saving' + String.fromCharCode(8230);
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/notifier/approvers', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app: app, approvers: list }),
      }).then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || 'Could not save'; return; }
        loadApprovalsSection(name, message);
      });
    }
    var removes = section.querySelectorAll('.approver-remove');
    for (var i = 0; i < removes.length; i++) {
      removes[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
        save(current.filter(function (a) { return a.user !== btn.dataset.user; }), CHANNEL_TITLES[app] + ' approver removed.');
      });
    }
    var manualAdd = section.querySelector('.approver-manual-add');
    if (manualAdd) {
      manualAdd.addEventListener('click', function () {
        var id = section.querySelector('.approver-manual-id').value.trim();
        var who = section.querySelector('.approver-manual-name').value.trim();
        if (!/^[0-9]{1,20}$/.test(id)) { result.textContent = 'A Telegram user id is a number, like 123456789.'; return; }
        if (current.some(function (a) { return a.user === id; })) { result.textContent = 'They are already an approver.'; return; }
        save(current.concat([who ? { user: id, name: who } : { user: id }]), 'Added 1 ' + CHANNEL_TITLES[app] + ' approver.');
      });
    }
    var load = section.querySelector('.approvers-load');
    if (!load) return;
    load.addEventListener('click', function () {
      load.disabled = true;
      result.textContent = 'Loading people' + String.fromCharCode(8230);
      var path = app === 'telegram' ? '/notifier/telegram-people' : '/notifier/slack-members';
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + path).then(function (r) {
        load.disabled = false;
        if (!r.ok) { result.textContent = r.body.error || 'Could not load people'; return; }
        var taken = current.map(function (a) { return a.user; });
        var people = (r.body.members || r.body.people || []).filter(function (m) { return taken.indexOf(m.id) === -1; });
        result.textContent = '';
        var picker = section.querySelector('.approvers-picker');
        if (!people.length) {
          picker.innerHTML = '<p class="hint">' + (app === 'telegram' ? (taken.length ? 'Everyone who has written to the bot is already an approver.' : 'Nobody has written to the bot yet. Send it a message, then try again.') : 'Everyone in the channel is already an approver.') + '</p>';
          return;
        }
        picker.innerHTML = '<div class="tool-picker" style="max-width:560px;margin-top:8px">' + people.map(function (m) {
          var label = m.name + (m.username && m.name !== '@' + m.username ? ' (@' + m.username + ')' : '');
          return '<label class="tool-picker-item" style="justify-content:flex-start"><input type="checkbox" value="' + escapeHtml(m.id) + '" data-name="' + escapeHtml(m.name) + '"> ' + escapeHtml(label) + ' <span class="hint">' + escapeHtml(m.id) + '</span></label>';
        }).join('') + '</div><p style="margin:8px 0 0"><button type="button" class="primary approvers-add">Add selected</button></p>';
        picker.querySelector('.approvers-add').addEventListener('click', function () {
          var picked = picker.querySelectorAll('input:checked');
          if (!picked.length) { result.textContent = 'Pick at least one person.'; return; }
          var list = current.slice();
          for (var k = 0; k < picked.length; k++) list.push({ user: picked[k].value, name: picked[k].dataset.name });
          save(list, picked.length === 1 ? 'Added 1 ' + CHANNEL_TITLES[app] + ' approver.' : 'Added ' + picked.length + ' ' + CHANNEL_TITLES[app] + ' approvers.');
        });
      });
    });
  }

  function renderApprovalsHtml(n) {
    return '<p class="muted" style="margin:0 0 20px">Connect a messaging app, so this agent can reach people when nobody is in Chat. When an app calls it over HTTP or a scheduled task runs, and a tool call needs approval or the agent asks a question, the request is sent here. In Chat it shows up in the conversation instead.</p>' +
      '<section id="approvalsSetup"><h3>Connections</h3>' +
      '<p class="muted" style="margin:0 0 12px">' + renderNotifierStatus(n) + '</p>' +
        (n.error ? '<p class="error">' + escapeHtml(n.error) + '</p>' : '') +
        (n.source === 'code' ? '' : renderConnectionsHtml(n)) + '</section>' +

      '<section><h3>Recent deliveries</h3>' + renderDeliveries(n.deliveries || []) + '</section>';
  }

  function wirePendingHandlers(name) {
    var content = detail.querySelector('#pendingContent');
    if (!content) return;
    var copyBtns = content.querySelectorAll('.pending-copy');
    for (var c = 0; c < copyBtns.length; c++) {
      copyBtns[c].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var link = location.origin + btn.dataset.path;
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy link'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link', link); });
        else window.prompt('Copy this link', link);
      });
    }
    var decideBtns = content.querySelectorAll('.pending-decide');
    for (var i = 0; i < decideBtns.length; i++) {
      decideBtns[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        btn.disabled = true;
        fetchJsonRetryOnce('/pending-approvals/' + encodeURIComponent(btn.dataset.id) + '/resolve', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: btn.dataset.decision }),
        }).then(function () { loadApprovalsSection(name); });
      });
    }
    var answerForms = content.querySelectorAll('.pending-answer');
    for (var j = 0; j < answerForms.length; j++) {
      answerForms[j].addEventListener('submit', function (ev) {
        ev.preventDefault();
        var form = ev.currentTarget;
        fetchJsonRetryOnce('/pending-questions/' + encodeURIComponent(form.dataset.id) + '/answer', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: new FormData(form).get('answer') }),
        }).then(function () { loadApprovalsSection(name); });
      });
    }
  }

  function wireApprovalsHandlers(name) {
    var content = approvalsContentEl();
    if (!content) return;
    var forms = content.querySelectorAll('.notifier-form');
    for (var i = 0; i < forms.length; i++) wireConnectionForm(name, forms[i]);
  }

  // One app's section: Save (with its "make primary" box), Send test and Remove act on
  // that app's connection only.
  function wireConnectionForm(name, form) {
    var channel = form.dataset.channel;
    var result = form.querySelector('.notifier-result');
    var base = '/agents/' + encodeURIComponent(name) + '/notifier';
    var generate = form.querySelector('.notifier-generate');
    if (generate) {
      generate.addEventListener('click', function () {
        var bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        var input = form.querySelector('input[name="secret"]');
        input.type = 'text';
        input.value = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        result.textContent = 'Copy this secret into your app before saving; it is not shown again.';
      });
    }
    if (channel === 'slack') wireSlackFields(name, form, result);
    if (channel === 'telegram') wireTelegramFields(name, form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = new FormData(form);
      var body = { channel: channel, events: data.getAll('events'), publicUrl: data.get('publicUrl') };
      if (channel === 'webhook') body.url = data.get('url');
      if (channel === 'telegram') body.chatId = data.get('chatId');
      if (channel === 'slack') body.channelId = data.get('channelId');
      if (channel === 'lark') { body.appId = data.get('appId'); body.chatId = data.get('chatId'); }
      if (channel === 'email') { body.to = data.get('emailTo'); body.from = data.get('emailFrom'); body.provider = data.get('emailProvider'); }
      if (data.get('secret')) body.secret = data.get('secret');
      if (channel === 'slack' && data.get('signingSecret')) body.signingSecret = data.get('signingSecret');
      if (channel === 'slack' || channel === 'telegram') {
        var conversationsBox = form.querySelector('#' + channel + 'Conversations');
        var jobsBox = form.querySelector('#' + channel + 'Jobs');
        var savedConn = lastNotifier && connectionFor(lastNotifier, channel);
        // A locked switch (free plan) keeps whatever was saved before.
        if (conversationsBox && !conversationsBox.disabled) body.conversations = conversationsBox.checked;
        else if (savedConn && savedConn.conversations !== undefined) body.conversations = savedConn.conversations;
        if (jobsBox && !jobsBox.disabled) body.jobs = jobsBox.checked;
        else if (savedConn && savedConn.jobs !== undefined) body.jobs = savedConn.jobs;
      }
      // Ticked "Make this the primary messaging app" (or none is primary yet,
      // which the server treats the same) makes this one primary.
      var makePrimaryBox = form.querySelector('input[name="makePrimary"]');
      if (makePrimaryBox && makePrimaryBox.checked) body.primary = true;
      var first = Boolean(makePrimaryBox && makePrimaryBox.checked) || (channel !== 'webhook' && lastNotifier && !lastNotifier.primary);
      result.textContent = 'Saving' + String.fromCharCode(8230);
      fetchJsonRetryOnce(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || 'Could not save'; return; }
        loadApprovalsSection(name, first ? CHANNEL_TITLES[channel] + ' saved and made primary.' : CHANNEL_TITLES[channel] + ' saved.');
      });
    });

    var testBtn = form.querySelector('.notifier-test');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        result.textContent = 'Sending' + String.fromCharCode(8230);
        fetchJsonRetryOnce(base + '/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: channel }) }).then(function (r) {
          var t = r.body;
          result.textContent = t.ok ? 'Test delivered (' + (t.status || 'ok') + ').' : 'Test failed: ' + (t.error || 'unknown error');
        });
      });
    }

    var removeBtn = form.querySelector('.notifier-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (removeBtn.dataset.confirming !== '1') {
          removeBtn.dataset.confirming = '1';
          removeBtn.textContent = lastNotifier && lastNotifier.primary === channel ? 'Click again: no messaging app will be primary' : 'Click again to remove';
          return;
        }
        fetchJsonRetryOnce(base + '?channel=' + encodeURIComponent(channel), { method: 'DELETE' }).then(function () {
          loadApprovalsSection(name, CHANNEL_TITLES[channel] + ' removed.');
        });
      });
    }
  }

  // Telegram's section: Connect the bot points its updates at this
  // server; Check connection says where they go now.
  function wireTelegramFields(name, form) {
    var out = form.querySelector('#telegramWebhookResult');
    var url = '/agents/' + encodeURIComponent(name) + '/notifier/telegram-webhook';
    var setBtn = form.querySelector('#telegramWebhookSet');
    if (setBtn) {
      setBtn.addEventListener('click', function () {
        setBtn.disabled = true;
        out.textContent = 'Connecting' + String.fromCharCode(8230);
        fetchJsonRetryOnce(url, { method: 'POST' }).then(function (r) {
          setBtn.disabled = false;
          if (!r.ok) { out.textContent = r.body.error || 'Could not connect the bot'; return; }
          loadApprovalsSection(name, 'Telegram connected' + (r.body.botUsername ? ': people can now reply to @' + r.body.botUsername + String.fromCharCode(8217) + 's requests.' : '.'));
        });
      });
    }
    var checkBtn = form.querySelector('#telegramWebhookCheck');
    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        out.textContent = 'Checking' + String.fromCharCode(8230);
        fetchJsonRetryOnce(url).then(function (r) {
          if (!r.ok) { out.textContent = r.body.error || 'Could not check'; return; }
          var b = r.body;
          // Telegram keeps its last error until a newer one, so it says when.
          var when = '';
          if (b.lastErrorAt) {
            var mins = Math.max(0, Math.round((Date.now() - Date.parse(b.lastErrorAt)) / 60000));
            when = mins < 2 ? 'just now' : mins < 120 ? mins + ' minutes ago' : mins < 2880 ? Math.round(mins / 60) + ' hours ago' : Math.round(mins / 1440) + ' days ago';
            when = ' (' + when + ', ' + new Date(b.lastErrorAt).toLocaleString() + ')';
          }
          out.textContent = (b.pointsHere ? 'Connected' + (b.botUsername ? ' (@' + b.botUsername + ')' : '') + '.' : b.url ? 'The bot sends its updates somewhere else: ' + b.url + '. Connect again to point it here.' : 'The bot isn' + String.fromCharCode(8217) + 't sending its updates anywhere. Connect again.') +
            (b.pending ? ' ' + b.pending + ' update' + (b.pending === 1 ? '' : 's') + ' waiting to be delivered.' : '') +
            (b.lastError ? ' Telegram' + String.fromCharCode(8217) + 's last delivery error' + when + ': ' + b.lastError + (b.pointsHere && !b.pending ? ' Nothing is waiting, so it' + String.fromCharCode(8217) + 's likely from before and since fixed.' : '') : '');
        });
      });
    }
  }

  // Slack's section: the manifest follows the link address; Load channels
  // fills the picker.
  function wireSlackFields(name, form, result) {
    var n0 = lastNotifier;
    var manifestEl = form.querySelector('#slackManifest');
    var linkInput = form.querySelector('.notifier-public-url');
    function refreshSlackManifest() {
      if (!manifestEl || !n0 || !n0.slack) return;
      var url = (linkInput.value || location.origin).replace(/[/]+$/, '') + n0.slack.interactivityPath;
      // Slack checks an events URL when the app is created, which a
      // local address can't answer, so thread replies are left out there.
      var manifest = JSON.parse(JSON.stringify(n0.slack.manifestTemplate));
      var host = url.split('//')[1] || '';
      var local = host.indexOf('localhost') === 0 || host.indexOf('127.0.0.1') === 0 || host.indexOf('.localhost') !== -1;
      if (local && manifest.settings) delete manifest.settings.event_subscriptions;
      manifestEl.value = JSON.stringify(manifest, null, 2).split('__INTERACTIVITY_URL__').join(url);
      var eventsNote = form.querySelector('#slackEventsNote');
      if (eventsNote) eventsNote.textContent = local ? 'Replies in a request thread need a public link address; the agent answers them once the manifest has one.' : 'Replies in a request thread go to ' + url + '/events, and the agent answers questions about the request there.';
      var urlEl = form.querySelector('#slackInteractivityUrl');
      if (urlEl) urlEl.textContent = url;
    }
    if (linkInput) linkInput.addEventListener('input', refreshSlackManifest);
    refreshSlackManifest();
    var copyManifest = form.querySelector('#slackManifestCopy');
    if (copyManifest) {
      copyManifest.addEventListener('click', function () {
        manifestEl.select();
        var done = function () { copyManifest.textContent = 'Copied'; setTimeout(function () { copyManifest.textContent = 'Copy manifest'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(manifestEl.value).then(done, done); else done();
      });
    }
    var loadChannels = form.querySelector('#slackLoadChannels');
    var channelSelect = form.querySelector('#slackChannelSelect');
    if (!loadChannels) return;
    loadChannels.addEventListener('click', function () {
      loadChannels.disabled = true;
      result.textContent = 'Loading channels' + String.fromCharCode(8230);
      var token = form.querySelector('input[name="secret"]').value;
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/notifier/slack-channels', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ botToken: token }),
      }).then(function (r) {
        loadChannels.disabled = false;
        if (!r.ok) { result.textContent = r.body.error || 'Could not load channels'; return; }
        var current = form.querySelector('input[name="channelId"]').value;
        channelSelect.innerHTML = '<option value="">Pick a channel</option>' + r.body.channels.map(function (c) {
          return '<option value="' + escapeHtml(c.id) + '"' + (c.id === current ? ' selected' : '') + '>' + (c.isPrivate ? '&#128274; ' : '#') + escapeHtml(c.name) + (c.isMember ? '' : ' (bot not in channel yet)') + '</option>';
        }).join('');
        result.textContent = r.body.channels.length + ' channels found.';
      });
    });
    channelSelect.addEventListener('change', function () {
      if (channelSelect.value) form.querySelector('input[name="channelId"]').value = channelSelect.value;
    });
  }

  function loadApprovalsSection(name, message) {
    var content = approvalsContentEl();
    if (!content) return;
    Promise.all([
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/notifier'),
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/pending'),
    ]).then(function (results) {
      if (currentName !== name) return;
      if (!results[0].ok) throw new Error(results[0].body.error || 'request failed');
      lastNotifier = results[0].body;
      showMessagingCount(results[0].body);
      // Keep open the app sections that were open (a save redraws the tab).
      var wasOpen = Array.prototype.map.call(content.querySelectorAll('details.msg-conn[open]'), function (d) { return d.dataset.channel; });
      content.innerHTML = renderApprovalsHtml(results[0].body);
      wasOpen.forEach(function (channel) {
        var section = content.querySelector('details.msg-conn[data-channel="' + channel + '"]');
        if (section) section.open = true;
      });
      wireApprovalsHandlers(name);
      wireApproversHandlers(name, results[0].body);
      showMessagingIdentities(name, content);
      var pendingEl = detail.querySelector('#pendingContent');
      var pending = (results[1].ok && results[1].body.pending) || [];
      if (pendingEl) {
        pendingEl.innerHTML = renderPendingHtml(pending, results[0].body);
        wirePendingHandlers(name);
      }
      showPendingCount(pending.length);
      if (message) {
        var approverApp = message.indexOf('Telegram') !== -1 ? 'telegram' : 'slack';
        // Otherwise the section that was open, which is the one just saved.
        var r = message.indexOf('pprover') !== -1
          ? content.querySelector('.approvers-section[data-app="' + approverApp + '"] .approvers-result')
          : content.querySelector('details.msg-conn[open] .notifier-result') || content.querySelector('#notifierResult');
        if (r) r.textContent = message;
      }
    }).catch(function (err) {
      if (currentName !== name) return;
      content.innerHTML = '<p class="error">Could not load approvals: ' + escapeHtml(err.message) + '</p>';
    });
  }

  // ---- Schedules tab: messages this agent receives on a timer (core/
  // scheduler.ts behind GET/POST .../schedules and POST /schedules/:id/
  // run|pause|resume|cancel). Reloaded every time the tab opens, and
  // every few seconds while a run is in progress. ----

  var schedulesRefreshTimer = null;

  function schedulesContentEl() {
    return detail.querySelector('#schedulesContent');
  }

  function renderSchedulesTabPlaceholder() {
    return '<div id="schedulesContent"><p class="hint">Loading&hellip;</p></div>';
  }

  var SCHEDULE_PILLS = {
    scheduled: 'good', running: 'accent', awaiting_approval: 'ask', paused: 'neutral', done: 'neutral', cancelled: 'neutral'
  };
  var SCHEDULE_LABELS = {
    scheduled: 'scheduled', running: 'running', awaiting_approval: 'waiting for approval', paused: 'paused', done: 'done', cancelled: 'cancelled'
  };

  // The workspace's time zone, from GET /agents/:name/schedules (an
  // older project adapter doesn't send it: then the browser's own).
  var schedulesTimeZone = null;
  // The agent's workflows, from the same response: a new schedule can run
  // one of them instead of a message.
  var schedulesWorkflows = [];

  function fmtScheduleTime(iso) {
    var d = new Date(iso);
    if (schedulesTimeZone) {
      try { return d.toLocaleString(undefined, { timeZone: schedulesTimeZone, timeZoneName: 'short' }); } catch (e) {}
    }
    return d.toLocaleString();
  }

  function scheduleText(s) {
    // A repeating task's anchor is its first run, so it says when the
    // later ones fall (e.g. every 1d from 9:00).
    return s.run_at ? 'Once, ' + escapeHtml(fmtScheduleTime(s.run_at)) : 'Every ' + escapeHtml(s.every) + (s.anchor ? '<div class="hint">from ' + escapeHtml(fmtScheduleTime(s.anchor)) + '</div>' : '');
  }

  function renderScheduleRow(t) {
    var actions = [];
    if (t.status !== 'running' && t.status !== 'awaiting_approval' && t.status !== 'cancelled') actions.push(['run', 'Run now']);
    if (t.status === 'scheduled') actions.push(['pause', 'Pause']);
    if (t.status === 'paused') actions.push(['resume', 'Resume']);
    if (t.status !== 'cancelled' && t.status !== 'done') actions.push(['cancel', 'Cancel']);
    if (t.status === 'cancelled' || t.status === 'done') actions.push(['delete', 'Delete']);
    var lastOutcome = t.last_status === 'ok' ? (t.last_result || '') : (t.last_error || '');
    var last = t.last_run_at
      ? '<span class="le-pill ' + (t.last_status === 'ok' ? 'good' : 'bad') + '">' + escapeHtml(t.last_status) + '</span> ' +
        '<span class="hint">' + escapeHtml(fmtScheduleTime(t.last_run_at)) + '</span>' +
        (lastOutcome ? '<div class="schedule-result workflow-markdown">' + renderMarkdownPreview(lastOutcome) + '</div>' : '')
      : '<span class="hint">not run yet</span>';
    var history = (t.history || []).slice().reverse().map(function (h) {
      var outcome = h.status === 'ok' ? (h.result || '') : (h.error || '');
      return '<li><span class="le-pill ' + (h.status === 'ok' ? 'good' : 'bad') + '">' + escapeHtml(h.status) + '</span> <span class="hint">' + escapeHtml(fmtScheduleTime(h.ran_at)) + '</span>' +
        (outcome ? '<div class="schedule-result workflow-markdown">' + renderMarkdownPreview(outcome) + '</div>' : '') + '</li>';
    }).join('');
    return '<tr id="schedule-' + escapeHtml(t.task_id) + '">' +
      '<td style="min-width:180px"><strong>' + escapeHtml(t.task_name || 'Untitled') + '</strong>' +
        (t.workflow
          ? '<div><span class="le-pill accent">Workflow</span> <a href="' + escapeHtml(workflowPageHref(currentName, t.workflow.id)) + '" class="schedule-workflow-link" title="Open the workflow">' + escapeHtml(t.workflow.title) + '</a></div>' +
            '<div class="schedule-result hint">' + escapeHtml(t.workflow.description || t.workflow.start_message) +
              (t.params ? '<br>' + Object.keys(t.params).map(function (k) { return escapeHtml(k) + ': ' + escapeHtml(t.params[k]); }).join(' ' + String.fromCharCode(183) + ' ') : '') + '</div>'
          : t.workflow_missing
            ? '<div><span class="le-pill bad">Workflow removed</span> <span class="hint">' + escapeHtml(t.workflow_id) + '</span></div>'
            : '<div class="schedule-result hint">' + escapeHtml(t.message) + '</div>') +
        // A workflow's schedule follows its Messaging tab (an old tick here
        // was moved there when the server started).
        (t.status !== 'cancelled' && t.status !== 'done' && !t.workflow_id
          ? '<label class="schedule-notify hint" title="Sent through its Messaging Apps tab: Slack, email, Lark or a webhook"><input type="checkbox" class="schedule-notify-toggle" data-id="' + escapeHtml(t.task_id) + '"' + (t.notify ? ' checked' : '') + '> Send result to messaging app</label>'
          : (t.notify && !t.workflow_id ? '<div><span class="workflow-option-value">Send result to messaging app</span></div>' : '')) + '</td>' +
      '<td>' + scheduleText(t.schedule) + (t.next_run_at ? '<div class="hint">next ' + escapeHtml(fmtScheduleTime(t.next_run_at)) + '</div>' : '') + '</td>' +
      '<td><span class="le-pill ' + (SCHEDULE_PILLS[t.status] || 'neutral') + '">' + escapeHtml(SCHEDULE_LABELS[t.status] || t.status) + '</span>' +
        (t.status === 'awaiting_approval' ? '<div class="hint"><a href="#" class="schedule-to-approvals">Decide in Messaging</a></div>' : '') + '</td>' +
      '<td style="min-width:200px">' + last + (history ? '<details><summary class="hint">History (' + (t.history || []).length + ')</summary><ul class="schedule-history">' + history + '</ul></details>' : '') + '</td>' +
      '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' + actions.map(function (a) {
        return '<button type="button" class="schedule-action' + (a[0] === 'run' ? ' primary' : '') + (a[0] === 'cancel' || a[0] === 'delete' ? ' delete-btn' : '') + '" data-id="' + escapeHtml(t.task_id) + '" data-action="' + a[0] + '"' + (t.workflow_id ? ' data-workflow="' + escapeHtml(t.workflow_id) + '"' : '') + '>' + a[1] + '</button>';
      }).join('') + '</div></td></tr>';
  }

  function renderSchedulesHtml(tasks) {
    var active = tasks.filter(function (t) { return t.status !== 'cancelled' && t.status !== 'done'; });
    var list = tasks.length
      ? '<div class="le-table-wrap"><table><thead><tr><th>Task</th><th>When</th><th>Status</th><th>Last run</th><th></th></tr></thead><tbody>' + tasks.map(renderScheduleRow).join('') + '</tbody></table></div>'
      : '<p class="hint">Nothing scheduled yet.</p>';
    return '<p class="muted" style="margin:0 0 20px">Workflows and messages this agent runs on a timer, like a cron job. A workflow schedule runs the workflow&#39;s instructions as they are at each run. Each run works like an app calling it over HTTP: an approval goes wherever the Messaging Apps tab sends it, and with nowhere set, a call that needs approval is denied. The agent can also schedule its own tasks when asked in Chat (&ldquo;remind me tomorrow at 9&rdquo;); they appear here too.</p>' +
      '<section><h3>Scheduled (' + active.length + ' active)</h3>' + list + '</section>' +
      '<section><h3>New schedule</h3>' +
        '<form class="add-source" id="scheduleForm" style="max-width:560px">' +
          (schedulesWorkflows.length
            ? '<div class="body-field">Runs' +
                '<div class="schedule-when"><input type="radio" name="runs" value="workflow" id="runsWorkflow" checked><label for="runsWorkflow">A workflow</label>' +
                  '<select name="workflow_id" aria-label="Workflow">' + schedulesWorkflows.map(function (w) {
                    return '<option value="' + escapeHtml(w.id) + '">' + escapeHtml(w.title) + '</option>';
                  }).join('') + '</select></div>' +
                '<div class="workflow-params" id="scheduleParams" style="margin:0 0 4px 22px"></div>' +
                '<p class="hint" style="margin:0 0 4px 22px">Each run follows the workflow&#39;s instructions as they are then, so changing the workflow changes what runs.</p>' +
                '<div class="schedule-when"><input type="radio" name="runs" value="message" id="runsMessage"><label for="runsMessage">A message</label></div>' +
              '</div>'
            : '') +
          '<label id="scheduleMessageField"' + (schedulesWorkflows.length ? ' hidden' : '') + '>Message <span class="hint">(what the agent receives each time, as if someone typed it)</span><textarea name="message" placeholder="Summarize yesterday&#39;s support tickets and post the summary."></textarea></label>' +
          '<div class="body-field">When' +
            '<div class="schedule-when"><input type="radio" name="when" value="every" id="whenEvery" checked><label for="whenEvery">Every</label>' +
              '<input type="number" name="everyN" value="1" min="1" aria-label="How many">' +
              '<select name="everyUnit" aria-label="Unit"><option value="m">minutes</option><option value="h" selected>hours</option><option value="d">days</option><option value="w">weeks</option></select>' +
              '<label for="everyStart">starting</label><input type="datetime-local" name="everyStart" id="everyStart" aria-label="First run"></div>' +
            '<p class="hint" style="margin:0 0 4px 22px">Optional. The first run, which sets the time of day (and the weekday, for weeks) every later run keeps, e.g. every 1 day starting tomorrow 09:00. Without it, the first run is one interval from now.' +
              (schedulesTimeZone ? ' Times are in ' + escapeHtml(schedulesTimeZone.replace(/_/g, ' ')) + ' (<a href="/config?section=settings">change</a>).' : '') + '</p>' +
            '<div class="schedule-when"><input type="radio" name="when" value="once" id="whenOnce"><label for="whenOnce">Once at</label>' +
              '<input type="datetime-local" name="runAt" aria-label="Date and time"></div>' +
          '</div>' +
          '<label>Name <span class="hint">(optional)</span><input name="task_name" placeholder="Daily ticket summary"></label>' +
          '<label class="http-tool-inline-label" id="scheduleNotifyField"' + (schedulesWorkflows.length ? ' hidden' : '') + '><input type="checkbox" name="notify"> Send result to messaging app <span class="hint">(through its Messaging Apps tab: Slack, email, Lark or a webhook)</span></label>' +
          '<div style="display:flex;gap:8px"><button type="submit">Schedule</button></div>' +
          '<div id="scheduleResult" class="hint"></div>' +
        '</form></section>';
  }

  // The New schedule form's parameter fields ("param:<name>"), filled ones only.
  function scheduleParams(data) {
    var params = {};
    data.forEach(function (value, key) {
      if (key.indexOf('param:') === 0 && String(value).trim()) params[key.slice(6)] = String(value).trim();
    });
    return params;
  }

  // A date field's value ("2026-11-02T09:00") goes as it is, for the
  // server to read in the workspace's time zone; with no workspace time
  // zone known, it's the browser's.
  function scheduleFormTime(value) {
    return schedulesTimeZone ? value : new Date(value).toISOString();
  }

  function wireSchedulesHandlers(name) {
    var content = schedulesContentEl();
    if (!content) return;
    var actionBtns = content.querySelectorAll('.schedule-action');
    for (var i = 0; i < actionBtns.length; i++) {
      actionBtns[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var action = btn.dataset.action;
        if ((action === 'cancel' || action === 'delete') && btn.dataset.confirming !== '1') {
          btn.dataset.confirming = '1';
          btn.textContent = 'Click again to ' + action;
          return;
        }
        btn.disabled = true;
        var request = action === 'delete'
          ? fetchJsonRetryOnce('/schedules/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' })
          : fetchJsonRetryOnce('/schedules/' + encodeURIComponent(btn.dataset.id) + '/' + action, { method: 'POST' });
        request.then(function () { setTimeout(function () { loadSchedulesTab(name); }, action === 'run' ? 800 : 0); });
      });
    }
    var notifyToggles = content.querySelectorAll('.schedule-notify-toggle');
    for (var n = 0; n < notifyToggles.length; n++) {
      notifyToggles[n].addEventListener('change', function (ev) {
        var box = ev.currentTarget;
        box.disabled = true;
        fetchJsonRetryOnce('/schedules/' + encodeURIComponent(box.dataset.id) + '/result-to-chat', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ result_to_chat: box.checked }),
        }).then(function (r) {
          box.disabled = false;
          if (!r.ok) { box.checked = !box.checked; alert('Could not change it: ' + (r.body.error || 'unknown error')); }
        });
      });
    }
    var toApprovals = content.querySelectorAll('.schedule-to-approvals');
    for (var j = 0; j < toApprovals.length; j++) {
      toApprovals[j].addEventListener('click', function (ev) { ev.preventDefault(); switchTab('messaging'); });
    }
    var form = content.querySelector('#scheduleForm');
    var result = content.querySelector('#scheduleResult');
    var messageField = content.querySelector('#scheduleMessageField');
    var runsRadios = content.querySelectorAll('input[name="runs"]');
    var paramsBox = content.querySelector('#scheduleParams');
    var workflowSelect = form.querySelector('select[name="workflow_id"]');
    // One field per parameter of the chosen workflow.
    function renderScheduleParams() {
      if (!paramsBox || !workflowSelect) return;
      var w = schedulesWorkflows.filter(function (x) { return x.id === workflowSelect.value; })[0];
      var parameters = (w && w.parameters) || {};
      paramsBox.innerHTML = Object.keys(parameters).map(function (p) {
        return '<label class="workflow-param">' + escapeHtml(p) + (parameters[p].required ? '' : ' <span class="hint">(optional)</span>') +
          inputControlHtml('param:' + p, parameters[p], false) + '</label>';
      }).join('');
    }
    // Opened from a workflow's "Add a schedule": that workflow, chosen.
    if (pendingScheduleWorkflow && workflowSelect) {
      workflowSelect.value = pendingScheduleWorkflow;
      var runsWorkflowRadio = form.querySelector('#runsWorkflow');
      if (runsWorkflowRadio) runsWorkflowRadio.checked = true;
      form.scrollIntoView({ block: 'start' });
    }
    pendingScheduleWorkflow = null;
    focusScheduleRow();
    renderScheduleParams();
    if (workflowSelect) workflowSelect.addEventListener('change', renderScheduleParams);
    for (var k = 0; k < runsRadios.length; k++) {
      runsRadios[k].addEventListener('change', function () {
        var byMessage = form.querySelector('input[name="runs"]:checked').value === 'message';
        messageField.hidden = !byMessage;
        if (paramsBox) paramsBox.hidden = byMessage;
        // A workflow's result goes where its Messaging tab says.
        var notifyField = form.querySelector('#scheduleNotifyField');
        if (notifyField) notifyField.hidden = !byMessage;
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = new FormData(form);
      var runsWorkflow = data.get('runs') === 'workflow';
      if (!runsWorkflow && !String(data.get('message') || '').trim()) { result.textContent = 'Write the message the agent receives.'; return; }
      var schedule;
      if (data.get('when') === 'once') {
        if (!data.get('runAt')) { result.textContent = 'Pick a date and time.'; return; }
        schedule = { run_at: scheduleFormTime(data.get('runAt')) };
      } else {
        // Weeks go to the scheduler as days.
        var unit = data.get('everyUnit');
        var n = Number(data.get('everyN')) || 1;
        schedule = { every: unit === 'w' ? String(n * 7) + 'd' : String(n) + unit };
        if (data.get('everyStart')) schedule.start_at = scheduleFormTime(data.get('everyStart'));
      }
      result.textContent = 'Scheduling' + String.fromCharCode(8230);
      // Live at once, a workflow's schedule too (it's how the workflow
      // starts, not what it does), and in Audit.
      var target = '/agents/' + encodeURIComponent(name) + '/schedules';
      fetchJsonRetryOnce(target, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign(
          runsWorkflow ? { workflow_id: data.get('workflow_id'), params: scheduleParams(data) } : { message: data.get('message') },
          { schedule: schedule, task_name: data.get('task_name'), result_to_chat: !runsWorkflow && data.get('notify') === 'on' }
        )),
      }).then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || 'Could not schedule'; return; }
        loadSchedulesTab(name);
      });
    });
  }

  function loadSchedulesTab(name) {
    var content = schedulesContentEl();
    if (!content) return;
    if (schedulesRefreshTimer) { clearTimeout(schedulesRefreshTimer); schedulesRefreshTimer = null; }
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/schedules').then(function (r) {
      if (currentName !== name) return;
      if (!r.ok) throw new Error(r.body.error || 'request failed');
      var tasks = r.body.tasks || [];
      schedulesTimeZone = r.body.time_zone || null;
      schedulesWorkflows = r.body.workflows || [];
      content.innerHTML = renderSchedulesHtml(tasks);
      wireSchedulesHandlers(name);
      leShell.setCount('schedules', tasks.filter(function (t) { return t.status !== 'cancelled' && t.status !== 'done'; }).length);
      if (tasks.some(function (t) { return t.status === 'running'; }) && currentTab === 'schedules') {
        schedulesRefreshTimer = setTimeout(function () { loadSchedulesTab(name); }, 3000);
      }
    }).catch(function (err) {
      if (currentName !== name) return;
      content.innerHTML = '<p class="error">Could not load schedules: ' + escapeHtml(err.message) + '</p>';
    });
  }

  function actauthContentEl() {
    return detail.querySelector('#actauthContent');
  }

  function advancedRulesEl() {
    return detail.querySelector('#advancedRulesContent');
  }

  // Permissions (one switch per tool, and the default) and Advanced's rule
  // editor (per-rule switches, Edit, Delete, Add a rule).
  function wireActauthHandlers(name, cfg) {
    var perm = actauthContentEl();
    var content = advancedRulesEl();
    if (!content || !perm) return;
    var editingRuleName = null;

    function ruleByName(ruleName) {
      for (var i = 0; i < cfg.rules.length; i++) {
        if (cfg.rules[i].name === ruleName) return cfg.rules[i];
      }
      return null;
    }

    function resetRuleForm() {
      var form = content.querySelector('#ruleForm');
      form.reset();
      content.querySelector('#ruleNameInput').disabled = false;
      content.querySelector('#ruleFormHeading').textContent = 'Add a rule';
      content.querySelector('#ruleSubmitBtn').textContent = 'Add';
      content.querySelector('#ruleCancelBtn').style.display = 'none';
      content.querySelector('#ruleFormError').textContent = '';
      editingRuleName = null;
    }

    var deleteButtons = content.querySelectorAll('.delete-rule-btn');
    for (var i = 0; i < deleteButtons.length; i++) {
      deleteButtons[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var ruleName = btn.getAttribute('data-name');
        if (!confirm('Remove rule "' + ruleName + '"?')) return;
        btn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name) + '/actauth/rules/' + encodeURIComponent(ruleName), { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            applyActauthConfig(name, result.body);
            refreshOverviewPanel(name);
          })
          .catch(function (err) {
            alert('Could not remove: ' + err.message);
            btn.disabled = false;
          });
      });
    }

    var editButtons = content.querySelectorAll('.edit-rule-btn');
    for (var i = 0; i < editButtons.length; i++) {
      editButtons[i].addEventListener('click', function (ev) {
        var ruleName = ev.currentTarget.getAttribute('data-name');
        var rule = ruleByName(ruleName);
        if (!rule) return;
        content.querySelector('#ruleNameInput').value = rule.name;
        content.querySelector('#ruleNameInput').disabled = true;
        content.querySelector('#ruleScopeInput').value = rule.scope;
        content.querySelector('#ruleToolInput').value = rule.tool;
        content.querySelector('#ruleDecisionInput').value = rule.decision;
        content.querySelector('#ruleFormHeading').textContent = 'Edit rule "' + rule.name + '"';
        content.querySelector('#ruleSubmitBtn').textContent = 'Save';
        content.querySelector('#ruleCancelBtn').style.display = '';
        content.querySelector('#ruleFormError').textContent = '';
        editingRuleName = rule.name;
        openEditDialog(content.querySelector('#ruleForm'));
      });
    }

    content.querySelector('#ruleCancelBtn').addEventListener('click', resetRuleForm);
    content.querySelector('.open-rule-form').addEventListener('click', function () {
      resetRuleForm();
      openEditDialog(content.querySelector('#ruleForm'));
      content.querySelector('#ruleNameInput').focus();
    });

    var ruleForm = content.querySelector('#ruleForm');
    ruleForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errorEl = content.querySelector('#ruleFormError');
      errorEl.textContent = '';
      var data = new FormData(ruleForm);
      var scope = data.get('scope');
      var tool = data.get('tool');
      var decision = data.get('decision');
      var submitBtn = content.querySelector('#ruleSubmitBtn');
      submitBtn.disabled = true;

      var request = editingRuleName
        ? fetch('/agents/' + encodeURIComponent(name) + '/actauth/rules/' + encodeURIComponent(editingRuleName), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scope: scope, tool: tool, decision: decision }),
          })
        : fetch('/agents/' + encodeURIComponent(name) + '/actauth/rules', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: data.get('name'), scope: scope, tool: tool, decision: decision }),
          });

      request
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || 'request failed');
          applyActauthConfig(name, result.body);
          refreshOverviewPanel(name);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          submitBtn.disabled = false;
        });
    });

    // Allow / Ask me / Never: a click saves at once. The pressed button
    // moves straight away and moves back if the save fails.
    function wireDecisionSwitch(group, errorEl, save) {
      group.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-decision]');
        if (!btn || btn.getAttribute('aria-pressed') === 'true' || group.classList.contains('is-saving')) return;
        var buttons = group.querySelectorAll('button[data-decision]');
        var before = group.querySelector('button[aria-pressed="true"]');
        function press(target) {
          for (var k = 0; k < buttons.length; k++) buttons[k].setAttribute('aria-pressed', buttons[k] === target ? 'true' : 'false');
        }
        press(btn);
        group.classList.add('is-saving');
        errorEl.textContent = '';
        save(btn.getAttribute('data-decision'))
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            applyActauthConfig(name, result.body);
            refreshOverviewPanel(name);
          })
          .catch(function (err) {
            press(before);
            group.classList.remove('is-saving');
            errorEl.textContent = 'Could not save: ' + err.message;
          });
      });
    }

    var ruleSwitches = content.querySelectorAll('.decision-switch[data-rule]');
    for (var s = 0; s < ruleSwitches.length; s++) {
      (function (group) {
        var rule = ruleByName(group.getAttribute('data-rule'));
        if (!rule) return;
        wireDecisionSwitch(group, content.querySelector('#rulesError'), function (decision) {
          return fetch('/agents/' + encodeURIComponent(name) + '/actauth/rules/' + encodeURIComponent(rule.name), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scope: rule.scope, tool: rule.tool, decision: decision }),
          });
        });
      })(ruleSwitches[s]);
    }

    var toolSwitches = perm.querySelectorAll('.decision-switch[data-tool]');
    for (var ts = 0; ts < toolSwitches.length; ts++) {
      (function (group) {
        var tool = group.getAttribute('data-tool');
        wireDecisionSwitch(group, perm.querySelector('#toolsDecisionError'), function (decision) {
          return fetch('/agents/' + encodeURIComponent(name) + '/actauth/tools/' + encodeURIComponent(tool), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ decision: decision }),
          });
        });
      })(toolSwitches[ts]);
    }

    wireDecisionSwitch(perm.querySelector('#defaultDecisionSwitch'), perm.querySelector('#defaultDecisionError'), function (decision) {
      return fetch('/agents/' + encodeURIComponent(name) + '/actauth/default-decision', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: decision }),
      });
    });
  }

  function applyActauthConfig(name, cfg) {
    var content = actauthContentEl();
    var advanced = advancedRulesEl();
    if (!content || !advanced) return;
    content.innerHTML = renderPermissionsHtml(cfg);
    advanced.innerHTML = renderRulesEditorHtml(cfg);
    wireActauthHandlers(name, cfg);
    actauthLoadedFor = name;
  }

  function loadActauthTab(name) {
    var content = actauthContentEl();
    if (!content) return;
    content.innerHTML = '<p class="hint">Loading&hellip;</p>';
    var advanced = advancedRulesEl();
    if (advanced) advanced.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/actauth')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (currentName !== name) return;
        applyActauthConfig(name, cfg);
      })
      .catch(function (err) {
        if (currentName !== name) return;
        content.innerHTML = '<p class="error">Could not load actauth rules: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Environment tab: every env var an ability (see ABILITIES.md,
  // bin/ability-manager.ts) declared it needs for this agent, across
  // every ability installed — status only, a value is never shown once
  // set, matching env-admin.ts's own never-echo-a-secret rule. Lazily
  // loaded the same way Actauth is, for the same reason (avoid a
  // redundant fetch on every agent switch for a tab that isn't always
  // opened). ----

  function renderEnvTabPlaceholder() {
    return '<section id="envSection"><div id="envContent"><p class="hint">Loading&hellip;</p></div></section>';
  }

  // One slot's cell: its current value (never a secret's), a form to set
  // it, and Remove once set. Slot "shared" is the project .env, slot
  // "agent" this agent's own agents/<name>/.env — see env-admin.ts's
  // DeclaredEnvVar.slot. The form/button classes and data-* attributes
  // are what wireEnvHandlers below binds to.
  function renderEnvSlotCell(v) {
    var status = !v.set
      ? (v.slot === 'agent' && v.scope === 'agent'
          ? '<span class="le-pill bad">missing</span>'
          : v.slot === 'agent'
            ? '<span class="hint">uses project-wide</span>'
            : '<span class="hint">not set</span>')
      : v.secret
        ? '<span class="le-pill good">set</span>'
        : '<code>' + escapeHtml(v.value || '') + '</code>';
    if (v.set && v.source === 'legacy') {
      status += ' <span class="hint" title="Read from the older prefixed project variable. Saving a value here moves it into this agent&#39;s own .env.">(from ' + escapeHtml(v.legacyName || '') + ')</span>';
    }
    var field = v.options
      ? '<select name="value">' + v.options.map(function (opt) {
          return '<option value="' + escapeHtml(opt) + '"' + (v.value === opt ? ' selected' : '') + '>' + escapeHtml(opt) + '</option>';
        }).join('') + '</select>'
      : v.multiline
        ? '<textarea name="value" rows="4" placeholder="' + (v.set ? 'paste a new value to replace it' : 'paste the full value') + '" required></textarea>'
        : '<input type="' + (v.secret ? 'password' : 'text') + '" name="value" placeholder="' + (v.set ? 'new value' : 'value') + '" required>';
    var remove = v.set
      ? '<button type="button" class="env-var-remove" data-name="' + escapeHtml(v.name) + '" data-slot="' + escapeHtml(v.slot) + '">Remove</button>'
      : '';
    return '<div class="env-cell"><div>' + status + '</div>' +
      '<form class="add-source env-var-form env-inline" data-name="' + escapeHtml(v.name) + '" data-slot="' + escapeHtml(v.slot) + '">' +
        field + '<button type="submit">' + (v.set ? 'Change' : 'Set') + '</button>' + remove +
      '</form></div>';
  }

  var ENV_SCOPE_LABELS = {
    shared: 'Shared by every agent',
    overridable: 'Shared; an agent can set its own',
    agent: 'Set per agent; never shared',
  };

  // One setting per row, its project-wide and per-agent values side by
  // side, plus which one this agent's tools actually read.
  function renderEnvSettingRow(shared, own) {
    var v = own || shared;
    var description = (shared && shared.description) || (own && own.description) || '';
    var alsoDeclared = v.abilityNames.length > 1
      ? ' <span class="hint" title="Also declared by: ' + escapeHtml(v.abilityNames.join(', ')) + '">(+' + (v.abilityNames.length - 1) + ' more)</span>'
      : '';
    var used = own && own.set
      ? 'this agent'
      : v.scope === 'agent'
        ? '<span class="error">nothing &mdash; its tools fail</span>'
        : shared && shared.set ? 'project-wide' : '<span class="hint">not set</span>';
    return '<tr>' +
      '<td style="min-width:200px"><code>' + escapeHtml(v.name) + '</code>' + (v.secret ? ' <span class="le-pill neutral">secret</span>' : '') + alsoDeclared +
        '<div class="hint">' + escapeHtml(ENV_SCOPE_LABELS[v.scope] || '') + '</div>' +
        (description ? '<div class="hint env-desc" title="' + escapeHtml(description) + '">' + escapeHtml(description) + '</div>' : '') + '</td>' +
      '<td>' + (shared ? renderEnvSlotCell(shared) : '<span class="hint">not used</span>') + '</td>' +
      '<td>' + (own ? renderEnvSlotCell(own) : '<span class="hint">&mdash;</span>') + '</td>' +
      '<td>' + used + '</td>' +
      '</tr>';
  }

  function renderEnvAbilityCard(abilityName, vars) {
    var names = [];
    var bySlot = {};
    vars.forEach(function (v) {
      if (!bySlot[v.name]) { bySlot[v.name] = {}; names.push(v.name); }
      bySlot[v.name][v.slot] = v;
    });
    var rows = names.map(function (n) { return renderEnvSettingRow(bySlot[n].shared, bySlot[n].agent); }).join('');
    return '<section><h3>' + escapeHtml(abilityName) + '</h3>' +
      '<div class="le-table-wrap"><table><thead><tr><th>Setting</th><th>Project-wide</th><th>This agent</th><th>Used</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</section>';
  }

  function renderEnvConfigHtml(vars) {
    if (!vars.length) return '<p class="hint">No installed ability has declared any environment variables for this agent yet.</p>';

    var summaryHtml = '<p class="muted" style="margin:0 0 20px">Settings your installed abilities read. A secret is never shown again after it is saved. Project-wide values live in the project <code>.env</code>; this agent&#39;s own values in <code>agents/&lt;name&gt;/.env</code>.</p>';

    // Grouped by declaring ability, not a single flat list — a var
    // declared by more than one ability (rare, but see renderEnvRow's
    // own comment) appears once under each, since either ability's own
    // card is a place an operator setting that ability up would
    // reasonably look for it.
    var byAbility = {};
    var abilityNames = [];
    vars.forEach(function (v) {
      v.abilityNames.forEach(function (abilityName) {
        if (!byAbility[abilityName]) {
          byAbility[abilityName] = [];
          abilityNames.push(abilityName);
        }
        byAbility[abilityName].push(v);
      });
    });
    abilityNames.sort();

    return summaryHtml + abilityNames.map(function (abilityName) {
      return renderEnvAbilityCard(abilityName, byAbility[abilityName]);
    }).join('');
  }

  function envContentEl() {
    return detail.querySelector('#envContent');
  }

  function wireEnvHandlers(name) {
    var content = envContentEl();
    if (!content) return;
    var forms = content.querySelectorAll('.env-var-form');
    for (var i = 0; i < forms.length; i++) {
      forms[i].addEventListener('submit', function (ev) {
        ev.preventDefault();
        var form = ev.currentTarget;
        var varName = form.getAttribute('data-name');
        var slot = form.getAttribute('data-slot');
        var value = new FormData(form).get('value');
        var submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name) + '/env/' + encodeURIComponent(varName) + '?slot=' + encodeURIComponent(slot), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: value }),
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            loadEnvTab(name);
          })
          .catch(function (err) {
            alert('Could not set value: ' + err.message);
            submitBtn.disabled = false;
          });
      });
    }
    var removeButtons = content.querySelectorAll('.env-var-remove');
    for (var j = 0; j < removeButtons.length; j++) {
      removeButtons[j].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var varName = btn.getAttribute('data-name');
        var slot = btn.getAttribute('data-slot');
        // A destructive action (clearing a configured value, possibly a
        // secret nothing else has a copy of) gets the one confirm() this
        // whole tab uses — every other action here is a plain upsert,
        // nothing else to lose by clicking it again.
        var what = slot === 'agent' ? 'the agent-specific value of ' + varName : varName;
        if (!confirm('Remove ' + what + '? Any tool/ability relying on it falls back to its own default (if it has one) or starts failing until it is set again.')) return;
        btn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name) + '/env/' + encodeURIComponent(varName) + '?slot=' + encodeURIComponent(slot), { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            loadEnvTab(name);
          })
          .catch(function (err) {
            alert('Could not remove value: ' + err.message);
            btn.disabled = false;
          });
      });
    }
  }

  function applyEnvConfig(name, vars) {
    var content = envContentEl();
    if (!content) return;
    content.innerHTML = renderEnvConfigHtml(vars);
    wireEnvHandlers(name);
    envLoadedFor = name;
  }

  function loadEnvTab(name) {
    var content = envContentEl();
    if (!content) return;
    content.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/env')
      .then(function (r) { return r.json(); })
      .then(function (vars) {
        if (currentName !== name) return;
        applyEnvConfig(name, vars);
      })
      .catch(function (err) {
        if (currentName !== name) return;
        content.innerHTML = '<p class="error">Could not load environment variables: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Apps tab: what's already installed for this agent, a
  // search box over official (@loopengine-co on npm) abilities,
  // and a plain spec field for a private ability (a git URL, a local
  // file:../path, or a private registry name) — both installs go
  // through the same POST .../abilities, since installAbility itself
  // already resolves any spec npm pack accepts (see
  // bin/ability-manager.ts's own doc comment on fetchAbilityDir).
  // Lazily loaded the same way Actauth/Environment are. ----

  function renderAbilitiesTabPlaceholder() {
    return '<section id="abilitiesSection"><div id="abilitiesContent"><p class="hint">Loading&hellip;</p></div></section>';
  }

  function renderInstalledAbilityRow(a) {
    // a.upToDate only ever comes back true when the npm registry lookup
    // (handleAbilitiesGet's own fetchLatestAbilityVersion) actually
    // succeeded and matched — a private/file:/git-installed ability, or
    // any registry hiccup, leaves it false, so the button still shows
    // rather than silently hiding on an unknown instead of a genuine
    // "nothing to upgrade".
    var actionHtml = a.upToDate
      ? '<span class="hint">up to date</span>'
      : '<button type="button" class="ability-upgrade-btn" data-name="' + escapeHtml(a.name) + '">Upgrade</button>';
    // Same reasoning as upToDate above — missingDependencies (see
    // hasNodeModule) only ever hides this once the server actually
    // found every dependency already present in node_modules; anything
    // it can't confirm still shows the button.
    var deps = a.missingDependencies || [];
    if (deps.length) {
      actionHtml += ' <button type="button" class="ability-install-deps-btn" data-name="' + escapeHtml(a.name) + '" title="npm install ' + escapeHtml(deps.join(' ')) + '">Install deps</button>';
    }
    actionHtml += ' <button type="button" class="ability-uninstall-btn" data-name="' + escapeHtml(a.name) + '">Uninstall</button>';
    // Details: what it can do, with this agent's own permissions. Fetched
    // by its install spec, pinned to the installed version for an npm name.
    var spec = a.spec || a.name;
    if (!/^(git[+:]|github:|https?:|file:|[.]|[/])/.test(spec) && spec.lastIndexOf('@') <= 0 && a.version) spec += '@' + a.version;
    var detailsHtml = '<button type="button" class="ability-details-btn" data-spec="' + escapeHtml(spec) + '" data-agent="' + escapeHtml(currentName) + '">Details</button>';
    return '<tr>' +
      '<td><code>' + escapeHtml(a.name) + '</code></td>' +
      '<td>' + escapeHtml(a.version) + '</td>' +
      '<td>' + leShell.abilityOriginBadge(a.origin) + '</td>' +
      '<td class="hint">' + escapeHtml((a.tools || []).concat(a.mcp ? a.mcp.tools.map(function (t) { return t.name; }) : []).join(', ')) + '</td>' +
      '<td style="white-space:nowrap">' + detailsHtml + ' ' + actionHtml + '</td>' +
      '</tr>';
  }

  // An official or private ability not installed here yet: its
  // details show the permissions it ships with.
  function renderAbilitySearchResultRow(pkg, installedNames, spec) {
    var installSpec = spec || pkg.name;
    var actionHtml = installedNames.indexOf(pkg.name) !== -1
      ? '<span class="hint">Installed</span>'
      : '<button type="button" class="ability-install-btn" data-spec="' + escapeHtml(installSpec) + '">Install</button>';
    var detailsSpec = spec || (pkg.version ? pkg.name + '@' + pkg.version : pkg.name);
    return '<tr>' +
      '<td><code>' + escapeHtml(pkg.name) + '</code>' + (pkg.version ? ' <span class="hint">' + escapeHtml(pkg.version) + '</span>' : '') + '</td>' +
      '<td>' + escapeHtml(pkg.description || '') + '</td>' +
      '<td style="white-space:nowrap"><button type="button" class="ability-details-btn" data-spec="' + escapeHtml(detailsSpec) + '">Details</button> ' + actionHtml + '</td>' +
      '</tr>';
  }

  function renderAbilitiesConfigHtml(data) {
    var installed = data.abilities || [];
    var installedHtml = installed.length
      ? '<table><thead><tr><th>Name</th><th>Version</th><th>Source</th><th>Tools</th><th></th></tr></thead><tbody>' + installed.map(renderInstalledAbilityRow).join('') + '</tbody></table>' +
        '<p id="abilityUpgradeStatus" class="hint"></p>'
      : '<p class="hint">Nothing added to this agent yet.</p>';

    // What this agent has first; then the workspace's connected apps (each
    // with the tools this agent gets), then official and private abilities.
    return '<h3 style="justify-content:flex-start;align-items:baseline;gap:8px">Installed <span class="hint" style="font-weight:400">the apps and abilities this agent has</span></h3>' + installedHtml +
      // Installing by name or spec is on the console's Abilities page.
      '<p id="abilityInstallStatus" class="hint"></p>' +
      '<h3 style="margin-top:24px;justify-content:flex-start;align-items:baseline;gap:8px">Apps <span class="hint" style="font-weight:400">connected in this workspace; choose which of their tools this agent gets, and each one' + String.fromCharCode(8217) + 's permission</span></h3>' +
      '<div id="agentApps" style="margin-bottom:32px"><p class="hint">Loading&hellip;</p></div>' +
      '<h3 style="margin-top:24px;justify-content:flex-start;align-items:baseline;gap:8px">Official abilities <span class="hint" style="font-weight:400">published by LoopEngine</span></h3>' +
      '<form id="abilitySearchForm" style="display:flex;gap:6px;margin:0 0 10px;max-width:560px">' +
        '<input type="search" name="q" placeholder="Search abilities, e.g. gmail" aria-label="Search official abilities" style="flex:1">' +
        '<button type="submit">Search</button>' +
      '</form>' +
      '<div id="abilitySearchResults" style="margin-bottom:32px"></div>' +
      '<h3 style="margin-top:24px;justify-content:flex-start;align-items:baseline;gap:8px">Private abilities <span class="hint" style="font-weight:400">your own, installed in this workspace</span></h3>' +
      '<div id="abilityPrivateResults" style="margin-bottom:32px"><p class="hint">Loading&hellip;</p></div>';
  }

  function abilitiesContentEl() {
    return detail.querySelector('#abilitiesContent');
  }

  // Shared by both the search-results "Install" button and the
  // spec-form submit — same endpoint either way, installAbility itself
  // doesn't distinguish "found via search" from "pasted directly".
  function installAbilitySpec(name, spec, statusEl, btn) {
    if (btn) { btn.disabled = true; }
    statusEl.className = 'hint';
    statusEl.textContent = 'Installing ' + spec + '…';
    fetch('/agents/' + encodeURIComponent(name) + '/abilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: spec }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        // Same "is this dev or serve" distinction the CLI's own
        // add-ability command prints after installing — a web install
        // doesn't splice into an already-running server's in-memory
        // registry any more than the CLI does (see installAbility's own
        // doc comment on why), so the operator needs the same nudge here.
        var message = 'Installed: ' + escapeHtml(result.body.installed.join(', ')) + '. Already running under npx loopengine dev? It becomes active automatically. Running under serve (or nothing yet)? Restart the server to pick it up.';
        var deps = result.body.dependencies || [];
        if (deps.length) {
          // installAbility only ever copies the ability's own files —
          // never touches package.json/node_modules — so a real npm
          // dependency the ability's own tool code imports (e.g. sharp)
          // has to be installed separately, or the tool fails at runtime
          // with an opaque "Cannot find package" the very next time this
          // agent's config is loaded. Surfaced here, loudly, instead of
          // leaving that as a silent trap discovered later — the
          // Installed table below now has its own "Install deps" button
          // for exactly this (see handleAbilityInstallDepsPost).
          message += ' <strong>This ability also needs: <code>' + escapeHtml(deps.join(', ')) + '</code></strong> — use the "Install deps" button below, or run <code>npm install ' + escapeHtml(deps.join(' ')) + '</code> yourself.';
        }
        statusEl.innerHTML = message;
        loadAbilitiesTab(name);
      })
      .catch(function (err) {
        statusEl.className = 'error';
        statusEl.textContent = 'Could not install: ' + err.message;
        if (btn) { btn.disabled = false; }
      });
  }

  // Upgrades an already-installed ability to whatever it currently
  // resolves to — same endpoint upgradeAbility (bin/ability-manager.ts)
  // backs, which three-way merges tool/skill files instead of blindly
  // overwriting a hand-edited one, so a merge conflict is a real,
  // expected outcome here, not an error — surfaced distinctly from a
  // request actually failing.
  function upgradeAbility(name, abilityName, statusEl, btn) {
    if (btn) { btn.disabled = true; }
    statusEl.className = 'hint';
    statusEl.textContent = 'Upgrading ' + abilityName + '…';
    fetch('/agents/' + encodeURIComponent(name) + '/abilities/' + encodeURIComponent(abilityName) + '/upgrade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        var files = result.body.files || [];
        // added/removed: new rules, and tool files a version dropped (its tools now come from the app's MCP server).
        var updated = files.filter(function (f) { return f.status === 'updated' || f.status === 'added' || f.status === 'removed'; });
        var conflicts = files.filter(function (f) { return f.status === 'conflict'; });
        var message;
        if (!files.length || (!updated.length && !conflicts.length)) {
          message = escapeHtml(abilityName) + ' is already up to date.';
        } else {
          message = 'Upgraded ' + escapeHtml(abilityName) + ': ' + escapeHtml(updated.map(function (f) { return f.path; }).join(', ') || 'no files changed') +
            '. Already running under npx loopengine dev? It becomes active automatically. Running under serve (or nothing yet)? Restart the server to pick it up.';
          if (conflicts.length) {
            message += ' <strong>' + conflicts.length + ' file(s) need resolving by hand: ' + escapeHtml(conflicts.map(function (f) { return f.path; }).join(', ')) + '</strong> — a hand-edited file with upstream changes too, left alone rather than overwritten.';
          }
        }
        statusEl.className = conflicts.length ? 'error' : 'hint';
        statusEl.innerHTML = message;
        loadAbilitiesTab(name);
      })
      .catch(function (err) {
        statusEl.className = 'error';
        statusEl.textContent = 'Could not upgrade: ' + err.message;
        if (btn) { btn.disabled = false; }
      });
  }

  // Runs npm install for an ability's own missing dependencies
  // (handleAbilityInstallDepsPost) — the server reads the dependency
  // list back off this ability's own installed record, not anything
  // this form could tamper with, so there's nothing to pass except
  // which ability. Can take a while (a native module like sharp
  // especially), so the button stays disabled and the status line says
  // so rather than looking hung.
  function installAbilityDeps(name, abilityName, statusEl, btn) {
    if (btn) { btn.disabled = true; }
    statusEl.className = 'hint';
    statusEl.textContent = 'Running npm install for ' + abilityName + '’s dependencies… this can take a minute.';
    fetch('/agents/' + encodeURIComponent(name) + '/abilities/' + encodeURIComponent(abilityName) + '/install-deps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        var installed = result.body.installed || [];
        statusEl.className = 'hint';
        statusEl.textContent = installed.length
          ? 'Installed: ' + installed.join(', ') + '. Restart the server to pick it up.'
          : abilityName + ' had no dependencies to install.';
        loadAbilitiesTab(name);
      })
      .catch(function (err) {
        statusEl.className = 'error';
        statusEl.textContent = 'Could not install dependencies: ' + err.message;
        if (btn) { btn.disabled = false; }
      });
  }

  // Deletes an ability's tool/skill files and actauth rules
  // (handleAbilityUninstallDelete / bin/ability-manager.ts's own
  // removeAbility). A file hand-modified since install is left in place
  // and reported back as refused rather than silently deleted — the
  // confirm() below offers to retry with force once the operator has
  // seen exactly which files those are, same two-step the CLI itself
  // takes with --force. Always reloads the tab afterward: a partial
  // uninstall (some files refused) still changes what is installed,
  // it just does not remove the ability entirely from provenance.
  function uninstallAbility(name, abilityName, statusEl, btn, force) {
    if (btn) { btn.disabled = true; }
    statusEl.className = 'hint';
    statusEl.textContent = 'Uninstalling ' + abilityName + '...';
    var url = '/agents/' + encodeURIComponent(name) + '/abilities/' + encodeURIComponent(abilityName) + (force ? '?force=true' : '');
    fetch(url, { method: 'DELETE' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        var removed = result.body.removed || [];
        var refused = result.body.refused || [];
        if (refused.length && !force) {
          var retry = confirm(
            abilityName + ': ' + refused.length + ' file(s) were hand-modified since install and left in place (' + refused.join(', ') + '). Remove them anyway?',
          );
          if (retry) {
            uninstallAbility(name, abilityName, statusEl, btn, true);
            return;
          }
        }
        statusEl.className = refused.length ? 'error' : 'hint';
        statusEl.textContent = removed.length
          ? 'Removed ' + removed.join(', ') + '.' + (refused.length ? ' Left in place (hand-modified): ' + refused.join(', ') + '.' : '')
          : 'Nothing removed.';
        if (btn) { btn.disabled = false; }
        loadAbilitiesTab(name);
      })
      .catch(function (err) {
        statusEl.className = 'error';
        statusEl.textContent = 'Could not uninstall: ' + err.message;
        if (btn) { btn.disabled = false; }
      });
  }

  // The workspace's private abilities (installed from the console's
  // Abilities page, core/workspace-abilities.ts), each with Details and
  // Install into this agent. With none, a link to install some there.
  function loadPrivateAbilitiesFor(name, content, installedNames) {
    var el = content.querySelector('#abilityPrivateResults');
    if (!el) return;
    fetch('/abilities/workspace')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (currentName !== name) return;
        // Connected apps are listed under Apps, above.
        var abilities = (d.abilities || []).filter(function (a) { return !a.app; });
        if (!abilities.length) {
          el.innerHTML = '<p><a href="/config?section=abilities#private-abilities">Install private abilities</a></p>';
          return;
        }
        el.innerHTML = '<table><thead><tr><th>Ability</th><th>What it does</th><th></th></tr></thead><tbody>' +
          abilities.map(function (a) { return renderAbilitySearchResultRow(a, installedNames, a.spec); }).join('') + '</tbody></table>' +
          '<p class="hint" style="margin:6px 0 0"><a href="/config?section=abilities#private-abilities">Install more private abilities</a></p>';
        var installBtns = el.querySelectorAll('.ability-install-btn');
        for (var i = 0; i < installBtns.length; i++) {
          installBtns[i].addEventListener('click', function (ev) {
            installAbilitySpec(name, ev.currentTarget.dataset.spec, content.querySelector('#abilityInstallStatus'), ev.currentTarget);
          });
        }
      })
      .catch(function (err) { el.innerHTML = '<p class="error">Could not list private abilities: ' + escapeHtml(err.message) + '</p>'; });
  }

  // Shared by the initial (empty-query) load right after the tab opens
  // and the search form's own submit — the empty-query case is just
  // "list every published ability" (the keyword filter alone, no extra
  // search text), so an operator sees what's out there immediately
  // instead of having to search for something before anything shows up.
  function runAbilitySearch(name, q, content, resultsEl, installedNames) {
    resultsEl.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/abilities/search' + (q ? '?q=' + encodeURIComponent(q) : ''))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body.error || 'search failed');
        var results = result.body.results || [];
        resultsEl.innerHTML = results.length
          ? '<table><thead><tr><th>Package</th><th>Description</th><th></th></tr></thead><tbody>' + results.map(function (pkg) { return renderAbilitySearchResultRow(pkg, installedNames); }).join('') + '</tbody></table>'
          : '<p class="hint">No official abilities found.</p>';
        var installBtns = resultsEl.querySelectorAll('.ability-install-btn');
        for (var i = 0; i < installBtns.length; i++) {
          installBtns[i].addEventListener('click', function (ev2) {
            var btn = ev2.currentTarget;
            installAbilitySpec(name, btn.dataset.spec, content.querySelector('#abilityInstallStatus'), btn);
          });
        }
      })
      .catch(function (err) {
        resultsEl.innerHTML = '<p class="error">' + escapeHtml(err.message) + '</p>';
      });
  }

  function wireAbilitiesHandlers(name, installedNames) {
    var content = abilitiesContentEl();
    if (!content) return;

    // Details buttons anywhere in the tab, including search results that
    // arrive later. The tab's container outlives each redraw, so wired once.
    if (!content.dataset.detailsWired) {
      content.dataset.detailsWired = '1';
      content.addEventListener('click', function (ev) {
        var btn = ev.target.closest && ev.target.closest('.ability-details-btn');
        if (btn) leShell.toggleAbilityDetails(btn);
      });
    }

    var upgradeStatusEl = content.querySelector('#abilityUpgradeStatus');
    var upgradeBtns = content.querySelectorAll('.ability-upgrade-btn');
    for (var u = 0; u < upgradeBtns.length; u++) {
      upgradeBtns[u].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        upgradeAbility(name, btn.dataset.name, upgradeStatusEl, btn);
      });
    }

    var installDepsBtns = content.querySelectorAll('.ability-install-deps-btn');
    for (var d = 0; d < installDepsBtns.length; d++) {
      installDepsBtns[d].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        installAbilityDeps(name, btn.dataset.name, upgradeStatusEl, btn);
      });
    }

    var uninstallBtns = content.querySelectorAll('.ability-uninstall-btn');
    for (var r = 0; r < uninstallBtns.length; r++) {
      uninstallBtns[r].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var abilityName = btn.dataset.name;
        if (!confirm('Uninstall ' + abilityName + '? This deletes its tool and skill files and actauth rules from this agent.')) return;
        uninstallAbility(name, abilityName, upgradeStatusEl, btn, false);
      });
    }

    var searchForm = content.querySelector('#abilitySearchForm');
    var resultsEl = content.querySelector('#abilitySearchResults');
    if (searchForm && resultsEl) {
      searchForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var q = new FormData(searchForm).get('q');
        runAbilitySearch(name, q, content, resultsEl, installedNames);
      });
      // List every published ability immediately, not just after the
      // operator explicitly searches for something.
      runAbilitySearch(name, '', content, resultsEl, installedNames);
    }
    loadPrivateAbilitiesFor(name, content, installedNames);
    loadAgentApps(name, content);
  }

  // ---- Apps: a connected app's tools for this agent ----
  // The workspace's connected apps (the console's Apps page). Adding one,
  // or Choose tools on one already added, opens a picker: each tool with a
  // checkbox and this agent's permission for it; Save installs the app
  // with just those tools, or changes the agent's choice.

  var agentApps = { name: null, connected: [], pickers: {} };
  var DECISION_NAMES = { allow: 'Allow', ask: 'Ask me', deny: 'Never' };

  function loadAgentApps(name, content) {
    var el = content.querySelector('#agentApps');
    if (!el) return;
    if (agentApps.name !== name) agentApps = { name: name, connected: [], pickers: {} };
    fetch('/config/apps', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (currentName !== name) return;
        agentApps.connected = d.connected || [];
        agentApps.canChange = Boolean(d.canConnect);
        renderAgentApps();
      })
      .catch(function (err) { el.innerHTML = '<p class="error">Could not list apps: ' + escapeHtml(err.message) + '</p>'; });
    if (!content.dataset.appsWired) {
      content.dataset.appsWired = '1';
      content.addEventListener('click', onAgentAppsClick);
      content.addEventListener('change', onAgentAppsChange);
      content.addEventListener('input', onAgentAppsInput);
    }
  }

  function renderAgentApps() {
    var content = abilitiesContentEl();
    var el = content && content.querySelector('#agentApps');
    if (!el) return;
    var name = agentApps.name;
    if (!agentApps.connected.length) {
      el.innerHTML = '<p class="hint">No apps connected yet. <a href="/config?section=apps">Connect one on the Apps page</a>, then add it here.</p>';
      return;
    }
    el.innerHTML = '<table><thead><tr><th>App</th><th>For this agent</th><th></th></tr></thead><tbody>' + agentApps.connected.map(function (c) {
      var added = c.agents.indexOf(name) !== -1;
      var open = agentApps.pickers[c.ability];
      return '<tr><td><strong>' + escapeHtml(c.title) + '</strong> <span class="hint">' + escapeHtml(c.ability) + '</span></td>' +
        '<td class="hint">' + (added ? 'Added' : 'Not added') + '</td>' +
        '<td style="white-space:nowrap"><button type="button" class="app-pick-open" data-ability="' + escapeHtml(c.ability) + '">' + (open ? 'Close' : added ? 'Choose tools' : 'Add') + '</button></td></tr>' +
        (open ? '<tr><td colspan="3">' + pickerHtml(c.ability) + '</td></tr>' : '');
    }).join('') + '</tbody></table>' +
    '<p class="hint" style="margin:6px 0 0"><a href="/config?section=apps">Connect more apps</a></p>';
  }

  function pickerHtml(ability) {
    var p = agentApps.pickers[ability];
    if (p.error) return '<div class="app-pick"><p class="error" style="margin:0">' + escapeHtml(p.error) + '</p></div>';
    if (!p.tools) return '<div class="app-pick"><p class="hint" style="margin:0">Asking the app for its tools' + String.fromCharCode(8230) + '</p></div>';
    var chosen = p.tools.filter(function (t) { return t.selected; }).length;
    var f = (p.filter || '').toLowerCase();
    var shown = p.tools.filter(function (t) { return !f || (t.remote + ' ' + t.description).toLowerCase().indexOf(f) !== -1; });
    var disabled = agentApps.canChange && !p.busy ? '' : ' disabled';
    return '<div class="app-pick">' +
      '<p class="hint" style="margin:0">Choose the tools this agent can use, and what each may do on its own: Allow runs it, Ask me waits for your OK, Never blocks it. Each starts at the app' + String.fromCharCode(8217) + 's default.</p>' +
      '<div class="app-pick-bar">' +
        (p.tools.length > 12 ? '<input type="search" class="app-pick-filter" data-ability="' + escapeHtml(ability) + '" placeholder="Filter tools" value="' + escapeHtml(p.filter || '') + '" aria-label="Filter tools">' : '') +
        '<button type="button" class="app-pick-readonly" data-ability="' + escapeHtml(ability) + '"' + disabled + '>Select read-only tools</button>' +
        '<button type="button" class="app-pick-none" data-ability="' + escapeHtml(ability) + '"' + disabled + '>Clear</button>' +
        '<span class="hint">' + chosen + ' of ' + p.tools.length + ' selected' + (chosen > 20 ? '. That' + String.fromCharCode(8217) + 's a lot: more tools make an agent slower to choose and likelier to pick the wrong one.' : '') + '</span>' +
      '</div>' +
      '<div class="app-pick-list">' + shown.map(function (t) {
        return '<label class="app-pick-tool"><input type="checkbox" class="app-pick-check" data-ability="' + escapeHtml(ability) + '" data-tool="' + escapeHtml(t.remote) + '"' + (t.selected ? ' checked' : '') + disabled + '>' +
          '<span><code>' + escapeHtml(t.name) + '</code> ' +
            '<select class="app-pick-decision" data-ability="' + escapeHtml(ability) + '" data-tool="' + escapeHtml(t.remote) + '" aria-label="Permission for ' + escapeHtml(t.name) + '"' + disabled + '>' +
              ['allow', 'ask', 'deny'].map(function (d) { return '<option value="' + d + '"' + (d === t.decision ? ' selected' : '') + '>' + DECISION_NAMES[d] + '</option>'; }).join('') + '</select>' +
            (t.destructive ? ' <span class="hint">destructive</span>' : t.readOnly ? ' <span class="hint">read-only</span>' : '') +
            (t.description ? '<span class="hint app-pick-desc">' + escapeHtml(t.description) + '</span>' : '') +
          '</span></label>';
      }).join('') + '</div>' +
      '<div class="app-pick-bar"><button type="button" class="app-pick-save" data-ability="' + escapeHtml(ability) + '"' + (chosen && !p.busy && agentApps.canChange ? '' : ' disabled') + '>' + (p.installed ? 'Save' : 'Add with ' + chosen + ' tool' + (chosen === 1 ? '' : 's')) + '</button>' +
        (agentApps.canChange ? '' : leShell.adminNote('Changing an agent' + String.fromCharCode(8217) + 's tools needs <code>LOOPENGINE_ADMIN_AUTH</code> set.')) +
        (p.message ? '<span class="' + (p.messageBad ? 'error' : 'hint') + '">' + escapeHtml(p.message) + '</span>' : '') + '</div>' +
      '</div>';
  }

  function pickerTool(ability, remote) {
    var tools = agentApps.pickers[ability].tools;
    for (var i = 0; i < tools.length; i++) if (tools[i].remote === remote) return tools[i];
    return null;
  }

  function openPicker(ability) {
    var name = agentApps.name;
    agentApps.pickers[ability] = { tools: null, filter: '' };
    renderAgentApps();
    fetch('/agents/' + encodeURIComponent(name) + '/apps/' + encodeURIComponent(ability), { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        var p = agentApps.pickers[ability];
        if (!p || agentApps.name !== name) return;
        if (!r.ok) p.error = r.body.error || 'Could not list its tools.';
        else { p.tools = r.body.tools; p.installed = r.body.installed; }
        renderAgentApps();
      })
      .catch(function (err) { var p = agentApps.pickers[ability]; if (p) { p.error = err.message; renderAgentApps(); } });
  }

  function savePicker(ability) {
    var name = agentApps.name;
    var p = agentApps.pickers[ability];
    var tools = p.tools.filter(function (t) { return t.selected; }).map(function (t) { return { remote: t.remote, decision: t.decision }; });
    p.busy = true;
    p.message = 'Saving' + String.fromCharCode(8230);
    p.messageBad = false;
    renderAgentApps();
    fetch('/agents/' + encodeURIComponent(name) + '/apps/' + encodeURIComponent(ability), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tools: tools }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        p.busy = false;
        if (!r.ok) { p.message = r.body.error || 'Could not save.'; p.messageBad = true; renderAgentApps(); return; }
        delete agentApps.pickers[ability];
        // The Installed table and the counts change too.
        loadAbilitiesTab(name);
      })
      .catch(function (err) { p.busy = false; p.message = err.message; p.messageBad = true; renderAgentApps(); });
  }

  function onAgentAppsClick(ev) {
    var t = ev.target;
    if (!t.dataset || !t.dataset.ability) return;
    var ability = t.dataset.ability;
    if (t.classList.contains('app-pick-open')) {
      if (agentApps.pickers[ability]) { delete agentApps.pickers[ability]; renderAgentApps(); }
      else openPicker(ability);
    } else if (t.classList.contains('app-pick-readonly') || t.classList.contains('app-pick-none')) {
      var readOnly = t.classList.contains('app-pick-readonly');
      agentApps.pickers[ability].tools.forEach(function (tool) { tool.selected = readOnly ? tool.default === 'allow' : false; });
      renderAgentApps();
    } else if (t.classList.contains('app-pick-save')) {
      savePicker(ability);
    }
  }

  function onAgentAppsChange(ev) {
    var t = ev.target;
    if (!t.dataset || !t.dataset.tool || !agentApps.pickers[t.dataset.ability]) return;
    var tool = pickerTool(t.dataset.ability, t.dataset.tool);
    if (!tool) return;
    if (t.classList.contains('app-pick-check')) tool.selected = t.checked;
    if (t.classList.contains('app-pick-decision')) { tool.decision = t.value; tool.selected = true; }
    renderAgentApps();
  }

  function onAgentAppsInput(ev) {
    var t = ev.target;
    if (!t.classList.contains('app-pick-filter')) return;
    agentApps.pickers[t.dataset.ability].filter = t.value;
    renderAgentApps();
    var again = abilitiesContentEl().querySelector('.app-pick-filter[data-ability="' + t.dataset.ability + '"]');
    if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
  }

  function applyAbilitiesConfig(name, data) {
    var content = abilitiesContentEl();
    if (!content) return;
    content.innerHTML = renderAbilitiesConfigHtml(data);
    var installedNames = (data.abilities || []).map(function (a) { return a.name; });
    // Keeps the tab badge right after an install or uninstall here.
    leShell.setCount('abilities', installedNames.length);
    wireAbilitiesHandlers(name, installedNames);
    abilitiesLoadedFor = name;
  }

  function loadAbilitiesTab(name) {
    var content = abilitiesContentEl();
    if (!content) return;
    content.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/abilities')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (currentName !== name) return;
        applyAbilitiesConfig(name, data);
      })
      .catch(function (err) {
        if (currentName !== name) return;
        content.innerHTML = '<p class="error">Could not load abilities: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Skills tab: editable — add/edit/delete SKILL.md files via
  // skills-admin.ts, restricted (see that file's own doc comment) to
  // flat, non-nested skill ids. Unlike the Tools tab's Gateway Tools
  // section, this doesn't need its own lazy-loaded endpoint — cfg.skills
  // (SkillGarden's own index: name + description, no body) is already
  // free from the same /config fetch that opened the agent; only Edit
  // needs a further per-skill GET, to pull the body that index doesn't
  // carry. ----

  // A skill that's a workflow is labelled, and its Edit opens the workflow
  // editor: its instructions are one text there, with its title,
  // description and parameters.
  function renderSkillCard(s) {
    return '<div class="source">' +
      '<div class="source-head">' +
        '<h4>' + escapeHtml(s.name) + (s.workflow ? ' <span class="le-pill accent">Workflow</span>' : '') + '</h4>' +
        '<span>' +
          (s.workflow
            ? '<button type="button" class="edit-workflow-skill-btn" data-id="' + escapeHtml(s.name) + '" title="Edit it as a workflow, on the Workflows tab">Edit</button> '
            : '<button type="button" class="edit-skill-btn" data-id="' + escapeHtml(s.name) + '">Edit</button> ') +
          '<button type="button" class="delete-btn delete-skill-btn" data-id="' + escapeHtml(s.name) + '" title="Delete this skill" aria-label="Delete this skill">Delete</button>' +
        '</span>' +
      '</div>' +
      '<p class="hint">' + escapeHtml(s.description) + '</p>' +
      '</div>';
  }

  function renderSkillsTabHtml(cfg) {
    var listHtml = cfg.skills.length ? cfg.skills.map(renderSkillCard).join('') : '<p class="hint">No skills yet.</p>';
    return '<section><h3>Skills (' + cfg.skills.length + ')</h3><div id="skillList">' + listHtml + '</div></section>' +
      '<section><button type="button" class="open-skill-form">Add a skill</button>' +
      editDialogHtml('<h3 id="skillFormHeading">Add a skill</h3>', '<p>Know-how the agent opens when a request matches its description.</p>',
        '<form class="add-source" id="skillForm">' +
          '<label>Id <span class="hint">(lowercase, hyphen-separated — becomes the SKILL.md folder name; nested skills aren\\'t editable here)</span>' +
            '<input name="id" id="skillIdInput" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="summarize-files">' +
          '</label>' +
          '<label>Description <span class="hint">(what should make the agent reach for this? newlines are collapsed to spaces on save)</span>' +
            '<textarea name="description" id="skillDescInput" required></textarea>' +
          '</label>' +
          '<div class="body-field">' +
            '<div class="body-field-head">' +
              '<span>Body <span class="hint">(markdown)</span></span>' +
              '<span class="md-toggle">' +
                '<button type="button" class="md-toggle-btn active" id="skillBodyWriteBtn">Write</button>' +
                '<button type="button" class="md-toggle-btn" id="skillBodyPreviewBtn">Preview</button>' +
              '</span>' +
            '</div>' +
            '<textarea name="body" id="skillBodyInput" required></textarea>' +
            '<div class="markdown-body" id="skillBodyPreview" style="display:none"></div>' +
          '</div>' +
          '<div id="skillFormError" class="error"></div>' +
          '<div class="ed-actions"><button type="button" id="skillCancelBtn" data-dialog-cancel style="display:none">Cancel</button><button type="submit" id="skillSubmitBtn" class="primary">Add</button></div>' +
        '</form>') + '</section>';
  }

  function skillsPanelEl() {
    return detail.querySelector('[data-tab-panel="skills"]');
  }

  function wireSkillsHandlers(name) {
    var panel = skillsPanelEl();
    if (!panel) return;
    var editingSkillId = null;

    // Write/Preview toggle for the Body field — same idea as GitHub's own
    // issue/PR editor: the textarea and the rendered preview show/hide
    // each other, the textarea's value is the only source of truth (the
    // preview is just a render of it on demand, not a second place edits
    // could get made), so switching back to Write can never lose anything
    // typed before switching to Preview.
    var bodyTextarea = panel.querySelector('#skillBodyInput');
    var bodyPreview = panel.querySelector('#skillBodyPreview');
    var bodyWriteBtn = panel.querySelector('#skillBodyWriteBtn');
    var bodyPreviewBtn = panel.querySelector('#skillBodyPreviewBtn');

    function showBodyWrite() {
      bodyTextarea.style.display = '';
      bodyPreview.style.display = 'none';
      bodyWriteBtn.classList.add('active');
      bodyPreviewBtn.classList.remove('active');
    }
    function showBodyPreview() {
      bodyPreview.innerHTML = renderMarkdownPreview(bodyTextarea.value);
      bodyTextarea.style.display = 'none';
      bodyPreview.style.display = 'block';
      bodyPreviewBtn.classList.add('active');
      bodyWriteBtn.classList.remove('active');
    }
    bodyWriteBtn.addEventListener('click', showBodyWrite);
    bodyPreviewBtn.addEventListener('click', showBodyPreview);

    function resetSkillForm() {
      var form = panel.querySelector('#skillForm');
      form.reset();
      panel.querySelector('#skillIdInput').disabled = false;
      panel.querySelector('#skillFormHeading').textContent = 'Add a skill';
      panel.querySelector('#skillSubmitBtn').textContent = 'Add';
      panel.querySelector('#skillCancelBtn').style.display = 'none';
      panel.querySelector('#skillFormError').textContent = '';
      editingSkillId = null;
      showBodyWrite();
    }

    var deleteButtons = panel.querySelectorAll('.delete-skill-btn');
    for (var i = 0; i < deleteButtons.length; i++) {
      deleteButtons[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var id = btn.getAttribute('data-id');
        if (!confirm('Delete skill "' + id + '"? This removes its SKILL.md.')) return;
        btn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name) + '/skills/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            refreshSkillsDependentPanels(name);
          })
          .catch(function (err) {
            alert('Could not delete: ' + err.message);
            btn.disabled = false;
          });
      });
    }

    var workflowEditButtons = panel.querySelectorAll('.edit-workflow-skill-btn');
    for (var we = 0; we < workflowEditButtons.length; we++) {
      workflowEditButtons[we].addEventListener('click', function (ev) {
        pendingWorkflowEdit = ev.currentTarget.getAttribute('data-id');
        switchTab('workflows');
        openPendingWorkflowEdit();
      });
    }

    var editButtons = panel.querySelectorAll('.edit-skill-btn');
    for (var i = 0; i < editButtons.length; i++) {
      editButtons[i].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        var errorEl = panel.querySelector('#skillFormError');
        errorEl.textContent = '';
        fetch('/agents/' + encodeURIComponent(name) + '/skills/' + encodeURIComponent(id))
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            panel.querySelector('#skillIdInput').value = result.body.id;
            panel.querySelector('#skillIdInput').disabled = true;
            panel.querySelector('#skillDescInput').value = result.body.description;
            panel.querySelector('#skillBodyInput').value = result.body.body;
            panel.querySelector('#skillFormHeading').textContent = 'Edit skill "' + result.body.id + '"';
            panel.querySelector('#skillSubmitBtn').textContent = 'Save';
            panel.querySelector('#skillCancelBtn').style.display = '';
            editingSkillId = result.body.id;
            showBodyWrite();
            openEditDialog(panel.querySelector('#skillForm'));
          })
          .catch(function (err) {
            errorEl.textContent = 'Could not load skill: ' + err.message;
          });
      });
    }

    panel.querySelector('#skillCancelBtn').addEventListener('click', resetSkillForm);
    panel.querySelector('.open-skill-form').addEventListener('click', function () {
      resetSkillForm();
      openEditDialog(panel.querySelector('#skillForm'));
      panel.querySelector('#skillIdInput').focus();
    });

    var form = panel.querySelector('#skillForm');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errorEl = panel.querySelector('#skillFormError');
      errorEl.textContent = '';
      var data = new FormData(form);
      // writeSkill (both routes go through the same PUT) creates-or-
      // replaces — so "Add" with an id that already exists just
      // overwrites it, same as editing it directly would.
      var id = editingSkillId || data.get('id');
      var submitBtn = panel.querySelector('#skillSubmitBtn');
      submitBtn.disabled = true;
      fetch('/agents/' + encodeURIComponent(name) + '/skills/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: data.get('description'), body: data.get('body') }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || 'request failed');
          refreshSkillsDependentPanels(name);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          submitBtn.disabled = false;
        });
    });
  }

  // ---- Tools tab: three sections, one per where a tool actually comes
  // from -- Local tools (agents/name/tools/), Agent as Tools (subagents,
  // via agentAsTool), and Gateway Tools (gateway-tools.ts's registry,
  // this section ported from the old standalone /agents/gateway-tools
  // page). Local tools/Agent as Tools render immediately from cfg --
  // already fetched to open the agent at all, no extra cost. Gateway
  // Tools alone loads lazily, only once this tab is opened (see
  // loadGatewayTab): unlike the other two, resolving it means actually
  // connecting to each registered source (see gateway-tools.ts's
  // describeGatewayTools), a real cost not worth paying up front. ----

  function renderToolsTabHtml(cfg) {
    return '<p class="muted" style="margin:0 0 20px">Everything this agent can call. <strong>Permission</strong> is set in the Permissions tab.</p>' +
      '<section><h3>Your tools (' + cfg.localTools.length + ')</h3>' + renderLocalTools(cfg.localTools) +
      '<div class="admin-subsection"><button type="button" class="open-http-tool-form">Create an HTTP tool</button>' +
        editDialogHtml('<h3 id="httpToolFormHeading">Create an HTTP tool</h3>', '<p>A tool that calls a web address, with the fields the agent fills in.</p>', renderHttpToolFormHtml()) + '</div>' +
      '</section>' +
      // Shown only for an agent that already has Composio tools
      // (gateway-tools.yml): see applyGatewaySources.
      '<section id="gatewayToolsSection" style="display:none">' +
        '<h3>From Composio <button type="button" id="gatewayToolsRefreshBtn" class="hint-btn">Refresh</button></h3>' +
        '<div id="gatewayToolsContent"><p class="hint">Loading&hellip;</p></div>' +
      '</section>' +
      '<section><h3>Subagents (' + cfg.agentAsTools.length + ')</h3>' + renderTools(cfg.agentAsTools) + '</section>';
  }

  // ---- Create an HTTP tool: generates a real agents/:name/tools/<tool>.ts
  // file from this form (loopengine's own createHttpTool), never arbitrary
  // code — only one shape, a parameterized HTTP call. See
  // web/http-tool-admin.ts's own header comment for why this is the line
  // this repo draws instead of, say, storing code in a SKILL.md and
  // executing it at request time. ----

  var httpToolFieldRowCount = 0;
  var httpToolHeaderRowCount = 0;

  function renderHttpToolFieldRow(index) {
    return '<div class="http-tool-field-row" data-row="' + index + '">' +
      '<input type="text" class="http-tool-field-name" placeholder="field_name" pattern="[a-zA-Z_][a-zA-Z0-9_]*">' +
      '<select class="http-tool-field-type">' +
        '<option value="string">string</option>' +
        '<option value="number">number</option>' +
        '<option value="boolean">boolean</option>' +
      '</select>' +
      '<input type="text" class="http-tool-field-description" placeholder="description (optional)">' +
      '<label class="http-tool-inline-label"><input type="checkbox" class="http-tool-field-required" checked> required</label>' +
      '<button type="button" class="delete-btn http-tool-remove-row" title="Remove this field" aria-label="Remove this field">Delete</button>' +
      '</div>';
  }

  function renderHttpToolHeaderRow(index) {
    return '<div class="http-tool-header-row" data-row="' + index + '">' +
      '<input type="text" class="http-tool-header-key" placeholder="Header-Name">' +
      '<input type="text" class="http-tool-header-value" placeholder="value, {field}, or {{ENV_VAR}}">' +
      '<button type="button" class="delete-btn http-tool-remove-row" title="Remove this header" aria-label="Remove this header">Delete</button>' +
      '</div>';
  }

  function renderHttpToolFormHtml() {
    httpToolFieldRowCount = 0;
    httpToolHeaderRowCount = 0;
    return '<form class="add-source" id="httpToolForm">' +
      '<label>Name <span class="hint">(snake_case, e.g. lookup_order_status)</span>' +
        '<input type="text" name="name" id="httpToolNameInput" required pattern="[a-z][a-z0-9_]*" placeholder="lookup_order_status">' +
      '</label>' +
      '<label>Description' +
        '<textarea name="description" id="httpToolDescriptionInput" required placeholder="What this tool does"></textarea>' +
      '</label>' +
      '<label>Fields' +
        '<div id="httpToolFieldRows"></div>' +
        '<button type="button" id="httpToolAddFieldBtn" class="hint-btn">Add field</button>' +
      '</label>' +
      '<label>Method &amp; URL <span class="hint">(use {field} for a field defined above)</span>' +
        '<div class="http-tool-method-url">' +
          '<select name="method">' +
            '<option value="GET">GET</option>' +
            '<option value="POST">POST</option>' +
            '<option value="PUT">PUT</option>' +
            '<option value="PATCH">PATCH</option>' +
            '<option value="DELETE">DELETE</option>' +
          '</select>' +
          '<input type="text" name="url" required placeholder="https://api.example.com/orders/{orderId}">' +
        '</div>' +
      '</label>' +
      '<label>Headers <span class="hint">(a value may reference {field} or {{ENV_VAR}} &mdash; never paste a real secret here)</span>' +
        '<div id="httpToolHeaderRows"></div>' +
        '<button type="button" id="httpToolAddHeaderBtn" class="hint-btn">Add header</button>' +
      '</label>' +
      '<label class="http-tool-inline-label"><input type="checkbox" name="sendFieldsAsJsonBody"> Send fields as a JSON body (POST/PUT/PATCH only)</label>' +
      '<label class="http-tool-inline-label"><input type="checkbox" name="safe"> Only reads data <span class="hint">(changes nothing: it runs in test runs, and alongside other calls)</span></label>' +
      '<label>Response JSON path <span class="hint">(optional &mdash; e.g. data.status; leave blank to return the raw response text)</span>' +
        '<input type="text" name="responseJsonPath" placeholder="data.status">' +
      '</label>' +
      '<label id="httpToolDecisionField">Grant permission <span class="hint">(optional &mdash; leave blank to leave this tool at actauth&#39;s own default, typically deny)</span>' +
        '<select name="decision">' +
          '<option value="">(leave unset)</option>' +
          '<option value="allow">allow</option>' +
          '<option value="ask">ask</option>' +
          '<option value="deny">deny</option>' +
        '</select>' +
      '</label>' +
      '<div id="httpToolError" class="error"></div>' +
      '<div class="ed-actions"><button type="button" id="httpToolCancelBtn" data-dialog-cancel style="display:none">Cancel</button><button type="submit" id="httpToolSubmitBtn" class="primary">Create tool</button></div>' +
      '</form>';
  }

  function wireHttpToolRemoveButton(row) {
    var btn = row.querySelector('.http-tool-remove-row');
    btn.addEventListener('click', function () {
      row.parentNode.removeChild(row);
    });
  }

  function wireHttpToolFormHandlers(name) {
    var form = detail.querySelector('#httpToolForm');
    if (!form) return;

    var fieldRows = detail.querySelector('#httpToolFieldRows');
    var headerRows = detail.querySelector('#httpToolHeaderRows');
    var addFieldBtn = detail.querySelector('#httpToolAddFieldBtn');
    var addHeaderBtn = detail.querySelector('#httpToolAddHeaderBtn');
    var errorEl = detail.querySelector('#httpToolError');
    var submitBtn = detail.querySelector('#httpToolSubmitBtn');
    var cancelBtn = detail.querySelector('#httpToolCancelBtn');
    var nameInput = detail.querySelector('#httpToolNameInput');
    var decisionField = detail.querySelector('#httpToolDecisionField');
    var headingEl = detail.querySelector('#httpToolFormHeading');
    // Non-null only while editing an existing tool — the name field is
    // disabled then (renaming isn't supported, see updateHttpTool's own
    // doc comment), so the submitted name always has to come from here,
    // never from the (excluded-from-FormData) disabled input.
    var editingHttpToolName = null;

    addFieldBtn.addEventListener('click', function () {
      fieldRows.insertAdjacentHTML('beforeend', renderHttpToolFieldRow(httpToolFieldRowCount++));
      wireHttpToolRemoveButton(fieldRows.lastElementChild);
    });
    addHeaderBtn.addEventListener('click', function () {
      headerRows.insertAdjacentHTML('beforeend', renderHttpToolHeaderRow(httpToolHeaderRowCount++));
      wireHttpToolRemoveButton(headerRows.lastElementChild);
    });

    // Repopulates the (blank, create-mode-shaped) form from a saved spec
    // — same field/header row-building addFieldBtn/addHeaderBtn already
    // do, just filled in immediately instead of left blank for typing.
    function populateHttpToolForm(spec) {
      nameInput.value = spec.name;
      form.querySelector('#httpToolDescriptionInput').value = spec.description;

      fieldRows.innerHTML = '';
      for (var i = 0; i < spec.fields.length; i++) {
        var f = spec.fields[i];
        fieldRows.insertAdjacentHTML('beforeend', renderHttpToolFieldRow(httpToolFieldRowCount++));
        var row = fieldRows.lastElementChild;
        row.querySelector('.http-tool-field-name').value = f.name;
        row.querySelector('.http-tool-field-type').value = f.type;
        row.querySelector('.http-tool-field-description').value = f.description || '';
        row.querySelector('.http-tool-field-required').checked = f.required;
        wireHttpToolRemoveButton(row);
      }

      form.querySelector('[name="method"]').value = spec.method;
      form.querySelector('[name="url"]').value = spec.url;

      headerRows.innerHTML = '';
      for (var j = 0; j < spec.headers.length; j++) {
        var h = spec.headers[j];
        headerRows.insertAdjacentHTML('beforeend', renderHttpToolHeaderRow(httpToolHeaderRowCount++));
        var hrow = headerRows.lastElementChild;
        hrow.querySelector('.http-tool-header-key').value = h.key;
        hrow.querySelector('.http-tool-header-value').value = h.value;
        wireHttpToolRemoveButton(hrow);
      }

      form.querySelector('[name="sendFieldsAsJsonBody"]').checked = spec.sendFieldsAsJsonBody;
      form.querySelector('[name="safe"]').checked = spec.safe === true;
      form.querySelector('[name="responseJsonPath"]').value = spec.responseJsonPath || '';
    }

    function resetHttpToolForm() {
      form.reset();
      fieldRows.innerHTML = '';
      headerRows.innerHTML = '';
      nameInput.disabled = false;
      if (headingEl) headingEl.textContent = 'Create an HTTP tool';
      submitBtn.textContent = 'Create tool';
      cancelBtn.style.display = 'none';
      decisionField.style.display = '';
      errorEl.textContent = '';
      editingHttpToolName = null;
    }

    cancelBtn.addEventListener('click', resetHttpToolForm);
    var openHttpToolBtn = detail.querySelector('.open-http-tool-form');
    if (openHttpToolBtn) openHttpToolBtn.addEventListener('click', function () {
      resetHttpToolForm();
      openEditDialog(form);
    });

    // Local tools table's own Edit buttons (renderLocalTools) — only
    // present for tools describeAgent flagged httpToolEditable, so this
    // GET should never actually 404 in normal use.
    var editButtons = detail.querySelectorAll('.edit-http-tool-btn');
    for (var k = 0; k < editButtons.length; k++) {
      editButtons[k].addEventListener('click', function (ev) {
        var toolName = ev.currentTarget.getAttribute('data-name');
        errorEl.textContent = '';
        fetch('/agents/' + encodeURIComponent(name) + '/tools/http/' + encodeURIComponent(toolName))
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            populateHttpToolForm(result.body);
            nameInput.disabled = true;
            if (headingEl) headingEl.textContent = 'Edit HTTP tool "' + toolName + '"';
            submitBtn.textContent = 'Save';
            cancelBtn.style.display = '';
            decisionField.style.display = 'none';
            editingHttpToolName = toolName;
            openEditDialog(form);
          })
          .catch(function (err) {
            errorEl.textContent = 'Could not load tool "' + toolName + '": ' + err.message;
          });
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      errorEl.textContent = '';

      var fields = [];
      var fieldRowEls = fieldRows.querySelectorAll('.http-tool-field-row');
      for (var i = 0; i < fieldRowEls.length; i++) {
        var row = fieldRowEls[i];
        var fieldName = row.querySelector('.http-tool-field-name').value.trim();
        if (!fieldName) continue;
        fields.push({
          name: fieldName,
          type: row.querySelector('.http-tool-field-type').value,
          description: row.querySelector('.http-tool-field-description').value.trim() || undefined,
          required: row.querySelector('.http-tool-field-required').checked,
        });
      }

      var headers = [];
      var headerRowEls = headerRows.querySelectorAll('.http-tool-header-row');
      for (var j = 0; j < headerRowEls.length; j++) {
        var hrow = headerRowEls[j];
        var headerKey = hrow.querySelector('.http-tool-header-key').value.trim();
        if (!headerKey) continue;
        headers.push({ key: headerKey, value: hrow.querySelector('.http-tool-header-value').value });
      }

      var formData = new FormData(form);
      var payload = {
        name: editingHttpToolName || formData.get('name'),
        description: formData.get('description'),
        fields: fields,
        method: formData.get('method'),
        url: formData.get('url'),
        headers: headers,
        sendFieldsAsJsonBody: formData.get('sendFieldsAsJsonBody') === 'on',
        safe: formData.get('safe') === 'on',
        responseJsonPath: formData.get('responseJsonPath') ? formData.get('responseJsonPath') : undefined,
        decision: formData.get('decision') ? formData.get('decision') : undefined,
      };

      var isEdit = !!editingHttpToolName;
      var url = '/agents/' + encodeURIComponent(name) + '/tools/http' + (isEdit ? '/' + encodeURIComponent(editingHttpToolName) : '');

      submitBtn.disabled = true;
      fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || 'request failed');
          selectAgent(name);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          submitBtn.disabled = false;
        });
    });
  }

  // Removing a source used to be one "Remove" button per source, at the
  // bottom of the card — dropping every tool it produces at once, with
  // no way to remove just one. Each slug now gets its own remove icon
  // instead, right where it's listed — a source disappears on its own,
  // via removeGatewayToolSlug, once its last slug is gone (see that
  // function's own doc comment).
  function renderGatewaySource(s) {
    var errorHtml = s.status === 'error' ? '<p class="error">' + escapeHtml(s.error) + '</p>' : '';
    var rowsHtml = !s.entry.slugs.length
      ? '<p class="hint">No tools registered.</p>'
      : '<ul class="tool-list">' + s.entry.slugs.map(function (slug, i) {
          var tool = s.status === 'ok' ? s.tools[i] : null;
          var label = tool
            ? '<code>' + escapeHtml(tool.name) + '</code> &mdash; ' + escapeHtml(tool.description)
            : '<code>' + escapeHtml(s.entry.name + '_' + slug) + '</code>';
          return '<li><span class="tool-picker-label">' + label + '</span>' +
            ' <button type="button" class="delete-btn" data-source="' + escapeHtml(s.entry.name) + '" data-slug="' + escapeHtml(slug) + '" title="Remove this tool" aria-label="Remove this tool">Delete</button>' +
            '</li>';
        }).join('') + '</ul>';

    return '<div class="source">' +
      '<div class="source-head">' +
        '<h4>' + escapeHtml(s.entry.name) + ' <span class="hint">(' + escapeHtml(s.entry.provider) + ')</span></h4>' +
        '<span class="' + (s.status === 'ok' ? 'status-ok' : 'status-error') + '">' + escapeHtml(s.status) + '</span>' +
      '</div>' +
      errorHtml +
      rowsHtml +
      '</div>';
  }

  function renderGatewayHtml(sources) {
    var listHtml = sources.length
      ? sources.map(renderGatewaySource).join('')
      : '<p class="hint">No gateway tools registered yet.</p>';

    // App + tool picker instead of freeform slug entry — pulled from
    // GET /composio/connections and GET /composio/tools?toolkit=X (see
    // wireGatewayHandlers below), so adding a source means checking boxes
    // for what's already connected and available, not needing to already
    // know a toolkit's exact slug strings by heart.
    return '<section><div id="sourceList">' + listHtml + '</div></section>' +
      '<section><h3>Add a gateway tool</h3>' +
      '<form class="add-source" id="addForm">' +
        '<label>Provider' +
          '<select name="provider"><option value="composio">Composio</option></select>' +
        '</label>' +
        '<label>App <span class="hint">(already connected via composio link)</span>' +
          '<select name="toolkit" id="toolkitSelect" required><option value="">Loading apps&hellip;</option></select>' +
        '</label>' +
        '<label>Name <span class="hint">(namespaces every tool it produces, e.g. "gh")</span>' +
          '<input name="name" required pattern="[a-z0-9_]+" placeholder="gh">' +
        '</label>' +
        '<label>Tools' +
          '<input type="text" id="toolFilter" placeholder="Filter by name or slug&hellip;">' +
          '<div class="tool-picker-controls">' +
            '<button type="button" id="selectAllToolsBtn" disabled>Select all</button>' +
            '<span class="hint" id="selectedCount"></span>' +
          '</div>' +
          '<div class="tool-picker-list" id="toolPickerList"><p class="hint">Pick an app above first.</p></div>' +
        '</label>' +
        '<label>Grant permission <span class="hint">(optional — leave blank to leave every new tool at actauth\\'s own default, typically deny)</span>' +
          '<select name="decision">' +
            '<option value="">(leave unset)</option>' +
            '<option value="auto" selected>auto — allow read-only tools, ask for the rest</option>' +
            '<option value="allow">allow</option>' +
            '<option value="ask">ask</option>' +
            '<option value="deny">deny</option>' +
          '</select>' +
        '</label>' +
        '<button type="submit" id="addSubmitBtn" disabled>Add</button>' +
        '<div id="addError" class="error"></div>' +
      '</form></section>';
  }

  function gatewayContentEl() {
    return detail.querySelector('#gatewayToolsContent');
  }

  function wireGatewayHandlers(name) {
    var content = gatewayContentEl();
    var removeToolButtons = content.querySelectorAll('.delete-btn');
    for (var i = 0; i < removeToolButtons.length; i++) {
      removeToolButtons[i].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var sourceName = btn.getAttribute('data-source');
        var slug = btn.getAttribute('data-slug');
        btn.disabled = true;
        fetch('/agents/' + encodeURIComponent(name) + '/gateway-tools/' + encodeURIComponent(sourceName) + '/' + encodeURIComponent(slug), { method: 'DELETE' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (result) {
            if (!result.ok) throw new Error(result.body.error || 'request failed');
            // Same shortcut as the add-form's own success handler — the
            // DELETE response already carries the freshly-resolved
            // sources, so applying it directly skips a second,
            // redundant live-reconnect round trip for the same data.
            applyGatewaySources(name, result.body.sources || []);
            // Removing a tool also drops its auto-seeded actauth rule
            // (see removeGatewayToolSlug) — keep Overview/Actauth in
            // sync with that.
            refreshActauthDependentPanels(name);
          })
          .catch(function (err) {
            alert('Could not remove: ' + err.message);
            btn.disabled = false;
          });
      });
    }

    var form = content.querySelector('#addForm');
    var toolkitSelect = content.querySelector('#toolkitSelect');
    var nameInput = form.querySelector('input[name="name"]');
    var toolFilter = content.querySelector('#toolFilter');
    var toolPickerList = content.querySelector('#toolPickerList');
    var selectAllBtn = content.querySelector('#selectAllToolsBtn');
    var selectedCountEl = content.querySelector('#selectedCount');
    var submitBtn = content.querySelector('#addSubmitBtn');
    var currentTools = [];
    // Tracks whichever toolkit slug the Name field was last auto-filled
    // with, so switching apps updates an untouched Name along with it —
    // but the moment a person types their own value in, it stops
    // clobbering that on the next app switch.
    var nameAutoFilledAs = '';

    function updateSelectedCount() {
      var boxes = toolPickerList.querySelectorAll('input[name="slugs"]');
      var checked = toolPickerList.querySelectorAll('input[name="slugs"]:checked').length;
      selectedCountEl.textContent = checked ? checked + ' of ' + boxes.length + ' selected' : '';
    }

    function renderToolPicker(tools, filterText) {
      var q = (filterText || '').toLowerCase();
      var filtered = !q
        ? tools
        : tools.filter(function (t) {
            return t.slug.toLowerCase().indexOf(q) !== -1 || t.name.toLowerCase().indexOf(q) !== -1 || t.description.toLowerCase().indexOf(q) !== -1;
          });
      if (!filtered.length) {
        toolPickerList.innerHTML = '<p class="hint">No matching tools.</p>';
        updateSelectedCount();
        return;
      }
      toolPickerList.innerHTML = filtered.map(function (t) {
        return '<label class="tool-picker-item">' +
          '<span class="tool-picker-label"><strong>' + escapeHtml(t.name) + '</strong> <span class="hint">' + escapeHtml(t.slug) + '</span>' +
          '<br><span class="hint">' + escapeHtml(t.description) + '</span></span>' +
          '<input type="checkbox" name="slugs" value="' + escapeHtml(t.slug) + '">' +
          '</label>';
      }).join('');
      var boxes = toolPickerList.querySelectorAll('input[name="slugs"]');
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].addEventListener('change', updateSelectedCount);
      }
      updateSelectedCount();
    }

    // Acts only on the currently-filtered/visible tools, not every tool
    // the toolkit has — filtering to "issue" and hitting Select all is
    // meant to select the issue-related tools shown, not silently pull
    // in everything else the toolkit offers too. Toggles: if everything
    // visible is already checked, this unchecks it instead.
    selectAllBtn.addEventListener('click', function () {
      var boxes = toolPickerList.querySelectorAll('input[name="slugs"]');
      if (!boxes.length) return;
      var allChecked = Array.prototype.every.call(boxes, function (b) { return b.checked; });
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = !allChecked;
      updateSelectedCount();
    });

    function loadToolsForToolkit(toolkit) {
      toolPickerList.innerHTML = '<p class="hint">Loading tools&hellip;</p>';
      submitBtn.disabled = true;
      selectAllBtn.disabled = true;
      fetch('/composio/tools?toolkit=' + encodeURIComponent(toolkit))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || 'request failed');
          currentTools = result.body.tools || [];
          renderToolPicker(currentTools, toolFilter.value);
          submitBtn.disabled = false;
          selectAllBtn.disabled = false;
        })
        .catch(function (err) {
          toolPickerList.innerHTML = '<p class="error">Could not load tools: ' + escapeHtml(err.message) + '</p>';
        });
    }

    fetch('/composio/connections')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var active = (data.connections || []).filter(function (c) { return c.status === 'ACTIVE'; });
        var toolkits = [];
        for (var i = 0; i < active.length; i++) {
          if (toolkits.indexOf(active[i].toolkit) === -1) toolkits.push(active[i].toolkit);
        }
        if (!toolkits.length) {
          toolkitSelect.innerHTML = '<option value="">No connected apps</option>';
          toolPickerList.innerHTML = '<p class="hint">Run "composio link &lt;toolkit&gt;" on the machine running this server, then reopen this tab.</p>';
          return;
        }
        toolkitSelect.innerHTML = '<option value="">Choose an app&hellip;</option>' +
          toolkits.map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
      })
      .catch(function (err) {
        toolkitSelect.innerHTML = '<option value="">Could not load apps</option>';
        toolPickerList.innerHTML = '<p class="error">Could not load connected apps: ' + escapeHtml(err.message) + '</p>';
      });

    toolkitSelect.addEventListener('change', function () {
      var toolkit = toolkitSelect.value;
      if (!toolkit) {
        toolPickerList.innerHTML = '<p class="hint">Pick an app above first.</p>';
        submitBtn.disabled = true;
        selectAllBtn.disabled = true;
        selectedCountEl.textContent = '';
        return;
      }
      if (!nameInput.value || nameInput.value === nameAutoFilledAs) {
        nameInput.value = toolkit;
        nameAutoFilledAs = toolkit;
      }
      loadToolsForToolkit(toolkit);
    });

    toolFilter.addEventListener('input', function () {
      renderToolPicker(currentTools, toolFilter.value);
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var addError = content.querySelector('#addError');
      addError.textContent = '';
      var checked = form.querySelectorAll('input[name="slugs"]:checked');
      var slugs = Array.prototype.map.call(checked, function (cb) { return cb.value; });
      if (!slugs.length) {
        addError.textContent = 'Pick at least one tool.';
        return;
      }
      var data = new FormData(form);
      var body = { provider: data.get('provider'), name: data.get('name'), slugs: slugs };
      var decision = data.get('decision');
      if (decision) body.decision = decision;

      // Immediate feedback the instant Add is clicked — without this,
      // the button just sits there through the whole POST (which itself
      // does a live connect to every registered source, not a quick
      // write — see gateway-tools.ts's describeGatewayTools), so nothing
      // visibly happens until it's already done.
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';

      fetch('/agents/' + encodeURIComponent(name) + '/gateway-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.body.error || 'request failed');
          // The POST response already carries the freshly-resolved
          // sources (handleToolSourcesPost returns exactly what
          // describeGatewayTools would) — applying it directly instead
          // of calling loadGatewayTab skips a second, fully-redundant
          // live-reconnect round trip for the exact same data.
          applyGatewaySources(name, result.body.sources || []);
          // A decision (if given) just seeded a new actauth rule — keep
          // Overview/Actauth in sync with that instead of showing it
          // only after the agent is re-selected.
          refreshActauthDependentPanels(name);
        })
        .catch(function (err) {
          addError.textContent = err.message;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add';
        });
    });
  }

  function applyGatewaySources(name, sources) {
    var content = gatewayContentEl();
    if (!content) return;
    var section = detail.querySelector('#gatewayToolsSection');
    if (section) section.style.display = sources.length ? '' : 'none';
    content.innerHTML = renderGatewayHtml(sources);
    wireGatewayHandlers(name);
    gatewayLoadedFor = name;
  }

  // force: true bypasses describeGatewayTools' own cache (see its own
  // doc comment) — the "Refresh" button's case, for when an operator
  // actually wants a live re-check (e.g. after reconnecting an account),
  // not the default tab-open case, which is happy with whatever a prior
  // load in this same gateway-tools.yml's lifetime already found.
  function loadGatewayTab(name, force) {
    var content = gatewayContentEl();
    if (!content) return;
    content.innerHTML = '<p class="hint">Loading&hellip;</p>';
    fetch('/agents/' + encodeURIComponent(name) + '/gateway-tools' + (force ? '?refresh=1' : ''))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (currentName !== name) return;
        applyGatewaySources(name, data.sources || []);
      })
      .catch(function (err) {
        if (currentName !== name) return;
        content.innerHTML = '<p class="error">Could not load gateway tools: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // ---- Tab switching + agent selection ----

  var CONFIG_TABS = ['overview', 'workflows', 'abilities', 'actauth', 'messaging', 'schedules', 'env', 'advanced'];
  // The old Tools and Skills tabs: now parts of Advanced. A link to one
  // opens Advanced at that part.
  // The Apps tab keeps the id 'abilities'; ?tab=apps opens it too.
  var TAB_ALIASES = { tools: 'advanced', skills: 'advanced', apps: 'abilities' };

  function resolveTab(tab) {
    tab = TAB_ALIASES[tab] || tab;
    return CONFIG_TABS.indexOf(tab) === -1 ? 'overview' : tab;
  }

  function switchTab(requested) {
    var tab = resolveTab(requested);
    currentTab = tab;
    leShell.setTab(tab);
    // Same URL a fresh load of this tab would have, so reload, back/forward
    // and a copied link all land here — without a navigation per click.
    var url = new URL(location.href);
    if (tab === 'overview') url.searchParams.delete('tab'); else url.searchParams.set('tab', tab);
    history.replaceState(null, '', url.pathname + url.search);
    var panels = detail.querySelectorAll('.tab-panel');
    for (var i = 0; i < panels.length; i++) {
      panels[i].style.display = panels[i].dataset.tabPanel === tab ? 'block' : 'none';
    }
    if (tab === 'advanced' && gatewayLoadedFor !== currentName) {
      loadGatewayTab(currentName);
    }
    // Opened through an old Tools or Skills link: scroll to that part.
    if (TAB_ALIASES[requested]) {
      var part = detail.querySelector('#advanced-' + requested);
      if (part) part.scrollIntoView({ block: 'start' });
    }
    if ((tab === 'actauth' || tab === 'advanced') && actauthLoadedFor !== currentName) {
      loadActauthTab(currentName);
    }
    if (tab === 'messaging') loadApprovalsSection(currentName);
    if (tab === 'actauth') refreshPendingCount(currentName);
    if (tab === 'env' && envLoadedFor !== currentName) {
      loadEnvTab(currentName);
    }
    if (tab === 'abilities' && abilitiesLoadedFor !== currentName) {
      loadAbilitiesTab(currentName);
    }
    if (tab === 'schedules') loadSchedulesTab(currentName);
  }

  // Refreshes just Overview's own summary — used after anything that
  // changes tools/skills/permissions but already has its own tab
  // reflecting the change directly from the response (applyGatewaySources,
  // applyActauthConfig, refreshSkillsDependentPanels's own Skills half),
  // so only Overview is left needing a re-fetch.
  function refreshOverviewPanel(name) {
    fetch('/agents/' + encodeURIComponent(name) + '/config')
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (currentName !== name) return;
        // A non-ok body is {error: "..."}, not a real config — bail out
        // to the catch below rather than rendering it as one (same risk
        // selectAgent's own /config fetch has — see its own comment).
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        var cfg = result.body;
        currentCfg = cfg;
        var overviewPanel = detail.querySelector('[data-tab-panel="overview"]');
        if (overviewPanel) {
          overviewPanel.innerHTML = renderOverviewHtml(cfg);
          fillOverviewCards(currentName);
          wireOverviewHandlers(name);
        }
      })
      .catch(function () {
        // Best-effort — the tab that triggered this already reflects the
        // change either way, this is only about keeping Overview in sync.
      });
  }

  // Adding or removing a gateway tool changes actauth.yml (a decision
  // seeds/drops a rule for it — see gateway-tools.ts's addGatewayTool/
  // removeGatewayToolSlug) but Overview's own Actauth section and the
  // dedicated Actauth tab were both rendered once, from whatever cfg
  // /agents/:name/config (and, for the Actauth tab, GET .../actauth)
  // returned when the agent/tab was first opened — without this, a rule
  // added or removed from the Tools tab wouldn't show up there until the
  // agent was re-selected or the page reloaded. Only re-loads the
  // Actauth tab if it's actually been opened already (actauthLoadedFor)
  // — otherwise it'll load fresh, gateway-tool-seeded rules included,
  // the first time it is.
  function refreshActauthDependentPanels(name) {
    refreshOverviewPanel(name);
    if (actauthLoadedFor === name) loadActauthTab(name);
  }

  // Skills tab isn't lazily loaded like Gateway Tools/Actauth (see its
  // own header comment — it's already free from cfg, no live connection
  // needed) — so refreshing it after an add/edit/delete just means
  // re-rendering both it and Overview from a fresh /config fetch.
  function refreshSkillsDependentPanels(name) {
    fetch('/agents/' + encodeURIComponent(name) + '/config')
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (result) {
        if (currentName !== name) return;
        // Same "don't render an {error: ...} body as if it were a real
        // config" guard as refreshOverviewPanel/selectAgent above.
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        var cfg = result.body;
        currentCfg = cfg;
        var overviewPanel = detail.querySelector('[data-tab-panel="overview"]');
        var skillsPanel = skillsPanelEl();
        if (overviewPanel) {
          overviewPanel.innerHTML = renderOverviewHtml(cfg);
          fillOverviewCards(currentName);
          wireOverviewHandlers(name);
        }
        if (skillsPanel) {
          skillsPanel.innerHTML = renderSkillsTabHtml(cfg);
          wireSkillsHandlers(name);
        }
      })
      .catch(function () {});
  }

  // A model provider by its name: OpenAI, Anthropic, Gemini...
  var PROVIDER_NAMES = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', meta: 'Meta', xai: 'xAI', deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM' };
  function providerName(p) { return PROVIDER_NAMES[p] || p; }
  // What a call no rule covers does, in words.
  var DEFAULT_DECISIONS = { allow: 'runs on its own', ask: 'asks you first', deny: 'never runs' };
  var OTHER_CALLS = { allow: 'run on their own', ask: 'ask you first', deny: 'never run' };
  function defaultDecisionText(d) { return 'Other tool calls ' + (OTHER_CALLS[d] || d); }
  function modelChip(cfg) {
    if (typeof cfg.model === 'string') return { text: cfg.model, mono: true };
    return { text: providerName(cfg.model.provider) + ' \u00b7 ' + (cfg.model.model || 'default model') };
  }

  function renderDetail(cfg) {
    currentCfg = cfg;
    detail.classList.toggle('wf-page-mode', Boolean(workflowPageId) && cfg.name === pageParams.get('agent'));
    detail.innerHTML =
      leShell.renderHead({
        name: cfg.name,
        displayName: cfg.displayName,
        prompt: cfg.systemPrompt,
        chips: [modelChip(cfg), { text: defaultDecisionText(cfg.permissions.defaultDecision) }],
        tab: currentTab,
        counts: { tools: cfg.tools.length, skills: cfg.skills.length, abilities: cfg.abilityCount, workflows: cfg.skills.filter(function (s) { return s.workflow; }).length },
      }) +
      '<div class="le-scroll"><div class="le-page" style="display:block">' +
      '<div class="tab-panel" data-tab-panel="overview">' + renderOverviewHtml(cfg) + '</div>' +
      // Workflows: the jobs this agent does, each with what starts it.
      '<div class="tab-panel" data-tab-panel="workflows">' +
        '<div class="wf-tab-head"><p class="muted">What this agent does on its own, as workflows: what each does, the ways to run it (a schedule, a webhook, Run now or an app&#39;s API call) and how its runs went. In Chat it can do them too, when you ask.</p>' +
          '<a class="wf-new-btn" href="/workflows/new?agent=' + encodeURIComponent(cfg.name) + '">Build a workflow</a></div>' +
        '<section id="workflowsSection"><div id="workflowsContent"><p class="hint">Loading&hellip;</p></div></section>' +
      '</div>' +
      // Advanced: the agent's own tools (and Composio, subagents), then its
      // own skills. Each part keeps its old data-tab-panel name, which the
      // code that redraws it looks for; only .tab-panel is shown or hidden.
      '<div class="tab-panel" data-tab-panel="advanced">' +
        '<p class="muted" style="margin:0 0 20px">For building your own: tools and skills that don&#39;t come from an ability, Composio tools, subagents and permission rules in full. What each ability adds is in its Details on the Apps tab.</p>' +
        '<h2 class="advanced-part" id="advanced-tools">Tools</h2>' +
        '<div data-tab-panel="tools">' + renderToolsTabHtml(cfg) + '</div>' +
        '<h2 class="advanced-part" id="advanced-skills">Skills</h2>' +
        '<div data-tab-panel="skills">' + renderSkillsTabHtml(cfg) + '</div>' +
        '<h2 class="advanced-part" id="advanced-rules">Permission rules</h2>' +
        '<div id="advancedRulesContent"><p class="hint">Loading&hellip;</p></div>' +
        '<h2 class="advanced-part" id="advanced-delete">Delete this agent</h2>' +
        renderDeleteAgentHtml(cfg) +
      '</div>' +
      '<div class="tab-panel" data-tab-panel="actauth">' + renderActauthTabPlaceholder() + '</div>' +
      '<div class="tab-panel" data-tab-panel="messaging">' + renderMessagingTabPlaceholder() + '</div>' +
      '<div class="tab-panel" data-tab-panel="env">' + renderEnvTabPlaceholder() + '</div>' +
      '<div class="tab-panel" data-tab-panel="abilities">' + renderAbilitiesTabPlaceholder() + '</div>' +
      '<div class="tab-panel" data-tab-panel="schedules">' + renderSchedulesTabPlaceholder() + '</div>' +
      '</div></div>';

    wireSkillsHandlers(cfg.name);
    wireOverviewHandlers(cfg.name);
    wireDeleteAgent(cfg.name);
    wireHttpToolFormHandlers(cfg.name);
    var gatewayRefreshBtn = detail.querySelector('#gatewayToolsRefreshBtn');
    if (gatewayRefreshBtn) {
      gatewayRefreshBtn.addEventListener('click', function () { loadGatewayTab(cfg.name, true); });
    }

    empty.style.display = 'none';
    detail.style.display = 'flex';
    switchTab(initialAdvancedPart || currentTab);
    initialAdvancedPart = null;
    fillOverviewCards(cfg.name);
    loadWorkflowsSection(cfg.name);
  }

  function fetchAgentConfig(name) {
    return fetch('/agents/' + encodeURIComponent(name) + '/config')
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  }

  // prefetched: the config request already under way for this agent, as
  // on a first load, which asks for it alongside the agent list.
  function selectAgent(name, prefetched) {
    currentName = name;
    gatewayLoadedFor = null;
    actauthLoadedFor = null;
    envLoadedFor = null;
    abilitiesLoadedFor = null;
    if (workflowsRefreshTimer) { clearTimeout(workflowsRefreshTimer); workflowsRefreshTimer = null; }
    leShell.setActive(name);
    // On a first load the page's own "Loading…" stays up; only a switch
    // from an agent already shown needs one in its place.
    if (detail.style.display !== 'none') detail.innerHTML = '<p class="muted" style="padding:24px">Loading&hellip;</p>';
    (prefetched || fetchAgentConfig(name))
      .then(function (result) {
        if (currentName !== name) return;
        // A non-ok response's body is {error: "..."}, not a real config
        // — rendering it as one would crash somewhere deep in
        // renderDetail (e.g. reading .model.provider off an object with
        // no .model at all) with a confusing, unrelated-looking message
        // instead of the actual server-side error this route already
        // went out of its way to surface clearly (see handleAgentConfig
        // Get's own doc comment).
        if (!result.ok) throw new Error(result.body.error || 'request failed');
        renderDetail(result.body);
      })
      .catch(function (err) {
        if (currentName !== name) return;
        empty.style.display = 'none';
        detail.style.display = 'flex';
        detail.innerHTML = '<p class="error">Could not load config: ' + escapeHtml(err.message) + '</p>';
      });
  }

  // Another agent in the sidebar opens in place, on the same tab: the
  // address changes as a click on the link would, without reloading the
  // page or the agent list.
  document.addEventListener('click', function (ev) {
    var link = ev.target.closest('a[data-le-agent]');
    if (!link || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (workflowPageId) return;
    if (document.querySelector('dialog[open]')) return;
    ev.preventDefault();
    var name = link.dataset.leAgent;
    if (name === currentName) return;
    history.pushState(null, '', leShell.tabHref(name, currentTab));
    selectAgent(name);
  });
  window.addEventListener('popstate', function () {
    var params = new URLSearchParams(location.search);
    var name = params.get('agent');
    if (!name) return;
    currentTab = resolveTab(params.get('tab'));
    if (name !== currentName) selectAgent(name); else switchTab(currentTab);
  });

  // Chat is a real link to the playground; every other tab, and every
  // Overview card pointing at one, switches in place. Delegated once
  // here because Overview's cards are re-rendered after every edit.
  detail.addEventListener('click', function (ev) {
    var link = ev.target.closest('a[data-tab]');
    if (!link || link.dataset.tab === 'chat' || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    switchTab(link.dataset.tab);
  });

  var initialParams = new URLSearchParams(location.search);
  currentTab = resolveTab(initialParams.get('tab'));
  // An old ?tab=tools or ?tab=skills link: scrolled to that part once loaded.
  var initialAdvancedPart = TAB_ALIASES[initialParams.get('tab')] ? initialParams.get('tab') : null;
  // The agent asked for is fetched alongside the list, not after it.
  var requestedAgent = initialParams.get('agent');
  var prefetchedConfig = requestedAgent ? fetchAgentConfig(requestedAgent) : null;
  if (prefetchedConfig) prefetchedConfig.catch(function () {});
  leShell.ready.then(function (agents) {
    if (!agents.length) {
      empty.innerHTML = leShell.loadError()
        ? 'Could not load agents: ' + escapeHtml(leShell.loadError()) + '. Reload the page to try again.'
        : 'No agents yet. <a href="/agents?new=1">Create one</a> or add a folder under agents/.';
      return;
    }
    var found = agents.some(function (a) { return a.name === requestedAgent; });
    selectAgent(found ? requestedAgent : agents[0].name, found ? prefetchedConfig : null);
  });
})();
</script>
</body>
</html>
`
