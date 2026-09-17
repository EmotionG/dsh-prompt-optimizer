window.__ModuleLoader__.load({ id: "dsh-prompt-optimizer", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var import_react = require("react");
var RPC_CHANNEL = "/prompt-optimizer";
var CSS = `
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
`;
var inject = ["slots", "connection"];
var persistedMode = "normal";
function errorText(error) {
  if (error instanceof Error && error.message !== "") return error.message;
  if (typeof error === "string" && error !== "") return error;
  return "\u672A\u77E5\u9519\u8BEF";
}
function PromptOptimizerToggle(props) {
  const { useInput, inputActions } = props;
  const useProjection = props.useProjection;
  const sessionId = props.sessionId;
  const [mode, setMode] = React.useState(persistedMode);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const [flash, setFlash] = React.useState(0);
  const noteSeq = React.useRef(0);
  function showNote(kind, text) {
    noteSeq.current += 1;
    setNote({ kind, text, seq: noteSeq.current });
  }
  const draft = useInput ? useInput((s) => s && typeof s.draft === "string" ? s.draft : "") : "";
  const modelProjection = useProjection ? useProjection("modelSelection") : void 0;
  const tokenRef = React.useRef(null);
  const abortRef = React.useRef(null);
  const optimizeRef = React.useRef(() => {
  });
  function toggleMode() {
    if (busy) return;
    const next = mode === "optimize" ? "normal" : "optimize";
    persistedMode = next;
    setMode(next);
    setNote(null);
  }
  function optimize() {
    if (busy || tokenRef.current !== null) return;
    const text = draft.trim();
    if (text === "") {
      showNote("info", "\u8BF7\u5148\u8F93\u5165\u8981\u4F18\u5316\u7684\u5185\u5BB9");
      return;
    }
    const token = `po-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    tokenRef.current = token;
    abortRef.current = controller;
    setBusy(true);
    setNote(null);
    const selection = modelProjection ? modelProjection.next ?? modelProjection.lastUsed : null;
    const payload = { sessionId, draft: text, token };
    if (selection && typeof selection.provider === "string" && typeof selection.model === "string") {
      payload.provider = selection.provider;
      payload.model = selection.model;
      if (typeof selection.reasoningEffort === "string") payload.reasoningEffort = selection.reasoningEffort;
    }
    const connection = ctxRef.connection;
    if (connection === void 0) {
      tokenRef.current = null;
      abortRef.current = null;
      setBusy(false);
      showNote("error", "\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u4F18\u5316");
      return;
    }
    connection.rpc.call(RPC_CHANNEL, "optimize", payload, controller.signal).then((result) => {
      if (tokenRef.current !== token) return;
      tokenRef.current = null;
      abortRef.current = null;
      setBusy(false);
      if (result && result.ok === true && result.value && typeof result.value.text === "string" && result.value.text.trim() !== "") {
        inputActions?.setDraft(result.value.text);
        setFlash((f) => f + 1);
        if (result.value.truncated === true) {
          showNote("info", "\u5DF2\u4F18\u5316\uFF08\u7ED3\u679C\u56E0\u957F\u5EA6\u4E0A\u9650\u88AB\u622A\u65AD\uFF0C\u53EF\u7EE7\u7EED\u7F16\u8F91\uFF09");
        }
      } else if (result && result.ok === false) {
        const err = result.error;
        showNote("error", err?.code === "cancelled" ? "\u5DF2\u53D6\u6D88\u4F18\u5316\uFF0C\u8349\u7A3F\u4FDD\u6301\u539F\u6587" : err?.message ?? "\u4F18\u5316\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u539F\u6587");
      } else {
        showNote("error", "\u4F18\u5316\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u539F\u6587");
      }
    }, (error) => {
      if (tokenRef.current !== token) return;
      tokenRef.current = null;
      abortRef.current = null;
      setBusy(false);
      showNote("error", "\u4F18\u5316\u5931\u8D25\uFF1A" + errorText(error));
    });
  }
  function cancelOptimize() {
    const token = tokenRef.current;
    if (token === null) return;
    tokenRef.current = null;
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort("prompt-optimizer: canceled by user");
    setBusy(false);
    showNote("info", "\u5DF2\u53D6\u6D88\u4F18\u5316\uFF0C\u8349\u7A3F\u4FDD\u6301\u539F\u6587");
  }
  React.useEffect(() => {
    optimizeRef.current = optimize;
  });
  React.useEffect(() => () => {
    tokenRef.current = null;
    abortRef.current?.abort("prompt-optimizer: composer unmounted");
    abortRef.current = null;
  }, []);
  React.useEffect(() => {
    if (typeof document === "undefined") return void 0;
    function onKeyDown(event) {
      if (event.defaultPrevented || event.isComposing) return;
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "o" && event.key !== "O") return;
      const target = event.target;
      if (target && typeof target.tagName === "string") {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      event.preventDefault();
      optimizeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const children = [
    (0, import_react.createElement)("button", {
      key: "mode",
      type: "button",
      className: mode === "optimize" ? "dspo-pill dspo-pill-active" : "dspo-pill",
      onClick: toggleMode,
      disabled: busy,
      title: mode === "optimize" ? "\u63D0\u793A\u8BCD\u4F18\u5316\u6A21\u5F0F\u5DF2\u5F00\u542F\uFF0C\u70B9\u51FB\u5207\u6362\u56DE\u666E\u901A\u6A21\u5F0F" : "\u70B9\u51FB\u5F00\u542F\u63D0\u793A\u8BCD\u4F18\u5316\u6A21\u5F0F\uFF08Alt+O \u53EF\u76F4\u63A5\u4F18\u5316\u5F53\u524D\u8349\u7A3F\uFF09"
    }, mode === "optimize" ? "\u2728 \u4F18\u5316\u6A21\u5F0F" : "\u666E\u901A\u6A21\u5F0F")
  ];
  if (mode === "optimize" && !busy) {
    children.push((0, import_react.createElement)("button", {
      key: "run",
      type: "button",
      className: "dspo-action",
      onClick: optimize,
      disabled: draft.trim() === "",
      title: "\u57FA\u4E8E\u5F53\u524D\u4F1A\u8BDD\u4E0A\u4E0B\u6587\u4F18\u5316\u8F93\u5165\u6846\u4E2D\u7684\u8349\u7A3F\uFF08Alt+O\uFF09"
    }, "\u4F18\u5316\u63D0\u793A\u8BCD"));
  }
  if (busy) {
    children.push((0, import_react.createElement)(
      "span",
      { key: "busy", className: "dspo-busy" },
      (0, import_react.createElement)("span", { className: "dspo-spinner" }),
      "\u4F18\u5316\u4E2D\u2026",
      (0, import_react.createElement)("button", { key: "cancel", type: "button", className: "dspo-cancel", onClick: cancelOptimize }, "\u53D6\u6D88")
    ));
  }
  if (!busy && flash > 0) {
    children.push((0, import_react.createElement)("span", {
      key: `flash${flash}`,
      className: "dspo-flash",
      onAnimationEnd: () => setFlash(0)
    }, "\u2713 \u5DF2\u4F18\u5316\uFF0C\u53EF\u7EE7\u7EED\u7F16\u8F91"));
  }
  if (!busy && note) {
    children.push((0, import_react.createElement)("span", {
      key: `note${note.seq}`,
      className: `dspo-note dspo-note-${note.kind}`,
      title: note.text,
      onAnimationEnd: () => setNote(null)
    }, note.text));
  }
  return (0, import_react.createElement)("div", { className: "dspo-root" }, children);
}
var ctxRef = null;
function apply(ctx) {
  ctxRef = ctx;
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {
    };
    const element = document.createElement("style");
    element.textContent = CSS;
    document.head.append(element);
    return () => {
      element.remove();
    };
  }, "prompt-optimizer: styles");
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register(
    {
      name: "conversation.input.right",
      id: "prompt-optimizer-toggle",
      order: 10,
      label: "\u63D0\u793A\u8BCD\u4F18\u5316"
    },
    (props) => (0, import_react.createElement)(PromptOptimizerToggle, props)
  ));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
