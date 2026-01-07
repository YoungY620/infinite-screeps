#!/usr/bin/env python3
"""
get_game_state.py - 获取完整的游戏状态（原始 API 数据）

用法: python3 tools/get_game_state.py
输出: 包含原始 API 数据的提示词
"""

import urllib.request
import json
import os
import re
import base64
import gzip
from datetime import datetime
from pathlib import Path

# 加载 Token
def load_token():
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.startswith('SCREEPS_TOKEN='):
                    return line.strip().split('=', 1)[1]
    return os.environ.get('SCREEPS_TOKEN', '')

TOKEN = load_token()
API_BASE = "https://screeps.com/api"

def api_get(endpoint):
    """调用 Screeps API，返回原始 JSON"""
    url = f"{API_BASE}{endpoint}"
    req = urllib.request.Request(url)
    req.add_header('X-Token', TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return {'error': str(e)}

def pretty_json(data):
    """格式化 JSON"""
    return json.dumps(data, indent=2, ensure_ascii=False)

def parse_room_name(name):
    """解析房间名称为坐标"""
    match = re.match(r'([EW])(\d+)([NS])(\d+)', name)
    if match:
        ew, x, ns, y = match.groups()
        x = int(x) if ew == 'E' else -int(x) - 1
        y = int(y) if ns == 'S' else -int(y) - 1
        return x, y
    return None

def make_room_name(x, y):
    """从坐标生成房间名称"""
    ew = 'E' if x >= 0 else 'W'
    ns = 'S' if y >= 0 else 'N'
    rx = x if x >= 0 else -x - 1
    ry = y if y >= 0 else -y - 1
    return f"{ew}{rx}{ns}{ry}"

def main():
    if not TOKEN:
        print("错误: SCREEPS_TOKEN 未设置")
        return
    
    print(f"# Screeps 状态 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    print()
    
    # ========== 1. 用户信息 ==========
    user_data = api_get('/auth/me')
    print("## 1. 用户信息")
    print("```json")
    print(pretty_json({
        'username': user_data.get('username'),
        'gcl': user_data.get('gcl'),
        'cpu': user_data.get('cpu'),
        'cpuShard': user_data.get('cpuShard'),
    }))
    print("```")
    print()
    
    # ========== 2. 房间概览 ==========
    overview = api_get('/user/overview?statName=energyHarvested&interval=8')
    
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
        return
    
    print(f"## 2. 房间: `{current_room}` @ `{current_shard}`")
    print()
    
    # ========== 3. 房间对象 ==========
    room_data = api_get(f'/game/room-objects?room={current_room}&shard={current_shard}')
    objects = room_data.get('objects', [])
    
    # 按类型分组
    objects_by_type = {}
    for obj in objects:
        t = obj.get('type', 'unknown')
        if t not in objects_by_type:
            objects_by_type[t] = []
        objects_by_type[t].append(obj)
    
    print("## 3. 房间对象")
    print("```")
    for t, objs in sorted(objects_by_type.items()):
        print(f"  {t}: {len(objs)}")
    print("```")
    print()
    
    # 关键对象详情
    if 'controller' in objects_by_type:
        ctrl = objects_by_type['controller'][0]
        print("### Controller")
        print("```json")
        print(pretty_json({
            'level': ctrl.get('level'),
            'progress': ctrl.get('progress'),
            'progressTotal': ctrl.get('progressTotal'),
            'safeMode': ctrl.get('safeMode'),
            'safeModeAvailable': ctrl.get('safeModeAvailable'),
        }))
        print("```")
        print()
    
    if 'spawn' in objects_by_type:
        spawn = objects_by_type['spawn'][0]
        print("### Spawn")
        print("```json")
        print(pretty_json({
            'name': spawn.get('name'),
            'x': spawn.get('x'),
            'y': spawn.get('y'),
            'energy': spawn.get('store', {}).get('energy', 0),
            'spawning': spawn.get('spawning'),
        }))
        print("```")
        print()
    
    if 'creep' in objects_by_type:
        creeps = objects_by_type['creep']
        spawn_user = objects_by_type.get('spawn', [{}])[0].get('user')
        my_creeps = [c for c in creeps if c.get('user') == spawn_user]
        
        print(f"### Creeps ({len(my_creeps)} 个)")
        print("```json")
        simplified = [{
            'name': c.get('name'),
            'body': [p.get('type') for p in c.get('body', [])],
            'hits': c.get('hits'),
            'store': c.get('store'),
        } for c in my_creeps[:15]]
        print(pretty_json(simplified))
        print("```")
        print()
    
    # ========== 4. Memory ==========
    memory_data = api_get(f'/user/memory?shard={current_shard}')
    print("## 4. Memory.stats")
    mem_str = memory_data.get('data', '')
    if mem_str.startswith('gz:'):
        try:
            decoded = base64.b64decode(mem_str[3:])
            mem_json = json.loads(gzip.decompress(decoded).decode())
            if 'stats' in mem_json:
                print("```json")
                print(pretty_json(mem_json['stats']))
                print("```")
        except:
            print("*解压失败*")
    print()
    
    # ========== 5. 周围房间侦查 ==========
    coords = parse_room_name(current_room)
    if coords:
        x, y = coords
        adjacent = [
            (make_room_name(x - 1, y), "←"),
            (make_room_name(x + 1, y), "→"),
            (make_room_name(x, y - 1), "↑"),
            (make_room_name(x, y + 1), "↓"),
        ]
        
        print("## 5. 周围房间")
        print()
        
        spawn_user = objects_by_type.get('spawn', [{}])[0].get('user')
        
        for adj_room, direction in adjacent:
            adj_data = api_get(f'/game/room-objects?room={adj_room}&shard={current_shard}')
            adj_objects = adj_data.get('objects', [])
            
            summary = {}
            adj_controller = None
            for obj in adj_objects:
                t = obj.get('type')
                summary[t] = summary.get(t, 0) + 1
                if t == 'controller' and obj.get('user'):
                    adj_controller = obj
            
            print(f"### {adj_room} ({direction})")
            if adj_controller:
                print(f"**玩家控制** Level {adj_controller.get('level')}")
            print("```json")
            print(pretty_json(summary) if summary else "{}")
            print("```")
            print()
    
    # ========== 6. 服务器代码 ==========
    print("## 6. 服务器代码")
    code_data = api_get('/user/code')
    if code_data.get('ok'):
        modules = code_data.get('modules', {})
        main_code = modules.get('main', '')
        
        if main_code:
            lines = main_code.split('\n')
            print(f"**main.js** ({len(lines)} 行)")
            print("```javascript")
            for line in lines[:25]:
                print(line)
            if len(lines) > 25:
                print(f"// ... 还有 {len(lines) - 25} 行 ...")
            print("```")
        else:
            print("⚠️ **警告: main.js 为空！需要重新上传代码！**")
    print()
    
    print("---")
    print("以上为 Screeps API 原始数据。分析后采取行动。")

if __name__ == '__main__':
    main()

