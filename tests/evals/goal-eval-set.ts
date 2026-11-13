// The goal planner's eval set: 30 goals, each with the context the
// planner would know and what a good plan must do. Run with
// `npm run eval:goals` (tests/evals/run-goal-evals.ts); scored by
// tests/evals/goal-scoring.ts. The contexts are made up, except
// LoopEngine's and Everymarket's, which follow our own.
import type { GoalContext, GoalScope, SavedGoalWorkflow } from '#core/system-agents/goal-planner.js'
import type { GoalFocus } from '#core/system-agents/goal-playbooks.js'

export interface GoalEvalCase {
  id: string
  goal: string
  context: GoalContext
  saved?: SavedGoalWorkflow[]
  expect: {
    /** Acceptable scopes. */
    scope: GoalScope[]
    /** Acceptable focuses; any when left out. */
    focus?: (GoalFocus | 'other')[]
    /** At least one of these playbook levers should be in the plan. */
    preferLevers?: string[]
    minWorkflows?: number
    maxWorkflows?: number
    /** What the goal singles out: some workflow's request or covers must
     * mention one of each qualifier's words. */
    qualifiers?: { name: string; anyOf: string[] }[]
  }
}

const sys = (name: string, kind: string, connected: boolean) => ({ name, kind, connected })

const LOOPENGINE: GoalContext = {
  about: 'LoopEngine: an open-source (MIT) platform of AI agents that ask before anything risky, and LoopEngine Cloud, hosted workspaces at <name>.loopengine.app. Website loopengine.co with a blog; code on GitHub (loopengine-co/loopengine); 76 apps and ready-made workflow examples.',
  audience: 'Individuals and small teams who want AI agents for real work (customer emails, alerts, ops) without building them in code; many compare n8n, Zapier and Make.',
  systems: [sys('Firecrawl', 'web-search', true), sys('Telegram', 'messaging', true), sys('GitHub', 'github', true), sys('Gmail', 'email', false), sys('Stripe', 'stripe', false), sys('Clerk signup webhooks', 'signup-events', false), sys('Cloud usage database', 'usage-data', false)],
  agents: [{ name: 'growth-agent', description: 'Growth tasks for the founder: research, drafts, community.' }],
  rules: 'Nothing is posted or sent without approval. Replies say plainly that the founder works on LoopEngine.',
  weeklyHours: 3,
}

const EVERYMARKET: GoalContext = {
  about: 'Everymarket: an online marketplace shipping household goods to US customers. Customer service answers emails in FreeScout; order, shipment, refund and on-the-way status are looked up from the order system.',
  audience: 'Customers who bought on Everymarket and write about orders, shipping, returns and refunds.',
  systems: [sys('FreeScout', 'helpdesk', true), sys('Everymarket order lookups (lp-em-orders)', 'orders-or-crm', true), sys('Slack', 'messaging', true), sys('Gmail', 'email', true), sys('Firecrawl', 'web-search', true)],
  agents: [{ name: 'cs-agent', description: 'Drafts customer replies from order data.' }, { name: 'ops-agent', description: 'Order and shipment checks.' }],
  rules: 'Replies are drafts for a person to send. Never promise refunds or delivery dates the data does not support.',
  weeklyHours: 5,
}

const CANDLE_SHOP: GoalContext = {
  about: 'Wick & Ember: a two-person Shopify store selling hand-poured soy candles, mostly in the US. Instagram is the main social channel.',
  audience: 'Gift buyers and home-fragrance fans, mostly women 25–45.',
  systems: [sys('Shopify', 'shopify', true), sys('Gmail', 'email', true), sys('Telegram', 'messaging', true), sys('Firecrawl', 'web-search', true), sys('Instagram', 'instagram', false)],
  agents: [{ name: 'shop-agent', description: 'Store tasks: orders, customers, product copy.' }],
  weeklyHours: 3,
}

const CONSULTANT: GoalContext = {
  about: 'A freelance data-analytics consultant helping small e-commerce brands with dashboards and reporting.',
  audience: 'Founders and marketing leads at e-commerce brands doing $1–20M a year.',
  systems: [sys('Gmail', 'email', true), sys('Google Calendar', 'calendar', true), sys('Firecrawl', 'web-search', true), sys('Notion', 'records', true), sys('LinkedIn', 'linkedin', false)],
  agents: [{ name: 'assistant', description: 'Personal assistant for the business.' }],
  weeklyHours: 2,
}

const INVOICING_SAAS: GoalContext = {
  about: 'Billwise: a subscription invoicing app for creative agencies, about 400 paying accounts on monthly plans.',
  audience: 'Agency owners and office managers.',
  systems: [sys('Stripe', 'stripe', true), sys('Intercom', 'helpdesk', true), sys('Product database (Postgres)', 'usage-data', true), sys('HubSpot', 'orders-or-crm', true), sys('Slack', 'messaging', true), sys('Gmail', 'email', true), sys('Firecrawl', 'web-search', true), sys('Signup webhooks', 'signup-events', true)],
  agents: [{ name: 'success-agent', description: 'Customer success: onboarding and retention.' }, { name: 'support-agent', description: 'Support inbox.' }],
  weeklyHours: 4,
}

