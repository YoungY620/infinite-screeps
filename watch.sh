#!/bin/bash
# Screeps Event Watcher - 事件监听器
# 检测紧急事件并触发 Agent 重启

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
EVENTS_FILE="$PROJECT_DIR/events/pending.json"
CHECK_INTERVAL=60  # 检查间隔（秒）

cd "$PROJECT_DIR"

# 获取游戏状态
check_game_status() {
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    if [ -z "$token" ]; then
        echo "No token"
        return 1
    fi
    
    # 获取房间对象
    local room_data=$(curl -s -H "X-Token: $token" \
        "https://screeps.com/api/game/room-objects?room=W13N45&shard=shard3" 2>/dev/null)
    
    echo "$room_data"
}

# 检测紧急事件
detect_events() {
    local data="$1"
    local events=()
    local priority="low"
    
    # 检测敌人
    if echo "$data" | grep -q '"user":"[^"]*".*"type":"creep"' | grep -v "payyy"; then
        if echo "$data" | grep -q 'hostile\|invader'; then
            events+=("hostile_detected")
            priority="critical"
        fi
    fi
    
    # 检测 Spawn 数量（如果为0说明被摧毁）
    local spawn_count=$(echo "$data" | grep -o '"type":"spawn"' | wc -l)
    if [ "$spawn_count" -eq 0 ]; then
        events+=("no_spawn")
        priority="critical"
    fi
    
    # 检测 Creep 数量
    local creep_count=$(echo "$data" | grep -o '"type":"creep"' | wc -l)
    if [ "$creep_count" -eq 0 ]; then
        events+=("no_creeps")
        priority="high"
    fi
    
    # 如果有事件，写入文件
    if [ ${#events[@]} -gt 0 ]; then
        local timestamp=$(date -Iseconds)
        cat > "$EVENTS_FILE" << EOF
{
    "timestamp": "$timestamp",
    "priority": "$priority",
    "events": $(printf '%s\n' "${events[@]}" | jq -R . | jq -s .),
    "creep_count": $creep_count,
    "spawn_count": $spawn_count
}
EOF
        echo "$priority"
        return 0
    fi
    
    return 1
}

# 触发重启
trigger_restart() {
    local priority="$1"
    echo "[$(date)] 🚨 Event detected (priority: $priority), restarting agent..."
    
    # 停止当前 session
    ./stop.sh 2>/dev/null || true
    sleep 2
    
    # 启动新 session
    ./start.sh
}

echo "👀 Screeps Event Watcher started"
echo "   Checking every ${CHECK_INTERVAL}s"
echo ""

while true; do
    # 获取状态
    status=$(check_game_status)
    
    if [ -n "$status" ] && [ "$status" != "No token" ]; then
        # 检测事件
        priority=$(detect_events "$status")
        
        if [ -n "$priority" ]; then
            if [ "$priority" = "critical" ] || [ "$priority" = "high" ]; then
                trigger_restart "$priority"
                # 重启后等待久一点，让 Agent 有时间处理
                sleep 300
            fi
        else
            echo "[$(date)] ✓ No urgent events"
        fi
    else
        echo "[$(date)] ⚠ Could not fetch game status"
    fi
    
    sleep $CHECK_INTERVAL
done
