// Playbook v1 for the goal planner (core/system-agents/goal-planner.ts):
// proven levers by focus. A lever is one way to move a kind of goal, the
// idea behind a workflow, general enough to fit many businesses. The
// planner starts from the levers for the brief's focus, adapts the ones
// that fit to the person's context, and may add its own ideas, labelled
// as new. Ids are the stable names saved drafts, dismissals and eval
// expectations refer to: change a lever's wording freely, never its id.
//
// A lever describes a mechanism, never a promised result: why it tends
// to move the measure, and how to see whether it does.

export type GoalFocus = 'new-signups' | 'activation' | 'retention' | 'faster-support' | 'revenue-recovery' | 'ops-hygiene'

export const GOAL_FOCUSES: readonly GoalFocus[] = ['new-signups', 'activation', 'retention', 'faster-support', 'revenue-recovery', 'ops-hygiene']

export interface Lever {
  /** `<focus>.<name>`, stable. */
  id: string
  focus: GoalFocus
  name: string
  /** Why it works, in a sentence: shown as the plan's "Why". */
  mechanism: string
  fitsWhen: string[]
  notWhen: string[]
  /** What a workflow for it uses: any one of `anyOf`, plus each of `plus`.
   * Names are kinds of app or ability (email, messaging, web-search…). */
  needs: { anyOf?: string[]; plus?: string[] }
  /** The person's review time it usually takes. */
  humanMinutesPerWeek: number
  /** Days until it first shows something. */
  firstResultDays: number
  /** How its effect on the measure shows up. */
  measureLink: string
  /** Rules every workflow built from it keeps. */
  guardrails: string[]
  /** The request it starts from, with {placeholders} filled from context. */
  template: string
}

const APPROVE = 'Nothing is posted, sent or published without the person’s approval.'

