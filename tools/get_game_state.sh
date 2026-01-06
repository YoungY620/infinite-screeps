#!/bin/bash
# get_game_state.sh - 获取完整的游戏状态，生成 AI 提示词
#
# 用法: ./tools/get_game_state.sh
# 输出: 包含最新游戏数据的提示词

# 加载 Token
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$SCREEPS_TOKEN" ]; then
    echo "错误: SCREEPS_TOKEN 未设置"
    exit 1
fi

TOKEN="$SCREEPS_TOKEN"
API_BASE="https://screeps.com/api"

# ========== 使用 Python 获取所有数据 ==========

python3 << 'PYEOF'
import urllib.request
import json
import os
from datetime import datetime

TOKEN = os.environ.get('SCREEPS_TOKEN', '')
API_BASE = "https://screeps.com/api"
SHARD = "shard3"

def api_get(endpoint):
    """调用 Screeps API"""
    url = f"{API_BASE}{endpoint}"
    req = urllib.request.Request(url)
    req.add_header('X-Token', TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return {'error': str(e)}

# 获取用户信息
user_data = api_get('/auth/me')
username = user_data.get('username', 'unknown')

# 获取房间
overview = api_get('/user/overview?statName=energyHarvested&interval=8')
rooms = overview.get('shards', {}).get(SHARD, {}).get('rooms', [])
if not rooms:
    print("错误: 无法获取房间信息")
    exit(1)

room = rooms[0]

# 获取房间对象
room_data = api_get(f'/game/room-objects?room={room}&shard={SHARD}')
objects = room_data.get('objects', [])

# 解析对象
controller = None
spawn = None
my_creeps = []
extensions = []
extension_sites = []
towers = []
tower_sites = []
enemies = []
sources = []
other_sites = []

spawn_user = None

for obj in objects:
    t = obj.get('type')
    if t == 'controller':
        controller = obj
    elif t == 'spawn':
        spawn = obj
        spawn_user = obj.get('user')
    elif t == 'extension':
        extensions.append(obj)
    elif t == 'tower':
        towers.append(obj)
    elif t == 'source':
        sources.append(obj)
    elif t == 'constructionSite':
        st = obj.get('structureType')
        if st == 'extension':
            extension_sites.append(obj)
        elif st == 'tower':
            tower_sites.append(obj)
        else:
            other_sites.append(obj)
    elif t == 'creep':
        if obj.get('user') == spawn_user:
            my_creeps.append(obj)
        else:
            enemies.append(obj)

# 从 Memory API 获取角色统计
roles = {'harvester': 0, 'builder': 0, 'upgrader': 0, 'unknown': 0}
try:
    mem_data = api_get('/user/memory?shard=shard3&path=creeps')
    mem_str = mem_data.get('data', '')
    if mem_str.startswith('gz:'):
        import base64, gzip
        decoded = base64.b64decode(mem_str[3:])
        mem_str = gzip.decompress(decoded).decode()
    creep_memory = json.loads(mem_str) if mem_str else {}
    for name, info in creep_memory.items():
        if isinstance(info, dict):
            role = info.get('role', 'unknown')
            roles[role] = roles.get(role, 0) + 1
except Exception as e:
    # 回退到 room-objects 的数据
    for c in my_creeps:
        roles['unknown'] += 1

# 侦查周围房间
def parse_room_name(name):
    """解析房间名称为坐标"""
    import re
    match = re.match(r'([EW])(\d+)([NS])(\d+)', name)
    if match:
        ew, x, ns, y = match.groups()
        x = int(x) if ew == 'E' else -int(x) - 1
        y = int(y) if ns == 'S' else -int(y) - 1
        return x, y, ew, ns
    return None

def make_room_name(x, y):
    """从坐标生成房间名称"""
    ew = 'E' if x >= 0 else 'W'
    ns = 'S' if y >= 0 else 'N'
    rx = x if x >= 0 else -x - 1
    ry = y if y >= 0 else -y - 1
    return f"{ew}{rx}{ns}{ry}"

coords = parse_room_name(room)
if coords:
    x, y, _, _ = coords
    adjacent_rooms = [
        make_room_name(x - 1, y),
        make_room_name(x + 1, y),
        make_room_name(x, y - 1),
        make_room_name(x, y + 1),
    ]
else:
    adjacent_rooms = []

intel_report = []
neighbor_count = 0
strongest_neighbor = ""
strongest_level = 0

for adj_room in adjacent_rooms:
    adj_data = api_get(f'/game/room-objects?room={adj_room}&shard={SHARD}')
    adj_objects = adj_data.get('objects', [])
    
    adj_controller = None
    adj_spawns = 0
    adj_towers = 0
    adj_creeps = 0
    
    for obj in adj_objects:
        t = obj.get('type')
        if t == 'controller' and obj.get('user'):
            adj_controller = obj
        elif t == 'spawn':
            adj_spawns += 1
        elif t == 'tower':
            adj_towers += 1
        elif t == 'creep':
            adj_creeps += 1
    
    if adj_controller:
        level = adj_controller.get('level', 0)
        neighbor_count += 1
        intel_report.append(f"  - {adj_room}: 👤 Level {level}, Spawns: {adj_spawns}, Towers: {adj_towers}, Creeps: {adj_creeps}")
        if level > strongest_level:
            strongest_level = level
            strongest_neighbor = adj_room
    elif adj_spawns > 0:
        neighbor_count += 1
        intel_report.append(f"  - {adj_room}: 👤 有 Spawn")
    elif adj_creeps > 0:
        intel_report.append(f"  - {adj_room}: {adj_creeps} Creep 活动")
    else:
        intel_report.append(f"  - {adj_room}: 空")

# 评估威胁
ctrl_level = controller.get('level', 0) if controller else 0
if enemies:
    threat_level = "🔴 高 - 敌人在房间内！"
elif strongest_level > ctrl_level:
    threat_level = "🟡 中 - 邻居比你强"
else:
    threat_level = "🟢 低"

# 生成提示词
ctrl = controller or {}
spn = spawn or {}
safe_mode = ctrl.get('safeMode', 0)
safe_mode_str = f"激活中 (剩余 {safe_mode} ticks)" if safe_mode else "未激活"

print(f"""执行游戏管理循环。以下是最新的战场情况：

## 📊 当前状态 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})

**基础信息:**
- 用户: {username}
- Shard: {SHARD}
- 房间: {room}

**控制器:**
- Level: {ctrl.get('level', 0)}
- 升级进度: {ctrl.get('progress', 0)} / {ctrl.get('progressTotal', 0)}
- Safe Mode: {safe_mode_str}
- Safe Mode 储备: {ctrl.get('safeModeAvailable', 0)}

**Spawn:**
- 名称: {spn.get('name', 'N/A')}
- 位置: ({spn.get('x', '?')}, {spn.get('y', '?')})
- 能量: {spn.get('store', {}).get('energy', 0)} / 300

**Creeps ({len(my_creeps)} 个):**
- Harvester: {roles.get('harvester', 0)}
- Builder: {roles.get('builder', 0)}
- Upgrader: {roles.get('upgrader', 0)}
- 其他: {roles.get('unknown', 0)}

**建筑:**
- Extension: {len(extensions)} 完成, {len(extension_sites)} 建造中
- Tower: {len(towers)} 完成, {len(tower_sites)} 建造中
- Sources: {len(sources)}
- 其他建造中: {len(other_sites)}

**威胁:**
- 房间内敌人: {len(enemies)}
- 威胁等级: {threat_level}

## 🔍 周围侦查

{chr(10).join(intel_report)}

**侦查摘要:**
- 周围玩家数: {neighbor_count}
- 最强邻居: {strongest_neighbor} (Level {strongest_level})

---

## 📋 任务

根据以上信息：
1. 分析当前状态是否健康
2. 识别需要改进的地方
3. 如果需要修改代码，执行修改并上传
4. 如果一切正常，报告"✅ 稳定运行"

如果发现紧急情况（敌人入侵、Safe Mode 即将结束等），优先处理！
""")
PYEOF
