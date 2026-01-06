#!/bin/bash
# Screeps Eternal Agent - 停止脚本

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
SESSION_FILE="$PROJECT_DIR/.tmux-session"

if [ ! -f "$SESSION_FILE" ]; then
    echo "❌ No session file found"
    exit 1
fi

SESSION_NAME=$(cat "$SESSION_FILE")

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    tmux kill-session -t "$SESSION_NAME"
    rm "$SESSION_FILE"
    echo "✅ Stopped: $SESSION_NAME"
else
    echo "⚠️  Session not running: $SESSION_NAME"
    rm "$SESSION_FILE"
fi
