#!/bin/bash
# Screeps Eternal Agent - 启动脚本
# 每个 session 运行一段时间后自动切换到下一个

set -e

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
STATS_DIR="$PROJECT_DIR/knowledge/stats"
SESSION_TIMEOUT=86400  # 24小时切换一次 session
POLL_INTERVAL=300     # 5分钟记录一次统计

cd "$PROJECT_DIR"

# 确保目录存在
mkdir -p "$STATS_DIR"

# 记录统计数据的函数
record_stats() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local stats_file="$STATS_DIR/$timestamp.json"
    
    # 使用 curl 直接调用 Screeps API
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    
    if [ -n "$token" ]; then
        # 获取用户概览
        local overview=$(curl -s -H "X-Token: $token" \
            "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8" 2>/dev/null)
        
        # 获取用户信息
        local me=$(curl -s -H "X-Token: $token" \
            "https://screeps.com/api/auth/me" 2>/dev/null)
        
        # 写入统计文件
        cat > "$stats_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "overview": $overview,
    "user": $me
}
EOF
        echo "[$(date)] Stats recorded: $stats_file"
    fi
}

# 后台统计记录进程
start_stats_recorder() {
    while true; do
        record_stats
        sleep $POLL_INTERVAL
    done
}

# 启动统计记录 (后台)
start_stats_recorder &
STATS_PID=$!

# 清理函数
cleanup() {
    echo "[$(date)] Stopping stats recorder..."
    kill $STATS_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# 主循环
session_count=0

while true; do
    session_count=$((session_count + 1))
    echo ""
    echo "=========================================="
    echo "  Screeps Eternal Agent - Session #$session_count"
    echo "  $(date)"
    echo "=========================================="
    echo ""
    
    # 记录 session 开始
    echo "[$(date)] Session $session_count started" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    # 运行 kimi session (带超时)
    timeout $SESSION_TIMEOUT kimi -y --prompt "$(cat << 'PROMPT'
你是 Screeps 游戏的永恒 AI Agent。

## 立即执行

1. 阅读 AGENTS.md 了解你的使命和约束
2. 遍历项目所有文件，理解当前状态
3. 检查游戏状态，采取必要行动
4. 总结本次 session，将重要信息固化到文件
5. 每次修改后 git commit

## 凭证
- Token 在 .env 文件
- 用户: payyy
- 房间: W13N45 (shard3)

## 工作目录
/Users/moonshot/dev/infinite-screeps

开始工作。
PROMPT
)" || true
    
    # 记录 session 结束
    echo "[$(date)] Session $session_count ended" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    echo ""
    echo "[$(date)] Session $session_count ended, starting next session in 10 seconds..."
    sleep 10
done
