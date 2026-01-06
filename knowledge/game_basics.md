# Screeps 游戏基础知识

## ⚠️ 动态信息获取

**不要硬编码房间名称、坐标等信息！** 这些会随着重生、迁移而改变。

### 获取当前房间
```bash
# 通过 API 获取
curl -H "X-Token: $TOKEN" \
  "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8"
# 返回: shards.shard3.rooms = ['当前房间名']
```

### 获取 Spawn 位置
```javascript
// 游戏内代码 - 动态获取
const spawn = Object.values(Game.spawns)[0];
const spawnPos = spawn.pos;  // 不要硬编码！
```

---

## 账户限制 (免费玩家)

- **CPU**: 20/tick
- **房间**: 最多 1 个
- **Shard**: 通过 API 查询

---

## Creep 配置

### 基础配置 (200 能量)
```
[WORK, CARRY, MOVE]
- 采集: 2 energy/tick
- 容量: 50 energy
- 移动: 1 tick/tile (平地)
```

### 中型配置 (400 能量)
```
[WORK, WORK, CARRY, CARRY, MOVE, MOVE]
- 采集: 4 energy/tick
- 容量: 100 energy
```

### 大型配置 (550 能量)
```
[WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]
- 采集: 6 energy/tick
- 容量: 100 energy
```

---

## 关键游戏规则

### 能量经济
- Source 容量: 3000 energy
- Source 再生: 300 ticks
- 每个 Source 理论产出: 10 energy/tick
- Spawn 容量: 300 energy

### 控制器升级
| Level | 能量需求 | 解锁 |
|-------|----------|------|
| 1→2 | 200 | 5 Extension |
| 2→3 | 45,000 | 10 Extension, 1 Tower |
| 3→4 | 135,000 | 20 Extension, 1 Storage |

### Creep 生命周期
- 寿命: 1500 ticks
- 孵化时间: 每 body part 3 ticks
- [WORK, CARRY, MOVE] = 9 ticks 孵化

---

## CPU 优化技巧

### 高成本操作 (避免/缓存)
| 操作 | CPU | 建议 |
|------|-----|------|
| `findClosestByPath()` | 1-10+ | 缓存结果 |
| `room.find()` + 复杂 filter | 0.5-2 | 缓存结果 |
| `moveTo()` | 0.5-3 | 使用 reusePath |

### 低成本操作
| 操作 | CPU |
|------|-----|
| `Game.getObjectById()` | 0.1 |
| `Game.creeps[name]` | 0.1 |
| `creep.memory` 访问 | 0.1 |

### 优化策略
1. 缓存目标 ID 到 Memory
2. `moveTo(target, { reusePath: 5 })`
3. 非紧急操作每 N tick 执行一次
4. 建筑规划每 50-100 tick 检查一次

---

## 动态建筑规划

**Extension 位置必须相对于 Spawn 动态计算：**

```javascript
function getExtensionPositions(spawn) {
    const x = spawn.pos.x;
    const y = spawn.pos.y;
    return [
        {x: x-1, y: y-1}, {x: x+1, y: y-1},
        {x: x-1, y: y+1}, {x: x+1, y: y+1},
        {x: x+2, y: y},   {x: x-2, y: y},
        // ... 更多位置
    ];
}
```

---

*最后更新: 2026-01-07*
