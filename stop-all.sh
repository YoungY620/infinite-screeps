#!/bin/bash
# 停止 Agent + Event Watcher

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
cd "$PROJECT_DIR"

echo "🛑 Stopping Screeps Eternal System"

# 停止 Agent
./stop.sh 2>/dev/null || true

# 停止 Watcher
WATCHER_SESSION="screeps-watcher"
if tmux has-session -t "$WATCHER_SESSION" 2>/dev/null; then
    tmux kill-session -t "$WATCHER_SESSION"
    echo "✅ Watcher stopped"
else
    echo "⚠️  Watcher not running"
fi

echo ""
echo "All stopped."
