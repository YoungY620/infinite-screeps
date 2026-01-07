#!/bin/bash
# Start Screeps Eternal System (Agent + Watcher)

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

AGENT_SESSION="screeps-agent"
WATCHER_SESSION="screeps-watcher"

echo "🚀 Starting Screeps Eternal System"
echo ""

# Start Agent
if tmux has-session -t "$AGENT_SESSION" 2>/dev/null; then
    echo "⚠️  Agent already running"
else
    tmux new-session -d -s "$AGENT_SESSION" "./agent-loop.sh"
    echo "✅ Agent started"
fi

# Start Watcher
if tmux has-session -t "$WATCHER_SESSION" 2>/dev/null; then
    echo "⚠️  Watcher already running"
else
    tmux new-session -d -s "$WATCHER_SESSION" "./event-watcher.sh"
    echo "✅ Watcher started"
fi

echo ""
echo "📋 Sessions:"
echo "   Agent:   tmux attach -t $AGENT_SESSION"
echo "   Watcher: tmux attach -t $WATCHER_SESSION"
echo ""
echo "   Stop: ./stop.sh"
