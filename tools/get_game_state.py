#!/usr/bin/env python3
"""
get_game_state.py - 获取 Screeps 游戏状态
用法: python3 tools/get_game_state.py
"""

import urllib.request, json, os, re, base64, gzip
from datetime import datetime
from pathlib import Path

def load_token():
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        for line in open(env_path):
            if line.startswith('SCREEPS_TOKEN='):
                return line.strip().split('=', 1)[1]
    return os.environ.get('SCREEPS_TOKEN', '')

TOKEN = load_token()
API = "https://screeps.com/api"

def get(endpoint):
    req = urllib.request.Request(f"{API}{endpoint}")
    req.add_header('X-Token', TOKEN)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
    except Exception as e:
        return {'error': str(e)}

def pj(data): 
    return json.dumps(data, indent=2, ensure_ascii=False)

def parse_room(name):
    m = re.match(r'([EW])(\d+)([NS])(\d+)', name)
    if m:
        ew, x, ns, y = m.groups()
        return (int(x) if ew == 'E' else -int(x)-1, int(y) if ns == 'S' else -int(y)-1)
    return None

def make_room(x, y):
    return f"{'E' if x >= 0 else 'W'}{x if x >= 0 else -x-1}{'S' if y >= 0 else 'N'}{y if y >= 0 else -y-1}"

def group_by_type(objects):
    result = {}
    for obj in objects:
        t = obj.get('type', 'unknown')
        result.setdefault(t, []).append(obj)
    return result

