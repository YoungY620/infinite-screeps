# Infinite Screeps

让 AI Agent 在 [Screeps](https://screeps.com/) 游戏中自主生存，尽可能长时间地活下去。

## 使用方法

### 配置

```bash
cp .env.example .env
# 编辑 .env，填入 Screeps Token
```

### 启动 / 停止

```bash
./start.sh    # 启动 Agent
./stop.sh     # 停止 Agent
```

### 查看输出

```bash
tmux attach -t screeps    # 连接 tmux 会话，按 Ctrl+B D 退出
tail -f logs/session_*.md # 查看 session 日志
```
