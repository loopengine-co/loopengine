// An eighth real ModelCall implementation, for Meta's Muse models
// (muse-spark-1.3 and later) through the Meta Model API. Its
// /chat/completions endpoint is OpenAI-compatible, function calling
// included, so this reuses openai-model-call.ts's translation verbatim via
// the real `openai` SDK client pointed at https://api.meta.ai/v1, same
// pattern deepseek/kimi/glm/gemini-model-call.ts established.
//
// META_API_KEY is the name LiteLLM uses; Meta's own examples read a
// generic MODEL_API_KEY, too vague next to the other providers' keys.
// Uses `max_completion_tokens`: Meta accepts `max_tokens` only as a
// deprecated alias. The Model API was a US-only public preview when this
// was written.
import OpenAI from 'openai'
import type { ToolSchema } from '#core/agent-config.js'
import type { Message, ModelCall, ModelResponse } from '#core/run-agent.js'
import { toMessageParams, toModelResponse } from './openai-model-call.js'

export interface MetaModelCallOptions {
  /** Defaults to the META_API_KEY env var. */
  apiKey?: string
  /** No hardcoded default — same reasoning as OpenAIModelCallOptions.model:
   * pass the one you actually want. */
  model: string
  maxTokens?: number
  /** Defaults to Meta's own Model API — override to point at a proxy/mirror. */
  baseURL?: string
  /** Inject a pre-configured client instead of building one from apiKey/baseURL — e.g. to pass a custom `fetch` in tests. */
  client?: OpenAI
}

export function createMetaModelCall(options: MetaModelCallOptions): ModelCall {
  if (!options.client && !options.apiKey && !process.env.META_API_KEY) {
    // Fails here, with a Meta-specific message, rather than letting the
    // OpenAI SDK's own constructor validation reject it — that error says
    // "set OPENAI_API_KEY", which would send someone who never touched
    // that variable chasing the wrong fix.
    throw new Error('createMetaModelCall: no apiKey given and META_API_KEY is not set.')
  }

  const client =
    options.client ??
    new OpenAI({
      // Explicitly null, not undefined, if neither is set — see
      // kimi-model-call.ts's comment for why this matters even
      // though the guard above already rules out reaching here with no
      // key at all.
      apiKey: options.apiKey ?? process.env.META_API_KEY ?? null,
      baseURL: options.baseURL ?? 'https://api.meta.ai/v1',
    })
  const maxTokens = options.maxTokens ?? 4096

  return async (messages: Message[], system: string, tools: ToolSchema[]): Promise<ModelResponse> => {
    const response = await client.chat.completions.create({
      model: options.model,
      max_completion_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages.flatMap(toMessageParams)],
      tools: tools.length
        ? tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          }))
        : undefined,
    })

    const usage = response.usage ? { input_tokens: response.usage.prompt_tokens, output_tokens: response.usage.completion_tokens } : undefined
    return { ...toModelResponse(response.choices[0]), usage }
  }
}
