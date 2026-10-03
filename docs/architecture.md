# 架构

SkillCat 采用 **Core + UI** 分层：核心逻辑与界面完全解耦，核心可以驱动 Electron、CLI 或未来的
Web UI。

## 分层

```
┌─────────────────────────────────────────────────────────────┐
│ apps/desktop                        Electron 44 + React 19   │
│  ├─ src/main       主进程：SkillManager 实例、IPC、状态广播   │
│  ├─ src/preload    contextBridge 暴露类型化 API               │
│  ├─ src/shared     IPC 契约（频道常量 + 类型）                │
│  └─ src/renderer   React 界面（视图 / 组件 / hooks / i18n）   │
└───────────────▲─────────────────────────────────────────────┘
                │  类型化 IPC（zod 校验）
┌───────────────┴─────────────────────────────────────────────┐
│ packages/core                        纯 TS，零 UI 依赖        │
│  发现 discovery · 解析 skill · 触发词 triggers · 相似度        │
│  分析 analysis · LLM 评估 evaluation · CLI 适配 · 项目注册表   │
└──────────────────────────────────────────────────────────────┘
```

**关键约束**：`@skillcat/core` 不产出任何面向展示的字符串。分析与诊断信息以
`{ code, params }` 结构化返回（`FindingCode` / `DoctorWarningCode`），由 UI 翻译；字典 key 与
code 之间有编译期覆盖校验，新增规则时不会漏翻译。

## 仓库结构

```
skillcat/
├─ package.json           根脚本：build / typecheck / test / desktop / dist
├─ pnpm-workspace.yaml    workspace：packages/* 与 apps/*
├─ tsconfig.base.json
├─ packages/core/         @skillcat/core
│  └─ src/
│     ├─ index.ts         公共 API（消费者只从这里 import）
│     ├─ manager.ts       SkillManager 门面：状态、刷新、操作编排
│     ├─ manager/         门面协作者（state / settings / evaluation / doctor）
│     ├─ scan.ts          扫描流水线（全局 + 各项目），供 manager 调用
│     ├─ discovery.ts     文件系统发现（枚举 skill 目录）
│     ├─ discovery/links.ts  各 agent 的链接状态计算
│     ├─ skill.ts         SKILL.md / frontmatter 解析
│     ├─ triggers.ts      触发词提取与人工标注合并
│     ├─ bridge/          运行触发监听：适配器注册表、收件箱、匹配、统计
│     ├─ similarity.ts    IDF 加权重叠 + 余弦 + Jaccard
│     ├─ analysis.ts      规则引擎：ANALYSIS_RULES 注册表 + 结果排序
│     ├─ rules/           独立规则模块（records / scopes / similarity / helpers）
│     ├─ findings.ts      finding 排序（规则引擎与 AI 判定共用）
│     ├─ keys.ts          skill 身份与投影（recordKey / skillRef …）
│     ├─ evaluation/      LLM 评估（run / json / candidates / normalize / prompt / model / verdicts）
│     ├─ cli/             skills CLI 适配、操作构造（operations）、代理、远程搜索（remote-search/）
│     ├─ coerce.ts        frontmatter / API 值的强制转换，unknown 错误 → message
│     ├─ http.ts          带超时的 fetch + JSON 解析封装
│     ├─ config.ts        config.json 持久化与净化
│     ├─ sidecar.ts       annotations / state / evaluation sidecar
│     ├─ paths.ts         跨平台路径布局
│     ├─ agents.ts        已知 agent 目录表
│     └─ types/           按域拆分的类型定义
└─ apps/desktop/
   ├─ electron-builder.yml   打包配置
   ├─ electron.vite.config.ts 三端（main / preload / renderer）构建配置
   └─ src/{main,preload,shared,renderer}
```

`packages/core/src/types.ts` 只做 re-export，实际定义按域拆分在 `src/types/`：
`domain`（skill/项目模型）、`findings`（分析/诊断）、`config`、`storage`、`cli`、`evaluation`、`bridge`。

## 数据流

1. **启动**（`main/bootstrap.ts`）：`manager.init()` 读取配置与 sidecar（标注、上次扫描哈希、
   已保存的评估），解析 `skills` CLI；随后执行一次 `refresh()`。首次扫描失败不会阻止应用启动。
2. **扫描**（`core/discovery.ts`）：读取全局与项目锁文件，枚举 canonical 目录、各 agent 目录与
   自定义目录，解析每个 skill，计算内容哈希与各 agent 的链接状态，合并人工标注。
3. **分析**（`core/analysis.ts`）：按 `rules/` 注册表对全部记录运行确定性 + 启发式规则，得到
   `baseFindings`；再把已保存的 AI 判定（verdicts）应用到 findings 上。新增规则只需添加一个
   规则模块并登记到 `ANALYSIS_RULES`，无需改动引擎。
