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
import { devUiCss } from './dev-ui-styles.js'
import { MESSAGING_ICONS } from './messaging-icons.js'
import { consoleShellScript, consoleSidebarHtml } from './console-shell.js'
import { REASONING_PROVIDERS } from './agent-file-admin.js'

export const agentsConfigPageHtml: string = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LoopEngine Console</title>
<style>${devUiCss}
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
  .wf-tab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0 0 20px; }
  .wf-tab-head p { margin: 0; max-width: 72ch; }
  .wf-new-btn { flex: none; display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 8px; background: var(--accent); color: var(--on-accent); font-size: 13.5px; font-weight: 600; text-decoration: none; white-space: nowrap; }
  .wf-new-btn:hover { filter: brightness(1.08); }
  .wf-card { margin: 0 0 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); box-shadow: 0 1px 2px rgba(15, 23, 42, .04); overflow: hidden; }
  .wf-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 18px 20px 16px; }
  .wf-card-title { min-width: 0; }
  .wf-card-title h3 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.01em; color: var(--ink); }
  .wf-card-title p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-muted); }
  .wf-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .wf-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 550; line-height: 1.5; }
  .wf-chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .7; }
  .wf-chip.good { background: var(--good-soft); color: var(--good); border-color: transparent; }
  .wf-chip.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
  .wf-chip.accent { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
  .wf-card-actions { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 50%; }
  .wf-card-actions button { height: 32px; padding: 0 12px; border-radius: 8px; font-size: 13px; }
  .wf-card-actions .wf-remove { border-color: transparent; background: transparent; color: var(--bad); }
  .wf-card-actions .wf-remove:hover:not(:disabled) { background: var(--bad-soft); }
  .wf-card-actions .wf-remove[data-confirming="1"] { height: auto; min-height: 32px; padding: 6px 12px; background: var(--bad-soft); text-align: left; white-space: normal; }
  .wf-empty { padding: 12px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-muted); }
  .wf-card > .workflow-result:empty { display: none; }
  .wf-card > .workflow-result { padding: 10px 20px; border-top: 1px solid var(--line); }
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
  .workflow-starts > .workflow-section-content { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .workflow-starts.wf-starts-compact > .workflow-section-content { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .workflow-starts.wf-starts-compact .wf-start-api { grid-column: 1 / -1; }
  @media (max-width: 900px) { .workflow-starts.wf-starts-compact > .workflow-section-content { grid-template-columns: minmax(0, 1fr); } }
  .workflow-starts .wf-start { align-content: start; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
  .workflow-starts .wf-start:first-of-type { padding-top: 14px; border-top: 1px solid var(--line); }
  .workflow-starts .workflow-hooks:empty { display: none; }
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
  .workflow-card { margin-bottom: 10px; }
  .workflow-card.workflow-focus { box-shadow: 0 0 0 2px var(--le-accent, #0f766e); transition: box-shadow 0.3s; }
  tr.schedule-focus td { background: var(--le-accent-soft, #e6f4ef); transition: background 0.3s; }
  .workflow-run-controls { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
  .workflow-run-notify { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
  .workflow-run-notify input { width: auto; margin: 0; }
  .wf-start { padding: 10px 0; border-top: 1px solid var(--le-line, #e5e7eb); display: grid; gap: 6px; font-size: 13px; }
  .wf-start:first-of-type { border-top: 0; padding-top: 6px; }
  .wf-start-head { display: flex; align-items: center; gap: 6px; }
  .wf-start-head strong { font-size: 13px; }
  .help-q { width: 18px; height: 18px; padding: 0; border-radius: 50%; font-size: 11px; line-height: 16px; font-weight: 600; text-align: center; cursor: pointer; }
  .help-text { margin: 0; }
  .help-text[hidden] { display: none; }
  .wf-start .schedule-history { margin: 0; gap: 6px; }
  .wf-start .workflow-params { margin: 0; }
  .wf-start pre { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--le-bg, #fff); border: 1px solid var(--le-line, #e5e7eb); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
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
  .workflow-param-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .workflow-param-row .wp-name { width: 160px; font-family: var(--le-mono, monospace); }
  .workflow-param-row .wp-desc { flex: 1; min-width: 200px; }
  .workflow-param { display: flex; flex-direction: column; gap: 3px; font-size: 12px; min-width: 180px; }
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
  .le-channel-icon { width: 18px; height: 18px; flex: none; }
  .msg-conn-blurb { flex-basis: 100%; margin: 0; }
  .msg-conn > form.add-source { border: 0; background: none; box-shadow: none; padding: 0 0 14px; margin: 0; }
  .env-desc { max-width: 340px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  form.add-source.env-inline { border: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; max-width: 320px; }
  form.add-source.env-inline input, form.add-source.env-inline select { flex: 1 1 140px; width: auto; min-width: 0; }
  form.add-source.env-inline textarea { flex: 1 1 100%; }
  form.add-source.env-inline button { padding: 4px 10px; }
  .tab-panel .le-table-wrap table { border: 0; border-radius: 0; }
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
  .kv dd { margin: 0; font-family: ui-monospace, monospace; }
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
</style>
</head>
<body data-le-page="agent-config">
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

  // A small, deliberately non-CommonMark markdown-to-HTML renderer for
  // the skill Body field's Preview toggle (see wireSkillsHandlers) — this
  // page stays a self-contained string, no build step, no CDN (same
  // reasoning as devUiCss's own header comment), so pulling in a real
  // markdown library isn't an option without breaking that. Covers what
  // an actual SKILL.md body realistically uses (headings, bold/italic,
  // inline code, fenced code blocks, links, lists, rules, paragraphs) —
  // good enough for "does this read the way it will on GitHub", not a
  // spec-complete parser. Escapes first, so no markdown source can inject
  // raw HTML into the preview.
  function renderMarkdownPreview(md) {
    var lines = escapeHtml(md).split('\\n');
    var html = '';
    var inCode = false;
    var codeBuffer = '';
    var listType = null;
    var paragraph = [];

    // This whole page is one outer TS template literal AND its output is
    // itself served as JS source text a browser then parses again — two
    // layers of "escape sequences get processed", not one. The unicode
    // escape used for the backtick patterns below survives both layers fine, since
    // it's a real, recognized escape at both of them. A star/bracket/
    // paren/s/d/dot escape (\*, \[, \s, \d, \.) is *not* a recognized
    // escape at either layer, so each layer that touches it silently
    // drops the backslash and keeps just the character — confirmed by
    // extracting and executing the actually-served page during
    // development, where every regex built the "obvious" way here ended
    // up with its escapes stripped entirely, sometimes still parsing
    // (silently wrong) and sometimes throwing ("nothing to repeat").
    // Building these particular patterns from a runtime backslash
    // character instead sidesteps the whole problem: there is no
    // backslash-followed-by-letter sequence anywhere in this source for
    // either layer to misinterpret.
    var bs = String.fromCharCode(92);
    var inlineCodePattern = new RegExp('\\u0060([^\\u0060]+)\\u0060', 'g');
    var fencePattern = new RegExp('^\\u0060\\u0060\\u0060');
    var boldPattern = new RegExp(bs + '*' + bs + '*([^*]+)' + bs + '*' + bs + '*', 'g');
    var italicPattern = new RegExp(bs + '*([^*]+)' + bs + '*', 'g');
    var linkPattern = new RegExp(bs + '[([^' + bs + ']]+)' + bs + ']' + bs + '(([^)]+)' + bs + ')', 'g');
    var headingPattern = new RegExp('^(#{1,6})' + bs + 's+(.*)$');
    var hrPattern = new RegExp('^(---|' + bs + '*' + bs + '*' + bs + '*)' + bs + 's*$');
    var ulPattern = new RegExp('^[-*]' + bs + 's+(.*)$');
    var olPattern = new RegExp('^' + bs + 'd+' + bs + '.' + bs + 's+(.*)$');
    function inlineFormat(text) {
      return text
        .replace(inlineCodePattern, '<code>$1</code>')
        .replace(boldPattern, '<strong>$1</strong>')
        .replace(italicPattern, '<em>$1</em>')
        .replace(linkPattern, function (_, label, href) {
          var lowerHref = href.toLowerCase();
          var safeHref = lowerHref.indexOf('https://') === 0 || lowerHref.indexOf('http://') === 0 || lowerHref.indexOf('mailto:') === 0;
          return safeHref ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : label;
        });
    }
    function flushParagraph() {
      if (paragraph.length) {
        html += '<p>' + inlineFormat(paragraph.join(' ')) + '</p>';
        paragraph = [];
      }
    }
    function closeList() {
      if (listType) {
        html += '</' + listType + '>';
        listType = null;
      }
    }
    function tableCells(line) {
      var value = line.trim();
      if (value.charAt(0) === '|') value = value.slice(1);
      if (value.charAt(value.length - 1) === '|') value = value.slice(0, -1);
      return value.split('|').map(function (cell) { return cell.trim(); });
    }
    function isTableDivider(line) {
      if (line.indexOf('|') < 0) return false;
      var cells = tableCells(line);
      return cells.length > 0 && cells.every(function (cell) {
        var value = cell.replace(/:/g, '').replace(/-/g, '').trim();
        return cell.indexOf('-') >= 0 && value === '';
      });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (fencePattern.test(line)) {
        if (!inCode) {
          flushParagraph();
          closeList();
          inCode = true;
          codeBuffer = '';
        } else {
          html += '<pre><code>' + codeBuffer + '</code></pre>';
          inCode = false;
        }
        continue;
      }
      if (inCode) {
        codeBuffer += line + '\\n';
        continue;
      }

      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        flushParagraph();
        closeList();
        var headers = tableCells(line);
        html += '<div class="workflow-markdown-table"><table><thead><tr>' + headers.map(function (cell) { return '<th>' + inlineFormat(cell) + '</th>'; }).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') {
          var cells = tableCells(lines[i]);
          html += '<tr>' + headers.map(function (_, index) { return '<td>' + inlineFormat(cells[index] || '') + '</td>'; }).join('') + '</tr>';
          i++;
        }
        html += '</tbody></table></div>';
        i--;
        continue;
      }

      var heading = line.match(headingPattern);
      if (heading) {
        flushParagraph();
        closeList();
        var level = heading[1].length;
        html += '<h' + level + '>' + inlineFormat(heading[2]) + '</h' + level + '>';
        continue;
      }
      if (hrPattern.test(line)) {
        flushParagraph();
        closeList();
        html += '<hr>';
        continue;
      }
      var ul = line.match(ulPattern);
      var ol = line.match(olPattern);
      if (ul || ol) {
        flushParagraph();
        var wantType = ul ? 'ul' : 'ol';
        if (listType !== wantType) {
          closeList();
          html += '<' + wantType + '>';
          listType = wantType;
        }
        html += '<li>' + inlineFormat((ul || ol)[1]) + '</li>';
        continue;
      }
      closeList();

      if (line.trim() === '') {
        flushParagraph();
        continue;
      }
      paragraph.push(line.trim());
    }
    flushParagraph();
    closeList();
    return html || '<p class="hint">Nothing to preview yet.</p>';
  }

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
    if (!matching.length) return '<span class="le-pill ' + perms.defaultDecision + '" title="No rule names this tool; the default applies">' + escapeHtml(perms.defaultDecision) + '</span>';
    if (decisions.length === 1 && !conditional) return '<span class="le-pill ' + decisions[0] + '">' + escapeHtml(decisions[0]) + '</span>';
    return '<span class="le-pill neutral" title="' + escapeHtml(decisions.join(' / ')) + ', depending on tenant, environment or condition">depends</span>';
  }

  function renderTools(tools) {
    if (!tools.length) return '<p class="muted">None.</p>';
    var rows = tools.map(function (t) {
      return '<tr><td><code>' + escapeHtml(t.name) + '</code></td>' +
        '<td>' + escapeHtml(t.description) + '</td>' +
        '<td>' + runsPill(t.name) + '</td>' +
        '<td>' + (t.safe ? 'yes' : 'no') + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>What it does</th><th>Runs</th><th>Parallel-safe</th></tr></thead><tbody>' + rows + '</tbody></table>';
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
        '<td>' + (t.safe ? 'yes' : 'no') + '</td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Name</th><th>What it does</th><th>Runs</th><th>Parallel-safe</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
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
    return '<table><thead><tr><th>Name</th><th>Description</th><th>Type</th><th>Parallel-safe</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
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
    return '<div class="le-cards" style="margin-bottom:28px">' +
      card(null, 'Model', escapeHtml(modelValue), escapeHtml(modelDetail)) +
      (cfg.abilityCount != null
        ? card('abilities', 'Apps', String(cfg.abilityCount), cfg.abilityCount ? 'Apps and abilities added to this agent' : 'Add apps and abilities, with the tools you choose')
        : card('abilities', 'Apps', 'Browse', 'Add apps and abilities, with the tools you choose')) +
      card('workflows', 'Workflows', '<span id="ovWorkflowsValue">&hellip;</span>', '<span id="ovWorkflowsDetail">Loading&hellip;</span>') +
      card('tools', 'Tools &amp; skills', cfg.tools.length + (cfg.tools.length === 1 ? ' tool' : ' tools'),
        (cfg.skills.length + (cfg.skills.length === 1 ? ' skill' : ' skills')) + (toolNames.length ? ' \u00b7 ' + escapeHtml(toolNames.slice(0, 2).join(', ') + (toolNames.length > 2 ? ', \u2026' : '')) : '')) +
      card('actauth', 'Permissions', rules.length + (rules.length === 1 ? ' rule' : ' rules'),
        (asks ? asks + ' need approval \u00b7 ' : '') + 'unmatched calls: ' + escapeHtml(cfg.permissions.defaultDecision)) +
      card('messaging', 'Messaging', '<span id="ovMessagingValue">&hellip;</span>', '<span id="ovMessagingDetail">Loading&hellip;</span>') +
      card('schedules', 'Schedules', '<span id="ovSchedulesValue">&hellip;</span>', '<span id="ovSchedulesDetail">Loading&hellip;</span>') +
      card('env', 'Environment', 'Settings', '<span data-le-env-count="' + escapeHtml(cfg.name) + '">' + leShell.envCountHtml(cfg.name) + '</span> Values your installed abilities read') +
    '</div>';
  }

  var APP_NAMES = { slack: 'Slack', lark: 'Lark', webhook: 'Webhook', email: 'Email', database: 'Database', redis: 'Redis' };

  // Messaging and Schedules come from their own endpoints, so their
  // cards are filled in once those answer. Called after every render of
  // Overview, which is also re-rendered after edits.
  // ---- Overview: the agent's workflows (web/workflow-admin.ts), added
  // from "Describe a workflow": each with its instructions, what starts it
  // (its real schedules and webhooks), its recent runs and Run now. ----

  // What starts a workflow, in a few words, from its schedules and
  // webhooks: never a label that could say something else.
  function workflowStartsSummary(w) {
    var parts = (w.schedules || []).filter(function (x) { return x.repeating && x.status !== 'paused'; }).map(function (x) { return x.describe; });
    if (w.webhooks) parts.push(w.webhooks === 1 ? 'when its webhook is called' : 'when one of its ' + w.webhooks + ' webhooks is called');
    if (!parts.length) return 'No schedule or webhook yet';
    var text = parts.join(', and ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // With no schedule and no webhook, Run now, Schedule and Webhook are
  // small: one row; once either has something to list, one per row.
  function startsCompact(w) {
    return !(w.schedules || []).length && !(w.webhooks || w.webhooksWaiting || w.webhooksOff);
  }

  // Ways to run it: four, each with a ? that says what it is. Run now
  // with the values a run is given, a schedule (pause, resume, remove,
  // add), a webhook, and the API call an app makes.
  function wfStartSection(key, title, help, body) {
    return '<div class="wf-start wf-start-' + key.split('-')[0] + '">' +
      '<div class="wf-start-head"><strong>' + title + '</strong>' +
        '<button type="button" class="help-q" aria-expanded="false" aria-controls="help-' + key + '" aria-label="What is ' + title.toLowerCase() + '?">?</button></div>' +
      '<p class="hint help-text" hidden>' + help + '</p>' + body + '</div>';
  }

  function workflowStartsHtml(w, agentName, paramsHtml) {
    var schedules = (w.schedules || []).map(function (x) {
      var state = x.waiting ? '<span class="le-pill ask">Waiting for a decision</span>'
        : x.status === 'paused' ? '<span class="le-pill warn">Paused</span>'
        : x.status === 'running' ? '<span class="le-pill accent">Running</span>'
        : (x.nextRunAt ? '<span class="hint">next ' + escapeHtml(new Date(x.nextRunAt).toLocaleString()) + '</span>' : '');
      var values = x.params ? Object.keys(x.params).map(function (k) { return escapeHtml(k) + ': ' + escapeHtml(x.params[k]); }).join(' ' + String.fromCharCode(183) + ' ') : '';
      return '<li style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<span><a href="?agent=' + encodeURIComponent(agentName) + '&amp;tab=schedules#schedule-' + escapeHtml(x.taskId) + '" class="workflow-schedule-link" data-task="' + escapeHtml(x.taskId) + '" title="See it in the Schedules tab">' +
          escapeHtml(x.describe.charAt(0).toUpperCase() + x.describe.slice(1)) + '</a></span>' + state +
        (values ? '<span class="hint">' + values + '</span>' : '') +
        (x.notify ? '<span class="workflow-option-value">Send result to messaging app</span>' : '') +
        '<span style="display:flex;gap:6px;margin-left:auto">' +
          (x.status === 'paused' ? '<button type="button" class="workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="resume">Resume</button>'
            : x.status === 'scheduled' ? '<button type="button" class="workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="pause">Pause</button>' : '') +
          '<button type="button" class="delete-btn workflow-schedule-action" data-id="' + escapeHtml(x.taskId) + '" data-action="cancel">Remove</button>' +
        '</span></li>';
    }).join('');
    var paramNames = Object.keys(w.parameters || {});
    // A body that shows what a call can carry: its values, and waiting
    // for the result.
    var example = '{ ' + (paramNames.length ? '"params": { ' + paramNames.map(function (p) { return '"' + p + '": "' + String.fromCharCode(8230) + '"'; }).join(', ') + ' }, ' : '') + '"wait": true }';
    var apiUrl = location.origin + '/agents/' + encodeURIComponent(agentName) + '/workflows/' + encodeURIComponent(w.id) + '/run';
    return '<details class="workflow-section workflow-starts' + (startsCompact(w) ? ' wf-starts-compact' : '') + '"><summary class="workflow-section-title">Run options</summary><div class="workflow-section-content">' +
      wfStartSection('run-' + w.id, 'Run now',
        'Starts a run right away, from here' + (paramNames.length ? ', with the values you fill in' : '') + '. It shows under Recent runs as it goes.',
        (paramsHtml ? '<div class="workflow-params">' + paramsHtml + '</div>' : '') +
        '<div class="workflow-run-controls">' +
          '<label class="workflow-run-notify" title="Sends the completed result through this agent' + String.fromCharCode(8217) + 's configured notifier"><input type="checkbox" class="workflow-run-notify-toggle"> Send result to messaging app</label>' +
          '<button type="button" class="workflow-run primary">Run now</button></div>') +
      wfStartSection('schedule-' + w.id, 'Schedule',
        'Runs it on a timer, like every day at 9:00, with the values you give the schedule. Nobody needs to be there: approvals and questions go to the agent' + String.fromCharCode(8217) + 's messaging app.',
        (schedules ? '<ul class="schedule-history">' + schedules + '</ul>' : '<span class="hint">None yet.</span>') +
        '<div><button type="button" class="workflow-add-schedule">Add a schedule</button></div>') +
      wfStartSection('webhook-' + w.id, 'Webhook',
        'A private web address another app (Stripe, GitHub, Shopify or your own) calls when something happens. Each call starts a run, with values taken from what the app sends.',
        '<div class="workflow-hooks"></div>' +
        '<div class="workflow-hooks-add"' + (w.webhooks || w.webhooksWaiting || w.webhooksOff ? ' hidden' : '') + '><button type="button" class="workflow-hooks-btn">Add a webhook</button></div>') +
      wfStartSection('api-' + w.id, 'API',
        'Your own app starts a run by calling this address with an API key. Add "wait": true to get the result in the answer, or "callback_url" to have it posted to you when the run ends.',
        '<pre>POST ' + escapeHtml(apiUrl) + String.fromCharCode(10) + escapeHtml(example) + '</pre>' +
        '<p class="hint" style="margin:0">' + (paramNames.length ? '<code>params</code>: ' + paramNames.map(function (p) { return '<code>' + escapeHtml(p) + '</code>' + (w.parameters[p].required ? ' (required)' : '') + (w.parameters[p].description ? ', ' + escapeHtml(w.parameters[p].description) : ''); }).join('; ') + '. ' : 'It takes no params. ') +
          'Optional: <code>"wait": true</code> answers with the result; <code>"notify": true</code> sends the result to the messaging app; <code>"callback_url"</code> posts it to your app when the run ends. Leave them out to get the run' + String.fromCharCode(8217) + 's id back at once.</p>') +
    '</div></details>';
  }

  // What starts a workflow and what it's doing, as chips under its title:
  // each schedule, then its webhooks; one line when nothing starts it.
  function workflowStatusChips(w) {
    var chips = [];
    var cap = function (t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
    var when = function (iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    var DOT = ' ' + String.fromCharCode(183) + ' ';
    (w.schedules || []).forEach(function (x) {
      var what = escapeHtml(cap(x.describe));
      if (x.waiting) chips.push('<span class="wf-chip warn">' + what + DOT + 'waiting for a decision</span>');
      else if (x.status === 'running') chips.push('<span class="wf-chip accent">' + what + DOT + 'running</span>');
      else if (x.status === 'paused') chips.push('<span class="wf-chip warn">' + what + DOT + 'paused</span>');
      else chips.push('<span class="wf-chip good">' + what + (x.nextRunAt ? DOT + 'next ' + escapeHtml(when(x.nextRunAt)) : '') + '</span>');
    });
    var n = function (count, one, many) { return count === 1 ? one : count + ' ' + many; };
    if (w.webhooks) chips.push('<span class="wf-chip good">' + n(w.webhooks, 'Webhook on', 'webhooks on') + '</span>');
    if (w.webhooksWaiting) chips.push('<span class="wf-chip warn">' + n(w.webhooksWaiting, 'Webhook needs its signing secret', 'webhooks need their signing secrets') + '</span>');
    if (w.webhooksOff) chips.push('<span class="wf-chip">' + n(w.webhooksOff, 'Webhook off', 'webhooks off') + '</span>');
    if (!chips.length) chips.push('<span class="wf-chip">Runs when you start it: Run now, the API or Chat</span>');
    return chips.join('');
  }

  function renderWorkflowsHtml(name, workflows) {
    if (!workflows.length) {
      return '<div class="wf-empty-state"><strong>No workflows yet</strong><p>Describe a job in a sentence or two, or start from an example, and it' + String.fromCharCode(8217) + 's planned and set up for you.</p><a class="wf-new-btn" href="/workflows/new?agent=' + encodeURIComponent(name) + '">Build a workflow</a></div>';
    }
    return workflows.map(function (w) {
      var paramNames = Object.keys(w.parameters || {});
      var params = paramNames.map(function (p) {
        var spec = w.parameters[p];
        return '<label class="workflow-param">' + escapeHtml(p) + (spec.required ? '' : ' <span class="hint">(optional)</span>') +
          '<input name="' + escapeHtml(p) + '"' + (spec.required ? ' required' : '') + ' placeholder="' + escapeHtml(spec.description || '') + '"></label>';
      }).join('');
      var runs = (w.recentRuns || []).map(function (r) {
        var pill = r.status === 'done' ? '<span class="le-pill good">Done</span>'
          : r.status === 'error' ? '<span class="le-pill bad">Failed</span>'
          : r.status === 'awaiting_approval' ? '<span class="le-pill ask">Waiting for a decision</span>'
          : '<span class="le-pill accent">Running</span>';
        var values = r.params ? Object.keys(r.params).map(function (k) { return '<span><strong>' + escapeHtml(k) + '</strong>: ' + escapeHtml(r.params[k]) + '</span>'; }).join('') : '';
        var source = r.source === 'console' ? 'Manual run' : r.source === 'api' ? 'App / API' : r.source === 'schedule' ? 'Scheduled' + (r.task_name ? ' · ' + r.task_name : '') : 'Webhook';
        var outcome = r.status === 'error' ? (r.error || '') : (r.result || '');
        var formattedOutcome = outcome ? renderMarkdownPreview(outcome) : '';
        return '<li class="workflow-run-entry"><div class="workflow-run-entry-head">' + pill +
          '<span class="workflow-run-time">' + escapeHtml(new Date(r.started_at).toLocaleString()) + '</span>' +
          '<span class="workflow-run-source hint">' + escapeHtml(source) + '</span></div>' +
          (values ? '<div><div class="workflow-run-entry-label">Parameters</div><div class="workflow-run-params">' + values + '</div></div>' : '') +
          (outcome ? '<div><div class="workflow-run-entry-label">' + (r.status === 'error' ? 'Error' : 'Final response') + '</div><div class="schedule-result workflow-markdown">' + formattedOutcome + '</div><details class="schedule-result-details"><summary>View full ' + (r.status === 'error' ? 'error' : 'response') + '</summary><div class="schedule-result-full workflow-markdown workflow-markdown-full">' + formattedOutcome + '</div></details></div>' : '') + '</li>';
      }).join('');
      return '<article class="workflow-card wf-card" data-workflow="' + escapeHtml(w.id) + '">' +
        '<header class="wf-card-head"><div class="wf-card-title">' +
            '<h3>' + escapeHtml(w.title) + '</h3>' +
            (w.description ? '<p>' + escapeHtml(w.description) + '</p>' : '') +
            '<div class="wf-chips">' + workflowStatusChips(w) + '</div></div>' +
          '<div class="wf-card-actions"><button type="button" class="workflow-edit">Edit</button><button type="button" class="wf-remove workflow-forget">Remove</button></div>' +
        '</header>' +
        (w.originalRequest ? '<details class="workflow-section" open><summary class="workflow-section-title">Original message</summary><div class="workflow-section-content"><div class="workflow-steps-text">' + escapeHtml(w.originalRequest) + '</div></div></details>' : '') +
        '<details class="workflow-section" open><summary class="workflow-section-title">Instructions <span class="workflow-section-meta">' + escapeHtml(w.id) + ' skill</span></summary><div class="workflow-section-content"><div class="workflow-steps-text">' + escapeHtml(w.instructions) + '</div></div></details>' +
        workflowStartsHtml(w, name, params) +
        (runs ? '<details class="workflow-section workflow-runs"' + ((w.recentRuns || []).some(function (r) { return r.status === 'running' || r.status === 'awaiting_approval'; }) ? ' open' : '') + '><summary class="workflow-section-title">Recent runs<span class="workflow-section-meta">' + w.recentRuns.length + '</span></summary><div class="workflow-section-content"><ul class="schedule-history">' + runs + '</ul></div></details>'
          : '<div class="wf-empty">No runs yet.</div>') +
        '<div class="hint workflow-result"></div>' +
        '</article>';
    }).join('');
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
    detailEl.textContent = parts.join(' \u00b7 ') || (workflows.length ? 'Run by hand, by an app or a webhook' : 'Describe a job for this agent to do');
  }

  var workflowsRefreshTimer = null;
  // Set by a workflow's "Add a schedule", for the Schedules tab's form.
  var pendingScheduleWorkflow = null;
  // Set by a schedule's workflow link: the card to scroll to and mark.
  var pendingWorkflowFocus = null;

  function focusWorkflowCard(tries) {
    if (!pendingWorkflowFocus) return;
    var card = detail.querySelector('.workflow-card[data-workflow="' + CSS.escape(pendingWorkflowFocus) + '"]');
    if (!card) {
      if ((tries || 0) < 40) setTimeout(function () { focusWorkflowCard((tries || 0) + 1); }, 150);
      return;
    }
    pendingWorkflowFocus = null;
    card.scrollIntoView({ block: 'start' });
    card.classList.add('workflow-focus');
    setTimeout(function () { card.classList.remove('workflow-focus'); }, 2500);
  }

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
  // or a webhook secret being typed.
  function workflowInputInUse() {
    if (document.querySelector('dialog[open]')) return true;
    var inputs = detail.querySelectorAll('.workflow-hooks input');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].value || inputs[i] === document.activeElement) return true;
    return false;
  }

  function loadWorkflowsSection(name) {
    var el = detail.querySelector('#workflowsContent');
    if (!el) return;
    if (workflowsRefreshTimer) { clearTimeout(workflowsRefreshTimer); workflowsRefreshTimer = null; }
    fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/workflows').then(function (r) {
      if (currentName !== name) return;
      if (!r.ok) { el.innerHTML = '<p class="error">Could not load workflows: ' + escapeHtml(r.body.error || 'unknown error') + '</p>'; return; }
      var workflows = r.body.workflows || [];
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
      var running = workflows.some(function (w) { return (w.recentRuns || []).some(function (x) { return x.status === 'running'; }); });
      if (running && currentTab === 'workflows') workflowsRefreshTimer = setTimeout(function () { if (!workflowEditing && !workflowInputInUse()) loadWorkflowsSection(name); }, 3000);
    });
  }

  // ---- The workflow editor: its title, its instructions (the skill body)
  // and the values a run is given. What starts it is on the card.
  function workflowParamRowHtml(pname, spec) {
    return '<div class="workflow-param-row">' +
      '<input class="wp-name" aria-label="Parameter name" placeholder="order_number" value="' + escapeHtml(pname || '') + '">' +
      '<input class="wp-desc" aria-label="What it is" placeholder="What it is, e.g. The order to check" value="' + escapeHtml((spec && spec.description) || '') + '">' +
      '<label class="http-tool-inline-label"><input type="checkbox" class="wp-required"' + (spec && spec.required ? ' checked' : '') + '> Required</label>' +
      '<button type="button" class="delete-btn wp-remove">Remove</button></div>';
  }

  function workflowEditorHtml(w) {
    var rows = Object.keys(w.parameters || {}).map(function (p) { return workflowParamRowHtml(p, w.parameters[p]); }).join('');
    return '<form class="add-source workflow-editor-form">' +
      '<label>Title<input name="title" maxlength="120" value="' + escapeHtml(w.title) + '">' +
        '<span class="hint">ID: <code>' + escapeHtml(w.id) + '</code>, used by the API, schedules and webhooks; it doesn' + String.fromCharCode(8217) + 't change when you edit.</span></label>' +
      '<label>Description <span class="hint">(one line on what this job is; the agent uses it to recognise the job when you ask in Chat)</span>' +
        '<input name="description" maxlength="500" required value="' + escapeHtml(w.description) + '"></label>' +
      '<label>Instructions <span class="hint">(what the agent does, step by step; $name puts in a parameter&#39;s value. Chat uses them too.)</span>' +
        '<textarea name="instructions" maxlength="12000" rows="12" required>' + escapeHtml(w.instructions) + '</textarea></label>' +
      '<div class="body-field">Parameters <span class="hint">(values a run is given; apps send them as params)</span>' +
        '<div class="workflow-param-rows">' + rows + '</div>' +
        '<button type="button" class="wp-add" style="align-self:flex-start">Add parameter</button></div>' +
      '<p class="hint workflow-editor-check" style="margin:0"></p>' +
      '<div class="hint workflow-editor-result"></div>' +
      '<div class="ed-actions"><button type="button" class="wp-cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form>';
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
    if (unused.length) notes.push(unused.join(', ') + ' ' + (unused.length > 1 ? 'aren' : 'isn') + String.fromCharCode(8217) + 't used in the instructions: its value is passed as an input.');
    form.querySelector('.workflow-editor-check').textContent = notes.join(' ');
  }

  function openWorkflowEditor(name, card) {
    var w = workflowsById[card.dataset.workflow];
    if (!w) return;
    workflowEditing = true;
    // In a dialog: the editor's code holds its own form, so it needn't sit
    // in the card. Closing it any way (Esc, the backdrop, x, Cancel)
    // discards the edits.
    var dialog = document.createElement('dialog');
    dialog.innerHTML = editDialogHtml('<h3>Edit workflow</h3>', '<p>Its title, what it' + String.fromCharCode(8217) + 's for, the steps the agent follows and the values each run is given.</p>', workflowEditorHtml(w));
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
    form.querySelector('.wp-cancel').addEventListener('click', close);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var parameters = {};
      var problem = '';
      var list = rows.querySelectorAll('.workflow-param-row');
      for (var i = 0; i < list.length; i++) {
        var pname = list[i].querySelector('.wp-name').value.trim();
        if (!pname) continue;
        if (!/^[a-z_][a-z0-9_]*$/.test(pname)) { problem = 'Parameter "' + pname + '": use lowercase letters, digits and _, starting with a letter, e.g. order_number.'; break; }
        if (parameters[pname]) { problem = 'Parameter "' + pname + '" is listed twice.'; break; }
        parameters[pname] = { description: list[i].querySelector('.wp-desc').value.trim(), required: list[i].querySelector('.wp-required').checked };
      }
      if (problem) { result.textContent = problem; return; }
      result.textContent = 'Saving' + String.fromCharCode(8230);
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(w.id), {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: form.title.value, description: form.description.value, instructions: form.instructions.value, parameters: parameters }),
      }).then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || 'Could not save'; return; }
        close();
        loadWorkflowsSection(name);
      });
    });
    check();
    form.title.focus();
  }

  // ---- A workflow's webhook triggers (core/workflow-triggers.ts): secret
  // URLs an outside service posts its events to, to start a run.
  var HOOK_OUTCOMES = {
    started: ['good', 'Started a run'], filtered: ['', 'Skipped by the filter'], duplicate: ['', 'A retry, skipped'],
    busy: ['', 'Already running'], rejected: ['bad', 'Signature check failed'], invalid: ['bad', 'Couldn' + String.fromCharCode(8217) + 't start'], error: ['bad', 'Failed'],
  };
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

  function hookRowHtml(t, shownUrl) {
    var last = (t.deliveries || []).slice(0, 3).map(function (d) {
      var o = HOOK_OUTCOMES[d.outcome] || ['', d.outcome];
      return '<li><span class="le-pill ' + o[0] + '">' + escapeHtml(o[1]) + '</span> <span class="hint">' + escapeHtml(new Date(d.at).toLocaleString()) + '</span>' +
        (d.detail ? '<div class="schedule-result">' + escapeHtml(d.detail) + '</div>' : '') + '</li>';
    }).join('');
    var rules = [];
    if (t.verify) rules.push(t.verify.sender === 'custom'
      ? 'checks the signature in ' + escapeHtml(t.verify.header || '(header not set yet)') + ' (' + escapeHtml(t.verify.algorithm || 'sha256') + ', ' + escapeHtml(t.verify.encoding || 'hex') + ')'
      : 'checks the ' + escapeHtml(HOOK_SENDERS[t.verify.sender] || t.verify.sender) + ' signature');
    if (t.filter) rules.push('only when ' + escapeHtml(t.filter.path) + ' is ' + t.filter.values.map(escapeHtml).join(' or '));
    if (t.mapping) rules.push(Object.keys(t.mapping).map(function (p) { return escapeHtml(p) + ' ' + String.fromCharCode(8592) + ' ' + escapeHtml(t.mapping[p]); }).join(', '));
    if (t.payload_param) rules.push('the whole payload goes to ' + escapeHtml(t.payload_param));
    if (t.notify) rules.push('<span class="workflow-option-value">Send result to messaging app</span>');
    if (t.callback_url) rules.push('reports to ' + escapeHtml(t.callback_url));
    // Made by the workflow planner without its secret: it turns on once
    // the sender's signing secret is added.
    var needsSecret = t.verify && !t.verify.secret_set;
    var setup = needsSecret ? hookSetupSteps(t) : null;
    return '<div class="workflow-hook" data-trigger="' + escapeHtml(t.trigger_id) + '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><strong>' + escapeHtml(t.name) + '</strong>' +
        '<code class="hint">/hooks/workflows/' + escapeHtml(t.token_hint) + '</code>' + (needsSecret ? ' <span class="le-pill warn">Needs its signing secret</span>' : t.enabled ? '' : ' <span class="le-pill">Off</span>') + '</div>' +
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
      (last ? '<ul class="schedule-history">' + last + '</ul>' : '<p class="hint" style="margin:2px 0">No deliveries yet.</p>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
        (needsSecret ? '' : '<button type="button" class="hook-toggle">' + (t.enabled ? 'Turn off' : 'Turn on') + '</button>') +
        '<button type="button" class="hook-rotate">New URL</button>' +
        '<button type="button" class="delete-btn hook-delete">Delete</button></div></div>';
  }

  // The add-webhook dialog's form: where the events come from, which ones,
  // what the workflow gets from each, and what happens after each run.
  function hookFormHtml(w) {
    var params = Object.keys(w.parameters || {});
    var RSQ = String.fromCharCode(8217);
    var field = function (label, input, hint, attrs) {
      return '<div class="hd-field"' + (attrs || '') + '><label class="hd-label">' + label + input + '</label>' + (hint ? '<p class="hd-hint">' + hint + '</p>' : '') + '</div>';
    };
    return '<form class="hook-form hd">' +
      '<header class="hd-head"><div><h3>Add a webhook</h3>' +
        '<p>Another app calls a private URL when something happens, and each call starts a run of ' + String.fromCharCode(8220) + escapeHtml(w.title || w.id) + String.fromCharCode(8221) + '.</p></div>' +
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
        '<section class="hd-section"><h4>After each run</h4>' +
          '<label class="hd-check"><input type="checkbox" name="notify"><span><strong>Send the result to the messaging app</strong><span class="hd-hint">Through the agent' + RSQ + 's Messaging tab: Slack, Telegram, email or another you set up.</span></span></label>' +
          field('Post the result to <span class="hd-optional">(optional)</span>', '<input name="callback_url" placeholder="https://example.com/hooks/loopengine" inputmode="url">', 'An https address in your own app that gets each run' + RSQ + 's result.') +
        '</section>' +
      '</div>' +
      '<footer class="hd-foot"><span class="hook-form-result" role="status"></span>' +
        '<div class="hd-actions"><button type="button" class="hook-dialog-cancel">Cancel</button><button type="submit" class="primary">Create webhook</button></div></footer>' +
      '</form>';
  }

  function openHookFormDialog(w, base, onCreated) {
    var dialog = document.createElement('dialog');
    dialog.className = 'le-dialog hook-dialog';
    dialog.innerHTML = hookFormHtml(w);
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
    senderChanged();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var result = form.querySelector('.hook-form-result');
      var body = { name: form.name.value.trim() || defaultName() };
      if (form.sender.value) body.verify = { sender: form.sender.value, secret: form.secret.value.trim() };
      // No secret yet (most senders only show it once they have the URL):
      // made turned off, with steps to finish it.
      if (form.sender.value && !form.secret.value.trim()) { delete body.verify.secret; body.enabled = false; }
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
      if (form.notify.checked) body.notify = true;
      if (form.callback_url.value.trim()) body.callback_url = form.callback_url.value.trim();
      result.textContent = 'Making it' + String.fromCharCode(8230);
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      fetchJsonRetryOnce(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
        if (!r.ok) { result.textContent = r.body.error || 'Could not make it'; submit.disabled = false; return; }
        dialog.close();
        onCreated(r.body.url, r.body.trigger && r.body.trigger.trigger_id, r.body.trigger);
      }).catch(function (err) {
        result.textContent = err && err.message ? err.message : 'Could not make it';
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
    var hooksById = {};
    function render(shownUrl, shownId) {
      if (!box.innerHTML) box.innerHTML = '<p class="hint" style="margin:0">Loading' + String.fromCharCode(8230) + '</p>';
      fetchJsonRetryOnce(base).then(function (r) {
        if (!r.ok) { box.innerHTML = '<p class="error">' + escapeHtml(r.body.error || 'Could not load webhooks') + '</p>'; return; }
        var list = r.body.triggers || [];
        hooksById = {};
        list.forEach(function (t) { hooksById[t.trigger_id] = t; });
        // Keep the card's summary in step with what was just changed.
        w.webhooks = list.filter(function (t) { return t.enabled; }).length;
        w.webhooksWaiting = list.filter(function (t) { return !t.enabled && t.verify && !t.verify.secret_set; }).length;
        w.webhooksOff = list.length - w.webhooks - w.webhooksWaiting;
        var chips = card.querySelector('.wf-chips');
        if (chips) chips.innerHTML = workflowStatusChips(w);
        var starts = card.querySelector('.workflow-starts');
        if (starts) starts.classList.toggle('wf-starts-compact', startsCompact(w));
        if (addBox) addBox.hidden = list.length > 0;
        // One waiting for its secret, or just made: open the Run options
        // row it's in, so its steps show.
        var row = box.closest('details');
        if (row && (shownId || w.webhooksWaiting)) row.open = true;
        var setupPending = list.some(function (t) { return t.verify && !t.verify.secret_set; });
        box.innerHTML = list.map(function (t) { return hookRowHtml(t, t.trigger_id === shownId ? shownUrl : null); }).join('') +
          // Finish a planned webhook's setup before offering a second one.
          (list.length
            ? (setupPending
              ? '<p class="hint" style="margin:8px 0 0">Finish setting up the webhook above before adding another.</p>'
              : '<div style="margin-top:10px"><button type="button" class="hook-add-another">Add another webhook</button></div>')
            : '');
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
            act(id, '', { method: 'DELETE' });
          });
        })(rows[i]);
      }
      var addButton = box.querySelector('.hook-add-another');
      if (addButton) addButton.addEventListener('click', function () {
        openHookFormDialog(w, base, function (url, id) { render(url, id); });
      });
    }
    render(shown ? shown.url : null, shown ? shown.id : null);
  }

  function wireWorkflowCard(name, card) {
    var id = card.dataset.workflow;
    var result = card.querySelector('.workflow-result');
    var base = '/agents/' + encodeURIComponent(name) + '/workflows/' + encodeURIComponent(id);
    card.querySelector('.workflow-edit').addEventListener('click', function () { openWorkflowEditor(name, card); });
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
    // The ? beside each way it starts shows or hides what it is.
    var helps = card.querySelectorAll('.help-q');
    for (var hq = 0; hq < helps.length; hq++) {
      helps[hq].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var text = btn.closest('.wf-start').querySelector('.help-text');
        text.hidden = !text.hidden;
        btn.setAttribute('aria-expanded', String(!text.hidden));
      });
    }
    // Shown only while it has none: straight to the form; once one is made,
    // it's listed in the tile with its setup steps.
    card.querySelector('.workflow-hooks-btn').addEventListener('click', function () {
      var w = workflowsById[id];
      if (!w) return;
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
    var scheduleBtns = card.querySelectorAll('.workflow-schedule-action');
    for (var sb = 0; sb < scheduleBtns.length; sb++) {
      scheduleBtns[sb].addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        var action = btn.dataset.action;
        if (action === 'cancel' && btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again to remove'; return; }
        btn.disabled = true;
        fetchJsonRetryOnce('/schedules/' + encodeURIComponent(btn.dataset.id) + '/' + action, { method: 'POST' }).then(function () {
          loadWorkflowsSection(name);
          // The Schedules tab's count, and the Overview's tile.
          fillOverviewCards(name);
        });
      });
    }
    card.querySelector('.workflow-run').addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var params = {};
      var inputs = card.querySelectorAll('.workflow-params input');
      for (var i = 0; i < inputs.length; i++) {
        var value = inputs[i].value.trim();
        if (!value && inputs[i].required) { result.textContent = 'Fill in ' + inputs[i].name + ' first.'; inputs[i].focus(); return; }
        if (value) params[inputs[i].name] = value;
      }
      var notifyToggle = card.querySelector('.workflow-run-notify-toggle');
      var notifyResult = notifyToggle.checked;
      notifyToggle.disabled = true;
      btn.disabled = true;
      result.textContent = 'Starting' + String.fromCharCode(8230);
      fetchJsonRetryOnce(base + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ params: params, source: 'console', notify: notifyResult }) }).then(function (r) {
        btn.disabled = false;
        notifyToggle.disabled = false;
        if (!r.ok) { result.textContent = r.body.error || 'Could not start it.'; return; }
        result.textContent = 'Started. Questions and approvals go to this agent' + String.fromCharCode(8217) + 's messaging app; the result shows under Recent runs.' + (notifyResult ? ' The result will also be sent to the messaging app when it finishes.' : '');
        setTimeout(function () { loadWorkflowsSection(name); }, 800);
      });
    });
    card.querySelector('.workflow-forget').addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      if (btn.dataset.confirming !== '1') { btn.dataset.confirming = '1'; btn.textContent = 'Click again: its schedules and webhooks go; its instructions stay as a skill for Chat'; return; }
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
      '<h3>System prompt <button type="button" class="edit-btn" id="editSystemPromptBtn">Edit</button></h3>' +
      '<pre id="systemPromptDisplay">' + escapeHtml(cfg.systemPrompt) + '</pre>' +
      editDialogHtml('<h3>Edit system prompt</h3>', '<p>What the agent reads on every run: who it is and the rules it always follows.</p>',
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
          '<dt>Provider</dt><dd>' + escapeHtml(cfg.model.provider) + '</dd>' +
          '<dt>Model</dt><dd>' + escapeHtml(cfg.model.model || '(provider default)') + '</dd>' +
          '<dt>Max tokens</dt><dd>' + escapeHtml(cfg.model.maxTokens != null ? cfg.model.maxTokens : '(default)') + '</dd>' +
          // Unset is low for OpenAI's reasoning models (core/model-calls/openai-model-call.ts).
          '<dt>Reasoning effort</dt><dd>' + escapeHtml(cfg.model.reasoningEffort ||
            (cfg.model.provider === 'openai' && /^(gpt-[5-9]|o[0-9])/i.test(cfg.model.model || '') ? 'low (default)'
              : REASONING_PROVIDERS.indexOf(cfg.model.provider) !== -1 ? '(model default)' : 'n/a')) + '</dd>' +
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

    return renderOverviewCards(cfg) +
      '<section>' + nameSection + '</section>' +
      '<section>' + systemPromptSection + '</section>' +
      '<section>' + modelSection + '</section>' +
      '<section><h3>Limits &amp; budgets <button type="button" class="edit-btn" id="editLimitsBtn">Edit</button></h3>' +
        '<dl class="kv" id="limitsDisplay">' +
          '<dt>maxTurns</dt><dd>' + escapeHtml(cfg.maxTurns) + '</dd>' +
          '<dt>contextBudgetTokens</dt><dd>' + escapeHtml(cfg.contextBudgetTokens) + '</dd>' +
          '<dt>skillIndexBudgetTokens</dt><dd>' + escapeHtml(cfg.skillIndexBudgetTokens) + '</dd>' +
        '</dl>' +
        editDialogHtml('<h3>Edit limits &amp; budgets</h3>', '<p>Caps on how long a turn runs and how much context it keeps.</p>',
        '<form class="add-source" id="limitsForm" style="display:none">' +
          '<label>Max turns <span class="hint">(hard cap on model calls in one turn)</span>' +
            '<input type="number" name="maxTurns" min="1" step="1" value="' + escapeHtml(cfg.maxTurns) + '">' +
          '</label>' +
          '<label>Context budget <span class="hint">(tokens — triggers compaction of older messages once exceeded)</span>' +
            '<input type="number" name="contextBudgetTokens" min="1" step="1" value="' + escapeHtml(cfg.contextBudgetTokens) + '">' +
          '</label>' +
          '<label>Skill index budget <span class="hint">(tokens — caps the always-loaded skill name/description index)</span>' +
            '<input type="number" name="skillIndexBudgetTokens" min="1" step="1" value="' + escapeHtml(cfg.skillIndexBudgetTokens) + '">' +
          '</label>' +
          '<div class="error" id="limitsError"></div>' +
          '<div class="ed-actions"><button type="button" id="cancelLimitsBtn" data-dialog-cancel>Cancel</button><button type="submit" class="primary">Save</button></div>' +
        '</form>') +
      '</section>';
  }

  // Wires the System prompt / Model / Limits & budgets Edit buttons rendered by
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
      '<td>' + (r.ability ? '<code>' + escapeHtml(r.ability) + '</code>' : '') + '</td>' +
      '<td><code>' + escapeHtml(r.tool) + '</code></td>' +
      '<td>' + (r.name
        ? decisionSwitch(r.decision, 'Decision for ' + r.name, 'data-rule="' + escapeHtml(r.name) + '"')
        : '<span class="le-pill ' + escapeHtml(r.decision) + '">' + escapeHtml(DECISION_LABELS[r.decision] || r.decision) + '</span>') + '</td>' +
      '<td>' + actionsHtml + '</td>' +
      '</tr>';
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
        '<td>' + (t.ability ? '<code>' + escapeHtml(t.ability) + '</code>' : '') + '</td>' +
        '<td><code>' + escapeHtml(t.tool) + '</code></td>' +
        '<td>' + decision + (note ? ' <span class="hint">' + escapeHtml(note) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join('');
    return '<p class="muted" style="margin:0 0 20px">Decide which tool calls run on their own (Allow), which wait for a person (Ask me), and which never run (Never). Click to change; it&#39;s saved at once. Scoped rules, adding and removing rules are in <a href="?tab=advanced" data-tab="advanced">Advanced</a>.</p>' +
      '<section><h3>Tools (' + tools.length + ')</h3>' +
        (tools.length
          ? '<div class="le-table-wrap"><table class="actauth-rules"><thead><tr><th>Ability</th><th>Tool</th><th>Decision</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
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
      ? '<div class="le-table-wrap"><table class="actauth-rules actauth-rules-full"><thead><tr><th>Name</th><th>Who (tenant / environment)</th><th>Ability</th><th>Tool</th><th>Decision</th><th></th></tr></thead><tbody>' +
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
      ? 'A private chat with the bot, or @mentioning it in a group, runs the agent on that message, and it answers with a reply. Replying to its answer carries the job on. In a group the bot only sees mentions when it&#39;s an admin or its privacy mode is off (@BotFather, /setprivacy); replies to its messages always reach it.'
      : 'A DM to the bot, or @mentioning it in a channel, runs the agent on that message, and it answers in a thread. Replies in the thread carry the job on.';
    return '<div class="body-field" style="margin:4px 0 0">' +
      '<label class="tool-picker-item" style="border:0;padding:0;justify-content:flex-start"><input type="checkbox" name="jobs" id="' + app + 'Jobs"' + (on ? ' checked' : '') + (free ? ' disabled' : '') + '> ' +
      'Start jobs from messages' + (free ? ' <span class="le-pill accent">Pro</span>' : '') + '</label>' +
      '<p class="hint" style="margin:2px 0 0">' + (free ? 'Starting jobs from ' + CHANNEL_TITLES[app] + ' needs LoopEngine Pro.' : how + ' Only approvers (below) can give it jobs; with none listed, anyone in its ' + (app === 'telegram' ? 'chat' : 'channel') + ' can, but not by direct message. A request it needs approved waits in the same thread.') + '</p></div>';
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
    return (n.canSave === false ? '<p class="error" style="margin:0 0 12px">Saving needs <code>LOOPENGINE_ADMIN_AUTH</code> set on the server, because this stores a secret. Add <code>LOOPENGINE_ADMIN_AUTH=user:pass</code> to <code>.env</code> and restart.</p>' : '') +
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
      (n.primary !== app ? '<p class="hint" style="margin:0 0 8px">' + title + ' isn&#39;t primary, so requests aren&#39;t sent there until it is. Jobs started there still use this list.</p>' : '') +
      '<p class="muted" style="margin:0 0 10px">People who can approve, deny, change or answer a request ' + where + ', like &ldquo;yes, go ahead&rdquo; or &ldquo;make it $40&rdquo;. A plain &ldquo;yes&rdquo; runs it; a reply that&#39;s less clear (&ldquo;sure, send it&rdquo;, &ldquo;yes but check the amount&rdquo;) shows exactly what will run with a Confirm button first, and a change is shown to approve first. Once anyone is listed, only approvers&#39; button clicks count, and only approvers can give the agent jobs. Anyone can still ask about a request.</p>' +
      (approvers.length
        ? '<div class="le-table-wrap" style="max-width:560px"><table><thead><tr><th>Name</th><th>' + title + ' ID</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="hint">No approvers yet. Until you add someone, anyone can use the buttons, and deciding by reply is off.</p>') +
      (n.canSave === false
        ? '<p class="hint">Changing approvers needs <code>LOOPENGINE_ADMIN_AUTH</code> set on the server.</p>'
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
          ? '<div><span class="le-pill accent">Workflow</span> <a href="?agent=' + encodeURIComponent(currentName) + '&amp;tab=workflows" class="schedule-workflow-link" data-workflow="' + escapeHtml(t.workflow.id) + '" title="See it on the Workflows tab">' + escapeHtml(t.workflow.title) + '</a></div>' +
            '<div class="schedule-result hint">' + escapeHtml(t.workflow.description || t.workflow.start_message) +
              (t.params ? '<br>' + Object.keys(t.params).map(function (k) { return escapeHtml(k) + ': ' + escapeHtml(t.params[k]); }).join(' ' + String.fromCharCode(183) + ' ') : '') + '</div>'
          : t.workflow_missing
            ? '<div><span class="le-pill bad">Workflow removed</span> <span class="hint">' + escapeHtml(t.workflow_id) + '</span></div>'
            : '<div class="schedule-result hint">' + escapeHtml(t.message) + '</div>') +
        (t.status !== 'cancelled' && t.status !== 'done'
          ? '<label class="schedule-notify hint" title="Sent through its Messaging tab: Slack, email, Lark or a webhook"><input type="checkbox" class="schedule-notify-toggle" data-id="' + escapeHtml(t.task_id) + '"' + (t.notify ? ' checked' : '') + '> Send result to messaging app</label>'
          : (t.notify ? '<div><span class="workflow-option-value">Send result to messaging app</span></div>' : '')) + '</td>' +
      '<td>' + scheduleText(t.schedule) + (t.next_run_at ? '<div class="hint">next ' + escapeHtml(fmtScheduleTime(t.next_run_at)) + '</div>' : '') + '</td>' +
      '<td><span class="le-pill ' + (SCHEDULE_PILLS[t.status] || 'neutral') + '">' + escapeHtml(SCHEDULE_LABELS[t.status] || t.status) + '</span>' +
        (t.status === 'awaiting_approval' ? '<div class="hint"><a href="#" class="schedule-to-approvals">Decide in Messaging</a></div>' : '') + '</td>' +
      '<td style="min-width:200px">' + last + (history ? '<details><summary class="hint">History (' + (t.history || []).length + ')</summary><ul class="schedule-history">' + history + '</ul></details>' : '') + '</td>' +
      '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' + actions.map(function (a) {
        return '<button type="button" class="schedule-action' + (a[0] === 'run' ? ' primary' : '') + (a[0] === 'cancel' || a[0] === 'delete' ? ' delete-btn' : '') + '" data-id="' + escapeHtml(t.task_id) + '" data-action="' + a[0] + '">' + a[1] + '</button>';
      }).join('') + '</div></td></tr>';
  }

  function renderSchedulesHtml(tasks) {
    var active = tasks.filter(function (t) { return t.status !== 'cancelled' && t.status !== 'done'; });
    var list = tasks.length
      ? '<div class="le-table-wrap"><table><thead><tr><th>Task</th><th>When</th><th>Status</th><th>Last run</th><th></th></tr></thead><tbody>' + tasks.map(renderScheduleRow).join('') + '</tbody></table></div>'
      : '<p class="hint">Nothing scheduled yet.</p>';
    return '<p class="muted" style="margin:0 0 20px">Workflows and messages this agent runs on a timer, like a cron job. A workflow schedule runs the workflow&#39;s instructions as they are at each run. Each run works like an app calling it over HTTP: an approval goes wherever the Messaging tab sends it, and with nowhere set, a call that needs approval is denied. The agent can also schedule its own tasks when asked in Chat (&ldquo;remind me tomorrow at 9&rdquo;); they appear here too.</p>' +
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
          '<label class="http-tool-inline-label"><input type="checkbox" name="notify"> Send result to messaging app <span class="hint">(through its Messaging tab: Slack, email, Lark or a webhook)</span></label>' +
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
    // A schedule's workflow opens its card on the Workflows tab.
    var workflowLinks = content.querySelectorAll('.schedule-workflow-link');
    for (var wl = 0; wl < workflowLinks.length; wl++) {
      workflowLinks[wl].addEventListener('click', function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
        ev.preventDefault();
        pendingWorkflowFocus = ev.currentTarget.dataset.workflow;
        switchTab('workflows');
        focusWorkflowCard();
      });
    }
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
        fetchJsonRetryOnce('/schedules/' + encodeURIComponent(box.dataset.id) + '/notify', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notify: box.checked }),
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
          '<input name="param:' + escapeHtml(p) + '" placeholder="' + escapeHtml(parameters[p].description || '') + '"></label>';
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
      fetchJsonRetryOnce('/agents/' + encodeURIComponent(name) + '/schedules', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign(
          runsWorkflow ? { workflow_id: data.get('workflow_id'), params: scheduleParams(data) } : { message: data.get('message') },
          { schedule: schedule, task_name: data.get('task_name'), notify: data.get('notify') === 'on' }
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
        (agentApps.canChange ? '' : '<span class="error">Changing an agent' + String.fromCharCode(8217) + 's tools needs LOOPENGINE_ADMIN_AUTH set.</span>') +
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
    return '<p class="muted" style="margin:0 0 20px">Everything this agent can call. <strong>Runs</strong> comes from Permissions: allow runs on its own, ask waits for a person, deny never runs.</p>' +
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
      '<label class="http-tool-inline-label"><input type="checkbox" name="safe"> Parallel-safe <span class="hint">(read-only, no side effects &mdash; safe to run alongside other calls)</span></label>' +
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

  function modelChip(cfg) {
    if (typeof cfg.model === 'string') return { text: cfg.model, mono: true };
    return { text: cfg.model.provider + ' \u00b7 ' + (cfg.model.model || 'default model'), mono: true };
  }

  function renderDetail(cfg) {
    currentCfg = cfg;
    detail.innerHTML =
      leShell.renderHead({
        name: cfg.name,
        displayName: cfg.displayName,
        prompt: cfg.systemPrompt,
        chips: [modelChip(cfg), { text: 'unmatched calls: ' + cfg.permissions.defaultDecision }],
        tab: currentTab,
        counts: { tools: cfg.tools.length, skills: cfg.skills.length, abilities: cfg.abilityCount, workflows: cfg.skills.filter(function (s) { return s.workflow; }).length },
      }) +
      '<div class="le-scroll"><div class="le-page" style="display:block">' +
      '<div class="tab-panel" data-tab-panel="overview">' + renderOverviewHtml(cfg) + '</div>' +
      // Workflows: the jobs this agent does, each with what starts it.
      '<div class="tab-panel" data-tab-panel="workflows">' +
        '<div class="wf-tab-head"><p class="muted">The jobs this agent does on its own: what it does, the ways to run it (a schedule, a webhook, Run now or an app&#39;s API call) and how its runs went. In Chat it can do them too, when you ask.</p>' +
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
