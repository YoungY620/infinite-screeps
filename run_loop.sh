#!/bin/bash
# Screeps Eternal Agent - 循环监控脚本
#
# 用法:
#   ./run_loop.sh          # 自动循环，每 5 分钟获取状态
#   ./run_loop.sh --once   # 只运行一次
#   ./run_loop.sh --watch  # 持续监控，发现异常时告警

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$PROJECT_DIR/logs"
LOOP_INTERVAL=${LOOP_INTERVAL:-300}  # 默认 5 分钟

cd "$PROJECT_DIR"
mkdir -p "$LOGS_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "[$(date '+%H:%M:%S')] $1"
}

# 获取游戏状态
get_state() {
    python3 "$PROJECT_DIR/tools/get_game_state.py" 2>/dev/null
}

# 快速状态检查
quick_check() {
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    
    curl -s -H "X-Token: $token" \
        "https://screeps.com/api/game/room-objects?room=$1&shard=$2" 2>/dev/null | \
    python3 -c "
import sys, json
data = json.load(sys.stdin)
objs = data.get('objects', [])

ctrl = next((o for o in objs if o.get('type') == 'controller'), {})
creeps = [o for o in objs if o.get('type') == 'creep']
spawn = next((o for o in objs if o.get('type') == 'spawn'), {})
enemies = [o for o in objs if o.get('type') == 'creep' and o.get('user') != spawn.get('user')]

level = ctrl.get('level', 0)
progress = ctrl.get('progress', 0)
safe_mode = ctrl.get('safeMode', 0)

print(f'Level {level} ({progress}/45000) | Creeps: {len(creeps)} | Enemies: {len(enemies)} | SafeMode: {\"ON\" if safe_mode else \"OFF\"}')

# 返回状态码
if enemies:
    sys.exit(2)  # 有敌人
elif len(creeps) < 5:
    sys.exit(1)  # Creep 不足
else:
    sys.exit(0)  # 正常
" 2>/dev/null
}

# 单次运行
run_once() {
    log "获取游戏状态..."
    
    local state=$(get_state)
    
    if [ -z "$state" ]; then
        log "${RED}获取状态失败${NC}"
        return 1
    fi
    
    # 显示状态
    echo "$state"
    
    # 保存到日志
    local timestamp=$(date +%Y%m%d_%H%M%S)
    echo "$state" > "$LOGS_DIR/state_$timestamp.md"
    
    log "${GREEN}状态已保存${NC}"
}

# 监控模式
run_watch() {
    log "启动监控模式..."
    
    # 获取当前房间
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    local room=$(curl -s -H "X-Token: $token" \
        "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8" 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('shards',{}).get('shard3',{}).get('rooms',[]); print(r[0] if r else '')")
    
    if [ -z "$room" ]; then
        log "${RED}无法获取房间信息${NC}"
        return 1
    fi
    
    log "监控房间: $room"
    
    local iteration=0
    while true; do
        iteration=$((iteration + 1))
        
        local status=$(quick_check "$room" "shard3")
        local exit_code=$?
        
        case $exit_code in
            0)
                log "${GREEN}✓${NC} $status"
                ;;
            1)
                log "${YELLOW}⚠${NC} $status"
                ;;
            2)
                log "${RED}🚨 敌人入侵!${NC} $status"
                # 可以在这里添加通知逻辑
                ;;
        esac
        
        sleep 60  # 监控模式每分钟检查一次
    done
}

# 循环模式
run_loop() {
    log "启动循环模式 (间隔: ${LOOP_INTERVAL}s)"
    
    local iteration=0
    while true; do
        iteration=$((iteration + 1))
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log "迭代 #$iteration"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        run_once
        
        log "下次检查: ${LOOP_INTERVAL}s 后"
        sleep $LOOP_INTERVAL
    done
}

# ========== 主程序 ==========

case "${1:-loop}" in
    --once|-1)
        run_once
        ;;
    --watch|-w)
        run_watch
        ;;
    --loop|-l|loop|*)
        run_loop
        ;;
esac