export const LEVERS: readonly Lever[] = [
  // ---- New signups: bringing new people in.
  {
    id: 'new-signups.answer-intent-posts', focus: 'new-signups', name: 'Answer people asking for what you do',
    mechanism: 'People with the problem ask about it in public; a genuinely helpful answer at that moment earns attention and clicks.',
    fitsWhen: ['the problem is discussed in public communities', 'the audience is individuals or small teams'],
    notWhen: ['buyers are reached only through enterprise sales', 'the communities forbid any mention of products'],
    needs: { anyOf: ['web-search', 'reddit', 'x'], plus: ['messaging'] }, humanMinutesPerWeek: 100, firstResultDays: 1,
    measureLink: 'signups tagged ref=community',
    guardrails: [APPROVE, 'Answer the question first; mention the product only where it fits.', 'Say plainly that the person works on the product.'],
    template: 'Every weekday at 9:00, find up to {count} posts from the last day in {communities} where someone asks {intent_phrases}. For each, send me in {channel} the link, a one-line summary and a drafted reply that answers their question first; mention {product} only where it fits and say I work on it. Never post anything yourself.',
  },
  {
    id: 'new-signups.directory-listings', focus: 'new-signups', name: 'Get listed where people look for tools',
    mechanism: 'Directories, curated lists and comparison articles send visitors for months to every product they include.',
    fitsWhen: ['the product is software people choose from lists', 'there are directories or curated lists for the category'],
    notWhen: ['the product is a local or offline service'],
    needs: { anyOf: ['web-search'] }, humanMinutesPerWeek: 30, firstResultDays: 7,
    measureLink: 'signups tagged ref=directory',
    guardrails: [APPROVE, 'One honest submission per list; follow each list’s rules.'],
    template: 'Every Monday, find {count} directories, curated lists and comparison articles for {category} that don’t include {product}, and draft the submission, pull request or note to the author for each. Send them to me in {channel}; I submit them.',
  },
  {
    id: 'new-signups.use-case-pages', focus: 'new-signups', name: 'A page for each job people search for',
    mechanism: 'People search for the job, not the product; a page answering that job brings visitors from search for a long time.',
    fitsWhen: ['the product does several distinct jobs people search for', 'the person can publish pages'],
    notWhen: ['there is no website to publish on'],
    needs: { anyOf: ['web-search'] }, humanMinutesPerWeek: 45, firstResultDays: 14,
    measureLink: 'signups tagged ref=page-<job>',
    guardrails: [APPROVE, 'Only claim what the product really does.'],
    template: 'Every Wednesday, pick the job people asked about most this week ({source}), check that people search for it, and draft a page for {site}: the problem, how {product} does it, and a start link. Send me the draft; I publish it.',
  },
  {
    id: 'new-signups.creator-outreach', focus: 'new-signups', name: 'Pitch creators who cover this space',
    mechanism: 'One newsletter, video or blog mention reaches thousands of the right people at once.',
    fitsWhen: ['creators cover the category or its competitors', 'there is something worth showing them'],
    notWhen: ['nothing public to point creators to yet'],
    needs: { anyOf: ['web-search'], plus: ['email'] }, humanMinutesPerWeek: 30, firstResultDays: 14,
    measureLink: 'signups tagged ref=creator-<name>',
    guardrails: [APPROVE, 'Personal pitches tied to what each creator made; no bulk sends.'],
    template: 'Every Thursday, find {count} newsletters, channels or blogs that covered {competitors_or_topic} this month, and draft a short personal pitch for each tied to what they made. Send them to me for approval before anything is sent.',
  },
  {
    id: 'new-signups.competitor-switchers', focus: 'new-signups', name: 'Help people unhappy with a competitor',
    mechanism: 'People complaining about the tool they use are the easiest to win, if the answer is helpful rather than a pitch.',
    fitsWhen: ['there are well-known competitors people complain about publicly'],
    notWhen: ['the category has no visible competitors'],
    needs: { anyOf: ['web-search', 'reddit', 'x'], plus: ['messaging'] }, humanMinutesPerWeek: 45, firstResultDays: 2,
    measureLink: 'signups tagged ref=switcher',
    guardrails: [APPROVE, 'Never disparage competitors; help with the problem.'],
    template: 'Every day, find posts complaining about {competitors} ({pain_points}) and draft a helpful reply for each, mentioning {product} only where it solves the problem. Send them to me in {channel}; never post yourself.',
  },
  {
    id: 'new-signups.marketplace-listings', focus: 'new-signups', name: 'List in the marketplaces your users already use',
    mechanism: 'App stores and integration marketplaces put the product in front of people already looking inside the tools they use.',
    fitsWhen: ['the product integrates with platforms that have marketplaces (Shopify, Slack, Zapier…)'],
    notWhen: ['no integrations with marketplace platforms'],
    needs: { anyOf: ['web-search'] }, humanMinutesPerWeek: 20, firstResultDays: 14,
    measureLink: 'signups tagged ref=marketplace-<name>',
    guardrails: [APPROVE],
    template: 'Find the marketplaces for {platforms} where {product} could be listed, check what each needs, and draft each listing for me to submit. Check monthly for new ones.',
  },
  {
    id: 'new-signups.local-reviews', focus: 'new-signups', name: 'Ask happy customers for reviews',
    mechanism: 'New customers choose by reviews; asking satisfied customers at the right moment multiplies them.',
    fitsWhen: ['a business whose customers pick by reviews (local services, shops, apps)'],
    notWhen: ['no customers yet'],
    needs: { anyOf: ['email', 'sms'], plus: ['orders-or-crm'] }, humanMinutesPerWeek: 15, firstResultDays: 7,
    measureLink: 'new reviews per week, and enquiries after them',
    guardrails: [APPROVE, 'Ask only customers whose order went well; never offer rewards for reviews.'],
    template: 'Each day, find customers whose {order_or_job} was completed {days} days ago without a complaint, and draft a short personal request for a review on {review_site}. Send them after I approve.',
  },

  // ---- Activation: helping people who signed up get value.
  {
    id: 'activation.personal-welcome', focus: 'activation', name: 'A personal welcome',
    mechanism: 'A personal note in the first hour gets replies and tells new users someone will help them succeed.',
    fitsWhen: ['signups can be detected (webhook or list)', 'few enough signups to read each one'],
    notWhen: ['thousands of signups a day'],
    needs: { anyOf: ['email'], plus: ['signup-events'] }, humanMinutesPerWeek: 30, firstResultDays: 1,
    measureLink: 'share of new signups who complete the first key step',
    guardrails: [APPROVE],
    template: 'When someone signs up, draft a short personal welcome from me that points to {first_step} and offers help. Send after I approve.',
  },
  {
    id: 'activation.first-step-nudge', focus: 'activation', name: 'Nudge people who haven’t taken the first step',
    mechanism: 'Most signups stall before the first success; a timely, specific nudge brings many back.',
    fitsWhen: ['the first key step can be checked for each user'],
    notWhen: ['there is no way to see what a user has done'],
    needs: { anyOf: ['email'], plus: ['usage-data'] }, humanMinutesPerWeek: 20, firstResultDays: 3,
    measureLink: 'share of nudged users who then take the first step',
    guardrails: [APPROVE, 'At most one nudge per user per week.'],
    template: 'Every day at 10:00, find users who signed up {days} days ago and haven’t {first_step} yet, and draft a short check-in asking what they’re trying to do and offering help. Send after I approve.',
  },
  {
    id: 'activation.stuck-user-help', focus: 'activation', name: 'Spot users who are stuck',
    mechanism: 'Errors and repeated failed attempts mark people about to give up; reaching out first saves them.',
    fitsWhen: ['errors or failed attempts are visible per user'],
    notWhen: ['no usage or error data'],
    needs: { anyOf: ['usage-data'], plus: ['messaging'] }, humanMinutesPerWeek: 30, firstResultDays: 2,
    measureLink: 'stuck users who succeed within a week',
    guardrails: [APPROVE],
    template: 'Every day, find users who hit {error_signal} more than {times} times, and send me in {channel} who they are, what failed and a drafted offer of help.',
  },

  // ---- Retention: keeping people who already use it.
  {
    id: 'retention.value-recap', focus: 'retention', name: 'Show users what they got',
    mechanism: 'People keep what they can see working; a short recap of results makes value visible.',
    fitsWhen: ['the product produces results that can be counted per user'],
    notWhen: ['no per-user results'],
    needs: { anyOf: ['email', 'messaging'], plus: ['usage-data'] }, humanMinutesPerWeek: 10, firstResultDays: 7,
    measureLink: 'renewal or weekly active rate of recapped users',
    guardrails: [APPROVE],
    template: 'Every Monday, for each active user, draft a short recap of what {product} did for them last week ({results}). Send after I approve the first week; then send weekly.',
  },
  {
    id: 'retention.quiet-account-check', focus: 'retention', name: 'Check in with accounts going quiet',
    mechanism: 'Usage drops before people leave; a check-in at the drop finds the reason while there is still time.',
    fitsWhen: ['usage per account can be tracked'],
    notWhen: ['no usage data'],
    needs: { anyOf: ['email'], plus: ['usage-data'] }, humanMinutesPerWeek: 20, firstResultDays: 7,
    measureLink: 'quiet accounts that become active again',
    guardrails: [APPROVE],
    template: 'Every week, find accounts whose use dropped by more than half compared with their usual, and draft a personal check-in asking whether something got in the way. Send after I approve.',
  },
  {
    id: 'retention.feedback-after-success', focus: 'retention', name: 'Ask for feedback right after a success',
    mechanism: 'Asking at a moment of success gets honest feedback and strengthens the habit.',
    fitsWhen: ['successes are visible per user'],
    notWhen: ['no success signal'],
    needs: { anyOf: ['email', 'messaging'], plus: ['usage-data'] }, humanMinutesPerWeek: 10, firstResultDays: 7,
    measureLink: 'feedback received; fixes made from it',
    guardrails: [APPROVE],
    template: 'When a user {success_event} for the first time, draft a one-question note asking what would make {product} more useful. Send after I approve.',
  },

  // ---- Faster support: answering customers sooner and better.
  {
    id: 'faster-support.reply-drafts', focus: 'faster-support', name: 'Draft replies from the customer’s data',
    mechanism: 'Most replies need the same lookups; a draft that already has the order or account facts cuts each reply to a quick check.',
    fitsWhen: ['support questions are about orders, accounts or bookings the agent can look up'],
    notWhen: ['no system with customer data the agent can read'],
    needs: { anyOf: ['helpdesk', 'email'], plus: ['orders-or-crm'] }, humanMinutesPerWeek: 60, firstResultDays: 1,
    measureLink: 'time to first reply; share of drafts sent with few edits',
    guardrails: [APPROVE, 'Use only what the lookups return; never invent dates, amounts or tracking numbers.'],
    template: 'When a customer email arrives in {helpdesk}, look up {customer_data} and draft a reply to their latest message following our policies and special cases. Return the draft for a person to send.',
  },
  {
    id: 'faster-support.triage-routing', focus: 'faster-support', name: 'Sort and route what comes in',
    mechanism: 'Tickets wait longest while nobody knows whose they are; sorting on arrival gets each to the right person or answer.',
    fitsWhen: ['several kinds of request or several people handle them'],
    notWhen: ['one person handles everything and volume is low'],
    needs: { anyOf: ['helpdesk', 'email', 'github'] }, humanMinutesPerWeek: 15, firstResultDays: 1,
    measureLink: 'time to first reply by category',
    guardrails: ['Labels and assignments only; replies still need approval.'],
    template: 'When a new {request_kind} arrives in {inbox}, label it as {categories}, flag urgent ones, and assign it to {owners}.',
  },
  {
    id: 'faster-support.backlog-sweep', focus: 'faster-support', name: 'Sweep the backlog daily',
    mechanism: 'Old unanswered requests hurt most; a daily list of what’s waiting longest stops anything from being forgotten.',
    fitsWhen: ['requests sometimes wait more than a day'],
    notWhen: ['everything is answered within hours already'],
    needs: { anyOf: ['helpdesk', 'email'], plus: ['messaging'] }, humanMinutesPerWeek: 20, firstResultDays: 1,
    measureLink: 'number of requests waiting over 24 hours',
    guardrails: [],
    template: 'Every morning, send me in {channel} the {count} requests waiting longest in {helpdesk}, each with what the customer needs and a drafted reply.',
  },
  {
    id: 'faster-support.faq-gaps', focus: 'faster-support', name: 'Find the questions your help pages don’t answer',
    mechanism: 'The same questions keep coming because the answer isn’t written down; finding them prevents tickets.',
    fitsWhen: ['there are help pages or an FAQ', 'questions repeat'],
    notWhen: ['very few requests'],
    needs: { anyOf: ['helpdesk', 'email'] }, humanMinutesPerWeek: 20, firstResultDays: 7,
    measureLink: 'repeat questions per week',
    guardrails: [APPROVE],
    template: 'Every Friday, group this week’s {helpdesk} questions, find the ones asked three times or more that {help_site} doesn’t answer, and draft a help article for each.',
  },

  // ---- Revenue recovery: getting back money that slipped away.
  {
    id: 'revenue-recovery.failed-payments', focus: 'revenue-recovery', name: 'Follow up failed payments',
    mechanism: 'Many failed payments are expired cards; a friendly, quick note recovers a large share.',
    fitsWhen: ['subscriptions or invoices are paid by card'],
    notWhen: ['no recurring or card payments'],
    needs: { anyOf: ['stripe', 'payments'], plus: ['email'] }, humanMinutesPerWeek: 10, firstResultDays: 1,
    measureLink: 'recovered payments per week',
    guardrails: [APPROVE, 'Never take a payment action yourself.'],
    template: 'When a payment fails in {payments}, draft a friendly note to the customer with a link to update their card. Send after I approve; follow up once after {days} days.',
  },
  {
    id: 'revenue-recovery.abandoned-checkouts', focus: 'revenue-recovery', name: 'Follow up abandoned checkouts',
    mechanism: 'Shoppers who leave at checkout often meant to buy; a timely reminder brings some back.',
    fitsWhen: ['an online store with checkout data'],
    notWhen: ['no online checkout'],
    needs: { anyOf: ['shopify', 'store'], plus: ['email'] }, humanMinutesPerWeek: 15, firstResultDays: 1,
    measureLink: 'recovered checkouts per week',
    guardrails: [APPROVE, 'At most one reminder per checkout.'],
    template: 'Every few hours, find checkouts in {store} abandoned more than {hours} hours ago with an email address, and draft a short reminder. Send after I approve.',
  },
  {
    id: 'revenue-recovery.win-back', focus: 'revenue-recovery', name: 'Win back people who left',
    mechanism: 'Some people who cancelled left for a reason that has since changed; asking why and what’s new brings some back.',
    fitsWhen: ['cancellations are recorded with a date'],
    notWhen: ['no cancelled customers'],
    needs: { anyOf: ['stripe', 'payments', 'orders-or-crm'], plus: ['email'] }, humanMinutesPerWeek: 15, firstResultDays: 14,
    measureLink: 'reactivations per month',
    guardrails: [APPROVE],
    template: 'Every month, find customers who cancelled {months} months ago and draft a personal note asking what made them leave and sharing what has changed since. Send after I approve.',
  },

  // ---- Ops hygiene: keeping the business running without surprises.
  {
    id: 'ops-hygiene.exception-report', focus: 'ops-hygiene', name: 'A daily report of what went wrong',
    mechanism: 'Problems hidden in systems grow; a short daily list of exceptions catches them while they are small.',
    fitsWhen: ['orders, jobs or payments can fail or stall'],
    notWhen: ['nothing to monitor'],
    needs: { anyOf: ['orders-or-crm', 'database', 'stripe'], plus: ['messaging'] }, humanMinutesPerWeek: 20, firstResultDays: 1,
    measureLink: 'exceptions resolved within a day',
    guardrails: ['Report only; changes need approval.'],
    template: 'Every morning, check {systems} for {exception_kinds} from the last day and send me in {channel} a short list, each with what happened and what to do.',
  },
  {
    id: 'ops-hygiene.stuck-items', focus: 'ops-hygiene', name: 'Find what’s stuck',
    mechanism: 'Orders or tasks stuck in one state for days usually mean something broke; finding them early saves customers.',
    fitsWhen: ['items move through states (orders, shipments, tickets)'],
    notWhen: ['no state data'],
    needs: { anyOf: ['orders-or-crm', 'database'], plus: ['messaging'] }, humanMinutesPerWeek: 20, firstResultDays: 1,
    measureLink: 'items stuck longer than the threshold',
    guardrails: ['Report only; changes need approval.'],
    template: 'Every day, find {items} that have been in {state} for more than {days} days and send me in {channel} the list with what each probably needs.',
  },
  {
    id: 'ops-hygiene.deadline-reminders', focus: 'ops-hygiene', name: 'Remind before deadlines',
    mechanism: 'Missed renewals, filings and follow-ups cost money; a reminder with what’s needed arrives in time.',
    fitsWhen: ['recurring deadlines (renewals, invoices, filings)'],
    notWhen: ['no deadlines'],
    needs: { anyOf: ['calendar', 'database', 'records'], plus: ['messaging'] }, humanMinutesPerWeek: 5, firstResultDays: 1,
    measureLink: 'deadlines missed',
    guardrails: [],
    template: 'Every morning, check {deadline_source} for deadlines in the next {days} days and send me in {channel} each with what needs doing.',
  },
]

export function leversFor(focus: GoalFocus): Lever[] {
  return LEVERS.filter((l) => l.focus === focus)
}
