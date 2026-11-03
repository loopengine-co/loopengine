// A second real ModelCall implementation, alongside anthropic-model-call.ts
// — same seam, different provider. Swap createOpenAIModelCall(...) in for
// the canned fake in any agent and nothing in run-agent.ts, the adapters,
// or any AgentConfig changes.
//
// createOpenAIModelCall calls OpenAI's Responses API (/v1/responses):
// OpenAI's reasoning models refuse function tools together with any
// reasoning effort on /v1/chat/completions (every gpt-5.4 to gpt-6.1 model
// checked live, Nov 2026), so an agent with tools could only run them with
// reasoning off there. The Chat Completions translation below
// (toMessageParams/toStopReason/toModelResponse) stays for the
// OpenAI-compatible providers that reuse it.
//
// Responses is called statelessly (store: false): loopengine keeps the
// conversation itself, so each reasoning item comes back encrypted, rides
// in the conversation as an 'openai_reasoning' block, and is sent back
// with the tool results it led to, which the API needs to carry the
// model's reasoning across tool calls.
//
// Structural mismatch worth knowing: loopengine's Message bundles every
// tool_result from one turn into a single user-role message's content
// array (mirroring Anthropic's own shape, which this framework's Message
// type was modeled on). OpenAI's Chat Completions API has no equivalent —
// each tool result is its own top-level message with role: 'tool'. So
// unlike Anthropic's 1:1 toMessageParam, toMessageParams here is plural: one
// loopengine Message can expand into several OpenAI messages, never fewer.
//
// stop_reason is normalized to the vocabulary anthropic-model-call.ts
// already established ('end_turn' / 'tool_use' / 'max_tokens') rather than
// passed through as OpenAI's own finish_reason strings — recovery.ts's
// defaultIsTruncated checks a translated ModelResponse for stop_reason ===
// 'max_tokens', so a provider-agnostic caller wiring up onTruncated later
// gets the same behavior regardless of which ModelCall is plugged in.
//
// toMessageParams/toStopReason/toModelResponse are exported for
// deepseek-model-call.ts to reuse verbatim — DeepSeek's Chat Completions
// API is wire-compatible with this same request/response shape (confirmed
// against DeepSeek's own docs), the one real difference being the token-
// limit field name, which is only decided at the request-building call
// site below, not in these shared translation functions.
import OpenAI from 'openai'
import type { ToolSchema } from '#core/agent-config.js'
import type { Message, ModelCall, ModelContentBlock, ModelResponse } from '#core/run-agent.js'

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

// reasoning_content is a DeepSeek-specific extension of the otherwise
// wire-compatible request/response shape (confirmed against DeepSeek's
// own thinking-mode docs) — not part of the OpenAI SDK's own
// ChatCompletionMessage/ChatCompletionMessageParam types, hence these
// widened aliases rather than `as any` at each call site.
type ChatMessageWithReasoning = ChatMessage & { reasoning_content?: string }
type ChatCompletionMessageWithReasoning = OpenAI.Chat.Completions.ChatCompletionMessage & { reasoning_content?: string }

export interface OpenAIModelCallOptions {
  /** Defaults to the OPENAI_API_KEY env var, same as the SDK itself. */
  apiKey?: string
  /** No hardcoded default, unlike Anthropic's — OpenAI's current flagship
   * model name changes too often to bake into this file safely. Pass the
   * one you actually want. */
  model: string
  maxTokens?: number
  /** How much the model reasons before answering ('none' to 'max');
   * omitted, the model's own default. Works with tools, since this calls
   * /v1/responses. */
  reasoningEffort?: OpenAI.ReasoningEffort
  /** Inject a pre-configured client instead of building one from apiKey — e.g. to pass a custom `fetch` in tests. */
  client?: OpenAI
}

/** A tool call's arguments. Some OpenAI-compatible models now and then
 * add something after the JSON object (a second copy, a stray character):
 * the first complete object is used then. Arguments cut off part-way still
 * throw, so the caller can ask again. */
export function parseToolArguments(raw: string): Record<string, unknown> {
  const text = (raw ?? '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch (err) {
    const end = firstObjectEnd(text)
    if (end > 0 && end < text.length) return JSON.parse(text.slice(0, end)) as Record<string, unknown>
    throw err
  }
}

/** Where the first top-level JSON object in `text` ends (after its closing
 * brace), or -1 when it doesn't close. */
function firstObjectEnd(text: string): number {
  if (text[0] !== '{') return -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  return -1
}

export function toMessageParams(message: Message): ChatMessage[] {
  if (typeof message.content === 'string') {
    return [{ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }]
  }

  if (message.role === 'assistant') {
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
    const toolUseBlocks = message.content.filter((block) => block.type === 'tool_use')
    // DeepSeek's thinking mode requires the exact reasoning that produced
    // this message — tool_calls included — echoed back verbatim on every
    // later request that still includes this message, for as long as the
    // conversation keeps passing `tools` at all (confirmed live: dropping
    // it gets the whole request rejected with a 400, not just ignored).
    // Round-tripped opaquely here, never inspected — see
    // ModelContentBlock's own 'thinking' block doc comment (run-agent.ts).
    const thinkingBlock = message.content.find((block) => block.type === 'thinking')
    const result: ChatMessageWithReasoning = {
      role: 'assistant',
      // Required unless tool_calls is set — an empty string here (no
      // text, only tool calls) is rejected by the API, so this must be
      // null, not ''.
      content: text || null,
      tool_calls: toolUseBlocks.length
        ? toolUseBlocks.map((block) => ({
            id: block.id!,
            type: 'function',
            function: { name: block.name!, arguments: JSON.stringify(block.input ?? {}) },
          }))
        : undefined,
    }
    if (thinkingBlock?.text) result.reasoning_content = thinkingBlock.text
    return [result]
  }

  // Every non-assistant, block-structured Message this loop ever builds is
  // one turn's tool_result blocks bundled together (see run-agent.ts's
  // pushMessage calls) — expand each into its own `role: 'tool'` message.
  return message.content.map((block) => ({
    role: 'tool',
    tool_call_id: block.tool_use_id!,
    content: block.content ?? '',
  }))
}

