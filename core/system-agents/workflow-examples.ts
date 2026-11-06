// Workflow examples: ready-made plans on the console's new-workflow page
// (/workflows/new). Opening one goes straight to the plan review, with no
// model call, and creates it like a planned workflow: as a new agent or
// in one the person already has. They replace the starter templates.
//
// Each is split the way the planner splits a plan:
//   - newAgent.systemPrompt: the agent's standing instructions, read on
//     every run of every workflow it has: its role, rules that always
//     hold, and the parts the person fills in, marked "(edit this)";
//   - skill.body: the workflow's steps, read when it runs.
// Rules that must hold whatever the instructions say are permission
// rules (`deny`), which come along into an existing agent too.
import type { WorkflowPlan } from './workflow-planner.js'
import type { TemplateSkill } from './templates.js'

export interface WorkflowExample {
  /** Stable id, used in links: lowercase-hyphenated. */
  id: string
  /** Groups examples on the page: "Customer service", "Operations"… */
  category: string
  /** Its card: what a person would type to describe it, the apps it
   * works with, and what it asks before doing (the same as
   * ./workflow-example-messages.ts and loopengine.co/workflows). */
  message: string
  apps: string[]
  asksFirst: string[]
  plan: WorkflowPlan
}

const GMAIL = '@loopengine-co/gmail'
const SHOPIFY = '@loopengine-co/shopify'
const HUBSPOT = '@loopengine-co/hubspot'
const GMAIL_KEYS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']
const SHOPIFY_KEYS = ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN']
const GITHUB_APP = 'io.github.github/github-mcp-server'
const FIRECRAWL_APP = 'io.github.firecrawl/firecrawl-mcp-server'

const NEW_AGENT = 'A ready-made example, set up as its own agent; you can add it to an agent you have instead.'
const policiesNote = (what: string, skill: string) => `Write ${what} into its ${skill} skill (Advanced → Skills): the agent answers from it and nothing else`

const SUPPORT_POLICIES: TemplateSkill = {
  id: 'support-policies',
  description: 'Our shipping, returns, refunds and other customer policies. Read it before telling a customer anything about a policy.',
  body: `# Our customer policies

Edit this: replace each [bracket] with your own policy. The agent answers customers from this and nothing else.

## Shipping
- Where we ship: [countries]
- How long it takes: [e.g. 3–5 business days]
- Tracking: [when and how customers get it]

## Returns and refunds
- Return window: [e.g. 30 days from delivery]
- What can't be returned: [e.g. sale items, opened cosmetics]
- How refunds are paid: [e.g. to the original payment method, in 5–10 business days]

## Other questions
- [Order changes and cancellations]
- [Warranty]
- [Anything customers often ask]
`,
}

const RETURN_POLICY: TemplateSkill = {
  id: 'return-policy',
  description: 'Our return and refund policy: the window, what qualifies, and how much is refunded. Read it before proposing any refund.',
  body: `# Our return policy

Edit this: replace each [bracket] with your own policy. The agent proposes refunds from this and nothing else.

- Return window: [e.g. 30 days from delivery]
- Eligible items: [e.g. unused, in the original packaging]
- Not eligible: [e.g. sale items, gift cards, personalised items]
- Damaged or wrong items: [e.g. full refund including shipping, no return needed]
- Change of mind: [e.g. refund of the item price, customer pays return shipping]
- Shipping costs: [when they're refunded]
- Partial refunds: [when you offer one, and how much]
`,
}

const EXPENSE_POLICY: TemplateSkill = {
  id: 'expense-policy',
  description: 'Our expense policy: what can be claimed, the limits, and what a claim needs. Read it before giving any verdict.',
  body: `# Our expense policy

Edit this: replace each [bracket] with your own policy. The agent checks claims against this and nothing else.

## What can be claimed, and the limits
- Travel: [e.g. economy flights and trains; taxis when there's no public transport]
- Hotels: [e.g. up to 150 per night]
- Meals: [e.g. up to 50 per day when travelling]
- Equipment and software: [e.g. up to 200 without pre-approval]

## What can't be claimed
- [e.g. alcohol, fines, personal entertainment]

## What every claim needs
- An itemised receipt showing the amount, date and merchant
- [Pre-approval for anything over a limit]
- Submitted within [e.g. 60 days]
`,
}

