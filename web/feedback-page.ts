// The page a signed feedback link opens (GET /feedback/<token>, from a
// messaging app, an email or a callback): a run's result, and a form to
// say whether it was good, add a note, give the text actually used, and a
// name, sent with no sign-in (POST, the link is the permission). Plain
// HTML and a form, so it works anywhere, scripts or not.
import { devUiCss } from './dev-ui-styles.js'
import type { RunFeedback } from '../core/workflow-runs.js'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export function feedbackPageHtml(view:
  | { state: 'ask'; title: string; result: string; verdict?: 'good' | 'bad'; given?: RunFeedback; error?: string }
  | { state: 'thanks'; title: string }
  | { state: 'invalid' }): string {
  const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>${devUiCss}
  body { background: var(--canvas); }
  .fb { max-width: 640px; margin: 6vh auto 40px; padding: 0 16px; display: grid; gap: 18px; }
  .fb-card { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 22px 24px; display: grid; gap: 16px; box-shadow: 0 2px 10px rgba(0, 0, 0, .04); }
  .fb h1 { margin: 0; font-size: 24px; font-weight: 500; letter-spacing: -0.02em; }
  .fb h1 .soft { color: var(--ink-faint); }
  .fb-result { max-height: 280px; overflow: auto; padding: 12px 14px; border-radius: 10px; background: var(--surface); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.55; }
  .fb-k { font-size: 12px; font-family: var(--font-mono); color: var(--ink-faint); margin: 0 0 6px; }
  .fb-verdict { display: flex; gap: 10px; }
  .fb-verdict label { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border: 1px solid var(--line); border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .fb-verdict input { position: absolute; opacity: 0; pointer-events: none; }
  .fb-verdict label:has(input:checked) { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
  .fb textarea, .fb input[type="text"] { width: 100%; font-size: 14px; border-radius: 10px; padding: 10px 12px; }
  .fb textarea { min-height: 80px; }
  .fb details summary { cursor: pointer; font-size: 13.5px; color: var(--ink-muted); }
  .fb details[open] summary { margin-bottom: 8px; }
  .fb .send { height: 42px; border-radius: 11px; border: 0; background: var(--primary); color: var(--on-primary); font-size: 14.5px; font-weight: 600; }
  .fb .hint { font-size: 12.5px; color: var(--ink-muted); margin: 0; }
  .fb .error { color: var(--bad); font-size: 13.5px; margin: 0; }
  .fb-done { text-align: center; padding: 34px 24px; }
  .fb-done .big { font-size: 40px; }
</style></head><body><main class="fb">${body}</main></body></html>`
  if (view.state === 'invalid') {
    return page('Feedback link', '<div class="fb-card fb-done"><div class="big">⌛</div><h1>This link has expired</h1><p class="hint">Feedback links last 30 days. Give feedback on this run from the Inbox instead.</p></div>')
  }
  if (view.state === 'thanks') {
    return page('Thanks', `<div class="fb-card fb-done"><div class="big">🙏</div><h1>Thanks, that helps</h1><p class="hint">Your feedback on ${esc(view.title)} is saved. It's used to improve the workflow; you can close this page.</p></div>`)
  }
  const given = view.given
  const verdict = view.verdict ?? given?.verdict
  const check = (v: 'good' | 'bad') => (verdict === v ? ' checked' : '')
  return page(`Feedback: ${view.title}`, `
  <h1><span class="soft">How did</span> ${esc(view.title)} <span class="soft">do?</span></h1>
  <form class="fb-card" method="post">
    <div><p class="fb-k">// Its result</p><div class="fb-result">${esc(view.result || '(no result)')}</div></div>
    ${given ? `<p class="hint">Feedback was already given${given.by ? ` by ${esc(given.by)}` : ''}; sending again replaces it.</p>` : ''}
    <div class="fb-verdict" role="radiogroup" aria-label="Was it good?">
      <label><input type="radio" name="verdict" value="good"${check('good')} required>👍 Good</label>
      <label><input type="radio" name="verdict" value="bad"${check('bad')}>👎 Needs work</label>
    </div>
    <label><span class="fb-k">// What should change? (optional)</span><textarea name="note" maxlength="1000" placeholder="e.g. It should give the tracking number, and keep it shorter">${esc(given?.note ?? '')}</textarea></label>
    <details><summary>Fix the result yourself (optional)</summary><textarea name="final" maxlength="50000" style="min-height:160px">${esc(given?.final ?? view.result)}</textarea><p class="hint">Change it to what you'd actually send. The workflow learns from the difference.</p></details>
    <label><span class="fb-k">// Your name (optional)</span><input type="text" name="name" maxlength="80" placeholder="So the team knows who said it"></label>
    ${view.error ? `<p class="error">${esc(view.error)}</p>` : ''}
    <button type="submit" class="send">Send feedback</button>
  </form>`)
}
