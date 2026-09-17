# skillman

本地优先的 Agent SKILL 管理器。盘点全局与各项目的 skill，解释触发条件，发现安装态与语义冲突，并通过 `npx skills` 安全地执行安装 / 更新 / 删除 / 搜索。

架构为 **Core + UI**：`@skillman/core` 是唯一事实来源（零 UI 依赖），当前 UI 为 Electron 桌面端。

## 快速开始

```bash
pnpm install
pnpm desktop    # 桌面端（Electron，开发模式）
```

首次运行会提示设置扫描根目录（例如 `~/Workspace`），用于自动发现项目级 skill。

> 网络受限时安装可用镜像：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install --registry=https://registry.npmmirror.com/`

## 功能

- **库存盘点**：全局（`~/.agents/skills`）与项目（`<project>/.agents/skills`）skill 一览，含来源、锁文件元数据、真实链接状态（符号链接 / 悬空 / 副本漂移）
- **触发画像**：从 `when_to_use`、`dispatch_intent`、`description`（中英模式）、正文 "When to Use / 触发" 小节、名称提取正向触发词与负向排除；支持人工标注（sidecar 存储，不修改 skill 目录）
- **冲突检测**：确定性规则（悬空链接、锁记录缺失、副本漂移、本地修改、跨作用域遮蔽、来源冲突）+ 启发式规则（触发词重叠、负向矛盾、正文重复、description 触发信息缺失）
- **项目发现**：扫描根下按 marker 自动发现项目，收藏 / 最近访问；注册表只存路径，删除条目不会删除文件
- **操作代理**：add / remove / update / 远程搜索全部委托给 `npx skills`，流式进度与二次确认

## 桌面端

- 左侧：Skills / 冲突 / 项目 / 搜索 / 设置；作用域列表（全局 + 各项目）
- Skills：列表 + 详情（触发画像、链接状态、文件、正文），详情页可直接打开 / 定位 / 编辑触发词 / 更新 / 删除
- 冲突：按级别筛选，右侧显示说明、建议、证据与相关 skill
- 项目：收藏、添加目录（系统目录选择器）、移除注册、重新发现
- 搜索：调用 skills.sh，选中后安装到当前作用域
- 设置：扫描根、阈值、CLI 命令覆盖、网络代理、internal 显示、诊断（doctor）
- 代理：设置页开关启用后写入 `npx skills` 子进程环境（`HTTP(S)_PROXY`/`NO_PROXY`），远程搜索走 Electron session 的 `net.fetch`，GUI 启动的进程同样生效
- 所有变更操作通过 `npx skills` 执行，底部抽屉流式显示输出并可取消

安全边界：`contextIsolation` + `nodeIntegration: false`，IPC 参数经 zod 校验，渲染进程不接触文件系统。

UI 技术栈：Tailwind CSS v4（主题 tokens 定义在 `src/renderer/src/index.css`）+ Radix Primitives（Dialog）+ CVA 变体。`components/ui/` 是仓库内自有的原语组件（shadcn 风格，源码可改），业务组件与视图在其上组合。

主题：亮色 / 暗色双主题，**默认亮色**，侧边栏底部一键切换（localStorage 记忆）。所有颜色通过语义 tokens（`bg-background`、`text-muted-foreground`、`border-border`…）引用，组件内不写死颜色，新增界面自动适配两套主题。

多语言：中文 / English，**默认跟随系统语言**（`navigator.language`），侧边栏底部一键切换、设置页亦可选择（localStorage 记忆）。文案字典位于 `src/renderer/src/lib/i18n/messages.{zh,en}.ts`，英文包以 `Record<MessageKey, MessageValue>` 约束，缺 key 直接编译报错；支持 `{param}` 插值与 `Intl.PluralRules` 复数。core 不产出面向展示的字符串——冲突与诊断信息以 `{ code, params }` 结构化返回，由 UI 翻译（`FindingCode`/`DoctorWarningCode` 与字典 key 有编译期覆盖校验），因此新增规则时不会漏翻译。

## 打包为独立应用

```bash
pnpm dist   # 产出 apps/desktop/release/ 下的 dmg、zip 与 mac-arm64/skillman.app
```

产物为未签名应用（`electron-builder.yml` 中 `mac.identity: null`）：

- 本机直接双击可用；拷贝到其他 Mac 首次打开需右键 → 打开，或执行
  `xattr -dr com.apple.quarantine /Applications/skillman.app`
- 需要正式签名/公证时，删除 `mac.identity: null` 并配置 Apple Developer 证书
- 应用图标：放置 `apps/desktop/build/icon.icns`（或 512×512 的 `icon.png`）后重新打包

