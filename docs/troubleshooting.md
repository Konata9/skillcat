# 已知限制与常见问题

## 已知限制

- **触发词提取是确定性的文本分析**，不会理解未写入 metadata 的语义。启发式重叠存在少量误报，
  UI 会展示共享词供判断。
- **GitHub 来源的锁哈希是 git tree hash**，无法在本地直接比对，只能检测"自上次扫描后的变化"，
  因此这类 skill 的 `local-modified` 是 `info` 级。
- **远程搜索优先调用 skills.sh 公开接口**，失败时回退 `npx skills find` 的文本解析；两者字段
  不完全一致。
- **不支持编辑 SKILL.md 内容**：请用详情页的"打开 SKILL.md"交给外部编辑器。
- **预构建产物提供 macOS 与 Windows，且未签名**。本地自用无碍，跨机器分发需自行签名 / 公证。

## 常见问题

### 正式版里出现了我开发时的配置或 API Key

配置目录按构建类型隔离：正式版用 `skillcat`，开发版（`pnpm desktop`）用 `skillcat-dev`，
两者互不读取。配置也从不进入安装包（只打包 `out/**` 与 `package.json`），release 流程还会运行
`pnpm check:secrets` 校验产物不含配置或密钥。

若你在旧版本（两者共用同一目录）之后升级，正式版可能读到旧配置。删除
`~/Library/Application Support/skillcat`（Windows 为 `%APPDATA%\skillcat`）后重开，即为干净首启
（`roots`/`projects` 为空，只扫描全局）。注意这会同时清除该目录下的设置，请按需先备份。

### 应用打不开，提示"已损坏"或"无法验证开发者"

产物未签名。macOS 上 Gatekeeper 会拦截首次打开，可右键 → **打开**，或清除隔离属性（应用位于
`/Applications` 需要 `sudo`）：

```bash
sudo xattr -dr com.apple.quarantine /Applications/SkillCat.app
```

Windows 上 SmartScreen 会提示未知发布者，选择 **更多信息 → 仍要运行**；企业环境可能还需要在
安全策略中放行。

### 设置页显示 skills CLI 不可用

变更操作（安装 / 更新 / 删除）由官方 `skills` CLI 执行：

- **macOS 正式版自带该 CLI**（随包分发，用应用自身的 Electron 运行时以 `ELECTRON_RUN_AS_NODE`
  执行），**无需用户安装 Node.js**。
- **Windows 目前不自带**，改用系统的 Node.js / `npx`，因此需要用户安装 Node.js ≥ 22。

解析顺序：配置覆盖 → 内置 CLI（仅 macOS）→ 当前 `PATH` 的 `npx` → 登录 shell（`$SHELL -lic`，用
`whence -p` / `type -P` 跳过 alias 与函数，并取 `process.execPath` 得到稳定的 Node 路径，再把该
目录并入子进程 `PATH`）。

如果仍不可用（例如你希望使用自带的 npx 版本），可在设置页的 `skillsCommand` 覆盖里填完整命令：

```json
["/Users/you/.local/share/fnm/node-versions/v22.0.0/installation/bin/npx", "skills"]
```

或在设置页的 doctor 中查看解析到的命令与错误。

> 注意：登录 shell 回退会**跳过 `npx` 的 alias**（例如 `alias npx='https_proxy npx'`）。如果你
> 依赖它走代理，请在设置页的"网络"里配置代理，应用会把它注入 CLI 子进程。

### 安装 / 更新 / 远程搜索失败（网络受限）

设置页可启用代理（写入子进程的 `HTTP(S)_PROXY` / `NO_PROXY`，进程内请求走 Electron session）。
安装依赖与打包时也可使用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  pnpm install --registry=https://registry.npmmirror.com/

ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
  pnpm dist
```

### 首次运行没有数据 / 看不到项目

需要在设置里配置**扫描根目录**（例如 `~/Workspace`）。SkillCat 会在该根下按 agent marker
自动发现项目；也可以在"项目"页手动添加目录。若扫描根为空，doctor 会给出提示。

### 评估按钮不可用

AI 评估需要先在设置页启用 LLM 并填写端点与模型（需要密钥的供应商还要填密钥）。配置不完整时
`isLlmConfigured()` 返回 `false`，入口不可用。可先用"测试连接"验证。

### 评估结果显示"已过期"

评估保存时记录了输入签名（模型 + 每个 skill 的内容哈希）。扫描结果或模型变化后签名不匹配，
即提示过期，重新运行即可。语言不匹配（保存时的语言与当前界面语言不同）也会提示。

### 检查更新显示"暂无发布版本"

更新源由 `apps/desktop/package.json` 的 `repository` 字段解析得到（当前为 `Konata9/skillcat`）。
项目版本声明在根 `package.json` 的 `version`，构建时会同步到 `apps/desktop/package.json`，
应用内再通过 Electron 的 `app.getVersion()` 读取。公开仓库尚未发布 release 时，GitHub 的
`releases/latest` 返回 404，界面显示"暂无发布版本"并给出发布页链接；发布第一个 release 后即可
检测到新版本。

### 修改了配置文件但不生效

设置页的"重新加载配置"会重新读取 `config.json`、重新解析 CLI 并重新扫描。外部编辑保存后点一下
即可。

### 悬空链接 / 副本漂移是什么

- **悬空符号链接**：agent 目录下的链接指向的目标已不存在（通常是源被删了）。
- **副本漂移**：agent 目录下是实际副本而非符号链接，且副本内容与 canonical 不一致。

两者都可在 skill 详情页看到具体路径，并按提示用 `npx skills` 重装或清理。

### 诊断（doctor）

设置页的 doctor 会汇总：配置目录、CLI 命令与版本、生效代理、锁文件状态，以及警告项
（CLI 不可用、无扫描根、代理地址无效等）。排查问题时先看这里。