const DENTIST: GoalContext = {
  about: 'Bright Smile Dental: a three-chair dental clinic in Austin, Texas.',
  audience: 'Local families and professionals.',
  systems: [sys('Booking system', 'orders-or-crm', true), sys('Twilio SMS', 'sms', true), sys('Gmail', 'email', true), sys('Google Business reviews', 'reviews', false)],
  agents: [{ name: 'front-desk', description: 'Appointments and patient messages.' }],
  weeklyHours: 1,
}

const SHELTER: GoalContext = {
  about: 'Second Chance Paws: a volunteer-run animal shelter with a small donor base.',
  audience: 'Local animal lovers, past adopters, donors.',
  systems: [sys('Donor CRM (Bloomerang)', 'orders-or-crm', true), sys('Gmail', 'email', true), sys('Firecrawl', 'web-search', true), sys('Facebook page', 'facebook', false)],
  agents: [{ name: 'shelter-agent', description: 'Donor and volunteer communication.' }],
  weeklyHours: 2,
}

const HABIT_APP: GoalContext = {
  about: 'Streaky: an indie iOS habit-tracking app with a free tier and a yearly subscription.',
  audience: 'People building habits; many find apps through the App Store, Reddit and TikTok.',
  systems: [sys('Firebase analytics', 'usage-data', true), sys('Gmail', 'email', true), sys('Discord community', 'messaging', true), sys('Firecrawl', 'web-search', true), sys('App Store Connect', 'app-store', false)],
  agents: [{ name: 'app-agent', description: 'Growth and community for the app.' }],
  weeklyHours: 3,
}

const PERSONAL: GoalContext = {
  about: 'An individual using LoopEngine for personal projects.',
  systems: [sys('Gmail', 'email', true), sys('Google Calendar', 'calendar', true), sys('Telegram', 'messaging', true), sys('Firecrawl', 'web-search', true)],
  agents: [{ name: 'personal-agent', description: 'Personal assistant.' }],
  weeklyHours: 2,
}

