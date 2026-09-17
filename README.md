# dsh-prompt-optimizer

DSH 常驻插件（非动态沙箱包）：在聊天输入框右上角（`conversation.input.right`）注册「普通模式 / ✨ 优化模式」切换。优化模式下基于当前会话上下文、复用当前会话选择的模型优化输入框草稿，结果回填后仍可继续编辑。

## 与动态插件版的差异

本包是**可注册的正式插件**：通过 profile 的 `dsh.profile.bundles` 安装，进程重启后依然生效；而动态插件（`cordis_define`）只在当前进程内存活。

通信机制升级为 Connection RPC 通道（`/prompt-optimizer`）：宿主 handler 收到**真实 AbortSignal**，取消会传播到 LLM 适配器底层传输（动态版只能协作式 break）。

## 目录

| 路径 | 职责 |
|---|---|
| `src/index.ts` | Host 半：注册 `/prompt-optimizer` RPC 通道（`optimize` / `cancel`），读取会话表面作上下文，经 `ctx.llm.stream` 流式生成，AbortController 汇聚传输信号与显式取消。 |
| `src/client/index.ts` | Client 半：`conversation.input.right` 槽位 UI（切换/优化/加载/取消/错误/截断提示/成功渐隐）、Alt+O（IME/表单控件/defaultPrevented 防护）、`setDraft` 回填。 |
| `scripts/build-client.mjs` | esbuild 把 client 源码打成 ModuleLoader closure-factory bundle（`lib/client.js`），react 外部化。 |
| `cordis.patch.yml` | bundle patch：把插件 insert 进 profile 组合。 |

## 安装（web profile）

```powershell
# 在 profile 目录（C:\Users\<user>\.dsh\profiles\web）：
# 1. 添加依赖（file: 指向本包）
#    package.json → dependencies 加 "dsh-prompt-optimizer": "file:D:/developRelevant/product/dshp/dsh-sen-message/dsh-prompt-optimizer"
#    dsh.profile.bundles 加 "dsh-prompt-optimizer"
pnpm install

# 2. 构建本包（在包目录）
npm install   # devDependencies（esbuild/tsc/类型包）
npm run build # 产出 lib/index.js + lib/client.js

# 3. 重启 dsh web（或 dsh plugin 命令管理）
```

`dsh plugin --profile web -- add "file:..."` 也可以管理安装（它转发 pnpm）。

## 行为要点

- **取消链路**：用户取消 / 会话切换卸载 / 插件停止 / 传输关闭，全部汇聚到同一个 AbortController，在传输层中止 LLM 请求（含 DeepSeek 适配器的 idle watchdog 兜底）。
- **模型路由**：会话投影 `modelSelection` 的 `next ?? lastUsed`；provider/model 只传其一时视为整体未提供，回退 agent 默认模型。
- **健壮性**：draft 超 8000 字符截断；`max-tokens` 截断返回 `truncated` 并提示；重复 token 拒绝；消息 id 每请求唯一；上下文最近 10 条、每条 800 字符、总量 6000 字符。
- **状态**：模式选择为模块级变量，跨会话切换保持；插件重载时重置。
