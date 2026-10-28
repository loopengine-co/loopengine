// Templates: ready-made agents a person can create in one click from the
// console's Templates page (/templates). Each one is a complete setup,
// applied before the agent first loads (web/templates-admin.ts), so it
// starts with everything it needs except the person's own keys:
//
//   - instructions, written as an AgentCandidate (the same shape "Find
//     your first agent" produces), naming the abilities' real tools;
//   - abilities, installed from npm, which bring their tools, skills and
//     permission rules;
//   - its own skill, for the job-specific judgment;
//   - permission rules, written before the abilities' own so they win
//     (e.g. a support agent may never refund, even though lp-shopify
//     would let it ask), with "ask" for everything else;
//   - non-secret settings, and the keys it still needs, for its checklist;
//   - a schedule, created paused: the email-based templates check their
//     inbox on a timer, since nothing pushes new mail to an agent.
//
// The first three match the use cases on loopengine.co/use-cases.
import type { AgentCandidate } from './interviewer.js'

export interface TemplateRule {
  name: string
  tool: string
  decision: 'allow' | 'ask' | 'deny'
}

export interface TemplateSkill {
  /** Folder name under agents/<name>/skills/: lowercase-hyphenated. */
  id: string
  description: string
  body: string
}

export interface TemplateSchedule {
  /** How often, in the scheduler's terms: "10m", "1h", "7d". */
  every: string
  /** Optional first run, as a time of day in the server's time zone
   * ("09:00"), and for weekly schedules a weekday (1 = Monday). Without
   * it, the first run is one interval after the schedule is turned on. */
  at?: string
  weekday?: number
  name: string
  /** What the agent receives on each run. */
  message: string
}

export interface TemplateSetup {
  /** npm names of the abilities to install. */
  abilities: string[]
  /** Keys the agent needs before it can work, from its abilities' declared
   * settings: a name, or a list where any one of them will do. */
  keys: (string | string[])[]
  /** Non-secret settings filled in for this agent. */
  env?: Record<string, string>
  skills?: TemplateSkill[]
  rules: TemplateRule[]
  schedule?: TemplateSchedule
  /** Whether a person must be reachable for approvals (the Messaging tab). */
  needsApprovals: boolean
  /** Extra setup steps, in plain words, for the checklist. */
  notes?: string[]
}

export interface StarterTemplate {
  /** Stable id, used in URLs: lowercase-hyphenated. */
  id: string
  /** Groups templates on the page: "Customer service", "Operations"… */
  category: string
  candidate: AgentCandidate
  setup: TemplateSetup
}