export const GOAL_EVAL_SET: GoalEvalCase[] = [
  // LoopEngine
  { id: 'le-grow-100', goal: 'I want to grow LoopEngine Cloud users to 100.', context: LOOPENGINE, expect: { scope: ['in'], focus: ['new-signups'], preferLevers: ['new-signups.answer-intent-posts', 'new-signups.directory-listings', 'new-signups.competitor-switchers'] } },
  { id: 'le-grow-vague', goal: 'grow loopengine', context: LOOPENGINE, expect: { scope: ['in'], focus: ['new-signups', 'activation'] } },
  { id: 'le-activate', goal: 'More of our Cloud signups should actually build a workflow.', context: LOOPENGINE, expect: { scope: ['in'], focus: ['activation'], preferLevers: ['activation.first-step-nudge', 'activation.personal-welcome', 'activation.stuck-user-help'] } },
  {
    id: 'le-generate-more', goal: 'I want to grow LoopEngine Cloud users to 100, mostly small e-commerce shops.', context: LOOPENGINE,
    saved: [
      { title: 'Answer people asking for this', lever: 'answer intent posts', leverId: 'new-signups.answer-intent-posts', state: 'built' },
      { title: 'Get listed where people look for tools', lever: 'directory listings', leverId: 'new-signups.directory-listings', state: 'proposed' },
      { title: 'Pitch creators who cover this space', lever: 'creator outreach', leverId: 'new-signups.creator-outreach', state: 'dismissed' },
    ],
    expect: { scope: ['in'], focus: ['new-signups'], minWorkflows: 1, qualifiers: [{ name: 'small e-commerce shops', anyOf: ['e-commerce', 'ecommerce', 'shopify', 'store owner', 'shop owner', 'merchant', 'woocommerce', 'etsy', 'online store'] }] },
  },
  { id: 'le-moonshot', goal: 'Our moonshot: 10,000 LoopEngine users.', context: LOOPENGINE, expect: { scope: ['in'], focus: ['new-signups'] } },
  { id: 'le-stars', goal: 'Get LoopEngine to 5,000 GitHub stars.', context: LOOPENGINE, expect: { scope: ['in'], focus: ['new-signups', 'other'] } },
  // Everymarket
  { id: 'em-faster', goal: 'Answer customers faster.', context: EVERYMARKET, expect: { scope: ['in'], focus: ['faster-support'], preferLevers: ['faster-support.reply-drafts', 'faster-support.backlog-sweep', 'faster-support.triage-routing'] } },
  { id: 'em-2h', goal: 'First reply to every customer email within 2 hours.', context: EVERYMARKET, expect: { scope: ['in'], focus: ['faster-support'], qualifiers: [{ name: 'within 2 hours', anyOf: ['2 hour', 'two hour', '2h', '120 min', '90 min', 'hour'] }] } },
  { id: 'em-stuck-orders', goal: 'No order should sit unshipped for more than 3 days without us knowing.', context: EVERYMARKET, expect: { scope: ['in'], focus: ['ops-hygiene'], preferLevers: ['ops-hygiene.stuck-items', 'ops-hygiene.exception-report'] } },
  { id: 'em-fewer-wismo', goal: "Fewer 'where is my order' emails.", context: EVERYMARKET, expect: { scope: ['in'], focus: ['faster-support', 'ops-hygiene'] } },
  {
    id: 'em-generate-more', goal: 'Answer customers faster, especially about refunds.', context: EVERYMARKET,
    saved: [
      { title: 'Draft replies from order data', lever: 'reply drafts', leverId: 'faster-support.reply-drafts', state: 'built' },
      { title: 'Sort and route what comes in', lever: 'triage and routing', leverId: 'faster-support.triage-routing', state: 'proposed' },
    ],
    expect: { scope: ['in'], focus: ['faster-support'], minWorkflows: 1, qualifiers: [{ name: 'refunds', anyOf: ['refund'] }] },
  },
  // Candle shop
  { id: 'shop-sales', goal: 'Sell more candles online.', context: CANDLE_SHOP, expect: { scope: ['in'], focus: ['new-signups', 'revenue-recovery'] } },
  { id: 'shop-carts', goal: 'Recover more abandoned carts.', context: CANDLE_SHOP, expect: { scope: ['in'], focus: ['revenue-recovery'], preferLevers: ['revenue-recovery.abandoned-checkouts'] } },
  { id: 'shop-reviews', goal: 'Get more 5-star reviews.', context: CANDLE_SHOP, expect: { scope: ['in'], focus: ['new-signups', 'other'], preferLevers: ['new-signups.local-reviews'] } },
  { id: 'shop-christmas', goal: 'Make this Christmas our best season ever.', context: CANDLE_SHOP, expect: { scope: ['in'], focus: ['new-signups', 'revenue-recovery'], qualifiers: [{ name: 'Christmas', anyOf: ['christmas', 'holiday', 'gift', 'december'] }] } },
  // Consultant
  { id: 'cons-clients', goal: 'Land 3 new consulting clients this quarter.', context: CONSULTANT, expect: { scope: ['in'], focus: ['new-signups'] } },
  { id: 'cons-admin', goal: 'Spend less time on admin.', context: CONSULTANT, expect: { scope: ['in'], focus: ['ops-hygiene', 'other'] } },
  // Invoicing SaaS
  { id: 'saas-churn', goal: 'Reduce churn below 3% a month.', context: INVOICING_SAAS, expect: { scope: ['in'], focus: ['retention'], preferLevers: ['retention.quiet-account-check', 'retention.value-recap', 'retention.feedback-after-success'] } },
  { id: 'saas-failed-payments', goal: 'Stop losing revenue to failed payments.', context: INVOICING_SAAS, expect: { scope: ['in'], focus: ['revenue-recovery'], preferLevers: ['revenue-recovery.failed-payments'] } },
  { id: 'saas-first-invoice', goal: 'New accounts should send their first invoice within a day.', context: INVOICING_SAAS, expect: { scope: ['in'], focus: ['activation'], preferLevers: ['activation.first-step-nudge', 'activation.personal-welcome', 'activation.stuck-user-help'], qualifiers: [{ name: 'first invoice within a day', anyOf: ['first invoice', '24 hour', 'within a day', 'first day', 'same day'] }] } },
  { id: 'saas-support', goal: 'Happier support customers.', context: INVOICING_SAAS, expect: { scope: ['in'], focus: ['faster-support', 'retention'] } },
  // Dentist
  { id: 'dent-patients', goal: 'More new patients each month.', context: DENTIST, expect: { scope: ['in'], focus: ['new-signups'], preferLevers: ['new-signups.local-reviews'] } },
  { id: 'dent-no-shows', goal: 'Fewer missed appointments.', context: DENTIST, expect: { scope: ['in'], focus: ['ops-hygiene', 'retention', 'other'] } },
  // Shelter
  { id: 'np-donors', goal: 'Raise $50k from individual donors this year.', context: SHELTER, expect: { scope: ['in'], focus: ['new-signups', 'retention', 'revenue-recovery', 'other'], qualifiers: [{ name: 'individual donors', anyOf: ['donor'] }] } },
  { id: 'np-volunteers', goal: 'Find 20 more volunteers.', context: SHELTER, expect: { scope: ['in'], focus: ['new-signups', 'other'] } },
  // Habit app
  { id: 'app-week-one', goal: 'Keep more users after their first week.', context: HABIT_APP, expect: { scope: ['in'], focus: ['retention', 'activation'] } },
  { id: 'app-downloads', goal: 'Get to 10k downloads.', context: HABIT_APP, expect: { scope: ['in'], focus: ['new-signups'] } },
  // Beyond what agents can do
  { id: 'moon', goal: 'Land on the moon.', context: PERSONAL, expect: { scope: ['partial', 'out'], maxWorkflows: 3 } },
  { id: 'weight', goal: 'Lose 10 kg by summer.', context: PERSONAL, expect: { scope: ['partial', 'out'], maxWorkflows: 3 } },
  { id: 'house', goal: 'Build a house for my family.', context: PERSONAL, expect: { scope: ['partial', 'out'], maxWorkflows: 3 } },
]
