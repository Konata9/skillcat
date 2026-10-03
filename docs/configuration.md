# 配置与数据

SkillCat 的所有持久化数据都放在**配置目录**，不写入 skill 目录、锁文件或 agent 目录。
唯一的例外是用户在**设置 → 集成**中显式安装的运行监听插件（可一键卸载），见
[integrations.md](./integrations.md)。

## 配置目录

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/skillcat/` |
| Windows | `%APPDATA%\skillcat\` |
| Linux | `$XDG_CONFIG_HOME/skillcat/`（默认 `~/.config/skillcat/`） |

可用环境变量覆盖：`SKILLCAT_CONFIG_DIR`；设置后开发版与正式版都使用该目录。

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
| `config.json` | 应用配置（扫描根、项目注册表、阈值、代理、CLI 覆盖、LLM 与运行记录设置） |
| `annotations.json` | 人工触发词标注，按 `scope\|project\|name\|contentHash` 键控 |
| `state.json` | 上次扫描的内容哈希，用于检测漂移 |
| `evaluation.json` | LLM 评估报告与 AI 判定 |
| `optimizer.json` | 只读 SKILL 优化建议（按 skill 身份键控，手动重新生成才会覆盖） |
| `runtime-spool.jsonl` | 运行监听插件的收件箱：插件逐行追加原始触发记录，SkillCat 消费后清空 |
| `runtime-events.json` | 归一化并与扫描目录匹配后的触发历史（按保留期裁剪） |
| `integrations.json` | 已安装集成清单（文件路径 + 内容哈希），用于可撤销卸载 |
| `logs/main.log` | 诊断日志（按大小轮转，超限时归档为 `main.old.log`，总量受设置约束） |

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
| `showInternal` | `boolean` | `false` | 是否显示 internal skill（含应用自带的内置 skill，如 `skill-optimizer`） |
| `maxScanDepth` | `number` | `3` | 项目发现的最大深度（0–8），自动跳过 `node_modules` / `.git` 等 |
| `customSkillDirs` | `string[]` | `[]` | 额外的 skill 容器目录 |
| `activity` | `ActivitySettings` | 见下 | 运行触发记录的偏好 |
| `logging` | `LoggingSettings` | 见下 | 本地诊断日志偏好 |
| `llm` | `LlmSettings` | 见下 | 语言模型设置 |

`customSkillDirs` 的解析规则：以 `~` 开头或绝对路径 → 全局作用域；其余 → 每个项目根下的相对
路径。每个条目是一个**容器目录**，其子目录中带 `SKILL.md` 的即为 skill。

### `activity` 字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 是否记录触发事件；关闭后不再写入 |
| `storePhrase` | `boolean` | `true` | 是否保存触发词语（用户提示词片段，仅存本地） |
| `retentionDays` | `number` | `90` | 保留天数，限制 30–360 |
| `maxPhraseChars` | `number` | `300` | 触发词语最大长度，限制 40–4000 |

触发词语可能包含用户输入内容，只保存在本机配置目录，可通过「使用记录 → 清空记录」删除。

### `logging` 字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 是否写入诊断日志文件；关闭后不再写盘 |
| `level` | `debug \| info \| warn \| error` | `info` | 写入文件的最低等级 |
| `maxTotalMb` | `number` | `5` | 日志总量上限（MB），限制 1–30 |

日志写入 `logs/main.log`，采用 `electron-log` 原生的**按大小轮转**：超过上限时当前文件归档为
`main.old.log`（仅保留一份归档），因此总量约为 `maxTotalMb`。日志**不会**记录 API Key、
代理凭据、SKILL 正文、触发词语或用户 prompt。可在「设置 → 日志」中打开日志目录或清空。

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

## 相关路径

- 全局 canonical skill 目录：`~/.agents/skills`
- 全局锁文件：`~/.agents/.skill-lock.json`（设置 `XDG_STATE_HOME` 时为
  `$XDG_STATE_HOME/skills/.skill-lock.json`）
- 项目 canonical skill 目录：`<project>/.agents/skills`
- 项目锁文件：`<project>/skills-lock.json`
- 各 agent 的目录表：`packages/core/src/agents.ts`
- 应用自带的内置 skill：产物 `Resources/internal-skills/`（开发时为
  `apps/desktop/resources/internal-skills/`）；只读、不参与安装/卸载
