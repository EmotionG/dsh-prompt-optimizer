/**
 * dsh-prompt-optimizer — Host half.
 *
 * A normal (non-dynamic) DSH plugin: registers one Connection RPC channel
 * (`/prompt-optimizer`) that the browser half calls to optimize the composer
 * draft with the session's current model. Unlike the dynamic sandbox package,
 * this host half receives a REAL AbortSignal from the Connection transport,
 * so cancellation aborts the underlying LLM request transport-level.
 *
 * @module dsh-prompt-optimizer
 */

import type { Context } from '@deepseek-ai/cordis'

/** The Connection RPC channel this plugin owns. Must match src/client/index.ts. */
export const RPC_CHANNEL = '/prompt-optimizer'

/** Built-in optimizer system prompt. */
const OPTIMIZER_SYSTEM_PROMPT = [
  '你是专业的提示词优化专家。请根据对话上下文，将用户输入的草稿优化为更清晰、更结构化、更有效的提示词。',
  '要求：',
  '1. 保留用户原始意图，不添加额外需求',
  '2. 优化表达清晰度，消除歧义',
  '3. 适当补充上下文关联说明',
  '4. 结构化输出，分点表述复杂需求',
  '5. 明确输出格式和约束条件',
  '只输出优化后的提示词内容，不要解释，不要添加多余文字。',
].join('\n')

const MAX_DRAFT_CHARS = 8000
const CONTEXT_MESSAGE_LIMIT = 10
const CONTEXT_LINE_CHARS = 800
const CONTEXT_TOTAL_CHARS = 6000

/**
 * Required services. `llm` streams the optimization; `sessionQuery` reads the
 * current session surface for context. `agentDefaultModel` is read through
 * `ctx.get` because it is an optional fallback.
 */
export const inject = ['llm', 'sessionQuery']

function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (
      block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ) {
      out += (out === '' ? '' : '\n') + (block as { text: string }).text
    }
  }
  return out
}

function clipText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…'
}

/** Minimal structural face of the sessionQuery service used here. */
interface SessionQueryLike {
  readSurface(sessionId: string): Promise<{ events?: unknown[] }>
}

/** Read the session's model-visible surface and fold user/assistant text lines. */
async function buildContextLines(
  sessionQuery: SessionQueryLike,
  sessionId: string,
): Promise<string[]> {
  const lines: string[] = []
  if (typeof sessionId !== 'string' || sessionId === '') return lines
  try {
    const surface = await sessionQuery.readSurface(sessionId)
    const events = surface && Array.isArray(surface.events) ? surface.events : []
    for (const event of events) {
      if (event === null || typeof event !== 'object') continue
      const typed = event as { type?: unknown, data?: { content?: unknown, message?: { content?: unknown } } }
      if (typed.type === 'user/message') {
        const text = textOfContent(typed.data?.content)
        if (text.trim() !== '') lines.push('用户: ' + text.replace(/\n+/g, ' '))
      } else if (typed.type === 'assistant/message') {
        const message = typed.data?.message
        const text = textOfContent(message?.content)
        if (text.trim() !== '') lines.push('助手: ' + text.replace(/\n+/g, ' '))
      }
    }
  } catch (error) {
    // Context is best-effort: an unreadable session still optimizes the draft alone.
    console.warn?.('prompt-optimizer: could not read session surface', error)
  }
  return lines
}

interface OptimizeRequest {
  sessionId?: unknown
  draft?: unknown
  token?: unknown
  provider?: unknown
  model?: unknown
  reasoningEffort?: unknown
}

function asRecord(value: unknown): OptimizeRequest {
  return typeof value === 'object' && value !== null ? (value as OptimizeRequest) : {}
}

/** Structural view of the stream chunks this plugin consumes. */
type OptimizeChunk = {
  type: string
  blockType?: string
  text?: string
  reason?: { kind?: string, failure?: { message?: string } }
}

