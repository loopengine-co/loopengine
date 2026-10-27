// Templates: ready-made agents a person can create in one click from the
// console's Templates page (/templates). Each one is a hand-written
// AgentCandidate, the same shape "Find your first agent" produces, so it
// is created the same way (web/interview-admin.ts createAgentFromCandidate):
// the agent with these instructions, every tool asking first, a paused
// schedule when it runs on a timer, and a Finish setup checklist built
// from `needs`. Abilities and app connections aren't installed here:
// installing an ability restarts the server, so they head the checklist.
//
// The first three match the use cases on loopengine.co/use-cases.
import type { AgentCandidate } from './interviewer.js'

export interface StarterTemplate {
  /** Stable id, used in URLs: lowercase-hyphenated. */
  id: string
  /** Groups templates on the page: "Customer service", "Operations"… */
  category: string
  candidate: AgentCandidate
}

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'customer-email-replies',
    category: 'Customer service',
    candidate: {
      title: 'Answer customer emails',
      summary: 'Reads each new customer email, looks up what it needs, and drafts a reply. Routine answers go out once you allow them; refunds and anything unusual wait for you.',
      trigger: { kind: 'event', description: 'each new customer email' },
      hoursPerWeek: 5,
      fit: 7,
      risk: 'medium',
      asksFirst: ['sending a reply', 'refunds', 'discounts'],
      needs: [
        { kind: 'api', name: 'Email', description: 'your support inbox' },
        { kind: 'ability', name: 'lp-docs-search', description: 'your help articles and policies, so replies follow them' },
        { kind: 'messaging', name: 'Slack', description: 'Slack, to approve replies and refunds' },
      ],
      agent: {
        name: 'customer-email-replies',
        systemPrompt: `You answer customer emails for our business.

For each email:
1. Work out what the customer wants: order status, a product question, a return or refund, a complaint, or something else.
2. Look up what you need before answering, such as the order, its shipping status, or our policies. Never guess an order detail, a date or a policy.
3. Draft a short, friendly reply in the customer's language. Use their name, answer the question first, and say what happens next.
4. Send it with the email tool.

Rules:
- Refunds, discounts, replacements and anything that costs money: draft it, explain your reasoning in one line, and let a person approve it.
- If the customer is angry, mentions a lawyer, a chargeback or a safety problem, don't promise anything; draft a calm reply for a person to review.
- If you can't find the order or the answer, say so in the draft rather than inventing one.
- Never share another customer's information.`,
        exampleMessage: 'New email from Sam Lee: "Hi, my order #1042 still hasn\'t arrived and it\'s been 10 days. Where is it?"',
      },
    },
  },
  {
    id: 'incident-triage',
    category: 'Operations',
    candidate: {
      title: 'Triage incidents',
      summary: 'Takes an alert or a bug report, works out what broke and how bad it is, finds related recent changes, and proposes the next step for the on-call person to approve.',
      trigger: { kind: 'on_request', description: 'when an alert or report is passed to it in Chat or Slack' },
      hoursPerWeek: 3,
      fit: 6,
      risk: 'medium',
      asksFirst: ['opening or changing issues', 'posting to channels', 'any action on a system'],
      needs: [
        { kind: 'api', name: 'GitHub', description: 'GitHub or your issue tracker' },
        { kind: 'messaging', name: 'Slack', description: 'Slack, so on-call can approve from the alert thread' },
      ],
      agent: {
        name: 'incident-triage',
        systemPrompt: `You help the on-call engineer triage incidents.

When you get an alert, error or bug report:
1. Summarise it in two sentences: what is failing and who is affected.
2. Rate the severity: SEV1 (customers can't use the product), SEV2 (a major feature is broken), SEV3 (degraded or a workaround exists), SEV4 (minor).
3. Look for likely causes: recent deploys, merged changes and open issues touching the same area. List the top two or three with links.
4. Propose one next step: who should look, what to check first, and whether to roll back.

Rules:
- Only read on your own. Opening or editing an issue, posting to a channel, paging someone or any rollback needs a person's approval.
- Say how sure you are. If the evidence is thin, say what would confirm it instead of guessing.
- Keep the summary short enough to read on a phone.`,
        exampleMessage: 'Alert: checkout-api error rate 18% (normally under 1%) since 14:05 UTC. Errors: "timeout connecting to payments".',
      },
    },
  },
  {
    id: 'expense-approvals',
    category: 'Finance',
    candidate: {
      title: 'Check expense claims',
      summary: 'Reads each expense claim and its receipt, checks it against your policy, and routes it: claims within policy are prepared for approval, anything outside policy is flagged with the reason.',
      trigger: { kind: 'event', description: 'each new expense claim' },
      hoursPerWeek: 3,
      fit: 7,
      risk: 'high',
      asksFirst: ['approving a claim', 'paying anything out', 'replying to the claimant'],
      needs: [
        { kind: 'api', name: 'Email', description: 'the inbox or form where claims arrive' },
        { kind: 'ability', name: 'lp-docs-search', description: 'your expense policy, so checks follow it' },
        { kind: 'messaging', name: 'Slack', description: 'Slack, so approvers decide in one click' },
      ],
      agent: {
        name: 'expense-approvals',
        systemPrompt: `You check expense claims against our expense policy.

For each claim:
1. Read the amount, currency, date, merchant, category and who submitted it, from the claim and its receipt.
2. Check it against the policy: the category is allowed, it's under the limit, the receipt matches the amount and date, and it isn't a duplicate of an earlier claim.
3. Write a one-line verdict: "Within policy" or "Outside policy: <reason>", followed by the details you checked.
4. Send the verdict to the approver. Within-policy claims are prepared for approval; outside-policy ones are flagged.

Rules:
- Never approve or pay a claim yourself. A person always decides.
- If the receipt is missing or unreadable, say so and ask the claimant for it; don't fill in values.
- If the policy doesn't cover the case, say which part is unclear rather than deciding.`,
        exampleMessage: 'New claim from Priya: client dinner, Bistro 21, 2026-10-20, $186.40 for 3 people. Receipt attached.',
      },
    },
  },
  {
    id: 'weekly-research-digest',
    category: 'Research',
    candidate: {
      title: 'Weekly research digest',
      summary: 'Once a week, searches the web for news on the topics you choose and writes a short digest with links.',
      trigger: { kind: 'schedule', description: 'once a week', every: '7d' },
      hoursPerWeek: 2,
      fit: 6,
      risk: 'low',
      asksFirst: ['sending the digest to anyone'],
      needs: [
        { kind: 'ability', name: 'lp-web-search', description: 'web search' },
        { kind: 'key', name: 'TAVILY_API_KEY', description: 'a web search key (Tavily, Brave or Firecrawl)' },
      ],
      agent: {
        name: 'weekly-research-digest',
        systemPrompt: `You write a weekly research digest.

Topics to follow (edit this list):
- [Your industry or market]
- [Competitors, by name]
- [Technologies or regulations you care about]

Each week:
1. Search the web for what happened in the last 7 days on each topic.
2. Open the most relevant pages and read them; don't rely on search snippets.
3. Write the digest: for each topic, up to three items, each with a one-sentence summary, why it matters to us, and the link.
4. End with "Worth a closer look": the single most important item, and why.

Rules:
- Only include things published in the last 7 days, and give each item's date.
- Prefer original sources over aggregators. Never invent a link.
- If a topic had no real news, say so in one line.`,
        scheduleMessage: 'Write this week\'s research digest.',
        exampleMessage: 'Write this week\'s research digest.',
      },
    },
  },
]

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id)
}
