# 配置与数据

SkillCat 的所有持久化数据都放在**配置目录**，不写入 skill 目录、锁文件或 agent 目录。

## 配置目录

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/skillcat/` |
| Windows | `%APPDATA%\skillcat\` |
| Linux | `$XDG_CONFIG_HOME/skillcat/`（默认 `~/.config/skillcat/`） |

可用环境变量覆盖：`SKILLCAT_CONFIG_DIR`。旧变量 `SKILLMAN_CONFIG_DIR` 仍然兼容；设置后两种构建都使用该目录。

### 开发版与正式版隔离

开发版（`pnpm desktop`）使用独立的 `skillcat-dev` 目录，与正式产物完全隔离，因此开发时的配置
不会被正式版读取，正式版的配置也不会被开发版覆盖：

| 构建 | 目录 |
| --- | --- |
| 正式产物（`pnpm dist:*` 打出的 app） | 上表中的 `skillcat/` |
| 开发版（`pnpm desktop`） | 同级的 `skillcat-dev/`（macOS 为 `~/Library/Application Support/skillcat-dev/`） |

正式产物的配置目录在所有版本间保持稳定：**覆盖安装 / 更新应用不会清除或覆盖用户配置**。配置
从不进入 app 包（`electron-builder` 只打包 `out/**` 与 `package.json`），release 流程还会运行
`pnpm check:secrets` 校验产物不含配置或密钥。

> 因此，新用户首次打开正式版时项目目录为空（`roots`/`projects` 默认空），只会扫描全局作用域；
> 需要用户自行配置扫描根或添加项目。

## 文件

| 文件 | 内容 |
| --- | --- |
| `config.json` | 应用配置（扫描根、项目注册表、阈值、代理、CLI 覆盖、LLM 设置） |
| `annotations.json` | 人工触发词标注，按 `scope\|project\|name\|contentHash` 键控 |
| `state.json` | 上次扫描的内容哈希，用于检测漂移 |
| `evaluation.json` | LLM 评估报告与 AI 判定 |

### `config.json` 字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `version` | `1` | `1` | 配置版本 |
| `roots` | `string[]` | `[]` | 扫描根目录，用于自动发现项目 |
| `projects` | `{ path, alias?, pinned? }[]` | `[]` | 已注册项目；只存路径 |
| `recent` | `string[]` | `[]` | 最近访问（最多 20） |
| `skillsCommand` | `string[] \| null` | `null` | `skills` CLI 命令覆盖（留空则自动探测 `npx`） |
| `proxy.url` | `string` | `''` | 代理地址，如 `http://127.0.0.1:7890`；空为直连 |
| `proxy.bypass` | `string` | `''` | `NO_PROXY` 绕过列表，逗号分隔 |
| `thresholds.overlap` | `number` | `0.3` | 触发词重叠阈值（0–1） |
| `thresholds.duplicate` | `number` | `0.5` | 正文重复阈值（0–1） |
| `showInternal` | `boolean` | `false` | 是否显示 internal skill |
| `maxScanDepth` | `number` | `3` | 项目发现的最大深度（0–8），自动跳过 `node_modules` / `.git` 等 |
| `customSkillDirs` | `string[]` | `[]` | 额外的 skill 容器目录 |
| `llm` | `LlmSettings` | 见下 | 语言模型设置 |

`customSkillDirs` 的解析规则：以 `~` 开头或绝对路径 → 全局作用域；其余 → 每个项目根下的相对
路径。每个条目是一个**容器目录**，其子目录中带 `SKILL.md` 的即为 skill。

### `llm` 字段

```json
{
  "enabled": false,
  "provider": "openai",
  "apiKey": "",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o"
}
```

`enabled` 为 `false` 时忽略其余字段。配置不完整（缺端点、模型，或需要密钥却没填）时
`isLlmConfigured()` 返回 `false`，评估入口不可用。密钥仅保存在本地 `config.json`，
SkillCat 不会上传。

配置读取时会经过净化（`sanitize()`）：未知字段回退默认值，手改坏了的文件不会导致崩溃。

## 外部编辑

设置页提供"打开配置文件 / 在文件夹中显示 / 重新加载配置"。外部编辑保存后点"重新加载配置"
即生效（会重新读取配置、重新解析 CLI 并重新扫描）。

## 从 Skillman 升级

首次启动时，如果默认配置目录下还没有 `config.json`，而旧的 `skillman` 目录里存在配置，
SkillCat 会复制整个旧目录（设置、标注、扫描状态）。自定义 `configDir` 不会被迁移。
`SKILLMAN_CONFIG_DIR` 环境变量仍然兼容。

## 相关路径

- 全局 canonical skill 目录：`~/.agents/skills`
- 全局锁文件：`~/.agents/.skill-lock.json`（设置 `XDG_STATE_HOME` 时为
  `$XDG_STATE_HOME/skills/.skill-lock.json`）
- 项目 canonical skill 目录：`<project>/.agents/skills`
- 项目锁文件：`<project>/skills-lock.json`
- 各 agent 的目录表：`packages/core/src/agents.ts`
