#!/bin/bash
# get_game_state.sh - 获取游戏状态（精简版）
#
# 只输出核心数据，不包含公共/静态信息

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$SCREEPS_TOKEN" ]; then
    echo "错误: SCREEPS_TOKEN 未设置"
    exit 1
fi

python3 << 'PYEOF'
import urllib.request
import json
import os
from datetime import datetime

TOKEN = os.environ.get('SCREEPS_TOKEN', '')
API = "https://screeps.com/api"

def get(endpoint):
    req = urllib.request.Request(f"{API}{endpoint}")
    req.add_header('X-Token', TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {'error': str(e)}

# 获取 shard 和房间
overview = get('/user/overview?statName=energyHarvested&interval=8')
shard, room = None, None
for s, info in overview.get('shards', {}).items():
    if info.get('rooms'):
        shard, room = s, info['rooms'][0]
        break

if not room:
    print("❌ 无殖民地")
    exit(1)

# 获取房间数据
data = get(f'/game/room-objects?room={room}&shard={shard}')
objs = data.get('objects', [])

# 解析关键对象
ctrl = spawn = None
my_user = None
creeps, enemies = [], []
extensions, ext_sites = [], []
towers, tower_sites = [], []
sources = []

for o in objs:
    t = o.get('type')
    if t == 'controller': ctrl = o
    elif t == 'spawn': spawn = o; my_user = o.get('user')
    elif t == 'extension': extensions.append(o)
    elif t == 'tower': towers.append(o)
    elif t == 'source': sources.append(o)
    elif t == 'constructionSite':
        if o.get('structureType') == 'extension': ext_sites.append(o)
        elif o.get('structureType') == 'tower': tower_sites.append(o)

for o in objs:
    if o.get('type') == 'creep':
        if o.get('user') == my_user: creeps.append(o)
        else: enemies.append(o)

# 输出精简状态
print(f"## 游戏状态 ({datetime.now().strftime('%H:%M:%S')})")
print()
print(f"**{shard}/{room}** | Level {ctrl.get('level',0)} | Progress {ctrl.get('progress',0)}")
print()

# Safe Mode
sm = ctrl.get('safeMode', 0)
sma = ctrl.get('safeModeAvailable', 0)
if sm:
    print(f"🛡️ Safe Mode: {sm} ticks | 储备: {sma}")
else:
    print(f"Safe Mode: 未激活 | 储备: {sma}")
print()

# Creeps
print(f"**Creeps:** {len(creeps)} | **Enemies:** {len(enemies)}")
if enemies:
    print("```")
    for e in enemies[:5]:
        print(f"  ⚠️ {e.get('name')} @ ({e.get('x')},{e.get('y')})")
    print("```")
print()

# 建筑
print(f"**建筑:** Ext {len(extensions)}/{len(ext_sites)}建造 | Tower {len(towers)}/{len(tower_sites)}建造 | Spawn能量 {spawn.get('store',{}).get('energy',0)}/300")
print()

# 能量源
total_energy = sum(s.get('energy', 0) for s in sources)
print(f"**Sources:** {len(sources)} 个 | 剩余能量 {total_energy}")
print()

# 周围房间侦查
import re
def parse_room(name):
    m = re.match(r'([EW])(\d+)([NS])(\d+)', name)
    if m:
        ew, x, ns, y = m.groups()
        return (int(x) if ew == 'E' else -int(x)-1, int(y) if ns == 'S' else -int(y)-1)
    return None

def make_room(x, y):
    return f"{'E' if x>=0 else 'W'}{x if x>=0 else -x-1}{'S' if y>=0 else 'N'}{y if y>=0 else -y-1}"

print("## 周围侦查")
print()

coords = parse_room(room)
if coords:
    x, y = coords
    adj = [(make_room(x+dx, y+dy), d) for dx, dy, d in [
        (-1,0,"←"), (1,0,"→"), (0,-1,"↑"), (0,1,"↓")
    ]]
    
    for ar, d in adj:
        ad = get(f'/game/room-objects?room={ar}&shard={shard}')
        ao = ad.get('objects', [])
        
        # 快速统计
        ac = next((o for o in ao if o.get('type')=='controller'), None)
        spawns = sum(1 for o in ao if o.get('type')=='spawn')
        towers = sum(1 for o in ao if o.get('type')=='tower')
        keeper = sum(1 for o in ao if o.get('type')=='keeperLair')
        hcreeps = sum(1 for o in ao if o.get('type')=='creep' and o.get('user')!=my_user)
        
        if keeper:
            print(f"{d} **{ar}**: ⚠️ SK房间 (Keeper x{keeper})")
        elif spawns:
            lvl = ac.get('level',0) if ac else '?'
            sm = "🛡️" if ac and ac.get('safeMode') else ""
            print(f"{d} **{ar}**: 👤 Lv{lvl} {sm} | Spawn:{spawns} Tower:{towers}")
        elif hcreeps:
            print(f"{d} **{ar}**: {hcreeps} Creep活动")
        else:
            lvl = ac.get('level',0) if ac else 0
            if lvl == 0:
                print(f"{d} **{ar}**: 空房间")
            else:
                print(f"{d} **{ar}**: Lv{lvl} (无Spawn)")
    print()

# 任务
print("---")
print("分析状态，如需操作则执行。正常则回复 ✅")
PYEOF
