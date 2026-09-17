/**
 * dsh-prompt-optimizer — Browser half.
 *
 * Registers the mode toggle + optimize action into `conversation.input.right`
 * and calls the host half over the plugin's own Connection RPC channel.
 * Cancellation passes a real AbortSignal, so the host aborts the LLM stream
 * at the transport level.
 *
 * @module dsh-prompt-optimizer/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import * as React from 'react'
import { createElement } from 'react'
// Type-only: pulls the ctx.slots merge into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the InputState/InputActions slot props merges in.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ctx.connection merge into this program.
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

/** Must match src/index.ts. */
const RPC_CHANNEL = '/prompt-optimizer'

/** Fiber-scoped styles; colors ride the shell's design tokens for both themes. */
const CSS = `
.dspo-root{display:inline-flex;align-items:center;gap:6px;font-size:12px;flex:none}
.dspo-pill{font:inherit;font-size:12px;line-height:18px;padding:2px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color .15s,border-color .15s}
.dspo-pill:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dspo-pill:disabled{opacity:.5;cursor:default}
.dspo-pill-active{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dspo-action{font:inherit;font-size:12px;line-height:18px;padding:2px 10px;border-radius:999px;border:1px solid var(--dsw-alias-brand-primary);background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer}
.dspo-action:disabled{opacity:.45;cursor:default}
.dspo-action:not(:disabled):hover{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dspo-busy{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}
.dspo-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l1);border-top-color:var(--dsw-alias-brand-primary);animation:dspo-spin .8s linear infinite}
@keyframes dspo-spin{to{transform:rotate(360deg)}}
.dspo-cancel{font:inherit;font-size:12px;padding:0 2px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;text-decoration:underline}
.dspo-cancel:hover{color:var(--dsw-alias-label-primary)}
.dspo-flash{color:var(--dsw-alias-state-success-primary);animation:dspo-fade 2.5s ease forwards}
@keyframes dspo-fade{0%,70%{opacity:1}100%{opacity:0}}
.dspo-note{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:dspo-note-fade 5s ease forwards}
@keyframes dspo-note-fade{0%,80%{opacity:1}100%{opacity:0}}
.dspo-note-error{color:var(--dsw-alias-state-error-primary)}
.dspo-note-info{color:var(--dsw-alias-label-secondary)}
`

/** Required client services. */
export const inject = ['slots', 'connection']

/** Shared across sessions for the plugin's lifetime (a normal plugin may reload). */
let persistedMode: 'normal' | 'optimize' = 'normal'

function errorText(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  if (typeof error === 'string' && error !== '') return error
  return '未知错误'
}

interface OptimizeOk { ok: true, value: { text: string, truncated?: boolean } }
interface OptimizeErr { ok: false, error: { code: string, message: string, details: object } }
type OptimizeResult = OptimizeOk | OptimizeErr

interface SlotProps {
  useInput?: (selector: (s: { draft?: string } | undefined) => string) => string
  inputActions?: { setDraft(text: string): void }
  useProjection?: <K extends string>(key: K) =>
    | { next?: { provider?: unknown, model?: unknown, reasoningEffort?: unknown } | null
        lastUsed?: { provider?: unknown, model?: unknown, reasoningEffort?: unknown } | null }
    | undefined
  sessionId?: string
}

