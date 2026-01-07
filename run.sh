#!/bin/bash
# Screeps Eternal Agent - 主启动脚本
#
# 使用方式:
#   ./run.sh              # 获取状态并输出，可管道到 AI
#   ./run.sh | kimi       # 直接传给 kimi
#   ./run.sh --loop       # 循环模式
#   ./run.sh --watch      # 监控模式

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 如果有参数，转发到 run_loop.sh
if [ "$1" == "--loop" ] || [ "$1" == "-l" ]; then
    exec bash "$PROJECT_DIR/run_loop.sh" --loop
elif [ "$1" == "--watch" ] || [ "$1" == "-w" ]; then
    exec bash "$PROJECT_DIR/run_loop.sh" --watch
fi

# 默认：输出游戏状态（可用于管道）
python3 "$PROJECT_DIR/tools/get_game_state.py"
