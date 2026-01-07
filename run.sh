#!/bin/bash
# Screeps Eternal Agent - 主运行脚本
# 循环获取游戏状态，调用 kimi 处理

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$PROJECT_DIR/logs"
INTERVAL=${INTERVAL:-300}  # 默认 300 秒 (5分钟)

cd "$PROJECT_DIR"
mkdir -p "$LOGS_DIR"

# 清理函数
cleanup() {
    echo "[$(date '+%H:%M:%S')] 停止..."
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "=========================================="
echo "  Screeps Eternal Agent"
echo "  间隔: ${INTERVAL}s"
echo "  $(date)"
echo "=========================================="

iteration=0
while true; do
    iteration=$((iteration + 1))
    timestamp=$(date +%Y%m%d_%H%M%S)
    log_file="$LOGS_DIR/session_${iteration}_${timestamp}.md"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "[$(date '+%H:%M:%S')] 迭代 #$iteration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 获取游戏状态作为提示词
    prompt=$(python3 "$PROJECT_DIR/tools/get_game_state.py" 2>/dev/null)
    
    if [ -z "$prompt" ]; then
        echo "[$(date '+%H:%M:%S')] ❌ 获取状态失败，跳过"
        sleep $INTERVAL
        continue
    fi
    
    # 调用 kimi
    echo "$prompt" >> "$log_file"
    # echo ""
    # echo "---"
    # echo ""
    
    kimi --print -y -w "$PROJECT_DIR" -c "$prompt" 2>&1 | tee -a "$log_file"
    
    # 让 kimi 执行 git 提交（可处理 merge conflict）
    kimi --print -y -w "$PROJECT_DIR" -c "执行 git add -A && git commit，commit message 根据本次改动自行决定。如果有 merge conflict，尝试解决。" 2>&1 | tee -a "$log_file"
    
    echo ""
    echo "[$(date '+%H:%M:%S')] 下次: ${INTERVAL}s 后"
    sleep $INTERVAL
done
