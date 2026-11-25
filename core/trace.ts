// A turn's trace, written as it runs (core/audit-store.ts's trace_spans),
// so a run can be read back step by step, the way LangSmith shows one:
//
// - prompt: what the turn ran with: the system prompt (kept once, by
//   hash), the tools offered, the model, and the message it starts with
//   (a workflow run's inputs and instructions; on a resumed turn, the
//   answer it resumes with);
// - llm: each model call: the messages it was sent that no earlier step
//   showed (so a long conversation isn't copied again on every call),
//   how many it was sent in all, and what came back, with tokens and time;
// - tool: each tool call: its input, what it returned, its status
//   (allowed, approved, denied, skipped) and how long it took.
//
// Keyed by the session id, which a workflow run records, so a case finds
// its trace. Nothing here throws into the turn: a trace that can't be
// written is skipped.
import type { LoopEvent } from './loop-events.js'
import type { Message, ModelResponse } from './run-agent.js'
import { auditDb, pruneTraces, recordTracePrompt, recordTraceSpan } from './audit-store.js'

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean }

interface ToolCall {
  tool: string
  args?: Record<string, unknown>
  startedAt?: number
  endedAt?: number
  at: string
  status?: string
  output?: unknown
  isError?: boolean
  written?: boolean
}

export interface TurnTrace {
  /** The turn begins: `history` is what came before it (never repeated). */
  start(input: { system: string; tools: string[]; model: { provider?: string; model?: string }; history: Message[]; starter: Message; resumed: boolean }): void
  /** A model call: the messages sent, and what came back or the error. */
  llm(call: { sent: Message[]; response?: ModelResponse; error?: unknown; durationMs: number; model: { provider?: string; model?: string } }): void
  /** A message added to the conversation (tool results among them). */
  message(message: Message): void
  /** The loop's own events: tool calls starting and resolving. */
  event(event: LoopEvent): void
  /** Writes what's left: tool calls that finished since the last call. */
  flush(): void
}

const NONE: TurnTrace = { start() {}, llm() {}, message() {}, event() {}, flush() {} }

const blocksOf = (m: Message): Block[] => (typeof m.content === 'string' ? [{ type: 'text', text: m.content } as Block] : (m.content as unknown as Block[]))

export function startTurnTrace(sessionId: string | undefined): TurnTrace {
  if (!sessionId || !auditDb()) return NONE
  pruneTraces()
  // Messages (and model replies, by their content) a step already shows.
  const shownSet = new WeakSet<object>()
  const shown = {
    add: (v: unknown) => { if (v && typeof v === 'object') shownSet.add(v) },
    has: (v: unknown) => Boolean(v && typeof v === 'object' && shownSet.has(v)),
  }
  const calls = new Map<string, ToolCall>()
  const order: string[] = []
  // Every tool call a model reply asked for, by its id: its name and input.
  const asked = new Map<string, { name?: string; input?: Record<string, unknown> }>()
  const noteAsked = (messages: Message[]) => {
    for (const b of messages.flatMap(blocksOf)) if (b.type === 'tool_use' && b.id) asked.set(b.id, { ...(b.name ? { name: b.name } : {}), ...(b.input ? { input: b.input } : {}) })
  }

  const callFor = (id: string, tool?: string): ToolCall => {
    let call = calls.get(id)
    if (!call) {
      // A call with no start event (a built-in like Skill, or one from
      // before this turn, resumed after an approval): its name and input
      // are on the model reply that asked for it.
      const request = asked.get(id)
      call = { tool: tool ?? request?.name ?? 'tool', ...(request?.input ? { args: request.input } : {}), at: new Date().toISOString() }
      calls.set(id, call)
      order.push(id)
    }
    return call
  }

  const writeTools = (): void => {
    for (const id of order) {
      const call = calls.get(id)!
      if (call.written || (call.status === undefined && call.output === undefined)) continue
      call.written = true
      recordTraceSpan({
        sessionId,
        at: call.at,
        kind: 'tool',
        name: call.tool,
        ...(call.startedAt && call.endedAt ? { durationMs: Math.max(0, call.endedAt - call.startedAt) } : {}),
        ...(call.args ? { input: call.args } : {}),
        ...(call.output !== undefined ? { output: call.output } : {}),
        ...(call.isError ? { error: typeof call.output === 'string' ? call.output.slice(0, 500) : 'The tool returned an error.' } : {}),
        // A built-in that reports no status (Skill): done, or failed.
        meta: { toolUseId: id, status: call.status ?? (call.isError ? 'Failed.' : 'Done.') },
      })
    }
  }

  return safe({
    start(input) {
      noteAsked(input.history)
      for (const m of input.history) { shown.add(m); shown.add(m.content) }
      shown.add(input.starter)
      const systemHash = recordTracePrompt(input.system)
      recordTraceSpan({
        sessionId,
        at: new Date().toISOString(),
        kind: 'prompt',
        input: { ...(systemHash ? { systemHash } : { system: input.system }), tools: input.tools, model: input.model, start: input.starter.content, priorMessages: input.history.length },
        meta: { resumed: input.resumed },
      })
    },
    llm(call) {
      writeTools()
      const fresh = call.sent.filter((m) => !shown.has(m) && !shown.has(m.content))
      for (const m of call.sent) shown.add(m)
      if (call.response) {
        shown.add(call.response.content)
        noteAsked([{ role: 'assistant', content: call.response.content } as Message])
      }
      const usage = call.response?.usage
      recordTraceSpan({
        sessionId,
        at: new Date(Date.now() - call.durationMs).toISOString(),
        kind: 'llm',
        name: call.model.model ?? 'model',
        durationMs: call.durationMs,
        input: fresh,
        ...(call.response ? { output: call.response.content } : {}),
        ...(call.error !== undefined ? { error: call.error instanceof Error ? call.error.message : String(call.error) } : {}),
        meta: {
          ...call.model,
          sent: call.sent.length,
          ...(usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : {}),
          ...(call.response?.stop_reason ? { stopReason: call.response.stop_reason } : {}),
        },
      })
    },
    message(message) {
      for (const b of blocksOf(message)) {
        if (b.type !== 'tool_result' || !b.tool_use_id) continue
        const call = callFor(b.tool_use_id)
        call.output = b.content
        call.endedAt ??= Date.now()
        if (b.is_error) call.isError = true
      }
    },
    event(e) {
      if (e.type === 'tool:started') {
        const call = callFor(e.id, e.tool)
        call.startedAt = Date.now()
        call.at = new Date().toISOString()
        call.args = e.args
      } else if (e.type === 'tool:result') {
        const call = callFor(e.id, e.tool)
        call.status = e.statusText
        call.endedAt ??= Date.now()
        if (e.args && !call.args) call.args = e.args
      }
    },
    flush() {
      writeTools()
    },
  })
}

// Every method, made unable to throw into the turn.
function safe(trace: TurnTrace): TurnTrace {
  const guard = <A extends unknown[]>(name: string, fn: (...args: A) => void) => (...args: A): void => {
    try {
      fn(...args)
    } catch (err) {
      console.error(`[loopengine] trace ${name} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return {
    start: guard('start', trace.start),
    llm: guard('llm', trace.llm),
    message: guard('message', trace.message),
    event: guard('event', trace.event),
    flush: guard('flush', trace.flush),
  }
}

