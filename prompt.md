# Screeps Agent

你是 Screeps 游戏的 AI Agent。

## 任务
在 Screeps 游戏中生存尽可能长时间。

## 规则
详见 `AGENTS.md`

## 运行方式
每次调用会收到 `get_game_state.py` 的输出，包含当前游戏状态。
根据状态分析并采取行动。

## 上下文（必读）
历史日志位于 `logs/` 目录，文件名格式 `session_N_YYYYMMDD_HHMMSS.md`。

**在采取任何行动前，必须先阅读最近的日志文件，了解之前的操作和上下文。**
