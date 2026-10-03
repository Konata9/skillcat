# Changelog

本项目的重要变更都记录在此文件。每个版本只列出**它相对上一个版本**的变化，并作为该次
GitHub Release 的说明（见 `.github/workflows/release.yml`）。

格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循
[Semantic Versioning](https://semver.org/)。分类：`Added` / `Changed` / `Deprecated` /
`Removed` / `Fixed` / `Security`。

## [Unreleased]

## [1.2.0] - 2026-10-03

### Added

- 内置 skill 支持：应用自带 `skill-optimizer`（`resources/internal-skills`），以独立身份
  （`builtin||name`）参与扫描；随「显示 internal skill」开关一起显隐，不写入用户目录、不参与安装/卸载。
- SKILL 只读「优化建议」：在 skill 详情页用大模型生成诊断与改写建议（before/after），
  以内置 skill 为评审准则；**需先在设置中配置模型**。结果持久化到 `optimizer.json`，重启后保留，
  只有用户主动「重新生成」才会覆盖（避免重复消耗 token）。
- 官方站点（`site/`，中英双语），含 404、重定向、安全响应头与 sitemap。
- 诊断日志：主进程统一使用 `electron-log`，设置页可配置日志级别与大小上限，支持打开 / 清空
  日志目录；写入前对密钥与敏感字段做脱敏。
- 设置页新增 Tooltip 组件与相关说明文案。

### Changed

- **`@skillcat/core` / `apps/desktop` 代码结构优化**：拆解超大模块与组件、合并碎片文件；
  这次重构不改变公共 API 与运行时行为（详见 [docs/architecture.md](docs/architecture.md)）。
- SKILL 详情页改为「固定头部 + 详情 / 优化建议 Tab」：优化入口更醒目，生成结果单独成页，
  不再挤占正文；未配置模型时提供「去设置」快捷入口。
- SKILL 详情页与远程 SKILL 详情抽屉的按钮与布局调整。
- 设置页文案更新；DeepSeek 默认模型名调整。
- 统一应用命名为 SkillCat，移除 Skillman 时代的配置目录自动迁移与 `SKILLMAN_CONFIG_DIR`
  兼容（此前已完成迁移的配置不受影响）。

[Unreleased]: https://github.com/Konata9/skillcat/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Konata9/skillcat/compare/v1.1.0...v1.2.0
