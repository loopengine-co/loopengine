// A workflow run's trace as one record, for the case page, its export and
// apps (GET /agents/:agent/runs/:id/trace): which run of which workflow
// version, what it was given and gave back, the model, every tool call,
// every step in order (the prompt, model calls, tool calls, and what
// people decided, answered and said about it), any error, how long it
// took, what it cost, and the feedback on it.
//
// Built from what's kept: the run (core/workflow-runs.ts), its steps
// (core/trace.ts, in core/audit-store.ts's trace_spans), its model calls
// (core/usage.ts, priced from models.yaml) and its events (feedback).
import type { AuditEvent, TraceSpan } from '../core/audit-store.js'
import type { UsageRow } from '../core/usage.js'
import { workflowVersionOf, type WorkflowRun } from '../core/workflow-runs.js'

export interface TraceToolCall {
  id: string
  name: string
  input: unknown
  output: unknown
  /** Allowed, approved, denied, skipped, or not run (a test run). */
  status: string | null
  error: string | null
  started_at: string
  duration_ms: number | null
}

export type TraceStepEvent =
  | { type: 'prompt'; at: string; resumed: boolean; system: string; tools: string[]; input: unknown; prior_messages: number }
  | { type: 'model_call'; at: string; duration_ms: number | null; model: string | null; input: unknown; output: unknown; input_tokens: number | null; output_tokens: number | null; messages_sent: number | null; stop_reason: string | null; error: string | null }
  | ({ type: 'tool_call'; at: string } & Omit<TraceToolCall, 'started_at'>)
  | { type: 'decision'; at: string; tool: string; approved: boolean; changed: boolean; by: string | null; reason: string | null }
  | { type: 'answer'; at: string; question: string; answer: string; by: string | null }
  | { type: 'feedback'; at: string; by: string | null; verdict: string | null; edit: string | null; note: string | null }

export interface RunTrace {
  execution_id: string
  agent: string
  workflow_id: string
  /** The workflow version it ran under (core/audit-store.ts), and that
   * version's id, "<workflow>@v<number>". */
  workflow_version: number | null
  workflow_version_id: string | null
  status: WorkflowRun['status']
  started_at: string
  finished_at: string | null
  input: { params: Record<string, string>; message: string }
  final_output: string | null
  /** The result's JSON, for a workflow with an output schema, once it
   * matched; and the check: valid (null without a schema), how many
   * times the agent was asked again, and what was wrong last. */
  final_output_json: unknown
  output_schema_check: { valid: boolean | null; retries: number; errors: string[] }
  model: { provider: string | null; model: string } | null
  tool_calls: TraceToolCall[]
  step_events: TraceStepEvent[]
  error: string | null
  duration_ms: number | null
  /** usd is null unless every model call's model has a price. */
  cost: { usd: number | null; input_tokens: number; output_tokens: number; model_calls: number; model_ms: number }
  feedback: { verdict: string | null; edit: string | null; final_output_used: string | null; note: string | null; at: string } | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function buildRunTrace(input: { run: WorkflowRun; spans: TraceSpan[]; usage: UsageRow[]; events: AuditEvent[] }): RunTrace {
  const { run, spans, usage } = input
  const version = workflowVersionOf(run) ?? null

  const toolCalls: TraceToolCall[] = []
  const steps: TraceStepEvent[] = spans.map((s): TraceStepEvent => {
    if (s.kind === 'prompt') {
      const p = (s.input ?? {}) as { system?: string; tools?: string[]; start?: unknown; priorMessages?: number }
      return { type: 'prompt', at: s.at, resumed: s.meta?.resumed === true, system: p.system ?? '', tools: p.tools ?? [], input: p.start ?? null, prior_messages: p.priorMessages ?? 0 }
    }
    if (s.kind === 'llm') {
      return {
        type: 'model_call', at: s.at, duration_ms: s.durationMs ?? null, model: s.name ?? null, input: s.input ?? [], output: s.output ?? null,
        input_tokens: num(s.meta?.inputTokens), output_tokens: num(s.meta?.outputTokens), messages_sent: num(s.meta?.sent), stop_reason: str(s.meta?.stopReason), error: s.error ?? null,
      }
    }
    const call: TraceToolCall = {
      id: str(s.meta?.toolUseId) ?? String(s.id),
      name: s.name ?? 'tool',
      input: s.input ?? null,
      output: s.output ?? null,
      status: str(s.meta?.status),
      error: s.error ?? null,
      started_at: s.at,
      duration_ms: s.durationMs ?? null,
    }
    toolCalls.push(call)
    const { started_at: at, ...rest } = call
    return { type: 'tool_call', at, ...rest }
  })
  for (const d of run.decisions ?? []) steps.push({ type: 'decision', at: d.at, tool: d.tool, approved: d.approved, changed: Boolean(d.edited), by: d.by ?? null, reason: d.reason ?? null })
  for (const a of run.answers ?? []) steps.push({ type: 'answer', at: a.at, question: a.question, answer: a.answer, by: a.by ?? null })
  for (const e of input.events.filter((x) => x.kind === 'feedback')) {
    steps.push({ type: 'feedback', at: e.at, by: e.by ?? null, verdict: str(e.data.verdict), edit: str(e.data.edit), note: str(e.data.note) })
  }
  // In time order; a step and a decision at the same moment keep their place.
  const order = new Map(steps.map((s, i) => [s, i]))
  steps.sort((a, b) => a.at.localeCompare(b.at) || order.get(a)! - order.get(b)!)

  const firstCall = spans.find((s) => s.kind === 'llm')
  const firstPrompt = spans.find((s) => s.kind === 'prompt')?.input as { model?: { provider?: string; model?: string } } | undefined
  const modelName = str(firstCall?.meta?.model) ?? firstPrompt?.model?.model ?? usage[0]?.model ?? null
  const provider = str(firstCall?.meta?.provider) ?? firstPrompt?.model?.provider ?? usage[0]?.provider ?? null

  const priced = usage.length > 0 && usage.every((u) => u.costUsd != null)
  return {
    execution_id: run.run_id,
    agent: run.agent,
    workflow_id: run.workflow_id,
    workflow_version: version,
    workflow_version_id: version ? `${run.workflow_id}@v${version}` : null,
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at ?? null,
    input: { params: run.params ?? {}, message: run.message },
    final_output: run.result ?? null,
    final_output_json: run.output ?? null,
    output_schema_check: {
      valid: run.output !== undefined ? true : run.output_errors?.length && run.status === 'error' ? false : null,
      retries: run.output_retries ?? 0,
      errors: run.output_errors ?? [],
    },
    model: modelName ? { provider, model: modelName } : null,
    tool_calls: toolCalls,
    step_events: steps,
    error: run.error ?? null,
    duration_ms: run.finished_at ? Math.max(0, Date.parse(run.finished_at) - Date.parse(run.started_at)) : null,
    cost: {
      usd: priced ? usage.reduce((n, u) => n + u.costUsd!, 0) : null,
      input_tokens: usage.reduce((n, u) => n + u.inputTokens, 0),
      output_tokens: usage.reduce((n, u) => n + u.outputTokens, 0),
      model_calls: usage.length,
      model_ms: usage.reduce((n, u) => n + (u.durationMs ?? 0), 0),
    },
    feedback: run.feedback ? { verdict: run.feedback.verdict ?? null, edit: run.feedback.edit ?? null, final_output_used: run.feedback.final ?? null, note: run.feedback.note ?? null, at: run.feedback.at } : null,
  }
}
