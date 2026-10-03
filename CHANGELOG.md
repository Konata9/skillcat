# Changelog

本项目的重要变更都记录在此文件。每个版本只列出**它相对上一个版本**的变化，并作为该次
GitHub Release 的说明（见 `.github/workflows/release.yml`）。

格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循
[Semantic Versioning](https://semver.org/)。分类：`Added` / `Changed` / `Deprecated` /
`Removed` / `Fixed` / `Security`。

## [Unreleased]

### Added

- 官方站点（`site/`，中英双语），含 404、重定向、安全响应头与 sitemap。
- 诊断日志：主进程统一使用 `electron-log`，设置页可配置日志级别与大小上限，支持打开 / 清空
  日志目录；写入前对密钥与敏感字段做脱敏。
- 设置页新增 Tooltip 组件与相关说明文案。

### Changed

- **`@skillcat/core` / `apps/desktop` 代码结构优化**：拆解超大模块与组件、合并碎片文件，
  公共 API 与运行时行为保持不变（详见 [docs/architecture.md](docs/architecture.md)）。
- SKILL 详情页与远程 SKILL 详情抽屉的按钮与布局调整。
- 设置页文案更新；DeepSeek 默认模型名调整。
- 统一应用命名为 SkillCat，移除 Skillman 时代的配置目录自动迁移与 `SKILLMAN_CONFIG_DIR`
  兼容（此前已完成迁移的配置不受影响）。

[Unreleased]: https://github.com/Konata9/skillcat/compare/v1.1.0...HEAD
