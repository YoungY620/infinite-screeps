#!/bin/bash
# Screeps Event Watcher v2 - WebSocket + Polling Hybrid
# 
# Primary: WebSocket via event-monitor.js (real-time)
# Backup: REST API polling (every 60s)

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
cd "$(dirname "$0")" && PROJECT_DIR="$(pwd)"

EVENTS_FILE="$PROJECT_DIR/events/pending.json"
CHECK_INTERVAL=60
WEBSOCKET_PID=""

SYSTEM_LOG="$PROJECT_DIR/logs/system.log"

mkdir -p "$PROJECT_DIR/events" "$PROJECT_DIR/logs"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [WATCHER] $1"
    echo "$msg" | tee -a "$SYSTEM_LOG"
}

# Start WebSocket monitor in background
start_websocket() {
    log "Starting WebSocket monitor..."
    node "$PROJECT_DIR/src/event-monitor.js" &
    WEBSOCKET_PID=$!
    log "WebSocket monitor started (PID: $WEBSOCKET_PID)"
}

# Stop WebSocket monitor
stop_websocket() {
    if [ -n "$WEBSOCKET_PID" ]; then
        kill $WEBSOCKET_PID 2>/dev/null
        log "WebSocket monitor stopped"
    fi
}

# Check for pending events and trigger restart if needed
check_and_trigger() {
    if [ ! -f "$EVENTS_FILE" ]; then
        return 1
    fi
    
    # Check if file has content
    local content=$(cat "$EVENTS_FILE" 2>/dev/null)
    if [ -z "$content" ] || [ "$content" = "[]" ]; then
        return 1
    fi
    
    # Get highest priority event
    local priority=$(echo "$content" | python3 -c "
import sys, json
try:
    events = json.load(sys.stdin)
    if events:
        print(max(e.get('priority', 0) for e in events))
    else:
        print(0)
except:
    print(0)
" 2>/dev/null)
    
    if [ "$priority" -ge 7 ]; then
        # High priority: HOSTILE, SPAWN_ATTACKED, NO_SPAWN, NO_CREEPS, CONTROLLER_DOWNGRADE
        log "🚨 High priority event detected (priority: $priority)"
        trigger_restart
        return 0
    elif [ "$priority" -ge 4 ]; then
        # Medium priority: RCL_UP, TOWER_BUILT, STORAGE_BUILT
        log "📢 Medium priority event detected (priority: $priority)"
        trigger_restart
        return 0
    else
        log "📝 Low priority events logged (priority: $priority)"
        return 1
    fi
}

# Trigger agent restart
trigger_restart() {
    log "Restarting agent..."
    
    # Move events to processed
    if [ -f "$EVENTS_FILE" ]; then
        mv "$EVENTS_FILE" "$PROJECT_DIR/events/processed_$(date +%s).json"
    fi
    
    # Restart agent
    tmux kill-session -t screeps-agent 2>/dev/null || true
    sleep 2
    tmux new-session -d -s screeps-agent "$PROJECT_DIR/agent-loop.sh"
    
    # Wait before next check
    sleep 300
}

# Backup: REST API polling (动态获取房间)
poll_game_status() {
    local token=$(grep SCREEPS_TOKEN "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2)
    local shard=$(grep SHARD "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2)
    shard=${shard:-shard3}
    
    if [ -z "$token" ]; then
        return 1
    fi
    
    # 动态获取当前房间
    local room=$(curl -s -H "X-Token: $token" \
        "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8" 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); rooms=d.get('shards',{}).get('$shard',{}).get('rooms',[]); print(rooms[0] if rooms else '')" 2>/dev/null)
    
    if [ -z "$room" ]; then
        log "⚠️ REST poll: No room found (respawning?)"
        return 1
    fi
    
    # 获取房间对象
    local room_data=$(curl -s -H "X-Token: $token" \
        "https://screeps.com/api/game/room-objects?room=$room&shard=$shard" 2>/dev/null)
    
    local spawn_count=$(echo "$room_data" | grep -o '"type":"spawn"' | wc -l | tr -d ' ')
    local creep_count=$(echo "$room_data" | grep -o '"type":"creep"' | wc -l | tr -d ' ')
    
    if [ "$spawn_count" -eq 0 ]; then
        log "⚠️ REST poll [$room]: No spawn!"
        echo '[{"type":"NO_SPAWN","priority":10,"timestamp":"'$(date -Iseconds)'","raw":"REST poll: '$room'"}]' > "$EVENTS_FILE"
    elif [ "$creep_count" -eq 0 ]; then
        log "⚠️ REST poll [$room]: No creeps!"
        echo '[{"type":"NO_CREEPS","priority":9,"timestamp":"'$(date -Iseconds)'","raw":"REST poll: '$room'"}]' > "$EVENTS_FILE"
    fi
}

# Cleanup on exit
cleanup() {
    log "Stopping watcher..."
    stop_websocket
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main
log "👀 Screeps Event Watcher v2 started"
log "   WebSocket: real-time console monitoring"
log "   Polling: every ${CHECK_INTERVAL}s backup"
log ""

# Start WebSocket monitor
start_websocket

# Main loop
while true; do
    # Check for pending events
    check_and_trigger
    
    # Backup: REST polling
    poll_game_status
    
    # Check if WebSocket monitor is still running
    if ! kill -0 $WEBSOCKET_PID 2>/dev/null; then
        log "⚠️ WebSocket monitor died, restarting..."
        start_websocket
    fi
    
    sleep $CHECK_INTERVAL
done
