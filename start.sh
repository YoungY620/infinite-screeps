#!/bin/bash
# Screeps Eternal Agent - tmux 启动脚本

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
SESSION_NAME="screeps-agent-$(date +%Y%m%d%H%M%S)"
SESSION_FILE="$PROJECT_DIR/.tmux-session"

cd "$PROJECT_DIR"

# 检查是否已有运行的 session
if [ -f "$SESSION_FILE" ]; then
    old_session=$(cat "$SESSION_FILE")
    if tmux has-session -t "$old_session" 2>/dev/null; then
        echo "⚠️  Already running: $old_session"
        echo "   Attach: tmux attach -t $old_session"
        echo "   Kill:   tmux kill-session -t $old_session"
        exit 1
    fi
fi

# 创建新 tmux session
tmux new-session -d -s "$SESSION_NAME" "./run.sh"

# 记录 session 名称
echo "$SESSION_NAME" > "$SESSION_FILE"

echo "✅ Started: $SESSION_NAME"
echo ""
echo "   Attach:  tmux attach -t $SESSION_NAME"
echo "   Logs:    tmux capture-pane -t $SESSION_NAME -p"
echo "   Stop:    ./stop.sh"