网络受限时使用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
pnpm dist
```

实现要点：`@skillman/core`、`zod`、`execa` 等全部被 Vite 打进 main bundle，renderer 亦为打包产物，因此应用内不含 `node_modules`（asar 仅含 `out/` 与 `package.json`）。

## 设计边界

- **读写分离**：读取走文件系统 + 锁文件（快速、离线可用）；写入一律委托 `npx skills`（带显式 `cwd` 与 `--global/--project`），不重造安装逻辑
- **统一身份**：skill 身份（`scope|project|name`）与标注键（追加内容哈希）由 `packages/core/src/keys.ts` 单点推导，扫描、冲突与 UI 共用同一实现
- **只读安全**：默认不写入 skill 目录、锁文件或 agent 目录；人工标注存于配置目录的 sidecar
- **作用域模型**：项目作用域由 `cwd` 决定，项目锁为 `<project>/skills-lock.json`；项目级同名 skill 会遮蔽全局版本，工具会明确提示
- **冲突分级**：确定性 vs 启发式，后者标注置信度与共享词证据，阈值可配置

## 冲突规则

| 规则 | 级别 | 类型 |
|---|---|---|
| 悬空符号链接 | error | 确定性 |
| 锁记录目录缺失 | error | 确定性 |
| 副本与源不一致 | warn | 确定性 |
| 本地内容与安装时不一致（sha256 来源精确比对；GitHub 来源比对上次扫描） | warn/info | 确定性 |
| 跨作用域同名遮蔽 / 同名不同来源 | info/warn | 确定性 |
| 手动 skill（无锁记录） | info | 确定性 |
| CLI 声明安装但缺少链接（按 agent 聚合） | info | 确定性 |
| 触发词重叠（加权 IDF 重叠系数 + 余弦） | info | 启发式 |
| 负向排除命中他人正向触发 | info | 启发式 |
| 正文高度重复 | warn | 启发式 |
| description 缺少触发信号 | info | 确定性 |

触发词重叠的默认阈值为 `0.3`（配置项 `thresholds.overlap`）。同名前缀家族（`hyperframes` ↔ `hyperframes-cli`）自动跳过。

## 配置与数据

- 配置目录：macOS `~/Library/Application Support/skillman/`，Linux `$XDG_CONFIG_HOME/skillman/`，可用 `SKILLMAN_CONFIG_DIR` 覆盖
- `config.json`：扫描根、项目注册表、CLI 命令覆盖（`skillsCommand`，用于 GUI 或 fnm 等 PATH 场景）、阈值
- `annotations.json`：人工触发词标注（按 skill 内容哈希失效）
- `state.json`：上次扫描的内容哈希（用于漂移提示）

## 开发

```
packages/core   纯 TS，零 UI 依赖：发现、解析、触发词、相似度、冲突、CLI 适配、项目注册表
                （冲突/诊断信息以 { code, params } 返回，不含展示文案）
                types.ts 仅做 re-export；定义按域拆分在 src/types/：
                domain（skill/项目模型）、findings（冲突/诊断）、config、storage、cli
                renderer 只可 import 类型与纯函数子路径（@skillman/core/keys、/proxy），
                其余入口会经 index → execa 把 Node 依赖带进浏览器包
apps/desktop    Electron 44 + electron-vite + React 19
├─ src/main       主进程：SkillManager + IPC（zod 校验）+ 状态广播
├─ src/preload    contextBridge 暴露类型化 API
├─ src/shared     IPC 契约（频道常量 + 类型）
└─ src/renderer   React 界面
   ├─ components/ui  原语组件（button/badge/dialog/table…，仓库内自有源码）
   ├─ components     业务组件与外壳（SkillList/SkillDetail/TriggerEditor/AppSidebar/AppToolbar/ConfirmFlows…）
   ├─ hooks          API 驱动的状态（useOperations/useProjects/useScopes/useAnnotationEditor）
   ├─ views          页面组合（Skills/Conflicts/Projects/Search/Settings），纯展示、经 props 回调交互
   └─ lib            cn()、格式化、i18n 字典与 Provider、主题、导航模型
```

```bash
pnpm typecheck
pnpm test        # core 单测 + 桌面端 IPC/组件/交互测试
pnpm build
```

## 已知限制

- 触发词提取是确定性的文本分析，不会理解未写入 metadata 的语义；启发式重叠存在少量误报，UI 会展示共享词供判断
- GitHub 来源的锁哈希是 git tree hash，无法在本地直接比对，只能检测"自上次扫描后的变化"
- 远程搜索优先调用 skills.sh 公开接口，失败时回退 `npx skills find` 文本解析
- 暂不支持编辑 SKILL.md 内容（用详情页的"打开 SKILL.md"交给外部编辑器）
- 桌面端产物未签名（本地自用无碍，跨机器分发需自行签名/公证）
