@AGENTS.md


# CLAUDE.md - 自动维护的项目记忆

## 自动规则
当遇到以下情况时，Claude应该**主动**更新状态说明书：
1. 完成一个主要功能后 - 更新"已完成"章节
2. 遇到无法解决的bug时 - 更新"已知问题"
3. 做出重大技术决策时 - 添加ADR记录
4. 会话超过100轮对话时 - 完整重新生成说明书

## 更新命令
- `/save-state` - 生成完整状态快照到 docs/state_snapshot_{date}.md
- `/compact-state` - 生成精简版（只保留当前会话相关的增量）
- `/sync-state` - 从旧会话同步状态（当开了多个窗口时）

## 状态文件位置
- 详细报告：`docs/states/YYYY-MM-DD_HH-MM-SS.md`
- 最新状态链接：`docs/current_state.md` (总是指向最新报告)
- 自动加载状态：启动时自动读取 `docs/current_state.md`（如果存在）