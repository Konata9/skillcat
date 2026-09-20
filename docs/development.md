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

`pnpm typecheck` 与 `pnpm test` 会先构建 `@skillcat/core`：桌面端的类型检查与测试都通过
`@skillcat/core` 的 `dist` 声明解析，而 core 的 `typecheck` 用 `tsc --noEmit` 不产出 `dist`。
因此在干净的检出（如 CI）上直接运行即可，无需手动先 build。

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

项目版本只有一处来源：根 `package.json` 的 `version`。发版时改这一个字段并合并到 `main`，
Release 工作流会自动同步到 `apps/desktop/package.json`（Electron 的 `app.getVersion()` 与
electron-builder 读取它）、构建并发布 `v<version>`。

同步由 `scripts/sync-app-version.mjs` 完成：`pnpm desktop` 与 `pnpm dist` 都会先运行它，也可单独
执行 `pnpm sync-version`。因此应用内版本、产物名（`SkillCat-<version>-arm64.dmg`）与 release tag
始终一致。

应用内"检查更新"从 `apps/desktop/package.json` 的 `repository` 字段解析出 `owner/repo`，
查询 GitHub 的 `releases/latest` 并与当前版本比较。仓库暂无 release 时不会报错，而是提示
"暂无发布版本"。

## 打包

`pnpm dist` 使用 electron-builder 产出未签名应用（`mac.identity: null`），输出到
`apps/desktop/release/`。`@skillcat/core`、`zod`、`execa` 等会被 Vite 打进 main bundle，
asar 仅含 `out/` 与 `package.json`。

应用图标：`apps/desktop/build/icon.icns`（macOS）、`icon.ico`（Windows）、`icon.png`（Linux）。

需要正式签名 / 公证时，删除 `mac.identity: null` 并配置 Apple Developer 证书。

## GitHub Actions

仓库有两个工作流，辅助脚本放在 `scripts/`。两者均使用 Node 24，pnpm 版本由根 `package.json`
的 `packageManager` 字段决定。

### 依赖扫描（`.github/workflows/dependency-audit.yml`）

- 触发：每次 `push`（以及手动 `workflow_dispatch`）。
- `scripts/audit-fix.sh` 运行 `pnpm audit --audit-level=high`；发现 high/critical 时先
  `pnpm audit --fix update` 更新锁文件，仍存在则 `pnpm audit --fix override` 添加 overrides，
  并写出 `audit-report.md` 供 PR 正文使用。
- 随后运行 `pnpm typecheck` 与 `pnpm test`。**只有全部通过**，且当前分支是默认分支时，才通过
  `peter-evans/create-pull-request` 创建 PR（分支 `chore/dependency-audit`，已存在则更新）。
- 工作流需要 `contents: write` 与 `pull-requests: write` 权限；`GITHUB_TOKEN` 推送不会再次触发
  工作流，因此不会循环。
- 仓库需在 Settings → Actions → General 中允许 GitHub Actions 创建 PR（"Allow GitHub Actions to
  create and approve pull requests"），否则最后一步会被拒绝。

### 发布（`.github/workflows/release.yml`）

- 触发：`main` 分支上根 `package.json` 发生变化时（以及手动 `workflow_dispatch`，可传 `force`
  忽略版本变化）。
- `scripts/detect-version-change.sh` 比较当前 `version` 与本次 push 起点（`github.event.before`）
  的 `version`，并检查 `v<version>` tag 是否已存在；只有版本变化且未发布时才继续。
- 在 `macos-latest` 上 `pnpm install --frozen-lockfile` → `pnpm dist`（内含版本同步）→
  `softprops/action-gh-release` 发布 `v<version>`，附带 dmg 与 zip，自动生成 release notes。

发版流程：修改根 `package.json` 的 `version` 并合并到 `main`，工作流会自动构建并发布。若要补发
当前版本（例如版本号已改但尚未发布），可手动运行该工作流并勾选 `force`。