4. **广播**：`SkillManager` 通过 `onChange` 通知订阅者；主进程把状态经 IPC 推给渲染进程。
5. **操作**：所有变更（add / remove / update）由 `SkillManager` 构造参数并委托官方 `skills` CLI，
   以 `AsyncOp`（流式行 + 结果 Promise + cancel）形式返回给 UI 抽屉展示。macOS 正式版自带该 CLI
   （`resources/skills-cli`，由 `scripts/bundle-skills-cli.mjs` 生成），用应用自身的 Electron
   二进制以 `ELECTRON_RUN_AS_NODE` 运行，因此**不依赖宿主系统的 Node**；Windows 使用系统
   Node / `npx`。
6. **运行监听（可选）**：用户在设置中安装某个 agent 的 bridge 插件后，插件把触发记录追加到
   配置目录的 `runtime-spool.jsonl`；`BridgeService` 监听配置目录并按文件名过滤，用 `bridge/registry.ts` 中
   注册的适配器把记录归一化、匹配到已扫描的 skill，写入 `runtime-events.json` 并广播。适配器
   是唯一的 agent 相关代码，新增 agent 只加一个适配器模块。详见
   [integrations.md](./integrations.md)。

## 进程与安全

- **main**：唯一持有文件系统与子进程能力的地方。创建 `SkillManager`，注册 IPC，
  负责窗口、系统对话框、打开/定位文件、`shell.openExternal`。
- **preload**：`contextBridge` 暴露类型化 API，渲染进程不直接接触 Node。
- **renderer**：React 界面，通过 `@shared/contract` 的类型与 preload 通信。

安全边界：`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`；IPC 参数经 zod
校验；渲染进程不接触文件系统。窗口锁定在自身文档内：阻止 `will-navigate` 离开当前页面，
`setWindowOpenHandler` 拒绝新窗口，两者的 https 目标都转交系统浏览器打开（`openExternal`
在主进程侧也再次校验仅允许 https）。渲染页面的 CSP 由 `electron.vite.config.ts` 中的
`skillcat-csp` 插件注入：开发模式允许 Fast Refresh 所需的内联脚本与 Vite websocket，
生产模式收紧为 `script-src 'self'`、`connect-src 'none'`（开发模式放宽以支持 Fast Refresh）；
两种模式都附加 `object-src 'none'` / `base-uri 'self'` / `form-action 'none'`。主进程还对
`session.defaultSession` 设置 `setPermissionRequestHandler` / `setPermissionCheckHandler`，一律
拒绝可选权限（媒体、地理位置、通知等）。主进程启动时会
设置窗口 `backgroundColor` 并等待 `ready-to-show`，避免白屏闪烁。请求频道在
`shared/contract.ts` 的 `CH` 中声明（事件频道在 `EVENTS`），`main/ipc.ts` 以一个
`Record<Channel, handler>` 注册：漏写或写错频道都是编译错误。

## 代理

Node 全局 `fetch` 会忽略进程启动后再设置的代理环境变量，因此：

- **子进程**：`skills` CLI 运行时注入 `HTTP(S)_PROXY` / `NO_PROXY`（`core/cli/proxy.ts`）。
- **进程内请求**：Electron 主进程配置 `session.defaultSession.setProxy`，并把绑定该 session 的
  `net.fetch` 注入 `SkillManager.setRemoteFetch`，供远程搜索、榜单、LLM 探测、更新检查使用。

## 构建与打包

开发模式下 `electron.vite.config.ts` 把 `@skillcat/core` 及其子路径别名到 **源码**，因此修改 core
会触发热更新 / 重启，无需先 `core build`，也不用重启 `pnpm desktop`。

打包时 `@skillcat/core`、`zod`、`execa` 等全部被 Vite 打进 main bundle，renderer 也是打包产物，
所以应用内不含 `node_modules`（asar 仅含 `out/` 与 `package.json`）。

唯一的例外是内置的 `skills` CLI（**仅 macOS**）：`scripts/bundle-skills-cli.mjs` 把 `skills` 及其
运行时依赖闭包（`tar` / `yaml` 等）拷贝到 `apps/desktop/resources/skills-cli/`，再由
`electron-builder.yml` 中 `mac.extraResources` 放到应用的 `Resources/skills-cli/`（在 asar 之外，
可直接执行）。Windows 暂不内置，运行时回退到系统 Node / `npx`。

产物为未签名 macOS 应用（`electron-builder.yml` 中 `mac.identity: null`），输出到
`apps/desktop/release/`（dmg + zip + `mac-arm64/SkillCat.app`）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Electron 44、electron-vite 5、electron-builder 26 |
| 界面 | React 19、Tailwind CSS v4、Radix Primitives、CVA、lucide-react |
| 校验 | zod 4 |
| 子进程 | execa 10 |
| LLM | Vercel AI SDK 7（`@ai-sdk/anthropic`、`@ai-sdk/openai-compatible`）、jsonrepair |
| 解析 | yaml、自定义 frontmatter 解析 |
| 测试 | Vitest 3、Testing Library、jsdom |
