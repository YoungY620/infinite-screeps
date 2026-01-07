#!/bin/bash
# 在 tmux 中启动 Agent

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION_NAME="screeps-agent"
SESSION_FILE="$PROJECT_DIR/.tmux-session"

cd "$PROJECT_DIR"

# 检查是否已运行
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "⚠️  已在运行: $SESSION_NAME"
    echo "   查看: tmux attach -t $SESSION_NAME"
    echo "   停止: ./stop.sh"
    exit 1
fi

# 启动
tmux new-session -d -s "$SESSION_NAME" "./run.sh"
echo "$SESSION_NAME" > "$SESSION_FILE"

echo "✅ 已启动: $SESSION_NAME"
echo "   查看: tmux attach -t $SESSION_NAME"
echo "   停止: ./stop.sh"
