# 分析规则

SkillCat 的规则引擎（`packages/core/src/analysis.ts`）对全部扫描记录运行，输出带证据的
`Finding`。规则分**确定性**（来自磁盘事实）与**启发式**（来自文本相似度）两类。

## 规则表

| 规则 (`rule`) | 级别 | 置信度 | 触发条件 | 证据 |
| --- | --- | --- | --- | --- |
| `dangling-link` | error | 确定性 | 某 agent 目录下的链接是**悬空符号链接**（指向的目标不存在） | 链接路径 |
| `lock-missing-dir` | error | 确定性 | 锁文件声明了某 skill，但 canonical 目录下没有对应文件夹（孤儿锁记录） | 期望路径、source |
| `copy-drift` | warn | 确定性 | agent 目录下是**副本**（非符号链接），且副本哈希 ≠ canonical 内容哈希 | 副本路径 |
| `local-modified` | warn / info | 确定性 | canonical 内容与安装时不一致。锁哈希是 sha256 时精确比对（warn）；GitHub 来源的 git tree hash 无法本地比对，退化为"自上次扫描后变化"（info） | lock/local 哈希前缀 |
| `declared-link-missing` | info | 确定性 | CLI 声明某 agent 安装了该 skill，但对应 agent 目录缺少链接（按 agent + 作用域聚合） | 受影响 skill 列表 |
| `shadowing` | info | 确定性 | 全局与项目存在**同名** skill（同源） | 全局与项目路径 |
| `source-conflict` | warn | 确定性 | 全局与项目存在同名 skill，但来源不同 | 两侧 source |
| `description-lint` | info | 确定性 | description 缺失、过短（< 20 字符），或缺少 "when to use" 触发信号 | skill 路径 |
| `trigger-overlap` | info | 启发式 | 两个 skill 的触发画像相似度 ≥ 阈值（默认 `0.3`） | 共享词 |
| `negative-contradiction` | info | 启发式 | A 的负向触发词命中 B 的正向触发词 | 命中的词 |
| `duplicate-content` | warn | 启发式 | 两个 skill 正文 4-gram shingle 的 Jaccard ≥ 阈值（默认 `0.5`） | 相似度 |

排序：`error` → `warn` → `info`；同级按 `score` 降序，再按标题 code 与 id。见
`sortFindings()`。

## 触发词画像

`packages/core/src/triggers.ts` 从以下来源提取正 / 负向触发词，并带权重：

| 来源 | 权重 |
| --- | --- |
| frontmatter `when_to_use` | 1.0 |
| frontmatter `dispatch_intent` | 0.8 |
| `description`（中英模式） | 0.7 |
| 正文 "When to Use / 触发" 小节 | 0.5 |
| skill 名称 | 0.3 |

负向词从 "Do NOT / 不适用 / 不要" 等模式提取。人工标注（sidecar）以最高优先级合并，且不修改
skill 目录。标注按 `scope|project|name|contentHash` 存储，内容变化即失效。

## 相似度算法

`packages/core/src/similarity.ts`，纯函数、无 IO：

1. **分词**：`Intl.Segmenter`（中英）做词级切分；连续单字 CJK 段合并为 bigram（避免 ICU 把
   "润色"拆成单字），但只在真实词边界内合并。过滤中英停用词。
2. **向量**：正向触发词按权重、负向词 ×0.8、intent ×0.6，同一 token 取最大权重。
3. **IDF 加权**：`idf(t) = log(1 + n / df(t))`。若两 skill 的共享 token 全部是高 df 的通用词
   （`df > max(2, 0.3n)`），则判定为无特异性共享，直接跳过。
4. **重叠分**：`score = 0.7 × (共享权重 / min(L1)) + 0.3 × cosine`，与阈值比较。
5. **同族跳过**：名称互为前缀的 skill（`pdf` ↔ `pdf-tools`）跳过重叠检测。
6. **正文重复**：4-gram shingle 的 Jaccard；先用 1-gram Jaccard < 0.2 快速剪枝。

## 阈值

配置项 `thresholds`：

- `overlap` —— 触发词重叠阈值，默认 `0.3`（设置页可调）
- `duplicate` —— 正文重复阈值，默认 `0.5`

阈值越低越敏感（更多提示，也更多噪声）。启发式规则允许误报，UI 会展示共享词供人工判断，
并提供"隐藏 AI 判定为误报"的筛选。

## AI 判定如何叠加

规则引擎先产出 `baseFindings`，随后 `applyVerdicts()` 把已保存的 AI 判定附加到对应 finding：

- `confirmed` —— 确认问题
- `false-positive` —— 判定为误报（可在 UI 中一键隐藏）
- `uncertain` —— 无法确定

AI 判定不新增规则，只标注已有规则（`negative-contradiction`、`duplicate-content` 等），
避免把模型的不确定性变成事实。详见 [ai-evaluation.md](ai-evaluation.md)。
