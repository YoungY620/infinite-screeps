#!/bin/bash
# Screeps Eternal Agent - 启动脚本
# 每个 session 运行一段时间后自动切换到下一个

set -e

PROJECT_DIR="/Users/moonshot/dev/infinite-screeps"
STATS_DIR="$PROJECT_DIR/knowledge/stats"
LOGS_DIR="$PROJECT_DIR/logs"
SESSION_TIMEOUT=86400  # 24小时切换一次 session
POLL_INTERVAL=300      # 5分钟记录一次统计

cd "$PROJECT_DIR"

# 确保目录存在
mkdir -p "$STATS_DIR" "$LOGS_DIR"

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
    SESSION_ID="session_${session_count}_$(date +%Y%m%d_%H%M%S)"
    LOG_FILE="$LOGS_DIR/${SESSION_ID}.md"
    
    echo ""
    echo "=========================================="
    echo "  Screeps Eternal Agent - Session #$session_count"
    echo "  ID: $SESSION_ID"
    echo "  $(date)"
    echo "=========================================="
    echo ""
    
    # 记录 session 开始
    echo "[$(date)] Session $SESSION_ID started" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    # 运行 kimi session (带超时)
    timeout $SESSION_TIMEOUT kimi -y --prompt "$(cat << PROMPT
你是 Screeps 游戏的永恒 AI Agent。

## Session 信息
- Session ID: $SESSION_ID
- 日志文件: $LOG_FILE
- 开始时间: $(date)

## 日志记录要求

**你必须将所有思考和决策过程记录到日志文件 \`$LOG_FILE\`**

日志格式 (Markdown):

\`\`\`markdown
# Session: $SESSION_ID

## 🕐 [时间戳] 阶段标题

### 💭 思考
- 观察到什么
- 分析和推理

### 📋 决策
- 决定做什么
- 为什么这样决定

### ⚡ 行动
- 执行了什么命令/修改
- 结果如何

### 📝 总结
- 本阶段成果
- 下一步计划

---
\`\`\`

每个重要步骤都要记录，保持日志清晰美观。

## 立即执行

1. 创建日志文件，写入 session 开头
2. 阅读 AGENTS.md 了解你的使命和约束
3. 遍历项目所有文件，理解当前状态
4. 检查游戏状态，采取必要行动
5. 总结本次 session，将重要信息固化到 knowledge/
6. 每次修改后 git commit (包括日志文件)
7. 在日志中记录 session 结束总结

## 凭证
- Token 在 .env 文件
- 用户: payyy
- 房间: W13N45 (shard3)

## 工作目录
$PROJECT_DIR

开始工作。首先创建日志文件。
PROMPT
)" || true
    
    # 记录 session 结束
    echo "[$(date)] Session $SESSION_ID ended" >> "$PROJECT_DIR/knowledge/sessions.log"
    
    # 提交日志 (如果有变更)
    cd "$PROJECT_DIR"
    if [ -f "$LOG_FILE" ]; then
        git add -A
        git commit -m "[logs] Session $SESSION_ID completed" 2>/dev/null || true
        git push 2>/dev/null || true
    fi
    
    echo ""
    echo "[$(date)] Session $SESSION_ID ended, starting next session in 10 seconds..."
    sleep 10
done