export function apply(ctx: Context): void {
  // Structural faces: the services are injected by name; the exact types are
  // not imported to keep the build independent of their declaration files.
  const llm = ctx.get('llm') as {
    stream(options: unknown): AsyncIterable<OptimizeChunk>
  }
  const sessionQuery = ctx.get('sessionQuery') as SessionQueryLike

  /**
   * Live cancellation handles: token -> AbortController. The transport signal
   * and explicit cancel both abort the same controller, so either path stops
   * the LLM stream at the transport level.
   */
  const activeRuns = new Map<string, AbortController>()
  let requestSeq = 0

  ctx.inject(['connection', 'webServer'], scoped => {
    const connection = scoped.get('connection') as unknown as {
      register(
        owner: unknown,
        channel: string,
        handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>,
      ): unknown
    }
    if (connection === undefined) return
    try {
      connection.register(scoped, RPC_CHANNEL, async (endpoint, payload, signal) => {
        if (endpoint !== 'optimize' && endpoint !== 'cancel') {
          return {
            ok: false,
            error: { code: 'unknown-endpoint', message: `prompt-optimizer: unknown endpoint "${endpoint}"`, details: {} },
          }
        }

        if (endpoint === 'cancel') {
          const req = asRecord(payload)
          const token = typeof req.token === 'string' ? req.token : ''
          const run = token === '' ? undefined : activeRuns.get(token)
          if (run) run.abort('prompt-optimizer: canceled by caller')
          return { ok: true, value: null }
        }

        // endpoint === 'optimize'
        const req = asRecord(payload)
        const sessionId = typeof req.sessionId === 'string' ? req.sessionId : ''
        const rawDraft = typeof req.draft === 'string' ? req.draft : ''
        const token = typeof req.token === 'string' ? req.token : ''
        if (rawDraft.trim() === '') {
          return { ok: false, error: { code: 'empty-draft', message: '输入草稿为空，无法优化', details: {} } }
        }
        if (token !== '' && activeRuns.has(token)) {
          return { ok: false, error: { code: 'duplicate-token', message: '重复的优化请求，请稍后再试', details: {} } }
        }
        const draft = clipText(rawDraft, MAX_DRAFT_CHARS)

        // Model routing: the client supplies provider+model together from the
        // session's modelSelection projection; if only one arrives, treat the
        // pair as absent and fall back to the agent default model.
        let provider = typeof req.provider === 'string' ? req.provider : ''
        let model = typeof req.model === 'string' ? req.model : ''
        let reasoningEffort = typeof req.reasoningEffort === 'string' ? req.reasoningEffort : undefined
        if ((provider === '') !== (model === '')) {
          provider = ''
          model = ''
        }
        if (provider === '' || model === '') {
          const defaultModel = ctx.get('agentDefaultModel') as
            | { currentSelection(): { provider: string, model: string, reasoningEffort?: string } }
            | undefined
          let selection: { provider: string, model: string, reasoningEffort?: string } | undefined
          try {
            selection = defaultModel?.currentSelection()
          } catch {
            selection = undefined
          }
          if (selection) {
            if (provider === '') provider = selection.provider
            if (model === '') model = selection.model
            if (reasoningEffort === undefined) reasoningEffort = selection.reasoningEffort
          }
        }
        if (provider === '' || model === '') {
          return { ok: false, error: { code: 'no-model', message: '当前没有可用的模型配置，请先在设置中选择模型', details: {} } }
        }

        const lines = await buildContextLines(sessionQuery, sessionId)
        const recent = lines.slice(-CONTEXT_MESSAGE_LIMIT).map(line => clipText(line, CONTEXT_LINE_CHARS))
        let contextText = recent.join('\n')
        while (contextText.length > CONTEXT_TOTAL_CHARS && recent.length > 1) {
          recent.shift()
          contextText = recent.join('\n')
        }

        const userText = [
          '## 对话上下文（当前会话的最近历史，仅用于理解背景）',
          contextText === '' ? '（暂无历史消息）' : contextText,
          '',
          '## 用户输入的原始草稿',
          draft,
          '',
          '请优化以上草稿。',
        ].join('\n')

        requestSeq += 1
        const messages = [{
          id: `prompt-optimizer-${requestSeq}-${Date.now()}`,
          role: 'user' as const,
          content: [{ type: 'text' as const, text: userText }],
          source: { kind: 'user' as const },
        }]

        const controller = new AbortController()
        if (token !== '') activeRuns.set(token, controller)
        const transportAbort = () => controller.abort('prompt-optimizer: transport closed')
        signal.addEventListener('abort', transportAbort, { once: true })

        const blocks: string[] = []
        let current: string | null = null
        let truncated = false
        try {
          const options: Record<string, unknown> = {
            provider,
            model,
            messages,
            system: OPTIMIZER_SYSTEM_PROMPT,
            maxTokens: 2048,
            signal: controller.signal,
          }
          if (reasoningEffort !== undefined) options.reasoningEffort = reasoningEffort
          if (sessionId !== '') options.sessionId = sessionId

          for await (const chunk of llm.stream(options)) {
            if (controller.signal.aborted) break
            if (chunk.type === 'block-start' && chunk.blockType === 'text') {
              if (current !== null) blocks.push(current)
              current = ''
            } else if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
              if (current === null) current = ''
              current += chunk.text
            } else if (chunk.type === 'finish') {
              const reason = chunk.reason
              if (reason?.kind === 'error' && reason.failure) {
                return {
                  ok: false,
                  error: {
                    code: 'llm-error',
                    message: reason.failure.message || '模型调用失败',
                    details: {},
                  },
                }
              }
              if (reason?.kind === 'max-tokens') truncated = true
            }
          }
          if (current !== null) blocks.push(current)
        } catch (error) {
          if (controller.signal.aborted) {
            return { ok: false, error: { code: 'cancelled', message: '已取消优化', details: {} } }
          }
          return {
            ok: false,
            error: {
              code: 'llm-error',
              message: error instanceof Error ? error.message : '模型调用异常',
              details: {},
            },
          }
        } finally {
          signal.removeEventListener('abort', transportAbort)
          if (token !== '') activeRuns.delete(token)
        }

        if (controller.signal.aborted) {
          return { ok: false, error: { code: 'cancelled', message: '已取消优化', details: {} } }
        }
        const cleaned = blocks.join('\n').trim()
        if (cleaned === '') {
          return { ok: false, error: { code: 'empty-output', message: '模型没有返回有效内容，已保留原文', details: {} } }
        }
        return { ok: true, value: { text: cleaned, truncated } }
      })
    } catch (error) {
      // A failure here must be LOUD: a silently unmounted channel surfaces as
      // the SPA fallback's unexplained 405 in the browser.
      ctx.logger?.error?.('prompt-optimizer: could not register RPC channel ' + RPC_CHANNEL)
      ctx.logger?.error?.(error instanceof Error ? error.message : String(error))
    }
  })

  ctx.effect(() => () => {
    for (const controller of activeRuns.values()) controller.abort('prompt-optimizer: plugin stopped')
    activeRuns.clear()
  }, 'prompt-optimizer: abort in-flight runs on stop')
}
