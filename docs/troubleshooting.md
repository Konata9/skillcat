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

### 应用打不开，提示"已损坏"或"无法验证开发者"

产物未签名。macOS 首次打开下载副本时右键 → **打开**，或执行：

```bash
xattr -dr com.apple.quarantine /Applications/SkillCat.app
```

Windows 上 SmartScreen 会提示未知发布者，选择 **更多信息 → 仍要运行**；企业环境可能还需要在
安全策略中放行。

### 设置页显示 skills CLI 不可用

SkillCat 通过 `npx skills` 执行所有变更操作。若你的 Node 由 fnm / nvm 等版本管理器提供，
GUI 启动的应用可能拿不到正确的 `PATH`。解决方式：在设置页的 `skillsCommand` 覆盖里填完整命令，
例如：

```json
["/Users/you/.local/share/fnm/node-versions/v22.0.0/installation/bin/npx", "skills"]
```

或在设置页的 doctor 中查看解析到的命令与错误。

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
