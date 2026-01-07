#!/bin/bash
# Screeps Eternal Agent - 启动脚本

set -e

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
STATS_DIR="$PROJECT_DIR/knowledge/stats"
LOGS_DIR="$PROJECT_DIR/logs"
SYSTEM_LOG="$LOGS_DIR/system.log"
SESSION_TIMEOUT=1800   # 30分钟一次常规 session
POLL_INTERVAL=300      # 5分钟记录一次统计

cd "$PROJECT_DIR"

mkdir -p "$STATS_DIR" "$LOGS_DIR"

# 系统日志函数
syslog() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [AGENT] $1"
    echo "$msg" | tee -a "$SYSTEM_LOG"
}

# macOS 兼容的 timeout 函数
run_with_timeout() {
    local timeout=$1
    shift
    "$@" &
    local pid=$!
    (sleep $timeout && kill $pid 2>/dev/null) &
    local timer_pid=$!
    wait $pid 2>/dev/null
    local exit_code=$?
    kill $timer_pid 2>/dev/null || true
    return $exit_code
}

# 统计记录
record_stats() {
    local stats_file="$STATS_DIR/$(date +%Y%m%d_%H%M%S).json"
    local token=$(grep SCREEPS_TOKEN .env 2>/dev/null | cut -d'=' -f2)
    if [ -n "$token" ]; then
        local overview=$(curl -s -H "X-Token: $token" "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8" 2>/dev/null)
        local me=$(curl -s -H "X-Token: $token" "https://screeps.com/api/auth/me" 2>/dev/null)
        echo "{\"timestamp\":\"$(date -Iseconds)\",\"overview\":$overview,\"user\":$me}" > "$stats_file"
    fi
}

# 后台统计
(while true; do record_stats; sleep $POLL_INTERVAL; done) &
STATS_PID=$!
trap "kill $STATS_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# 主循环
session_count=0

while true; do
    session_count=$((session_count + 1))
    SESSION_ID="session_${session_count}_$(date +%Y%m%d_%H%M%S)"
    RAW_LOG="$LOGS_DIR/${SESSION_ID}.log"
    
    syslog "========== Session #$session_count started =========="
    syslog "ID: $SESSION_ID"
    
    # 读取提示词并运行 kimi，保存原始输出
    PROMPT=$(cat "$PROJECT_DIR/prompt.md")
    run_with_timeout $SESSION_TIMEOUT kimi --print -w "$PROJECT_DIR" -c "$PROMPT" 2>&1 | tee "$RAW_LOG" || true
    
    # 提交变更（包括 logs）
    cd "$PROJECT_DIR"
    git add -A
    git commit -m "[session] $SESSION_ID" 2>/dev/null || true
    
    # 尝试 push，如果失败则处理冲突
    if ! git push 2>/dev/null; then
        syslog "Push failed, attempting pull --rebase..."
        
        if ! git pull --rebase 2>/dev/null; then
            syslog "🚨 Merge conflict detected, invoking kimi to resolve..."
            
            # 获取冲突文件列表
            CONFLICT_FILES=$(git diff --name-only --diff-filter=U)
            
            if [ -n "$CONFLICT_FILES" ]; then
                # 调用 kimi 解决冲突
                RESOLVE_PROMPT="Git merge conflict detected. Please resolve the conflicts in these files:\n$CONFLICT_FILES\n\nFor each conflicted file:\n1. Read the file content\n2. Look for <<<<<<< ======= >>>>>>> markers\n3. Intelligently merge the changes (keep both changes if possible, prefer newer/better code)\n4. Remove all conflict markers\n5. Save the resolved file\n\nAfter resolving all conflicts, run: git add -A"
                
                kimi --print -w "$PROJECT_DIR" -c "$RESOLVE_PROMPT" 2>&1 | tee -a "$RAW_LOG" || true
                
                # 继续 rebase
                git add -A
                if git rebase --continue 2>/dev/null; then
                    syslog "✅ Conflict resolved, pushing..."
                    git push 2>/dev/null || syslog "⚠️ Push failed after resolve"
                else
                    syslog "⚠️ Rebase continue failed, aborting..."
                    git rebase --abort 2>/dev/null || true
                fi
            else
                syslog "⚠️ No conflict files found, aborting rebase..."
                git rebase --abort 2>/dev/null || true
            fi
        else
            # pull --rebase 成功，再次 push
            git push 2>/dev/null || syslog "⚠️ Push failed after rebase"
        fi
    fi
    
    syslog "Session #$session_count ended"
    syslog "Next session in 30 minutes..."
    sleep 1800  # 30分钟间隔
done
