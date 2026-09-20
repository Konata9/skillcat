# AI 评估

AI 评估是**可选**功能：SkillCat 本身不内置模型，需要用户自带密钥与端点。启用后可以为每个
skill 评分，并让模型判定重复 / 冲突候选对。

## 模型供应商

`packages/core/src/llm.ts` 内置以下预设（除 Anthropic 外均走 OpenAI 兼容的 chat-completions）：

| 供应商 | 默认模型 | 说明 |
| --- | --- | --- |
| Claude | `claude-sonnet-4-5` | Anthropic Messages API |
| ChatGPT | `gpt-4o` | OpenAI |
| Gemini | `gemini-2.5-flash` | Google OpenAI 兼容端点 |
| DeepSeek | `deepseek-chat` | |
| Qwen | `qwen-plus` | DashScope 兼容模式 |
| GLM | `glm-4-plus` | 智谱 |
| Kimi | `moonshot-v1-8k` | Moonshot |
| MiniMax | `MiniMax-Text-01` | |
| Mimo | `mimo-v2.5-pro` | 小米 |
| Ollama | `llama3.2` | 本地，无需密钥 |
| Custom | —— | 自定义 base URL 与模型 |

设置页提供"测试连接"：发送一个 `max_tokens=1` 的 ping 请求验证端点、密钥与模型。该探测永不抛出，
失败以 `{ ok: false, message }` 返回。

## 评估流程

`evaluateSkills()`（`packages/core/src/evaluation/evaluate.ts`）：

1. **编目**：把每个 skill 转成精简的 catalog 条目（名称、作用域、description、`when_to_use`、
   前 12 个正向触发词、正文摘要 1200 字、文件数）。
2. **分批评分**：按每批最多 6 个 skill、约 12000 字符切分，逐批调用模型返回
   `{ scores: [{ id, score, grade, summary, strengths, issues }] }`。单批失败不影响其他批次；
   全部失败才报错。分数裁剪到 0–100，等级 A（≥90）/ B（≥75）/ C（≥60）/ D。
3. **候选对判定**：用与规则引擎相同的相似度工具预筛选候选对（触发词重叠 ≥ 0.2 或正文相似
   ≥ 0.15，最多 24 对），再让模型判定 `duplicate` / `conflict` / `quality` / `trigger` /
   `boundary`，并给出 `confirmed` / `false-positive` / `uncertain`。
4. **总览**：生成一段整体总结。
5. **保存**：报告与判定写入配置目录的 `evaluation.json`。

## 容错

OpenAI 兼容模型经常输出不严格合法的 JSON。评估器做了多层容错：

- 剥离 ```json 代码围栏，按括号深度 + 字符串感知切片提取 JSON 值（截断时保留尾部交给修复器）。
- `jsonrepair` 修复截断数组、未加引号的键、单/智能引号、尾逗号与注释。
- AI SDK 的 `parsePartialJson` 兜底流式截断。
- 调用失败会追加"仅返回 JSON"的严格指令重试一次。
- 响应中的 catalog id（`s1`、`s45`）会被替换回 skill 名称，避免报告里出现内部 id。

## 过程日志

评估通过 `EvaluationEvent` 流式广播到 UI：

- `start` / `done`
- `step`：`eval.step.prepare`、`eval.step.scoring`、`eval.step.pairs`、`eval.step.judging`、
  `eval.step.summary`、`eval.step.review`
- `reasoning`：模型暴露的推理增量（按 160 字符合并后广播，避免刷屏）

这些事件是瞬态的，不落盘；UI 在"分析"页运行时展示过程日志。

## 过期判定

保存的评估带 `signature`，由 `模型标识 + 每个 skill 的 recordKey@contentHash` 哈希得到。只要
扫描结果或模型变化，签名就变，UI 显示"评估已过期"。判定与语言分别有独立的新鲜度检查：

- `evaluationStale()` —— 评估签名不匹配
- `verdictsStale()` —— 判定签名不匹配
- 语言不匹配 —— 保存时的语言与当前界面语言不同

## 远程榜单与搜索

搜索页（`SearchView`）默认展示 skills.sh 榜单，支持三个维度：`all-time`（全部时间）、
`trending`（趋势 24h）、`hot`（热门）。榜单由 `fetchLeaderboardApi` 请求
`/api/skills/{kind}/{page}`，保留服务端排序，并展示周安装量迷你折线图。

关键词搜索走 `/api/search`，失败时回退到 `npx skills find` 的文本解析。选中结果可查看详情
（SKILL.md 与文件列表）并直接安装到当前作用域。榜单在会话内缓存 10 分钟，并发请求会去重。
