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
import type { Context } from '@deepseek-ai/cordis';
/** The Connection RPC channel this plugin owns. Must match src/client/index.ts. */
export declare const RPC_CHANNEL = "/prompt-optimizer";
/**
 * Required services. `llm` streams the optimization; `sessionQuery` reads the
 * current session surface for context. `agentDefaultModel` is read through
 * `ctx.get` because it is an optional fallback.
 */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