/** The parts every example's plan shares. */
function example(id: string, category: string, card: Pick<WorkflowExample, 'message' | 'apps' | 'asksFirst'>, plan: Omit<WorkflowPlan, 'parameters' | 'gaps' | 'target' | 'notify'> & Partial<Pick<WorkflowPlan, 'parameters' | 'notify'>>): WorkflowExample {
  return {
    id,
    category,
    ...card,
    plan: {
      parameters: {},
      notify: { on: false, reason: '' },
      gaps: [],
      target: { kind: 'new', reason: NEW_AGENT },
      ...plan,
    },
  }
}

export const WORKFLOW_EXAMPLES: readonly WorkflowExample[] = [
  example('customer-email-replies', 'Customer service', { message: "Every 10 minutes, check our support inbox. For each customer email, look up their order in Shopify and our policies, and reply in the thread. Let me approve every reply, and leave refund requests for the team.", apps: ["Gmail", "Shopify"], asksFirst: ["sending a reply"] }, {
    name: 'Answer customer emails',
    id: 'answer-customer-emails',
    summary: 'Checks the support inbox every 10 minutes, looks up each customer\'s order and your policies, and replies. Every reply waits for your approval until you trust it; refund requests are left for a person.',
    trigger: { kind: 'schedule', description: 'every 10 minutes, for new emails', every: '10m' },
    steps: [
      { title: 'Find new customer emails', kind: 'tool', tool: 'gmail_search', ability: GMAIL },
      { title: 'Read the whole conversation', kind: 'tool', tool: 'gmail_get_thread', ability: GMAIL },
      { title: 'Look up their order', kind: 'tool', tool: 'shopify_find_orders', ability: SHOPIFY, detail: 'then shopify_get_order for its details' },
      { title: 'Check our policies', kind: 'other', detail: 'from its support-policies skill' },
      { title: 'Reply in the thread', kind: 'approval', tool: 'gmail_send', ability: GMAIL },
      { title: 'Mark the email done', kind: 'tool', tool: 'gmail_modify_labels', ability: GMAIL },
    ],
    abilities: [GMAIL, SHOPIFY],
    rules: [
      { tool: 'gmail_search', decision: 'allow' },
      { tool: 'gmail_get_thread', decision: 'allow' },
      { tool: 'gmail_create_draft', decision: 'allow' },
      { tool: 'gmail_modify_labels', decision: 'allow' },
      { tool: 'gmail_send', decision: 'ask' },
      { tool: 'shopify_create_refund', decision: 'deny' },
    ],
    keys: [...GMAIL_KEYS, ...SHOPIFY_KEYS],
    needsApprovals: true,
    skill: {
      description: 'Handle new customer emails in the support inbox: look up each order and our policies, and reply in the thread.',
      body: `1. Find new emails with gmail_search, query "is:unread in:inbox". Skip newsletters, receipts, automatic notifications and "no-reply" senders: mark those read and move on.
2. For each customer email, read the whole conversation with gmail_get_thread first.
3. Work out what they want: order status, a product question, a return or refund, a complaint, or something else.
4. Look up what you need before answering: the order with shopify_find_orders (by the order number they give, or their email) and shopify_get_order, and our policies in the support-policies skill (open it with Skill).
5. Reply with gmail_send, passing reply_to_message_id so it stays in the same thread: short, friendly, in the customer's language, using their name, answering the question first and saying what happens next.
6. Mark the email read with gmail_modify_labels (remove "UNREAD").

- A refund, return or replacement request: reply that it has been passed to the team, then star the email (add "STARRED") instead of acting on it.
- An angry customer, or one who mentions a lawyer, a chargeback or a safety problem: save a calm reply with gmail_create_draft and star the email for a person.
- If you can't find the order or the answer, say so and ask for the order number.`,
    },
    startMessage: 'Handle new customer emails in the support inbox.',
    newAgent: {
      name: 'customer-email-replies',
      systemPrompt: `You answer customer emails for our business, from our support inbox.

Rules:
- Refunds, returns and replacements are handled by a person; never promise or make one yourself.
- Never guess an order detail, a date or a policy. Our policies are in your support-policies skill: answer from it and nothing else.
- If a customer is angry, or mentions a lawyer, a chargeback or a safety problem, don't promise anything; leave it for a person.
- Never share one customer's information with anyone else.`,
    },
    skills: [SUPPORT_POLICIES],
    notes: [policiesNote('your policies', 'support-policies')],
  }),

  example('refund-approvals', 'Customer service', { message: "Every 10 minutes, find refund and return requests in our inbox. Check each against the Shopify order and our return policy, work out the amount, and refund it. Ask me before any refund or reply goes out.", apps: ["Gmail", "Shopify"], asksFirst: ["issuing a refund", "sending the reply"] }, {
    name: 'Refund approvals',
    id: 'refund-approvals',
    summary: 'Checks the inbox for refund and return requests, checks each against the order and your return policy, and proposes the refund and the reply. Both wait for your approval.',
    trigger: { kind: 'schedule', description: 'every 10 minutes, for new refund requests', every: '10m' },
    steps: [
      { title: 'Find refund and return requests', kind: 'tool', tool: 'gmail_search', ability: GMAIL },
      { title: 'Read each conversation', kind: 'tool', tool: 'gmail_get_thread', ability: GMAIL },
      { title: 'Look up the order', kind: 'tool', tool: 'shopify_find_orders', ability: SHOPIFY, detail: 'then shopify_get_order: what was paid, refunded and delivered' },
      { title: 'Check it against the return policy', kind: 'other', detail: 'from its return-policy skill' },
      { title: 'Work out the exact amount', kind: 'tool', tool: 'shopify_preview_refund', ability: SHOPIFY },
      { title: 'Issue the refund', kind: 'approval', tool: 'shopify_create_refund', ability: SHOPIFY },
      { title: 'Reply to the customer', kind: 'approval', tool: 'gmail_send', ability: GMAIL },
    ],
    abilities: [GMAIL, SHOPIFY],
    rules: [
      { tool: 'gmail_search', decision: 'allow' },
      { tool: 'gmail_get_thread', decision: 'allow' },
      { tool: 'gmail_create_draft', decision: 'allow' },
      { tool: 'gmail_modify_labels', decision: 'allow' },
      { tool: 'shopify_preview_refund', decision: 'allow' },
      { tool: 'shopify_create_refund', decision: 'ask' },
      { tool: 'gmail_send', decision: 'ask' },
    ],
    keys: [...GMAIL_KEYS, ...SHOPIFY_KEYS],
    needsApprovals: true,
    skill: {
      description: 'Handle new refund and return requests: check each against the order and our return policy, propose the refund, and reply.',
      body: `1. Find requests with gmail_search, query "is:unread in:inbox (refund OR return OR damaged OR broken OR "money back")". Read each conversation with gmail_get_thread. If an email isn't really a refund or return request, leave it unread for the support team.
2. Find the order with shopify_find_orders (the order number they give, or their email) and read it with shopify_get_order: what was bought, when, how much, what's already been refunded, whether it was delivered.
3. Check the request against our return policy in the return-policy skill (open it with Skill): the return window, whether the item is eligible, and whether the reason is covered.
4. Decide what to propose: a full refund, a partial refund, refunding shipping, or no refund (and which part of the policy says so).
5. Work out the exact amount with shopify_preview_refund. Never state an amount you haven't previewed.
6. Issue it with shopify_create_refund, with a note giving the policy rule and the facts from the order. A person approves it first.
7. Once the refund is done, reply with gmail_send (reply_to_message_id set): what was refunded, to which payment method, and that it takes 5–10 business days to arrive. Then mark the email read with gmail_modify_labels.

- If the refund is denied, don't try again; save a reply with gmail_create_draft explaining what you'd suggest instead, and star the email for a person.
- If the order can't be found, ask the customer for the order number.`,
    },
    startMessage: 'Handle new refund and return requests in the support inbox.',
    newAgent: {
      name: 'refund-approvals',
      systemPrompt: `You handle refund and return requests for our store.

Rules:
- Never refund more than was paid, and never refund an order twice: check its refunds first.
- Every amount you state comes from a refund preview, and every decision from your return-policy skill; never guess either.
- If a customer mentions a chargeback, a lawyer or a safety problem, don't act; leave it for a person.`,
    },
    skills: [RETURN_POLICY],
    notes: [policiesNote('your return policy', 'return-policy')],
  }),

  example('incident-triage', 'Operations', { message: "When our alerting tool sends an alert, rate how bad it is, check GitHub for the deploys and merged changes that likely caused it, and send me a short summary in Slack. Ask me before opening or commenting on an issue.", apps: ["GitHub", "Slack"], asksFirst: ["opening or commenting on issues"] }, {
    name: 'Triage an incident',
    id: 'triage-incident',
    summary: 'Takes an alert or a bug report, works out what broke and how bad it is, finds the deploys and changes that likely caused it, and sends you a summary. Opening or commenting on issues waits for approval.',
    trigger: { kind: 'on_request', description: 'when your alerting tool calls its webhook, or someone passes it an alert in Chat or Slack' },
    parameters: { alert: { description: 'The alert, error or bug report', required: true } },
    steps: [
      { title: 'Summarise it and rate the severity', kind: 'other' },
      { title: 'Find recent deploys and failed builds', kind: 'tool', tool: 'github_actions_list', detail: 'from the GitHub app' },
      { title: 'Find recently merged changes', kind: 'tool', tool: 'github_list_pull_requests', detail: 'and github_list_commits for detail' },
      { title: 'Check whether it\'s already known', kind: 'tool', tool: 'github_search_issues', detail: 'and github_issue_read for a match' },
      { title: 'Add findings to the issue, or open one', kind: 'approval', tool: 'github_issue_write', detail: 'or github_add_issue_comment' },
      { title: 'End with the summary', kind: 'other', detail: 'sent to you when the run finishes' },
    ],
    abilities: [],
    apps: [{ id: GITHUB_APP, title: 'GitHub', tools: ['list_commits', 'list_pull_requests', 'actions_list', 'search_issues', 'issue_read', 'issue_write', 'add_issue_comment'] }],
    rules: [
      { tool: 'github_issue_write', decision: 'ask' },
      { tool: 'github_add_issue_comment', decision: 'ask' },
    ],
    keys: [],
    needsApprovals: true,
    skill: {
      description: 'Triage an alert, error or bug report: what broke, how bad it is, and the change that likely caused it.',
      body: `Triage this alert: $alert

1. Summarise it in two sentences: what is failing and who is affected.
2. Rate the severity: SEV1 (customers can't use the product), SEV2 (a major feature is broken), SEV3 (degraded or a workaround exists), SEV4 (minor).
3. Find what changed shortly before it started: github_actions_list (method list_workflow_runs) for recent deploys and failed builds, github_list_pull_requests (state closed) for recently merged changes, and github_list_commits (narrowed with since and path) for detail. Match times carefully.
4. Check whether it's already known with github_search_issues; read a match with github_issue_read (method get).
5. If an issue already tracks it, add your findings with github_add_issue_comment; otherwise, for SEV1 or SEV2, open one with github_issue_write (method create). Both ask a person first.
6. End with the summary: what's broken, severity, the most likely cause with links, and one next step (who should look, what to check, or whether to roll back). Keep it short enough to read on a phone.`,
    },
    startMessage: 'Triage this alert: $alert',
    newAgent: {
      name: 'incident-triage',
      systemPrompt: `You help the on-call engineer triage incidents.

Our repository on GitHub: [owner/name] (edit this). Pass its owner and repo to every GitHub tool.

Rules:
- Only read on your own; never roll anything back yourself.
- Say how sure you are. If the evidence is thin, say what would confirm it instead of guessing.`,
    },
    notes: ['Send it alerts: add a webhook to this workflow (Workflows tab) with "Message me the result when it finishes" on, and paste its URL into your alerting tool; or mention it in Slack, or paste an alert into Chat'],
  }),

  example('expense-approvals', 'Finance', { message: "Every 15 minutes, read new claims in the claims inbox with their receipts, check each against our expense policy, and email the approver a one-line verdict. Never approve or pay anything yourself.", apps: ["Gmail"], asksFirst: ["replying to the claimant"] }, {
    name: 'Check expense claims',
    id: 'check-expense-claims',
    summary: 'Checks the claims inbox, reads each claim and its receipt, checks it against your expense policy, and sends the approver a one-line verdict. Replies to claimants wait for your approval.',
    trigger: { kind: 'schedule', description: 'every 15 minutes, for new claims', every: '15m' },
    steps: [
      { title: 'Find new claims', kind: 'tool', tool: 'gmail_search', ability: GMAIL },
      { title: 'Read each claim and its receipt', kind: 'tool', tool: 'gmail_get_thread', ability: GMAIL },
      { title: 'Check it against the expense policy', kind: 'other', detail: 'from its expense-policy skill' },
      { title: 'Email the approver the verdict', kind: 'approval', tool: 'gmail_send', ability: GMAIL },
      { title: 'Mark the claim done', kind: 'tool', tool: 'gmail_modify_labels', ability: GMAIL },
    ],
    abilities: [GMAIL],
    rules: [
      { tool: 'gmail_search', decision: 'allow' },
      { tool: 'gmail_get_thread', decision: 'allow' },
      { tool: 'gmail_create_draft', decision: 'allow' },
      { tool: 'gmail_modify_labels', decision: 'allow' },
      { tool: 'gmail_send', decision: 'ask' },
    ],
    keys: [...GMAIL_KEYS],
    needsApprovals: true,
    skill: {
      description: 'Check new expense claims in the inbox against our expense policy and send the approver a verdict.',
      body: `1. Find new claims with gmail_search, query "is:unread in:inbox". Read each with gmail_get_thread.
2. Read the amount, currency, date, merchant, category and who submitted it, from the email and its receipt (the attachment names show whether a receipt is there).
3. Check it against our expense policy in the expense-policy skill (open it with Skill): the category is allowed, it's under the limit, the receipt matches the amount and date, and it isn't a duplicate of an earlier claim (search the inbox for the same merchant and amount).
4. Write a one-line verdict: "Within policy" or "Outside policy: <reason>", then the details you checked.
5. Email the verdict to the approver at the address in the EXPENSE_APPROVER_EMAIL setting with gmail_send, then mark the claim read with gmail_modify_labels.

- If the receipt is missing or unreadable, draft a reply to the claimant asking for it with gmail_create_draft; don't fill in values.
- If the policy doesn't cover the case, say which part is unclear rather than deciding.`,
    },
    startMessage: 'Check the new expense claims in the inbox.',
    newAgent: {
      name: 'expense-approvals',
      systemPrompt: `You check expense claims against our expense policy, in your expense-policy skill.

Rules:
- Never approve or pay a claim yourself. A person always decides.
- Judge only by the policy and the receipt; never fill in a value you can't read.`,
    },
    skills: [EXPENSE_POLICY],
    notes: [policiesNote('your expense policy', 'expense-policy'), 'Set EXPENSE_APPROVER_EMAIL (Environment tab) to the approver\'s address'],
  }),

  example('lead-follow-up', 'Sales', { message: "Every hour, pick up new leads in HubSpot, research each company on the web, and send a short, personal first email. Ask me before sending, and before updating the lead.", apps: ["HubSpot", "Firecrawl", "Gmail"], asksFirst: ["sending the first email", "updating the lead"] }, {
    name: 'Lead follow-up',
    id: 'lead-follow-up',
    summary: 'Every hour, picks up new leads in HubSpot, researches each on the web, and sends a short, personal first email. Sending and updating the CRM wait for your approval.',
    trigger: { kind: 'schedule', description: 'every hour, for new leads', every: '1h' },
    steps: [
      { title: 'Find new leads', kind: 'tool', tool: 'hubspot_find_contacts', ability: HUBSPOT },
      { title: 'Skip anyone already being handled', kind: 'tool', tool: 'hubspot_get_contact', ability: HUBSPOT },
      { title: 'Research them on the web', kind: 'tool', tool: 'firecrawl_search', detail: 'and firecrawl_scrape, from the Firecrawl app' },
      { title: 'Send a short first email', kind: 'approval', tool: 'gmail_send', ability: GMAIL },
      { title: 'Log it in HubSpot', kind: 'tool', tool: 'hubspot_add_note', ability: HUBSPOT },
      { title: 'Update the lead\'s status', kind: 'approval', tool: 'hubspot_update_contact', ability: HUBSPOT },
    ],
    abilities: [HUBSPOT, GMAIL],
    apps: [{ id: FIRECRAWL_APP, title: 'Firecrawl', tools: ['firecrawl_search', 'firecrawl_scrape'] }],
    rules: [
      { tool: 'firecrawl_search', decision: 'allow' },
      { tool: 'firecrawl_scrape', decision: 'allow' },
      { tool: 'hubspot_add_note', decision: 'allow' },
      { tool: 'hubspot_update_contact', decision: 'ask' },
      { tool: 'hubspot_create_contact', decision: 'deny' },
      { tool: 'gmail_send', decision: 'ask' },
    ],
    keys: ['HUBSPOT_ACCESS_TOKEN', ...GMAIL_KEYS],
    needsApprovals: true,
    skill: {
      description: 'Follow up with new leads in HubSpot: research each one and send a short, personal first email.',
      body: `1. Find new leads with hubspot_find_contacts: lead_status "NEW", created_in_last_days 2.
2. For each, read hubspot_get_contact. Skip anyone with an owner, recent notes, or a last-contacted date: someone is already on it.
3. Research them with firecrawl_search and firecrawl_scrape: what their company does, its size, and anything recent that matters (funding, hiring, a launch). Note your sources.
4. Work out what they most likely need from us, in one sentence.
5. Send a short first email (under 120 words) with gmail_send: a specific opening based on your research, one sentence on how we help with that need, and one easy question to reply to. A person approves it first.
6. Log what you sent and found with hubspot_add_note, and set the lead to "ATTEMPTED_TO_CONTACT" with hubspot_update_contact.

- If the lead looks like a competitor, a student or spam, add a note saying so and don't email them.`,
    },
    startMessage: 'Follow up with the new leads in HubSpot.',
    newAgent: {
      name: 'lead-follow-up',
      systemPrompt: `You follow up with new leads for our business.

What we sell (edit this):
- [What your product does, in one sentence]
- [Who it is for]
- [The one result customers care about most]

Rules:
- Never invent facts about a lead. If research finds nothing reliable, write a simple, honest email instead.
- No pressure tactics, fake urgency or discounts you weren't told about.`,
    },
    notes: ['Edit "What we sell" at the top of its instructions (Overview tab)'],
  }),

  example('inbox-to-tasks', 'Operations', { message: "Every 10 minutes, turn each request in our shared inbox into a GitHub issue with an owner and a due date, then tell the sender who is handling it. Let me approve the reply.", apps: ["Gmail", "GitHub"], asksFirst: ["replying to the sender"] }, {
    name: 'Inbox to tasks',
    id: 'inbox-to-tasks',
    summary: 'Checks a shared inbox every 10 minutes and turns each request into a task (a GitHub issue) with an owner and a due date, then tells the sender who is handling it.',
    trigger: { kind: 'schedule', description: 'every 10 minutes, for new emails', every: '10m' },
    steps: [
      { title: 'Find new emails', kind: 'tool', tool: 'gmail_search', ability: GMAIL },
      { title: 'Read each one', kind: 'tool', tool: 'gmail_get_thread', ability: GMAIL },
      { title: 'Check for an existing task', kind: 'tool', tool: 'github_search_issues', detail: 'from the GitHub app' },
      { title: 'Open the task, or add to it', kind: 'tool', tool: 'github_issue_write', detail: 'or github_add_issue_comment' },
      { title: 'Tell the sender who is handling it', kind: 'approval', tool: 'gmail_send', ability: GMAIL },
      { title: 'Mark the email done', kind: 'tool', tool: 'gmail_modify_labels', ability: GMAIL },
    ],
    abilities: [GMAIL],
    apps: [{ id: GITHUB_APP, title: 'GitHub', tools: ['search_issues', 'issue_write', 'add_issue_comment'] }],
    rules: [
      { tool: 'gmail_search', decision: 'allow' },
      { tool: 'gmail_get_thread', decision: 'allow' },
      { tool: 'gmail_modify_labels', decision: 'allow' },
      { tool: 'github_issue_write', decision: 'allow' },
      { tool: 'github_add_issue_comment', decision: 'allow' },
      { tool: 'gmail_send', decision: 'ask' },
    ],
    keys: [...GMAIL_KEYS],
    needsApprovals: true,
    skill: {
      description: 'Turn new emails in the shared inbox into tasks (GitHub issues) with an owner and a due date, and tell each sender.',
      body: `1. Find new emails with gmail_search, query "is:unread in:inbox". Read each with gmail_get_thread.
2. Decide whether it's a request someone needs to act on. Newsletters, receipts, out-of-office replies and spam are not: mark them read and move on.
3. Check whether a task already exists with github_search_issues (the sender and subject). If so, add the new details with github_add_issue_comment instead.
4. Otherwise open one with github_issue_write (method create): a short title starting with a verb, a two-line summary, the sender, the due date (the date they asked for, or 2 working days if they didn't say), and the owner from "Who handles what" as the assignee.
5. Reply to the sender with gmail_send (reply_to_message_id set): who is handling it and by when. A person approves it first.
6. Mark the email read with gmail_modify_labels.

- If an email holds several requests, make one task for each.`,
    },
    startMessage: 'Turn the new emails in the shared inbox into tasks.',
    newAgent: {
      name: 'inbox-to-tasks',
      systemPrompt: `You turn requests in our shared inbox into tasks, kept as GitHub issues.

Tasks live in this GitHub repository: [owner/name] (edit this). Pass its owner and repo to every GitHub tool.

Who handles what (edit this; GitHub usernames):
- Billing and invoices: [username]
- Technical problems: [username]
- Everything else: [username]

Rules:
- Never promise a fix or a refund to a sender; only say who is handling it and by when.`,
    },
    notes: ['Edit "Who handles what" and the repository at the top of its instructions (Overview tab)'],
  }),

  example('weekly-research-digest', 'Research', { message: "Every Monday at 9, search the web for last week's news on our topics and competitors, and send me a short digest with links.", apps: ["Firecrawl", "Slack"], asksFirst: [] }, {
    name: 'Weekly research digest',
    id: 'weekly-research-digest',
    summary: 'Every Monday morning, searches the web for news on the topics you choose and sends you a short digest with links.',
    trigger: { kind: 'schedule', description: 'Mondays at 09:00', every: '7d', at: '09:00', weekday: 1 },
    steps: [
      { title: 'Search for this week\'s news on each topic', kind: 'tool', tool: 'firecrawl_search', detail: 'from the Firecrawl app' },
      { title: 'Read the most relevant pages', kind: 'tool', tool: 'firecrawl_scrape' },
      { title: 'Write the digest', kind: 'other', detail: 'sent to you when the run finishes' },
    ],
    abilities: [],
    apps: [{ id: FIRECRAWL_APP, title: 'Firecrawl', tools: ['firecrawl_search', 'firecrawl_scrape'] }],
    rules: [
      { tool: 'firecrawl_search', decision: 'allow' },
      { tool: 'firecrawl_scrape', decision: 'allow' },
    ],
    keys: [],
    needsApprovals: false,
    notify: { on: true, reason: 'The digest is the result, and no step posts it.' },
    skill: {
      description: 'Write this week\'s research digest on the topics to follow.',
      body: `1. Search the web with firecrawl_search for what happened in the last 7 days on each topic you follow.
2. Open the most relevant pages with firecrawl_scrape and read them; don't rely on search snippets.
3. Write the digest: for each topic, up to three items, each with a one-sentence summary, why it matters to us, and the link.
4. End with "Worth a closer look": the single most important item, and why.
5. Answer with the digest alone, nothing before or after it: it's sent as it is.`,
    },
    startMessage: 'Write this week\'s research digest.',
    newAgent: {
      name: 'weekly-research-digest',
      systemPrompt: `You follow news for our team and write research digests.

Topics to follow (edit this list):
- [Your industry or market]
- [Competitors, by name]
- [Technologies or regulations you care about]

Rules:
- Only include things published in the period you're asked about, and give each item's date.
- Prefer original sources over aggregators. Never invent a link.
- If a topic had no real news, say so in one line.`,
    },
    notes: ['Edit "Topics to follow" at the top of its instructions (Overview tab)'],
  }),
]

export function workflowExample(id: string): WorkflowExample | undefined {
  return WORKFLOW_EXAMPLES.find((e) => e.id === id)
}
