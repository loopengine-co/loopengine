// The page a decision link opens (GET /decide/<token>, see
// core/approval-links.ts): what's waiting — the tool and its arguments,
// or the question — and buttons to approve, deny or answer. Anyone with
// the link can decide; the signed token is the only credential, so this
// page shows nothing beyond the one decision it names.
//
// Rendered on the server; the small script only posts the choice back to
// the same URL (POST /decide/<token>) and shows the outcome. Written
// without backticks or backslashes inside the script, same convention as
// the other embedded pages.
import { devUiCss } from './dev-ui-styles.js'

export interface DecidePageItem {
  kind: 'approval' | 'question'
  agent: string
  tool: string
  args: Record<string, unknown>
  reason: string
  sessionId: string
  tenant: string
  createdAt?: string
  expiresAt: number
}

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const PAGE_CSS = `
  body { display: grid; place-items: start center; padding: 48px 16px; background: var(--surface); }
  main { width: 100%; max-width: 560px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 24px; display: grid; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--ink-muted); font-size: 13px; }
  .mark { width: 18px; height: 18px; border-radius: 5px; background: var(--accent); }
  h1 { font-size: 20px; margin: 0; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 0; font-size: 13px; }
  dt { color: var(--ink-faint); }
  dd { margin: 0; overflow-wrap: anywhere; }
  pre, textarea { font-family: var(--font-mono); font-size: 12.5px; background: var(--code-bg); border-radius: 8px; padding: 12px; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  textarea { width: 100%; min-height: 120px; border: 1px solid var(--line); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button { padding: 8px 16px; }
  .deny { color: var(--bad); }
  .note { font-size: 12px; color: var(--ink-faint); margin: 0; }
  .result { padding: 12px 14px; border-radius: 8px; background: var(--good-soft); color: var(--good); }
  .result.bad { background: var(--bad-soft); color: var(--bad); }
  .reply { white-space: pre-wrap; background: var(--surface); border-radius: 8px; padding: 12px 14px; }
  details summary { cursor: pointer; font-size: 13px; color: var(--ink-muted); }
`

function shell(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${devUiCss}${PAGE_CSS}</style>
</head>
<body>
<main>
<div class="brand"><span class="mark" aria-hidden="true"></span>LoopEngine</div>
${body}
</main>
${script}
</body>
</html>`
}

/** A link that's malformed, tampered with, or past its expiry. */
export function renderDecideInvalidPage(): string {
  return shell('Link not valid', '<h1>This link isn&#39;t valid</h1><p class="muted">It may have expired or been copied incompletely. Ask for a new one, or decide from the agent&#39;s Permissions tab.</p>')
}

/** A valid link whose decision has already been made. */
export function renderDecideGonePage(): string {
  return shell('Already decided', '<h1>Already decided</h1><p class="muted">Someone has already made this decision, so there&#39;s nothing left to do here.</p>')
}

const SCRIPT = `<script>
(function () {
  var main = document.querySelector('main');
  var result = document.getElementById('result');
  function send(body, button) {
    var buttons = main.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    result.hidden = false;
    result.className = 'result';
    result.textContent = 'Sending' + String.fromCharCode(8230);
    fetch(location.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.body.error || 'request failed');
        var form = document.getElementById('decision');
        if (form) form.hidden = true;
        result.textContent = r.body.message || (body.decision === 'deny' ? 'Denied.' : body.answer !== undefined ? 'Answer sent.' : 'Approved.');
        if (r.body.text) {
          var reply = document.createElement('div');
          reply.className = 'reply';
          reply.textContent = r.body.text;
          result.after(reply);
        }
      })
      .catch(function (err) {
        result.className = 'result bad';
        result.textContent = err.message;
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = false;
      });
  }
  main.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-send]');
    if (!btn) return;
    var payload = JSON.parse(btn.getAttribute('data-send'));
    if (payload.editedFrom) {
      try { payload = { decision: 'approve', editedArgs: JSON.parse(document.getElementById(payload.editedFrom).value) }; }
      catch (e) { result.hidden = false; result.className = 'result bad'; result.textContent = 'The arguments aren' + String.fromCharCode(39) + 't valid JSON.'; return; }
    }
    if (payload.answerFrom) {
      var text = document.getElementById(payload.answerFrom).value.trim();
      if (!text) return;
      payload = { answer: text };
    }
    send(payload, btn);
  });
})();
</script>`

export function renderDecidePage(item: DecidePageItem): string {
  const expires = new Date(item.expiresAt).toUTCString()
  const facts =
    `<dl><dt>Agent</dt><dd>${esc(item.agent)}</dd>` +
    `<dt>Conversation</dt><dd><code>${esc(item.sessionId)}</code>${item.tenant && item.tenant !== 'default' ? ` (tenant ${esc(item.tenant)})` : ''}</dd>` +
    (item.createdAt ? `<dt>Asked</dt><dd>${esc(new Date(item.createdAt).toUTCString())}</dd>` : '') +
    `</dl>`
  const note = `<p class="note">Anyone with this link can make this decision. It works once and expires ${esc(expires)}.</p>`
  const result = '<div id="result" class="result" hidden role="status"></div>'

  if (item.kind === 'question') {
    const question = typeof item.args.question === 'string' ? item.args.question : item.reason
    const options = Array.isArray(item.args.options) ? (item.args.options as unknown[]).map(String) : []
    const optionButtons = options.map((o) => `<button type="button" data-send="${esc(JSON.stringify({ answer: o }))}">${esc(o)}</button>`).join('')
    return shell(
      `Question from ${item.agent}`,
      `<h1>${esc(item.agent)} has a question</h1>${facts}<pre>${esc(question)}</pre>` +
        `<div id="decision" style="display:grid;gap:10px">` +
        (optionButtons ? `<div class="actions">${optionButtons}</div>` : '') +
        `<label style="display:grid;gap:6px;font-size:13px">${options.length ? 'Or answer in your own words' : 'Your answer'}<textarea id="answerText" style="min-height:80px;font-family:var(--font-sans)"></textarea></label>` +
        `<div class="actions"><button type="button" class="primary" data-send="${esc(JSON.stringify({ answerFrom: 'answerText' }))}">Send answer</button></div></div>` +
        result + note,
      SCRIPT,
    )
  }

  return shell(
    `Approve ${item.tool}?`,
    `<h1>Approve <code>${esc(item.tool)}</code>?</h1>${facts}` +
      `<pre>${esc(JSON.stringify(item.args, null, 2))}</pre>` +
      `<p class="muted" style="margin:0">${esc(item.reason)}</p>` +
      `<div id="decision" style="display:grid;gap:12px">` +
      `<div class="actions"><button type="button" class="primary" data-send="${esc(JSON.stringify({ decision: 'approve' }))}">Approve</button>` +
      `<button type="button" class="deny" data-send="${esc(JSON.stringify({ decision: 'deny' }))}">Deny</button></div>` +
      `<details><summary>Change the arguments first</summary><div style="display:grid;gap:8px;margin-top:8px">` +
      `<textarea id="editedArgs">${esc(JSON.stringify(item.args, null, 2))}</textarea>` +
      `<div class="actions"><button type="button" data-send="${esc(JSON.stringify({ editedFrom: 'editedArgs' }))}">Approve with these arguments</button></div></div></details>` +
      `</div>` + result + note,
    SCRIPT,
  )
}