export function toStopReason(finishReason: string): string {
  if (finishReason === 'tool_calls' || finishReason === 'function_call') return 'tool_use'
  if (finishReason === 'length') return 'max_tokens'
  if (finishReason === 'stop') return 'end_turn'
  return finishReason
}

export function toModelResponse(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): ModelResponse {
  const content: ModelContentBlock[] = []
  // Ordered first — reasoning precedes the response it produced. Only
  // DeepSeek's thinking-mode responses carry this; a plain response
  // simply has no reasoning_content, so nothing gets pushed and
  // toMessageParams above has nothing to echo back for this message.
  const reasoningContent = (choice.message as ChatCompletionMessageWithReasoning).reasoning_content
  if (reasoningContent) content.push({ type: 'thinking', text: reasoningContent })
  if (choice.message.content) content.push({ type: 'text', text: choice.message.content })
  for (const call of choice.message.tool_calls ?? []) {
    // A 'custom' tool call is the freeform-text tool type OpenAI added
    // alongside 'function' — this framework's ToolDefinition only ever
    // declares 'function'-shaped tools, so a custom call can't have come
    // from anything this loop offered the model.
    if (call.type !== 'function') continue
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.function.name,
      input: parseToolArguments(call.function.arguments),
    })
  }
  return { stop_reason: toStopReason(choice.finish_reason), content }
}

type ResponseInputItem = OpenAI.Responses.ResponseInputItem

/** The reasoning item an 'openai_reasoning' block carries, or undefined if
 * its data isn't one (it is sent back only as OpenAI returned it). */
function reasoningItem(block: ModelContentBlock): OpenAI.Responses.ResponseReasoningItem | undefined {
  try {
    const item = JSON.parse(block.data ?? '')
    return item && item.type === 'reasoning' ? item : undefined
  } catch {
    return undefined
  }
}

/** One loopengine Message as Responses input items: an assistant turn's
 * reasoning, text and tool calls in the order the model produced them,
 * and a user turn's tool results (or text). Another provider's 'thinking'
 * blocks are dropped: OpenAI can't use them. */
export function toResponsesInput(message: Message): ResponseInputItem[] {
  const role = message.role === 'assistant' ? 'assistant' : 'user'
  if (typeof message.content === 'string') return [{ role, content: message.content }]

  const items: ResponseInputItem[] = []
  for (const block of message.content) {
    if (block.type === 'openai_reasoning') {
      const item = reasoningItem(block)
      if (item) items.push(item)
    } else if (block.type === 'tool_use') {
      items.push({ type: 'function_call', call_id: block.id!, name: block.name!, arguments: JSON.stringify(block.input ?? {}) })
    } else if (block.type === 'tool_result') {
      items.push({ type: 'function_call_output', call_id: block.tool_use_id!, output: block.content ?? '' })
    } else if (block.type === 'text' && block.text) {
      items.push({ role, content: block.text })
    }
  }
  return items
}

/** A Response as a ModelResponse: reasoning items as 'openai_reasoning'
 * blocks, message text, and function calls as tool_use blocks (their
 * call_id is the id a tool result answers). */
export function fromResponse(response: OpenAI.Responses.Response): ModelResponse {
  const content: ModelContentBlock[] = []
  let calledTools = false
  for (const item of response.output) {
    if (item.type === 'reasoning') {
      content.push({ type: 'openai_reasoning', data: JSON.stringify(item) })
    } else if (item.type === 'message') {
      const text = item.content.map((part) => (part.type === 'output_text' ? part.text : part.refusal)).join('')
      if (text) content.push({ type: 'text', text })
    } else if (item.type === 'function_call') {
      calledTools = true
      content.push({ type: 'tool_use', id: item.call_id, name: item.name, input: parseToolArguments(item.arguments) })
    }
  }

  const stop_reason = calledTools
    ? 'tool_use'
    : response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens'
      ? 'max_tokens'
      : 'end_turn'
  const usage = response.usage ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } : undefined
  return { stop_reason, content, ...(usage ? { usage } : {}) }
}

export function createOpenAIModelCall(options: OpenAIModelCallOptions): ModelCall {
  const client = options.client ?? new OpenAI({ apiKey: options.apiKey })
  const maxTokens = options.maxTokens ?? 4096

  return async (messages: Message[], system: string, tools: ToolSchema[]): Promise<ModelResponse> => {
    const response = await client.responses.create({
      model: options.model,
      instructions: system,
      input: messages.flatMap(toResponsesInput),
      max_output_tokens: maxTokens,
      tools: tools.length
        ? tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: false }))
        : undefined,
      ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
      store: false,
      include: ['reasoning.encrypted_content'],
    })
    return fromResponse(response)
  }
}
