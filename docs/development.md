# 开发

## 环境要求

- Node.js ≥ 22
- pnpm 11（`packageManager` 固定为 `pnpm@11.22.0`）

## 常用命令

在仓库根目录运行：

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm desktop` | 构建 core 并以开发模式启动 Electron |
| `pnpm build` | 构建 core 与 desktop |
| `pnpm typecheck` | 全 workspace 类型检查 |
| `pnpm test` | core 单测 + 桌面端 IPC/组件/交互测试 |
| `pnpm dist` | 打包 macOS 应用（dmg + zip） |

单包运行：

```bash
pnpm --filter @skillcat/core test
pnpm --filter @skillcat/desktop test
```

开发模式下 `electron.vite.config.ts` 把 `@skillcat/core` 别名到源码，修改 core 会触发热更新 /
重启，无需先构建 core。

## 项目结构

```
packages/core/   纯 TS，零 UI 依赖：发现、解析、触发词、相似度、分析、
                 LLM 评估、CLI 适配、项目注册表
                 （分析/诊断以 { code, params } 返回，不含展示文案）
apps/desktop/    Electron 44 + electron-vite + React 19
├─ src/main       主进程：SkillManager + IPC（zod 校验）+ 状态广播
├─ src/preload    contextBridge 暴露类型化 API
├─ src/shared     IPC 契约（频道常量 + 类型）
└─ src/renderer   React 界面
   ├─ components/ui  原语组件（button/badge/dialog/table…，仓库内自有源码）
   ├─ components     业务组件与外壳
   ├─ hooks          API 驱动的状态（useOperations/useProjects/useScopes/…）
   ├─ views          页面组合（Skills/Analysis/Projects/Search/Settings）
   └─ lib            cn()、格式化、i18n 字典与 Provider、主题、导航模型
```

## 模块导入约束

- 消费者只从 `@skillcat/core` 入口 import；内部模块是实现细节。
- 渲染进程**只能** import 类型与纯函数子路径（`@skillcat/core/keys`、`/proxy`、`/llm`）。
  其余入口会经 `index → execa` 把 Node 依赖带进浏览器包。
- core 不产出面向展示的字符串。分析与诊断信息以 `{ code, params }` 结构化返回，由 UI 翻译；
  `FindingCode` / `DoctorWarningCode` 与 i18n 字典 key 之间有编译期覆盖校验。

## i18n

文案字典位于 `apps/desktop/src/renderer/src/lib/i18n/messages.{zh,en}.ts`。英文包以
`Record<MessageKey, MessageValue>` 约束，缺 key 直接编译报错。支持 `{param}` 插值与
`Intl.PluralRules` 复数。

## 新增一个 agent

只需在 `packages/core/src/agents.ts` 的 `ROWS` 表中加一行：

```ts
[id, display, projectDirs, globalDirs]
```

- `projectDirs` / `globalDirs` 为相对项目根 / 用户主目录的路径数组，按优先级排列
  （agent 原生目录在前，`npx skills` 安装目标与兼容目录在后）。
- 项目作用域不支持时传 `null`，全局作用域不支持时传 `null`。
- 项目 marker 与扫描目录都由该表派生，无需改其他地方。

## 测试

- core 单测位于 `packages/core/src/__tests__/`，覆盖发现、解析、触发词、相似度、分析、评估、
  CLI 输出解析、项目注册表等。
- 桌面端测试位于 `apps/desktop/src/**/*.test.ts(x)`，覆盖 IPC、启动流程、组件与交互。
- LLM 相关测试通过注入 `ModelCaller` 避免真实网络请求。

提交 PR 前请运行：

```bash
pnpm typecheck
pnpm test
```

## 版本与发布

应用版本只有一处来源：`apps/desktop/package.json` 的 `version`。Electron 的 `app.getVersion()`
读取它，electron-builder 也用它命名产物（`SkillCat-<version>-arm64.dmg`）。发版时改这一个字段，
再打 tag（`v<version>`）并在 GitHub 创建对应 release 即可。

应用内"检查更新"从 `apps/desktop/package.json` 的 `repository` 字段解析出 `owner/repo`，
查询 GitHub 的 `releases/latest` 并与当前版本比较。仓库暂无 release 时不会报错，而是提示
"暂无发布版本"。

## 打包

`pnpm dist` 使用 electron-builder 产出未签名应用（`mac.identity: null`），输出到
`apps/desktop/release/`。`@skillcat/core`、`zod`、`execa` 等会被 Vite 打进 main bundle，
asar 仅含 `out/` 与 `package.json`。

应用图标：`apps/desktop/build/icon.icns`（macOS）、`icon.ico`（Windows）、`icon.png`（Linux）。

需要正式签名 / 公证时，删除 `mac.identity: null` 并配置 Apple Developer 证书。
