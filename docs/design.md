# 设计取舍

这份文档解释 SkillCat 为什么这样设计，以及各条边界背后的理由。

## 读写分离

- **读取**走文件系统 + 锁文件：快速、离线可用、无副作用。
- **写入**一律委托官方 `skills` CLI（随应用内置，用 Electron 自带 Node 运行；带显式 `cwd` 与
  `--global/--project`），不重造安装逻辑。

这样只有一条安装路径，SkillCat 不会成为第二个"事实来源"，也不会与官方 CLI 的锁格式产生分歧。
代价是变更操作依赖 `skills` CLI 可用；CLI 不可用时读取与分析仍然完整可用，只是不能执行变更。

## 统一身份

skill 的身份由 `scope | projectPath | name` 唯一确定，派生逻辑集中在
`packages/core/src/keys.ts`：

- `recordKey(record)` —— 扫描、分析、UI 共用同一身份。
- `annotationKey(record)` —— 在身份之上追加 `contentHash`，因此人工标注按内容版本失效：
  skill 内容一变，旧标注自动不再命中。

该模块只做 type-only import，无运行时依赖，因此可通过 `@skillcat/core/keys` 子路径安全地
import 进浏览器包（renderer 不引入 Node 依赖）。

## 只读安全

默认**不写入** skill 目录、锁文件或 agent 目录。需要持久化的用户数据放在配置目录的 sidecar：

- `annotations.json` —— 人工触发词标注
- `state.json` —— 上次扫描的内容哈希（用于"自上次扫描后变化"提示）
- `evaluation.json` —— LLM 评估报告与 AI 判定

注册表只存项目路径；删除注册条目**不会删除任何文件**。

## 作用域模型

- 项目作用域由 `cwd` 决定；项目锁为 `<project>/skills-lock.json`，canonical 目录为
  `<project>/.agents/skills`。
- 全局锁为 `~/.agents/.skill-lock.json`（受 `XDG_STATE_HOME` 影响），canonical 目录为
  `~/.agents/skills`。
- 项目级同名 skill 会遮蔽全局版本，工具会明确提示（`shadowing`）；若两者来源不同，则升级为
  `source-conflict`。

## 自定义 skill 目录

用户可配置额外目录（每行一个）。以 `~` 开头或绝对路径视为**全局**目录；其余按**项目相对**
解析。全局条目只参与全局扫描，项目条目只参与项目扫描。

## 分析分级

分析结果分三类置信度：

- **deterministic（确定性）**：直接来自磁盘事实（悬空链接、锁记录缺失、副本漂移、哈希不一致、
  跨作用域遮蔽）。无需人工判断。
- **heuristic（启发式）**：来自文本相似度（触发词重叠、负向矛盾、正文重复）。带置信度与共享词
  证据，允许误报，UI 会展示证据供人判断。
- **ai**：LLM 判定。附加在规则 findings 上，可为 `confirmed` / `false-positive` / `uncertain`，
  默认不覆盖规则本身，只做标注。

阈值可配置：触发词重叠默认 `0.3`，正文重复默认 `0.5`。同名前缀家族
（`pdf` ↔ `pdf-tools`）会自动跳过重叠检测，避免把同一家族的子命令误判为冲突。

## 为什么 AI 是可选且显式的

AI 评估不参与常规扫描，只在用户点击时运行，因为：

- 需要用户自带模型密钥与端点，存在成本与网络依赖；
- 结果具有时间点属性，需要与扫描内容做签名比对才能判断是否过期。

因此评估结果保存后，UI 会通过 `evaluationSignature` 判断是否"过期"（staleness），并提示重新运行。

## 状态新鲜度

`SkillManager` 为评估与判定各维护一个签名：`evaluationSignature` 由
`模型标识 + 每个 skill 的 recordKey@contentHash` 哈希得到。只要扫描结果或模型变化，签名就会变，
UI 据此显示"评估已过期 / 判定已过期 / 语言不匹配"。
