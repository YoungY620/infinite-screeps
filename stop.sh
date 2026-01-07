#!/bin/bash
# 停止 Agent

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_NAME="screeps-agent"
SESSION_FILE="$PROJECT_DIR/.tmux-session"

cd "$PROJECT_DIR"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    tmux kill-session -t "$SESSION_NAME"
    rm -f "$SESSION_FILE"
    echo "✅ 已停止: $SESSION_NAME"
else
    rm -f "$SESSION_FILE"
    echo "⚠️  未运行"
fi