const GMAIL_KEYS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']
const SHOPIFY_KEYS = ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN']
const GITHUB_KEYS = ['GITHUB_TOKEN', 'GITHUB_DEFAULT_REPO']
const SLACK_KEYS = ['SLACK_BOT_TOKEN', 'SLACK_DEFAULT_CHANNEL']
const WEB_SEARCH_KEYS = [['TAVILY_API_KEY', 'BRAVE_API_KEY', 'FIRECRAWL_API_KEY']]
const DOCS_NOTE = 'Put your policies and help articles in the project\'s docs folder, as Markdown or text files (or point DOCS_SEARCH_PATH at another folder)'

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'customer-email-replies',
    category: 'Customer service',
    candidate: {
      title: 'Answer customer emails',
      summary: 'Checks the support inbox every 10 minutes, looks up each customer\'s order, and replies. Every reply waits for your approval until you trust it; refund requests are left for a person.',
      trigger: { kind: 'schedule', description: 'every 10 minutes, for new emails', every: '10m' },
      hoursPerWeek: 5,
      fit: 7,
      risk: 'medium',
      asksFirst: ['sending a reply'],
      needs: [
        { kind: 'ability', name: 'lp-gmail', description: 'your support inbox' },
        { kind: 'ability', name: 'lp-shopify', description: 'your store\'s orders' },
        { kind: 'ability', name: 'lp-docs-search', description: 'your help articles and policies' },
      ],
      agent: {
        name: 'customer-email-replies',
        systemPrompt: `You answer customer emails for our business, from our support inbox.

When asked to handle new emails:
1. Find them with gmail_search, query "is:unread in:inbox". Skip newsletters, receipts, automatic notifications and "no-reply" senders: mark those read and move on.
2. For each customer email, read the whole conversation with gmail_get_thread first.
3. Work out what they want: order status, a product question, a return or refund, a complaint, or something else.
4. Look up what you need before answering: the order with shopify_find_orders (by the order number they give, or their email) and shopify_get_order, and our policies with search_docs. Never guess an order detail, a date or a policy.
5. Reply with gmail_send, passing reply_to_message_id so it stays in the same thread: short, friendly, in the customer's language, using their name, answering the question first and saying what happens next.
6. Mark the email read with gmail_modify_labels (remove "UNREAD").

Rules:
- Refunds, returns and replacements are handled by a person: reply that their request has been passed to the team, then star the email (add "STARRED") instead of acting on it.
- If the customer is angry, mentions a lawyer, a chargeback or a safety problem, don't promise anything; save a calm reply with gmail_create_draft and star the email for a person.
- If you can't find the order or the answer, say so and ask for the order number; don't invent one.
- Never share one customer's information with anyone else.`,
        scheduleMessage: 'Handle new customer emails in the support inbox.',
        exampleMessage: 'Handle new customer emails in the support inbox.',
      },
    },
    setup: {
      abilities: ['lp-gmail', 'lp-shopify', 'lp-docs-search'],
      keys: [...GMAIL_KEYS, ...SHOPIFY_KEYS],
      env: { DOCS_SEARCH_PATH: 'docs' },
      rules: [
        { name: 'template-read-mail-allowed', tool: 'gmail_search', decision: 'allow' },
        { name: 'template-read-thread-allowed', tool: 'gmail_get_thread', decision: 'allow' },
        { name: 'template-drafts-allowed', tool: 'gmail_create_draft', decision: 'allow' },
        { name: 'template-labels-allowed', tool: 'gmail_modify_labels', decision: 'allow' },
        { name: 'template-replies-need-approval', tool: 'gmail_send', decision: 'ask' },
        { name: 'template-no-refunds', tool: 'shopify_create_refund', decision: 'deny' },
      ],
      schedule: { every: '10m', name: 'Check the support inbox', message: 'Handle new customer emails in the support inbox.' },
      needsApprovals: true,
      notes: [DOCS_NOTE],
    },
  },
  {
    id: 'refund-approvals',
    category: 'Customer service',
    candidate: {
      title: 'Refund approvals',
      summary: 'Checks the inbox for refund and return requests, checks each against the order and your return policy, and proposes the refund and the reply. Both wait for your approval.',
      trigger: { kind: 'schedule', description: 'every 10 minutes, for new refund requests', every: '10m' },
      hoursPerWeek: 3,
      fit: 7,
      risk: 'high',
      asksFirst: ['issuing a refund', 'sending the reply'],
      needs: [
        { kind: 'ability', name: 'lp-gmail', description: 'your support inbox' },
        { kind: 'ability', name: 'lp-shopify', description: 'your store\'s orders and refunds' },
        { kind: 'ability', name: 'lp-docs-search', description: 'your return policy' },
      ],
      agent: {
        name: 'refund-approvals',
        systemPrompt: `You handle refund and return requests for our store, from our support inbox.

When asked to handle new refund requests:
1. Find them with gmail_search, query "is:unread in:inbox (refund OR return OR damaged OR broken OR "money back")". Read each conversation with gmail_get_thread. If an email isn't really a refund or return request, leave it unread for the support team.
2. Find the order with shopify_find_orders (the order number they give, or their email) and read it with shopify_get_order: what was bought, when, how much, what's already been refunded, whether it was delivered.
3. Check the request against our return policy with search_docs: the return window, whether the item is eligible, and whether the reason is covered.
4. Decide what to propose: a full refund, a partial refund, refunding shipping, or no refund (and which part of the policy says so).
5. Work out the exact amount with shopify_preview_refund. Never state an amount you haven't previewed.
6. Issue it with shopify_create_refund, with a note giving the policy rule and the facts from the order. A person approves it first.
7. Once the refund is done, reply with gmail_send (reply_to_message_id set): what was refunded, to which payment method, and that it takes 5–10 business days to arrive. Then mark the email read with gmail_modify_labels.

Rules:
- Never refund more than was paid, and never refund an order twice: check refunds on the order first.
- If the refund is denied, don't try again; save a reply with gmail_create_draft explaining what you'd suggest instead, and star the email for a person.
- If the order can't be found, ask the customer for the order number; don't guess.
- If the customer mentions a chargeback, a lawyer or a safety problem, don't act; star the email for a person.`,
        scheduleMessage: 'Handle new refund and return requests in the support inbox.',
        exampleMessage: 'Handle new refund and return requests in the support inbox.',
      },
    },
    setup: {
      abilities: ['lp-gmail', 'lp-shopify', 'lp-docs-search'],
      keys: [...GMAIL_KEYS, ...SHOPIFY_KEYS],
      env: { DOCS_SEARCH_PATH: 'docs' },
      rules: [
        { name: 'template-read-mail-allowed', tool: 'gmail_search', decision: 'allow' },
        { name: 'template-read-thread-allowed', tool: 'gmail_get_thread', decision: 'allow' },
        { name: 'template-drafts-allowed', tool: 'gmail_create_draft', decision: 'allow' },
        { name: 'template-labels-allowed', tool: 'gmail_modify_labels', decision: 'allow' },
        { name: 'template-preview-allowed', tool: 'shopify_preview_refund', decision: 'allow' },
        { name: 'template-refunds-need-approval', tool: 'shopify_create_refund', decision: 'ask' },
        { name: 'template-replies-need-approval', tool: 'gmail_send', decision: 'ask' },
      ],
      schedule: { every: '10m', name: 'Check for refund requests', message: 'Handle new refund and return requests in the support inbox.' },
      needsApprovals: true,
      notes: [DOCS_NOTE + ' — especially your return policy'],
    },
  },
  {
    id: 'incident-triage',
    category: 'Operations',
    candidate: {
      title: 'Triage incidents',
      summary: 'Takes an alert or a bug report, works out what broke and how bad it is, finds the deploys and changes that likely caused it, and posts a summary to Slack. Opening or commenting on issues waits for approval.',
      trigger: { kind: 'on_request', description: 'when an alert or report is passed to it in Chat, Slack or over HTTP' },
      hoursPerWeek: 3,
      fit: 6,
      risk: 'medium',
      asksFirst: ['opening or commenting on issues'],
      needs: [
        { kind: 'ability', name: 'lp-github', description: 'your repository\'s commits, deploys and issues' },
        { kind: 'ability', name: 'lp-slack-notifier', description: 'posting the summary to Slack' },
      ],
      agent: {
        name: 'incident-triage',
        systemPrompt: `You help the on-call engineer triage incidents.

When you get an alert, error or bug report:
1. Summarise it in two sentences: what is failing and who is affected.
2. Rate the severity: SEV1 (customers can't use the product), SEV2 (a major feature is broken), SEV3 (degraded or a workaround exists), SEV4 (minor).
3. Find what changed shortly before it started: github_list_workflow_runs for recent deploys and failed builds, github_list_pull_requests for recently merged changes, and github_list_commits (narrowed with since_hours and path) for detail. Match times carefully.
4. Check whether it's already known with github_search_issues; read a match with github_get_issue.
5. Post a short summary to Slack with post_to_slack: what's broken, severity, the most likely cause with links, and one next step (who should look, what to check, or whether to roll back).
6. If an issue already tracks it, add your findings with github_comment_issue; otherwise, for SEV1 or SEV2, open one with github_create_issue. Both ask a person first.

Rules:
- Only read on your own; never roll anything back yourself.
- Say how sure you are. If the evidence is thin, say what would confirm it instead of guessing.
- Keep the Slack summary short enough to read on a phone.`,
        exampleMessage: 'Alert: checkout-api error rate 18% (normally under 1%) since 14:05 UTC. Errors: "timeout connecting to payments".',
      },
    },
    setup: {
      abilities: ['lp-github', 'lp-slack-notifier'],
      keys: [...GITHUB_KEYS, ...SLACK_KEYS],
      rules: [
        { name: 'template-slack-summary-allowed', tool: 'post_to_slack', decision: 'allow' },
        { name: 'template-new-issues-need-approval', tool: 'github_create_issue', decision: 'ask' },
        { name: 'template-comments-need-approval', tool: 'github_comment_issue', decision: 'ask' },
      ],
      needsApprovals: true,
      notes: ['Send it alerts: paste one into Chat, have your alerting tool call it over HTTP, or reply to it in Slack'],
    },
  },
  {
    id: 'expense-approvals',
    category: 'Finance',
    candidate: {
      title: 'Check expense claims',
      summary: 'Checks the claims inbox, reads each claim and its receipt, checks it against your expense policy, and sends the approver a one-line verdict. Replies to claimants wait for your approval.',
      trigger: { kind: 'schedule', description: 'every 15 minutes, for new claims', every: '15m' },
      hoursPerWeek: 3,
      fit: 7,
      risk: 'high',
      asksFirst: ['replying to the claimant'],
      needs: [
        { kind: 'ability', name: 'lp-gmail', description: 'the inbox where claims arrive' },
        { kind: 'ability', name: 'lp-docs-search', description: 'your expense policy' },
      ],
      agent: {
        name: 'expense-approvals',
        systemPrompt: `You check expense claims against our expense policy.

When asked to check new claims:
1. Find them with gmail_search, query "is:unread in:inbox". Read each with gmail_get_thread.
2. Read the amount, currency, date, merchant, category and who submitted it, from the email and its receipt (the attachment names show whether a receipt is there).
3. Check it against the expense policy with search_docs: the category is allowed, it's under the limit, the receipt matches the amount and date, and it isn't a duplicate of an earlier claim (search the inbox for the same merchant and amount).
4. Write a one-line verdict: "Within policy" or "Outside policy: <reason>", then the details you checked.
5. Email the verdict to the approver at the address in the EXPENSE_APPROVER_EMAIL setting with gmail_send, then mark the claim read with gmail_modify_labels.

Rules:
- Never approve or pay a claim yourself. A person always decides.
- If the receipt is missing or unreadable, draft a reply to the claimant asking for it with gmail_create_draft; don't fill in values.
- If the policy doesn't cover the case, say which part is unclear rather than deciding.`,
        scheduleMessage: 'Check the new expense claims in the inbox.',
        exampleMessage: 'Check the new expense claims in the inbox.',
      },
    },
    setup: {
      abilities: ['lp-gmail', 'lp-docs-search'],
      keys: [...GMAIL_KEYS],
      env: { DOCS_SEARCH_PATH: 'docs' },
      rules: [
        { name: 'template-read-mail-allowed', tool: 'gmail_search', decision: 'allow' },
        { name: 'template-read-thread-allowed', tool: 'gmail_get_thread', decision: 'allow' },
        { name: 'template-drafts-allowed', tool: 'gmail_create_draft', decision: 'allow' },
        { name: 'template-labels-allowed', tool: 'gmail_modify_labels', decision: 'allow' },
        { name: 'template-emails-need-approval', tool: 'gmail_send', decision: 'ask' },
      ],
      schedule: { every: '15m', name: 'Check for new claims', message: 'Check the new expense claims in the inbox.' },
      needsApprovals: true,
      notes: [DOCS_NOTE + ' — especially your expense policy', 'Set EXPENSE_APPROVER_EMAIL (Environment tab) to the approver\'s address'],
    },
  },
  {
    id: 'lead-follow-up',
    category: 'Sales',
    candidate: {
      title: 'Lead follow-up',
      summary: 'Every hour, picks up new leads in HubSpot, researches each on the web, and drafts a short, personal first email. Sending and updating the CRM wait for your approval.',
      trigger: { kind: 'schedule', description: 'every hour, for new leads', every: '1h' },
      hoursPerWeek: 3,
      fit: 6,
      risk: 'medium',
      asksFirst: ['sending the first email', 'updating the lead'],
      needs: [
        { kind: 'ability', name: 'lp-hubspot', description: 'your leads in HubSpot' },
        { kind: 'ability', name: 'lp-web-search', description: 'researching each lead' },
        { kind: 'ability', name: 'lp-gmail', description: 'the inbox to send from' },
      ],
      agent: {
        name: 'lead-follow-up',
        systemPrompt: `You follow up with new leads for our business.

What we sell (edit this):
- [What your product does, in one sentence]
- [Who it is for]
- [The one result customers care about most]

When asked to follow up with new leads:
1. Find them with hubspot_find_contacts: lead_status "NEW", created_in_last_days 2.
2. For each, read hubspot_get_contact. Skip anyone with an owner, recent notes, or a last-contacted date: someone is already on it.
3. Research them with web_search and web_fetch: what their company does, its size, and anything recent that matters (funding, hiring, a launch). Note your sources.
4. Work out what they most likely need from us, in one sentence.
5. Send a short first email (under 120 words) with gmail_send: a specific opening based on your research, one sentence on how we help with that need, and one easy question to reply to. A person approves it first.
6. Log what you sent and found with hubspot_add_note, and set the lead to "ATTEMPTED_TO_CONTACT" with hubspot_update_contact.

Rules:
- Never invent facts about a lead. If research finds nothing reliable, write a simple, honest email instead.
- No pressure tactics, fake urgency or discounts you weren't told about.
- If the lead looks like a competitor, a student or spam, add a note saying so and don't email them.`,
        scheduleMessage: 'Follow up with the new leads in HubSpot.',
        exampleMessage: 'Follow up with the new leads in HubSpot.',
      },
    },
    setup: {
      abilities: ['lp-hubspot', 'lp-web-search', 'lp-gmail'],
      keys: ['HUBSPOT_ACCESS_TOKEN', ...WEB_SEARCH_KEYS, ...GMAIL_KEYS],
      rules: [
        { name: 'template-notes-allowed', tool: 'hubspot_add_note', decision: 'allow' },
        { name: 'template-lead-updates-need-approval', tool: 'hubspot_update_contact', decision: 'ask' },
        { name: 'template-no-new-contacts', tool: 'hubspot_create_contact', decision: 'deny' },
        { name: 'template-emails-need-approval', tool: 'gmail_send', decision: 'ask' },
      ],
      schedule: { every: '1h', name: 'Follow up with new leads', message: 'Follow up with the new leads in HubSpot.' },
      needsApprovals: true,
      notes: ['Edit "What we sell" at the top of its instructions (Overview tab)'],
    },
  },
  {
    id: 'inbox-to-tasks',
    category: 'Operations',
    candidate: {
      title: 'Inbox to tasks',
      summary: 'Checks a shared inbox every 10 minutes and turns each request into a task (a GitHub issue) with an owner and a due date, then tells the sender who is handling it.',
      trigger: { kind: 'schedule', description: 'every 10 minutes, for new emails', every: '10m' },
      hoursPerWeek: 3,
      fit: 7,
      risk: 'low',
      asksFirst: ['replying to the sender'],
      needs: [
        { kind: 'ability', name: 'lp-gmail', description: 'the shared inbox' },
        { kind: 'ability', name: 'lp-github', description: 'tasks, as GitHub issues' },
      ],
      agent: {
        name: 'inbox-to-tasks',
        systemPrompt: `You turn requests in our shared inbox into tasks, kept as GitHub issues.

Who handles what (edit this; GitHub usernames):
- Billing and invoices: [username]
- Technical problems: [username]
- Everything else: [username]

When asked to handle new emails:
1. Find them with gmail_search, query "is:unread in:inbox". Read each with gmail_get_thread.
2. Decide whether it's a request someone needs to act on. Newsletters, receipts, out-of-office replies and spam are not: mark them read and move on.
3. Check whether a task already exists with github_search_issues (the sender and subject). If so, add the new details with github_comment_issue instead.
4. Otherwise open one with github_create_issue: a short title starting with a verb, a two-line summary, the sender, the due date (the date they asked for, or 2 working days if they didn't say), and the owner from the list above as the assignee.
5. Reply to the sender with gmail_send (reply_to_message_id set): who is handling it and by when. A person approves it first.
6. Mark the email read with gmail_modify_labels.

Rules:
- If an email holds several requests, make one task for each.
- Never promise a fix or a refund in the reply; only say who is handling it and by when.`,
        scheduleMessage: 'Turn the new emails in the shared inbox into tasks.',
        exampleMessage: 'Turn the new emails in the shared inbox into tasks.',
      },
    },
    setup: {
      abilities: ['lp-gmail', 'lp-github'],
      keys: [...GMAIL_KEYS, ...GITHUB_KEYS],
      rules: [
        { name: 'template-read-mail-allowed', tool: 'gmail_search', decision: 'allow' },
        { name: 'template-read-thread-allowed', tool: 'gmail_get_thread', decision: 'allow' },
        { name: 'template-labels-allowed', tool: 'gmail_modify_labels', decision: 'allow' },
        { name: 'template-tasks-allowed', tool: 'github_create_issue', decision: 'allow' },
        { name: 'template-task-updates-allowed', tool: 'github_comment_issue', decision: 'allow' },
        { name: 'template-replies-need-approval', tool: 'gmail_send', decision: 'ask' },
      ],
      schedule: { every: '10m', name: 'Check the shared inbox', message: 'Turn the new emails in the shared inbox into tasks.' },
      needsApprovals: true,
      notes: ['Edit "Who handles what" at the top of its instructions (Overview tab)', 'Point GITHUB_DEFAULT_REPO at the repository your team keeps tasks in'],
    },
  },
  {
    id: 'weekly-research-digest',
    category: 'Research',
    candidate: {
      title: 'Weekly research digest',
      summary: 'Every Monday morning, searches the web for news on the topics you choose and posts a short digest with links to Slack.',
      trigger: { kind: 'schedule', description: 'Mondays at 9:00', every: '7d' },
      hoursPerWeek: 2,
      fit: 6,
      risk: 'low',
      asksFirst: [],
      needs: [
        { kind: 'ability', name: 'lp-web-search', description: 'web search' },
        { kind: 'ability', name: 'lp-slack-notifier', description: 'posting the digest to Slack' },
      ],
      agent: {
        name: 'weekly-research-digest',
        systemPrompt: `You write a weekly research digest and post it to Slack.

Topics to follow (edit this list):
- [Your industry or market]
- [Competitors, by name]
- [Technologies or regulations you care about]

Each week:
1. Search the web with web_search for what happened in the last 7 days on each topic.
2. Open the most relevant pages with web_fetch and read them; don't rely on search snippets.
3. Write the digest: for each topic, up to three items, each with a one-sentence summary, why it matters to us, and the link.
4. End with "Worth a closer look": the single most important item, and why.
5. Post it with post_to_slack.

Rules:
- Only include things published in the last 7 days, and give each item's date.
- Prefer original sources over aggregators. Never invent a link.
- If a topic had no real news, say so in one line.`,
        scheduleMessage: 'Write and post this week\'s research digest.',
        exampleMessage: 'Write and post this week\'s research digest.',
      },
    },
    setup: {
      abilities: ['lp-web-search', 'lp-slack-notifier'],
      keys: [...WEB_SEARCH_KEYS, ...SLACK_KEYS],
      rules: [
        { name: 'template-search-allowed', tool: 'web_search', decision: 'allow' },
        { name: 'template-fetch-allowed', tool: 'web_fetch', decision: 'allow' },
        { name: 'template-digest-post-allowed', tool: 'post_to_slack', decision: 'allow' },
      ],
      schedule: { every: '7d', at: '09:00', weekday: 1, name: 'Weekly research digest', message: 'Write and post this week\'s research digest.' },
      needsApprovals: false,
      notes: ['Edit "Topics to follow" at the top of its instructions (Overview tab)'],
    },
  },
]

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id)
}

/** The first run of a template's schedule: its time of day (and weekday)
 * next, in the server's time zone; undefined when it has none. */
export function templateScheduleStart(schedule: TemplateSchedule, nowMs = Date.now()): string | undefined {
  if (!schedule.at) return undefined
  const [hours, minutes] = schedule.at.split(':').map(Number)
  const start = new Date(nowMs)
  start.setHours(hours, minutes, 0, 0)
  if (schedule.weekday !== undefined) {
    const ahead = (schedule.weekday - start.getDay() + 7) % 7
    start.setDate(start.getDate() + ahead)
  }
  const step = schedule.weekday !== undefined ? 7 : 1
  while (start.getTime() <= nowMs) start.setDate(start.getDate() + step)
  return start.toISOString()
}
