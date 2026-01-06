#!/bin/bash
# get_game_state.sh - 获取完整的游戏状态（原始 API 数据）
#
# 用法: ./tools/get_game_state.sh
# 输出: 包含原始 API 数据的提示词

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

# ========== 获取原始 API 数据 ==========

python3 << 'PYEOF'
import urllib.request
import json
import os
from datetime import datetime

TOKEN = os.environ.get('SCREEPS_TOKEN', '')
API_BASE = "https://screeps.com/api"

def api_get(endpoint):
    """调用 Screeps API，返回原始 JSON"""
    url = f"{API_BASE}{endpoint}"
    req = urllib.request.Request(url)
    req.add_header('X-Token', TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return {'error': str(e)}

def pretty_json(data, max_items=None):
    """格式化 JSON，可选限制数组长度"""
    if max_items and isinstance(data, list) and len(data) > max_items:
        data = data[:max_items] + [f"... 还有 {len(data) - max_items} 项"]
    return json.dumps(data, indent=2, ensure_ascii=False)

# ========== 1. 获取用户信息 ==========
print("执行游戏管理循环。以下是原始 API 数据：")
print()
print(f"**查询时间:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

user_data = api_get('/auth/me')
print("## 1. 用户信息 (`/auth/me`)")
print("```json")
print(pretty_json({
    'username': user_data.get('username'),
    'email': user_data.get('email'),
    'gcl': user_data.get('gcl'),
    'power': user_data.get('power'),
    'money': user_data.get('money'),
    'cpu': user_data.get('cpu'),
    'cpuShard': user_data.get('cpuShard'),
}))
print("```")
print()

# ========== 2. 获取房间概览 ==========
overview = api_get('/user/overview?statName=energyHarvested&interval=8')
print("## 2. 房间概览 (`/user/overview`)")
print("```json")
print(pretty_json({
    'ok': overview.get('ok'),
    'shards': overview.get('shards'),
}))
print("```")
print()

# 确定当前 shard 和房间
current_shard = None
current_room = None
shards_data = overview.get('shards', {})
for shard_name, shard_info in shards_data.items():
    rooms = shard_info.get('rooms', [])
    if rooms:
        current_shard = shard_name
        current_room = rooms[0]
        break

if not current_room:
    print("## ⚠️ 错误：无法获取房间信息")
    print("可能原因：殖民地已丢失或 API 错误")
    exit(1)

print(f"**检测到:** Shard = `{current_shard}`, Room = `{current_room}`")
print()

# ========== 3. 获取房间对象 ==========
room_data = api_get(f'/game/room-objects?room={current_room}&shard={current_shard}')
objects = room_data.get('objects', [])

# 按类型分组
objects_by_type = {}
for obj in objects:
    t = obj.get('type', 'unknown')
    if t not in objects_by_type:
        objects_by_type[t] = []
    objects_by_type[t].append(obj)

print(f"## 3. 房间对象 (`/game/room-objects?room={current_room}&shard={current_shard}`)")
print()
print("### 对象统计")
print("```")
for t, objs in sorted(objects_by_type.items()):
    print(f"  {t}: {len(objs)}")
print("```")
print()

# 输出关键对象详情
key_types = ['controller', 'spawn', 'extension', 'tower', 'storage', 'terminal', 'constructionSite', 'source']
for t in key_types:
    if t in objects_by_type:
        print(f"### {t} ({len(objects_by_type[t])} 个)")
        print("```json")
        # 简化输出：只保留关键字段
        simplified = []
        for obj in objects_by_type[t][:10]:  # 最多显示 10 个
            s = {k: v for k, v in obj.items() if k in [
                'type', 'x', 'y', 'name', 'level', 'progress', 'progressTotal',
                'hits', 'hitsMax', 'energy', 'energyCapacity', 'store',
                'safeMode', 'safeModeAvailable', 'safeModeGenerated', 'safeModeAvailable',
                'structureType', 'user', 'body', 'memory'
            ]}
            simplified.append(s)
        print(pretty_json(simplified))
        print("```")
        print()

# Creeps 单独处理
if 'creep' in objects_by_type:
    creeps = objects_by_type['creep']
    print(f"### creep ({len(creeps)} 个)")
    print("```json")
    simplified = []
    for c in creeps[:15]:  # 最多 15 个
        simplified.append({
            'name': c.get('name'),
            'x': c.get('x'),
            'y': c.get('y'),
            'hits': c.get('hits'),
            'hitsMax': c.get('hitsMax'),
            'user': c.get('user'),
            'body': [p.get('type') for p in c.get('body', [])],
            'store': c.get('store'),
        })
    print(pretty_json(simplified))
    print("```")
    print()

# ========== 4. 获取 Memory（原始） ==========
memory_data = api_get(f'/user/memory?shard={current_shard}')
print(f"## 4. Memory (`/user/memory?shard={current_shard}`)")
print()
mem_str = memory_data.get('data', '')
if mem_str.startswith('gz:'):
    print("*Memory 数据为 gzip 压缩格式 (gz:...)*")
    try:
        import base64, gzip
        decoded = base64.b64decode(mem_str[3:])
        mem_json = json.loads(gzip.decompress(decoded).decode())
        # 只显示顶层 keys
        print("### Memory 顶层结构")
        print("```json")
        top_level = {}
        for k, v in mem_json.items():
            if isinstance(v, dict):
                top_level[k] = f"{{...}} ({len(v)} keys)"
            elif isinstance(v, list):
                top_level[k] = f"[...] ({len(v)} items)"
            else:
                top_level[k] = v
        print(pretty_json(top_level))
        print("```")
        
        # 如果有 stats，显示出来
        if 'stats' in mem_json:
            print("### Memory.stats")
            print("```json")
            print(pretty_json(mem_json['stats']))
            print("```")
    except Exception as e:
        print(f"*解压失败: {e}*")
else:
    print("```json")
    print(mem_str[:2000] if len(mem_str) > 2000 else mem_str)
    print("```")
print()

# ========== 5. 侦查周围房间 ==========
import re

def parse_room_name(name):
    match = re.match(r'([EW])(\d+)([NS])(\d+)', name)
    if match:
        ew, x, ns, y = match.groups()
        x = int(x) if ew == 'E' else -int(x) - 1
        y = int(y) if ns == 'S' else -int(y) - 1
        return x, y
    return None

def make_room_name(x, y):
    ew = 'E' if x >= 0 else 'W'
    ns = 'S' if y >= 0 else 'N'
    rx = x if x >= 0 else -x - 1
    ry = y if y >= 0 else -y - 1
    return f"{ew}{rx}{ns}{ry}"

coords = parse_room_name(current_room)
if coords:
    x, y = coords
    # 8 个相邻房间
    adjacent = [
        (make_room_name(x - 1, y - 1), "↖"),
        (make_room_name(x, y - 1), "↑"),
        (make_room_name(x + 1, y - 1), "↗"),
        (make_room_name(x - 1, y), "←"),
        (make_room_name(x + 1, y), "→"),
        (make_room_name(x - 1, y + 1), "↙"),
        (make_room_name(x, y + 1), "↓"),
        (make_room_name(x + 1, y + 1), "↘"),
    ]
    
    print("## 5. 周围房间侦查 (8个方向)")
    print()
    
    my_user_id = None
    if 'spawn' in objects_by_type:
        my_user_id = objects_by_type['spawn'][0].get('user')
    
    for adj_room, direction in adjacent:
        adj_data = api_get(f'/game/room-objects?room={adj_room}&shard={current_shard}')
        adj_objects = adj_data.get('objects', [])
        
        # 统计
        summary = {}
        for obj in adj_objects:
            t = obj.get('type')
            summary[t] = summary.get(t, 0) + 1
        
        # 提取关键信息
        adj_controller = None
        adj_spawns = []
        adj_towers = []
        adj_creeps = []
        adj_hostile_creeps = []
        
        for obj in adj_objects:
            t = obj.get('type')
            if t == 'controller':
                adj_controller = obj
            elif t == 'spawn':
                adj_spawns.append(obj)
            elif t == 'tower':
                adj_towers.append(obj)
            elif t == 'creep':
                if obj.get('user') == my_user_id:
                    adj_creeps.append(obj)
                else:
                    adj_hostile_creeps.append(obj)
        
        print(f"### {adj_room} ({direction})")
        
        if not adj_objects:
            print("*空房间或无法访问*")
            print()
            continue
        
        print("```json")
        room_info = {
            "对象统计": summary,
        }
        
        # Controller 详情
        if adj_controller:
            ctrl_info = {
                "level": adj_controller.get('level', 0),
                "user": adj_controller.get('user'),
                "safeMode": adj_controller.get('safeMode'),
                "reservation": adj_controller.get('reservation'),
            }
            # 清除 None 值
            ctrl_info = {k: v for k, v in ctrl_info.items() if v is not None}
            room_info["controller"] = ctrl_info
        
        # Spawn 详情
        if adj_spawns:
            room_info["spawns"] = [{
                "name": s.get('name'),
                "user": s.get('user'),
                "hits": s.get('hits'),
                "hitsMax": s.get('hitsMax'),
            } for s in adj_spawns]
        
        # Tower 详情
        if adj_towers:
            room_info["towers"] = [{
                "x": t.get('x'),
                "y": t.get('y'),
                "energy": t.get('store', {}).get('energy', 0),
            } for t in adj_towers]
        
        # 敌对 Creep
        if adj_hostile_creeps:
            room_info["hostile_creeps"] = [{
                "name": c.get('name'),
                "user": c.get('user'),
                "body": [p.get('type') for p in c.get('body', [])],
                "hits": c.get('hits'),
            } for c in adj_hostile_creeps[:10]]  # 最多 10 个
        
        print(pretty_json(room_info))
        print("```")
        print()

# ========== 6. 任务指令 ==========
print("---")
print()
print("## 📋 任务")
print()
print("根据以上原始 API 数据：")
print("1. 分析当前殖民地状态")
print("2. 识别问题和改进点")
print("3. 如果需要修改代码，执行修改并上传")
print("4. 如果一切正常，报告 `✅ 稳定运行`")
print()
print("**注意：以上数据直接来自 Screeps API，请自行解析和分析。**")
PYEOF
