# 运行监听（集成）

运行监听让 SkillCat 记录**哪些 SKILL 被触发、由哪个 agent、用什么触发词语、属于哪个任务**，
用于统计与后续的触发词优化/冲突判断。这是一个**可选、可一键卸载**的功能。

## 工作原理

```
agent 进程
  └─ SkillCat 安装的 bridge 插件 ──追加 JSON 行──▶ <configDir>/runtime-spool.jsonl
                                                       │ fs.watch
SkillCat BridgeService ── 适配器归一化 ── 匹配扫描目录 ──▶ runtime-events.json ──▶ 使用记录页
```

- 插件只写**触发事实**：skill 名、触发词语（用户提示词片段）、任务、会话、时间。
- SkillCat 消费收件箱后立即清空；**只有匹配到已扫描 skill 的记录才会落库**。
- 若 SkillCat 未运行，事件会留在收件箱，下次启动补消费。
- 触发词语会与 `triggers.ts` 提取的正向触发词比对，记录命中的触发词；同一句话触发多个
  skill 会被聚合为「同句多触发」，作为冲突信号。

## 适配器模型（可扩展）

所有 agent 相关逻辑收敛在 `packages/core/src/bridge/adapters/<id>/`，通过
`bridge/registry.ts` 注册。新增一个 agent 只需实现 `BridgeAdapter` 接口：

| 方法 | 职责 |
| --- | --- |
| `detect(ctx)` | 报告 agent 是否安装、相关路径 |
| `plan(ctx)` | 生成要安装的文件（内嵌 marker，供安全卸载） |
| `parse(raw)` | 把收件箱原始记录归一化为 `ParsedRuntimeEvent` |

安装/卸载、收件箱监听、catalog 匹配、统计、UI 全部是通用的，不感知具体 agent。
收件箱的统一 envelope 为 `{ v: 1, adapterId, kind, name, phrase?, task?, taskId?, sessionId?, cwd?, ts? }`。

## OpenCode（当前唯一适配器）

- 安装位置：`~/.config/opencode/plugins/skillcat-bridge.ts`（全局）。
- 生成文件自包含、无 SkillCat 依赖，导出 `SkillCatBridge`，在 `tool.execute.after` 中检测
  `tool === "skill"`。
- 通过 OpenCode SDK 读取：最后一条 user 消息文本（触发词语），以及任务标签
  （当前进行中的 todo → 会话标题 → 提示词片段）。
- 安装后需**重启 OpenCode** 生效。

### 一键安装 / 卸载

设置 → 集成 → OpenCode → 一键安装。卸载时会逐一对比文件内容哈希：若文件被外部修改，则
**拒绝删除**并提示，避免误删用户内容。

## 隐私与保留

- 触发词语是用户提示词片段，属敏感数据，**只保存在本机配置目录**，不含 SKILL 正文，不上传。
- 可在设置 → 集成的「记录偏好」中关闭记录、关闭触发词语保存，或调整保留天数（30–360 天）。
- 「使用记录 → 清空记录」可随时删除全部历史。