function PromptOptimizerToggle(props: SlotProps) {
  const { useInput, inputActions } = props
  const useProjection = props.useProjection
  const sessionId = props.sessionId

  const [mode, setMode] = React.useState<'normal' | 'optimize'>(persistedMode)
  const [busy, setBusy] = React.useState(false)
  // `seq` keys the note DOM node: a repeated identical text gets a fresh key
  // so React remounts the span and the fade animation replays.
  const [note, setNote] = React.useState<{ kind: 'info' | 'error', text: string, seq: number } | null>(null)
  const [flash, setFlash] = React.useState(0)
  const noteSeq = React.useRef(0)

  function showNote(kind: 'info' | 'error', text: string) {
    noteSeq.current += 1
    setNote({ kind, text, seq: noteSeq.current })
  }

  const draft = useInput ? useInput(s => (s && typeof s.draft === 'string' ? s.draft : '')) : ''
  const modelProjection = useProjection ? useProjection('modelSelection') : undefined

  const tokenRef = React.useRef<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const optimizeRef = React.useRef<() => void>(() => {})

  function toggleMode() {
    if (busy) return
    const next = mode === 'optimize' ? 'normal' : 'optimize'
    persistedMode = next
    setMode(next)
    setNote(null)
  }

  function optimize() {
    if (busy || tokenRef.current !== null) return
    const text = draft.trim()
    if (text === '') {
      showNote('info', '请先输入要优化的内容')
      return
    }
    const token = `po-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const controller = new AbortController()
    tokenRef.current = token
    abortRef.current = controller
    setBusy(true)
    setNote(null)

    const selection = modelProjection ? (modelProjection.next ?? modelProjection.lastUsed) : null
    const payload: Record<string, unknown> = { sessionId, draft: text, token }
    if (
      selection && typeof selection.provider === 'string' && typeof selection.model === 'string'
    ) {
      payload.provider = selection.provider
      payload.model = selection.model
      if (typeof selection.reasoningEffort === 'string') payload.reasoningEffort = selection.reasoningEffort
    }

    const connection = (ctxRef as unknown as { connection?: ConnectionHandle }).connection
    if (connection === undefined) {
      tokenRef.current = null
      abortRef.current = null
      setBusy(false)
      showNote('error', '连接不可用，无法优化')
      return
    }

    connection.rpc
      .call(RPC_CHANNEL, 'optimize', payload, controller.signal)
      .then((result: OptimizeResult) => {
        if (tokenRef.current !== token) return
        tokenRef.current = null
        abortRef.current = null
        setBusy(false)
        if (
          result && result.ok === true && result.value
          && typeof result.value.text === 'string' && result.value.text.trim() !== ''
        ) {
          inputActions?.setDraft(result.value.text)
          setFlash(f => f + 1)
          if (result.value.truncated === true) {
            showNote('info', '已优化（结果因长度上限被截断，可继续编辑）')
          }
        } else if (result && result.ok === false) {
          const err = result.error
          showNote('error', err?.code === 'cancelled' ? '已取消优化，草稿保持原文' : (err?.message ?? '优化失败，已保留原文'))
        } else {
          showNote('error', '优化失败，已保留原文')
        }
      }, (error: unknown) => {
        if (tokenRef.current !== token) return
        tokenRef.current = null
        abortRef.current = null
        setBusy(false)
        showNote('error', '优化失败：' + errorText(error))
      })
  }

  function cancelOptimize() {
    const token = tokenRef.current
    if (token === null) return
    tokenRef.current = null
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort('prompt-optimizer: canceled by user')
    setBusy(false)
    showNote('info', '已取消优化，草稿保持原文')
  }

  React.useEffect(() => {
    optimizeRef.current = optimize
  })

  // Unmount (session switch / plugin stop) cancels the in-flight request: the
  // abort signal reaches the host through the Connection transport.
  React.useEffect(() => () => {
    tokenRef.current = null
    abortRef.current?.abort('prompt-optimizer: composer unmounted')
    abortRef.current = null
  }, [])

  // Alt+O: skip handled keys, IME composition, and form-control targets. The
  // composer is a contenteditable, so typing there still triggers.
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key !== 'o' && event.key !== 'O') return
      const target = event.target as { tagName?: unknown } | null
      if (target && typeof target.tagName === 'string') {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      event.preventDefault()
      optimizeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const children = [
    createElement('button', {
      key: 'mode',
      type: 'button',
      className: mode === 'optimize' ? 'dspo-pill dspo-pill-active' : 'dspo-pill',
      onClick: toggleMode,
      disabled: busy,
      title: mode === 'optimize'
        ? '提示词优化模式已开启，点击切换回普通模式'
        : '点击开启提示词优化模式（Alt+O 可直接优化当前草稿）',
    }, mode === 'optimize' ? '✨ 优化模式' : '普通模式'),
  ]

  if (mode === 'optimize' && !busy) {
    children.push(createElement('button', {
      key: 'run',
      type: 'button',
      className: 'dspo-action',
      onClick: optimize,
      disabled: draft.trim() === '',
      title: '基于当前会话上下文优化输入框中的草稿（Alt+O）',
    }, '优化提示词'))
  }

  if (busy) {
    children.push(createElement('span', { key: 'busy', className: 'dspo-busy' },
      createElement('span', { className: 'dspo-spinner' }),
      '优化中…',
      createElement('button', { key: 'cancel', type: 'button', className: 'dspo-cancel', onClick: cancelOptimize }, '取消'),
    ))
  }

  if (!busy && flash > 0) {
    // Auto-dismiss after the fade animation: onAnimationEnd unmounts the
    // span entirely, so it never keeps occupying layout space in the tool row.
    children.push(createElement('span', {
      key: `flash${flash}`,
      className: 'dspo-flash',
      onAnimationEnd: () => setFlash(0),
    }, '✓ 已优化，可继续编辑'))
  }

  if (!busy && note) {
    children.push(createElement('span', {
      key: `note${note.seq}`,
      className: `dspo-note dspo-note-${note.kind}`,
      title: note.text,
      onAnimationEnd: () => setNote(null),
    }, note.text))
  }

  return createElement('div', { className: 'dspo-root' }, children)
}

// The component reads ctx.connection through a module-level ref set in apply:
// React elements cannot close over the Cordis context directly, and the slot
// render function only receives slot props.
let ctxRef: { connection?: ConnectionHandle } | null = null

export function apply(ctx: ClientContext): void {
  ctxRef = (ctx as unknown as { connection?: ConnectionHandle })

  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const element = document.createElement('style')
    element.textContent = CSS
    document.head.append(element)
    return () => { element.remove() }
  }, 'prompt-optimizer: styles')

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    {
      name: 'conversation.input.right',
      id: 'prompt-optimizer-toggle',
      order: 10,
      label: '提示词优化',
    },
    props => createElement(PromptOptimizerToggle, props),
  ))
}
