// One of the real ModelCall implementations loopengine ships (see also
// openai-model-call.ts, deepseek-model-call.ts — the latter is what
// agents/customer-service/index.ts actually uses). file-agent.ts and
// rag-agent.ts still use a canned, turn-counting fake so the whole loop
// is runnable with no API key — swap that fake for
// createAnthropicModelCall(...) and nothing in run-agent.ts, the
// adapters, or any AgentConfig changes. ModelCall is the only seam this
// needed.
//
// loopengine's own Message type mirrors Anthropic's native shape closely
// on purpose: `content` is either a plain string or a ModelContentBlock[]
// carrying real tool_use/tool_result blocks with ids, the same identity
// Anthropic's own API expects a tool_use to be answered by a matching
// tool_result. This file's only job is translating between that shape and
// the SDK's own param/response types — see message-to-param below.
//
// With a reasoning effort set, Claude thinks before answering (adaptive
// thinking at that effort), and its thinking blocks come back signed. The
// API needs them sent back unchanged with the tool results they led to,
// so each rides in the conversation as an 'anthropic_thinking' block (the
// whole block as JSON in `data`), sent back only to Anthropic.
import Anthropic from '@anthropic-ai/sdk'
import type { ToolSchema } from '#core/agent-config.js'
import type { Message, ModelCall, ModelContentBlock, ModelResponse } from '#core/run-agent.js'

export interface AnthropicModelCallOptions {
  /** Defaults to the ANTHROPIC_API_KEY env var, same as the SDK itself. */
  apiKey?: string
  model?: string
  /** Defaults to 4096, or 16000 with a reasoning effort set: thinking
   * counts toward it. */
  maxTokens?: number
  /** How much Claude thinks before answering. 'none' turns thinking off;
   * 'minimal' and 'low' to 'max' turn on adaptive thinking at that effort
   * (Claude has no 'minimal', so it means 'low'). Omitted, the model's
   * own default. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Inject a pre-configured client instead of building one from apiKey — e.g. to pass a custom `fetch` in tests. */
  client?: Anthropic
}

/** The thinking (or redacted thinking) block an 'anthropic_thinking'
 * block carries, or undefined if its data isn't one. */
function thinkingBlockParam(block: ModelContentBlock): Anthropic.Messages.ThinkingBlockParam | Anthropic.Messages.RedactedThinkingBlockParam | undefined {
  try {
    const parsed = JSON.parse(block.data ?? '')
    return parsed && (parsed.type === 'thinking' || parsed.type === 'redacted_thinking') ? parsed : undefined
  } catch {
    return undefined
  }
}

function toContentBlockParam(block: ModelContentBlock): Anthropic.Messages.ContentBlockParam {
  if (block.type === 'tool_use') {
    return { type: 'tool_use', id: block.id!, name: block.name!, input: block.input ?? {} }
  }
  if (block.type === 'tool_result') {
    return { type: 'tool_result', tool_use_id: block.tool_use_id!, content: block.content, is_error: block.is_error }
  }
  // text (and anything else this file doesn't specifically construct —
  // in practice only text/tool_use/tool_result ever end up in a Message
  // this framework builds).
  return { type: 'text', text: block.text ?? '' }
}

function toMessageParam(message: Message): Anthropic.Messages.MessageParam {
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    // Claude's own signed thinking goes back as it came. Blocks only
    // another provider can use (DeepSeek's 'thinking', 'openai_reasoning')
    // are left out; as text they'd be empty text blocks, which the API
    // rejects.
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.flatMap((block): Anthropic.Messages.ContentBlockParam[] => {
            if (block.type === 'anthropic_thinking') {
              const thinking = thinkingBlockParam(block)
              return thinking ? [thinking] : []
            }
            return ['text', 'tool_use', 'tool_result'].includes(block.type) ? [toContentBlockParam(block)] : []
          }),
  }
}

export function createAnthropicModelCall(options: AnthropicModelCallOptions = {}): ModelCall {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  const model = options.model ?? 'claude-sonnet-5'
  const maxTokens = options.maxTokens ?? (options.reasoningEffort ? 16000 : 4096)
  const effort = options.reasoningEffort === 'minimal' ? 'low' : options.reasoningEffort
  const reasoning: Pick<Anthropic.Messages.MessageCreateParamsNonStreaming, 'thinking' | 'output_config'> =
    effort === undefined ? {} : effort === 'none' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'adaptive' }, output_config: { effort } }

  return async (messages: Message[], system: string, tools: ToolSchema[]): Promise<ModelResponse> => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.map(toMessageParam),
      tools: tools.length
        ? tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          }))
        : undefined,
      ...reasoning,
    })

    const content: ModelContentBlock[] = response.content.map((block): ModelContentBlock => {
      if (block.type === 'text') return { type: 'text', text: block.text }
      if (block.type === 'thinking' || block.type === 'redacted_thinking') return { type: 'anthropic_thinking', data: JSON.stringify(block) }
      if (block.type === 'tool_use') {
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> }
      }
      return { type: block.type }
    })

    const usage = response.usage ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } : undefined
    return { stop_reason: response.stop_reason ?? 'end_turn', content, usage }
  }
}
