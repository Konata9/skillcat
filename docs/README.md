# SkillCat 文档

本目录收录 SkillCat 的架构说明、设计取舍与参考手册。README 只做概览与链接，具体内容都在这里。

## 目录

| 文档 | 内容 |
| --- | --- |
| [architecture.md](architecture.md) | Core + UI 架构、仓库结构、进程模型与 IPC、构建与打包 |
| [design.md](design.md) | 读写分离、统一身份、只读安全、作用域模型、分析分级 |
| [analysis-rules.md](analysis-rules.md) | 完整的确定性 / 启发式规则表与相似度算法 |
| [ai-evaluation.md](ai-evaluation.md) | LLM 评分、候选对判定、模型供应商、远程榜单与搜索 |
| [configuration.md](configuration.md) | 配置与数据位置、`config.json` 字段、代理、迁移 |
| [development.md](development.md) | 开发命令、项目结构、测试、新增 agent |
| [troubleshooting.md](troubleshooting.md) | 已知限制与常见问题 |

## 一句话架构

`@skillcat/core` 是唯一事实来源（纯 TS、零 UI 依赖）；`apps/desktop` 是当前唯一的 UI
（Electron + React）。UI 通过类型化 IPC 调用 core，core 只返回结构化数据与 `{ code, params }`，
展示文案由 UI 的 i18n 字典负责。
