#!/bin/bash
# Screeps Eternal Agent - 启动脚本

set -e

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
STATS_DIR="$PROJECT_DIR/knowledge/stats"
LOGS_DIR="$PROJECT_DIR/logs"
SESSION_TIMEOUT=86400  # 24小时切换一次 session
POLL_INTERVAL=300      # 5分钟记录一次统计

cd "$PROJECT_DIR"

# macOS 兼容的 timeout 函数
run_with_timeout() {
    local timeout=$1
    shift
    
    # 启动命令
    "$@" &
    local pid=$!
    
    # 后台计时
    (sleep $timeout && kill $pid 2>/dev/null) &
    local timer_pid=$!
    
    # 等待命令完成
    wait $pid 2>/dev/null
    local exit_code=$?
    
    # 取消计时器
    kill $timer_pid 2>/dev/null || true
    
    return $exit_code
}

# 确保目录存在
mkdir -p "$STATS_DIR" "$LOGS_DIR"

# 记录统计数据的函数
record_stats() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local stats_file="$STATS_DIR/$timestamp.json"
    
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    
    if [ -n "$token" ]; then
        local overview=$(curl -s -H "X-Token: $token" \
            "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8" 2>/dev/null)
        local me=$(curl -s -H "X-Token: $token" \
            "https://screeps.com/api/auth/me" 2>/dev/null)
        
        cat > "$stats_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "overview": $overview,
    "user": $me
}
EOF
        echo "[$(date)] Stats recorded"
    fi
}

# 后台统计记录进程
start_stats_recorder() {
    while true; do
        record_stats
        sleep $POLL_INTERVAL
    done
}

# 后台定期 git push
start_git_sync() {
    while true; do
        sleep 600  # 每 10 分钟同步一次
        cd "$PROJECT_DIR"
        git add -A
        git commit -m "[auto] sync $(date +%H:%M)" 2>/dev/null || true
        git push 2>/dev/null || true
    done
}

start_stats_recorder &
STATS_PID=$!

start_git_sync &
GIT_PID=$!

cleanup() {
    echo "[$(date)] Stopping..."
    kill $STATS_PID 2>/dev/null || true
    kill $GIT_PID 2>/dev/null || true
    cd "$PROJECT_DIR"
    git add -A
    git commit -m "[auto] final sync" 2>/dev/null || true
    git push 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# 主循环
session_count=0

while true; do
    session_count=$((session_count + 1))
    SESSION_ID="session_${session_count}_$(date +%Y%m%d_%H%M%S)"
    OUTPUT_LOG="$LOGS_DIR/${SESSION_ID}_output.log"
    
    echo ""
    echo "=========================================="
    echo "  Screeps Eternal Agent - Session #$session_count"
    echo "  ID: $SESSION_ID"
    echo "  $(date)"
    echo "=========================================="
    echo ""
    
    echo "[$(date)] Session $SESSION_ID started" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    # 读取提示词
    PROMPT=$(cat "$PROJECT_DIR/prompt.md")
    
    # 运行 kimi (带超时)
    run_with_timeout $SESSION_TIMEOUT kimi --print -w "$PROJECT_DIR" -c "$PROMPT" 2>&1 | tee "$OUTPUT_LOG" || true
    
    echo "[$(date)] Session $SESSION_ID ended" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    # 提交变更
    cd "$PROJECT_DIR"
    git add -A
    git commit -m "[session] $SESSION_ID completed" 2>/dev/null || true
    git push 2>/dev/null || true
    
    echo ""
    echo "[$(date)] Session ended, next in 10s..."
    sleep 10
done
