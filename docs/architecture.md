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
│     ├─ manager.ts       SkillManager 门面：配置、扫描、分析、操作
│     ├─ discovery.ts     文件系统发现 + 链接状态计算
│     ├─ skill.ts         SKILL.md / frontmatter 解析
│     ├─ triggers.ts      触发词提取与人工标注合并
│     ├─ similarity.ts    IDF 加权重叠 + 余弦 + Jaccard
│     ├─ analysis.ts      规则引擎
│     ├─ evaluation/      LLM 评估（evaluate / model / prompt / verdicts）
│     ├─ cli/             npx skills 适配、代理、远程搜索
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
`domain`（skill/项目模型）、`findings`（分析/诊断）、`config`、`storage`、`cli`、`evaluation`。

## 数据流

1. **启动**（`main/bootstrap.ts`）：`manager.init()` 读取配置与 sidecar（标注、上次扫描哈希、
   已保存的评估），解析 `skills` CLI；随后执行一次 `refresh()`。首次扫描失败不会阻止应用启动。
2. **扫描**（`core/discovery.ts`）：读取全局与项目锁文件，枚举 canonical 目录、各 agent 目录与
   自定义目录，解析每个 skill，计算内容哈希与各 agent 的链接状态，合并人工标注。
3. **分析**（`core/analysis.ts`）：对全部记录运行确定性 + 启发式规则，得到 `baseFindings`；
   再把已保存的 AI 判定（verdicts）应用到 findings 上。
4. **广播**：`SkillManager` 通过 `onChange` 通知订阅者；主进程把状态经 IPC 推给渲染进程。
5. **操作**：所有变更（add / remove / update）由 `SkillManager` 构造参数并委托 `npx skills`，
   以 `AsyncOp`（流式行 + 结果 Promise + cancel）形式返回给 UI 抽屉展示。

## 进程与安全

- **main**：唯一持有文件系统与子进程能力的地方。创建 `SkillManager`，注册 IPC，
  负责窗口、系统对话框、打开/定位文件、`shell.openExternal`。
- **preload**：`contextBridge` 暴露类型化 API，渲染进程不直接接触 Node。
- **renderer**：React 界面，通过 `@shared/contract` 的类型与 preload 通信。

安全边界：`contextIsolation: true` + `nodeIntegration: false`；IPC 参数经 zod 校验；
渲染进程不接触文件系统。主进程启动时会设置窗口 `backgroundColor` 并等待 `ready-to-show`，
避免白屏闪烁。

## 代理

Node 全局 `fetch` 会忽略进程启动后再设置的代理环境变量，因此：

- **子进程**：`npx skills` 运行时注入 `HTTP(S)_PROXY` / `NO_PROXY`（`core/cli/proxy.ts`）。
- **进程内请求**：Electron 主进程配置 `session.defaultSession.setProxy`，并把绑定该 session 的
  `net.fetch` 注入 `SkillManager.setRemoteFetch`，供远程搜索、榜单、LLM 探测、更新检查使用。

## 构建与打包

开发模式下 `electron.vite.config.ts` 把 `@skillcat/core` 及其子路径别名到 **源码**，因此修改 core
会触发热更新 / 重启，无需先 `core build`，也不用重启 `pnpm desktop`。

打包时 `@skillcat/core`、`zod`、`execa` 等全部被 Vite 打进 main bundle，renderer 也是打包产物，
所以应用内不含 `node_modules`（asar 仅含 `out/` 与 `package.json`）。

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
