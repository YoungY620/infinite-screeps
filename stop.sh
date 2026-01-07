#!/bin/bash
# Stop Screeps Eternal System

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

AGENT_SESSION="screeps-agent"
WATCHER_SESSION="screeps-watcher"

echo "🛑 Stopping Screeps Eternal System"

# Stop Agent
if tmux has-session -t "$AGENT_SESSION" 2>/dev/null; then
    tmux kill-session -t "$AGENT_SESSION"
    echo "✅ Agent stopped"
else
    echo "⚠️  Agent not running"
fi

# Stop Watcher
if tmux has-session -t "$WATCHER_SESSION" 2>/dev/null; then
    tmux kill-session -t "$WATCHER_SESSION"
    echo "✅ Watcher stopped"
else
    echo "⚠️  Watcher not running"
fi

echo ""
echo "All stopped."