def main():
    if not TOKEN:
        print("错误: SCREEPS_TOKEN 未设置")
        return
    
    # 获取基础数据
    user = get('/auth/me')
    overview = get('/user/overview?statName=energyHarvested&interval=8')
    
    # 找到当前房间
    shard, room = None, None
    for s, info in overview.get('shards', {}).items():
        if info.get('rooms'):
            shard, room = s, info['rooms'][0]
            break
    
    if not room:
        print("## ⚠️ 错误：无法获取房间信息")
        return
    
    # 获取房间数据
    room_data = get(f'/game/room-objects?room={room}&shard={shard}')
    objs = group_by_type(room_data.get('objects', []))
    spawn_user = objs.get('spawn', [{}])[0].get('user')
    
    # 获取 Memory
    mem_data = get(f'/user/memory?shard={shard}')
    mem_str = mem_data.get('data', '')
    mem = {}
    if mem_str.startswith('gz:'):
        try:
            mem = json.loads(gzip.decompress(base64.b64decode(mem_str[3:])).decode())
        except: pass
    
    # ========== 输出 ==========
    print(f"# Screeps 状态 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    print()
    
    # 1. 用户
    print("## 1. 用户信息")
    print(f"```json\n{pj({k: user.get(k) for k in ['username', 'gcl', 'cpu', 'cpuShard']})}\n```\n")
    
    # 2. 房间
    print(f"## 2. 房间: `{room}` @ `{shard}`\n")
    
    # 3. 对象统计
    print("## 3. 房间对象")
    print("```")
    for t, lst in sorted(objs.items()):
        print(f"  {t}: {len(lst)}")
    print("```\n")
    
    # 4. 资源状态
    print("## 4. 资源状态\n")
    
    # Controller
    if 'controller' in objs:
        c = objs['controller'][0]
        lvl, prog = c.get('level', 0), c.get('progress', 0)
        total = c.get('progressTotal') or prog  # API 有时返回 0
        print("### Controller")
        print(f"- Level: **{lvl}** | 进度: {prog:,} | Safe Mode: {c.get('safeMode') or '无'}")
        print(f"- Safe Mode 储备: {c.get('safeModeAvailable', 0)}\n")
    
    # 能量
    spawn_e = sum(s.get('store', {}).get('energy', 0) for s in objs.get('spawn', []))
    ext_e = sum(e.get('store', {}).get('energy', 0) for e in objs.get('extension', []))
    spawn_cap = len(objs.get('spawn', [])) * 300
    ext_cap = len(objs.get('extension', [])) * 50
    print(f"### 能量: {spawn_e + ext_e} / {spawn_cap + ext_cap}")
    print(f"- Spawn: {spawn_e}/{spawn_cap} | Extension: {ext_e}/{ext_cap}\n")
    
    # Sources
    if 'source' in objs:
        print("### Sources")
        for i, s in enumerate(objs['source']):
            e, cap = s.get('energy', 0), s.get('energyCapacity', 3000)
            print(f"- Source {i+1}: {e}/{cap} ({e*100//cap}%)")
        print()
    
    # 5. Creeps
    print("## 5. Creeps")
    my_creeps = [c for c in objs.get('creep', []) if c.get('user') == spawn_user]
    enemies = [c for c in objs.get('creep', []) if c.get('user') != spawn_user]
    
    roles = {}
    for c in my_creeps:
        name = c.get('name', '')
        body = c.get('body', [])
        work = sum(1 for p in body if p.get('type') == 'work')
        role = next((r for r in ['harvester', 'upgrader', 'builder', 'carrier'] if r in name.lower()), 'other')
        roles.setdefault(role, []).append({'name': name, 'parts': len(body), 'work': work})
    
    total_work = sum(sum(c['work'] for c in lst) for lst in roles.values())
    print(f"### 我的 Creeps ({len(my_creeps)} 个, 总 WORK: {total_work})\n")
    for role, lst in sorted(roles.items()):
        work = sum(c['work'] for c in lst)
        print(f"**{role}**: {len(lst)} 个 ({work} WORK)")
        for c in lst[:3]:
            print(f"  - {c['name']}: {c['parts']} parts, {c['work']} WORK")
        if len(lst) > 3:
            print(f"  - ... 还有 {len(lst) - 3} 个")
    print()
    
    if enemies:
        print(f"### ⚠️ 敌方 Creeps ({len(enemies)} 个)\n")
    
    # 6. 建造队列
    print("## 6. 建造队列")
    sites = objs.get('constructionSite', [])
    if sites:
        by_type = {}
        for s in sites:
            by_type.setdefault(s.get('structureType', '?'), []).append(s)
        for st, lst in sorted(by_type.items()):
            prog = sum(s.get('progress', 0) for s in lst)
            total = sum(s.get('progressTotal', 0) for s in lst)
            print(f"- **{st}** x{len(lst)}: {prog}/{total}")
    else:
        print("*无建造任务*")
    print()
    
    # 7. CPU
    print("## 7. CPU 和 Memory")
    stats = mem.get('stats', {})
    cpu = stats.get('cpu', 0)
    cpu_limit = user.get('cpu', 20)
    print(f"- **CPU**: {cpu:.2f} / {cpu_limit} ({cpu*100/cpu_limit:.0f}%)")
    print(f"- Game.time: {stats.get('time', 'N/A')}")
    print(f"- Memory: {len(mem_str):,} bytes\n")
    
    # 8. 周围房间
    print("## 8. 周围房间\n")
    coords = parse_room(room)
    if coords:
        x, y = coords
        for dx, dy, d in [(-1,0,"←"), (1,0,"→"), (0,-1,"↑"), (0,1,"↓")]:
            adj = make_room(x+dx, y+dy)
            adj_objs = group_by_type(get(f'/game/room-objects?room={adj}&shard={shard}').get('objects', []))
            ctrl = adj_objs.get('controller', [{}])[0]
            print(f"### {adj} ({d})")
            if ctrl.get('user'):
                print(f"**玩家控制** Level {ctrl.get('level')}")
            summary = {t: len(lst) for t, lst in adj_objs.items()}
            print(f"```json\n{pj(summary) if summary else '{}'}\n```\n")
    
    # 9. 代码
    print("## 9. 服务器代码")
    code = get('/user/code')
    main_code = code.get('modules', {}).get('main', '')
    if main_code:
        lines = main_code.split('\n')
        print(f"**main.js** ({len(lines)} 行)")
        print("```javascript")
        print('\n'.join(lines[:15]))
        if len(lines) > 15:
            print(f"// ... 还有 {len(lines) - 15} 行 ...")
        print("```")
    else:
        print("⚠️ **警告: main.js 为空！**")
    print()
    
    # 摘要
    print("---\n## 📊 摘要\n")
    if 'controller' in objs:
        c = objs['controller'][0]
        print(f"- **Level {c.get('level')}** | 进度: {c.get('progress', 0):,}")
    print(f"- **Creeps**: {len(my_creeps)} ({total_work} WORK)")
    print(f"- **能量**: {spawn_e + ext_e} / {spawn_cap + ext_cap}")
    print(f"- **威胁**: {'⚠️ ' + str(len(enemies)) + ' 敌人' if enemies else '无'}")
    print("\n---\n以上为 Screeps API 原始数据。分析后采取行动。")

if __name__ == '__main__':
    main()
