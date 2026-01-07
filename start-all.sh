#!/bin/bash
# 启动 Agent + Event Watcher

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
cd "$PROJECT_DIR"

echo "🚀 Starting Screeps Eternal System"
echo ""

# 启动 Agent
./start.sh

# 启动 Watcher (后台)
WATCHER_SESSION="screeps-watcher"
if tmux has-session -t "$WATCHER_SESSION" 2>/dev/null; then
    echo "⚠️  Watcher already running"
else
    tmux new-session -d -s "$WATCHER_SESSION" "./watch.sh"
    echo "✅ Watcher started: $WATCHER_SESSION"
fi

echo ""
echo "📋 Running sessions:"
echo "   Agent:   tmux attach -t screeps-agent"
echo "   Watcher: tmux attach -t screeps-watcher"
echo ""
echo "   Stop all: ./stop-all.sh"
