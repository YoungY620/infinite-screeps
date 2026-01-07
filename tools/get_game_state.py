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
    
    # ========== 4. 资源状态 ==========
    print("## 4. 资源状态")
    print()
    
    # Controller
    if 'controller' in objects_by_type:
        ctrl = objects_by_type['controller'][0]
        level = ctrl.get('level', 0)
        progress = ctrl.get('progress', 0)
        # Level 2→3 需要 45000
        level_requirements = {1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000}
        needed = level_requirements.get(level, 0)
        pct = (progress / needed * 100) if needed > 0 else 0
        
        print("### Controller")
        print(f"- Level: **{level}**")
        print(f"- 进度: {progress:,} / {needed:,} ({pct:.1f}%)")
        print(f"- 还差: **{needed - progress:,}** 能量")
        safe_mode = ctrl.get('safeMode')
        if safe_mode:
            print(f"- Safe Mode: 激活中 ({safe_mode:,} ticks)")
        print(f"- Safe Mode 储备: {ctrl.get('safeModeAvailable', 0)}")
        print()
    
    # 能量
    print("### 能量")
    spawn_energy = 0
    spawn_capacity = 0
    if 'spawn' in objects_by_type:
        for s in objects_by_type['spawn']:
            spawn_energy += s.get('store', {}).get('energy', 0)
            spawn_capacity += 300
    
    ext_energy = 0
    ext_capacity = 0
    if 'extension' in objects_by_type:
        for e in objects_by_type['extension']:
            ext_energy += e.get('store', {}).get('energy', 0)
            ext_capacity += 50  # Level 1-7 extension = 50
    
    total_energy = spawn_energy + ext_energy
    total_capacity = spawn_capacity + ext_capacity
    
    print(f"- Spawn: {spawn_energy} / {spawn_capacity}")
    print(f"- Extension: {ext_energy} / {ext_capacity}")
    print(f"- **总计: {total_energy} / {total_capacity}**")
    print()
    
    # Source
    print("### Sources")
    if 'source' in objects_by_type:
        for i, src in enumerate(objects_by_type['source']):
            energy = src.get('energy', 0)
            cap = src.get('energyCapacity', 3000)
            print(f"- Source {i+1}: {energy} / {cap} ({energy/cap*100:.0f}%)")
    print()
    
    # ========== 5. Creeps ==========
    print("## 5. Creeps")
    if 'creep' in objects_by_type:
        creeps = objects_by_type['creep']
        spawn_user = objects_by_type.get('spawn', [{}])[0].get('user')
        my_creeps = [c for c in creeps if c.get('user') == spawn_user]
        enemies = [c for c in creeps if c.get('user') != spawn_user]
        
        # 按角色分类
        roles = {}
        total_work = 0
        for c in my_creeps:
            name = c.get('name', '')
            body = c.get('body', [])
            work_count = sum(1 for p in body if p.get('type') == 'work')
            total_work += work_count
            
            # 从名称推断角色
            role = 'unknown'
            for r in ['harvester', 'upgrader', 'builder', 'carrier', 'defender']:
                if r in name.lower():
                    role = r
                    break
            
            if role not in roles:
                roles[role] = {'count': 0, 'work': 0, 'creeps': []}
            roles[role]['count'] += 1
            roles[role]['work'] += work_count
            roles[role]['creeps'].append({
                'name': name,
                'body': len(body),
                'work': work_count,
            })
        
        print(f"### 我的 Creeps ({len(my_creeps)} 个, 总 WORK: {total_work})")
        print()
        for role, info in sorted(roles.items()):
            print(f"**{role}**: {info['count']} 个 ({info['work']} WORK)")
            for c in info['creeps'][:5]:
                print(f"  - {c['name']}: {c['body']} parts, {c['work']} WORK")
            if len(info['creeps']) > 5:
                print(f"  - ... 还有 {len(info['creeps']) - 5} 个")
        print()
        
        if enemies:
            print(f"### ⚠️ 敌方 Creeps ({len(enemies)} 个)")
            for e in enemies[:5]:
                print(f"- {e.get('name')}: user={e.get('user')}")
            print()
    
    # ========== 6. 建造队列 ==========
    print("## 6. 建造队列")
    if 'constructionSite' in objects_by_type:
        sites = objects_by_type['constructionSite']
        print(f"共 {len(sites)} 个建造任务:")
        print()
        
        # 按类型分组
        by_type = {}
        for s in sites:
            st = s.get('structureType', 'unknown')
            if st not in by_type:
                by_type[st] = []
            by_type[st].append(s)
        
        for st, site_list in sorted(by_type.items()):
            total_progress = sum(s.get('progress', 0) for s in site_list)
            total_needed = sum(s.get('progressTotal', 0) for s in site_list)
            pct = (total_progress / total_needed * 100) if total_needed > 0 else 0
            print(f"- **{st}** x{len(site_list)}: {total_progress}/{total_needed} ({pct:.0f}%)")
    else:
        print("*无建造任务*")
    print()
    
    # ========== 7. CPU 和 Memory ==========
    print("## 7. CPU 和 Memory")
    memory_data = api_get(f'/user/memory?shard={current_shard}')
    mem_str = memory_data.get('data', '')
    
    if mem_str.startswith('gz:'):
        try:
            decoded = base64.b64decode(mem_str[3:])
            mem_json = json.loads(gzip.decompress(decoded).decode())
            
            if 'stats' in mem_json:
                stats = mem_json['stats']
                cpu_used = stats.get('cpu', 0)
                cpu_limit = user_data.get('cpu', 20)
                cpu_pct = (cpu_used / cpu_limit * 100) if cpu_limit > 0 else 0
                
                print(f"- **CPU**: {cpu_used:.2f} / {cpu_limit} ({cpu_pct:.1f}%)")
                print(f"- Game.time: {stats.get('time', 'N/A')}")
                print(f"- Creeps (Memory): {stats.get('creeps', 'N/A')}")
            
            # Memory 大小
            mem_size = len(mem_str)
            print(f"- Memory 大小: {mem_size:,} bytes")
        except Exception as e:
            print(f"*解析失败: {e}*")
    print()
    
    # ========== 8. 周围房间侦查 ==========
    coords = parse_room_name(current_room)
    if coords:
        x, y = coords
        adjacent = [
            (make_room_name(x - 1, y), "←"),
            (make_room_name(x + 1, y), "→"),
            (make_room_name(x, y - 1), "↑"),
            (make_room_name(x, y + 1), "↓"),
        ]
        
        print("## 8. 周围房间")
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
    
    # ========== 9. 服务器代码 ==========
    print("## 9. 服务器代码")
    code_data = api_get('/user/code')
    if code_data.get('ok'):
        modules = code_data.get('modules', {})
        main_code = modules.get('main', '')
        
        if main_code:
            lines = main_code.split('\n')
            print(f"**main.js** ({len(lines)} 行)")
            print("```javascript")
            for line in lines[:20]:
                print(line)
            if len(lines) > 20:
                print(f"// ... 还有 {len(lines) - 20} 行 ...")
            print("```")
        else:
            print("⚠️ **警告: main.js 为空！需要重新上传代码！**")
    print()
    
    # ========== 10. 摘要 ==========
    print("---")
    print()
    print("## 📊 摘要")
    print()
    
    if 'controller' in objects_by_type:
        ctrl = objects_by_type['controller'][0]
        level = ctrl.get('level', 0)
        progress = ctrl.get('progress', 0)
        level_requirements = {1: 200, 2: 45000, 3: 135000, 4: 405000}
        needed = level_requirements.get(level, 0)
        remaining = needed - progress
        
        print(f"- **Level {level}** → Level {level+1}: 还差 {remaining:,} 能量")
    
    if 'creep' in objects_by_type:
        my_creeps = [c for c in objects_by_type['creep'] 
                     if c.get('user') == objects_by_type.get('spawn', [{}])[0].get('user')]
        print(f"- **Creeps**: {len(my_creeps)} 个")
    
    print(f"- **能量**: {total_energy} / {total_capacity}")
    
    if 'constructionSite' in objects_by_type:
        print(f"- **建造队列**: {len(objects_by_type['constructionSite'])} 个任务")
    
    enemies_count = len([c for c in objects_by_type.get('creep', []) 
                         if c.get('user') != objects_by_type.get('spawn', [{}])[0].get('user')])
    if enemies_count > 0:
        print(f"- **⚠️ 敌人**: {enemies_count} 个")
    else:
        print("- **威胁**: 无")
    
    print()
    print("---")
    print("以上为 Screeps API 原始数据。分析后采取行动。")

if __name__ == '__main__':
    main()
