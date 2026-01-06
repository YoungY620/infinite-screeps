# Screeps 游戏基础知识

## 当前账户信息
- 用户: payyy
- Shard: shard3
- 房间: W13N45
- CPU 限制: 20/tick (免费玩家)
- 最多 1 个房间

## 房间 W13N45 资源

### 关键位置
| 结构/资源 | 位置 | 说明 |
|----------|------|------|
| Spawn1 | (25, 23) | 主孵化点 |
| Controller | (9, 13) | 控制器 |
| Source 1 | (8, 6) | 北部能量源 |
| Source 2 | (5, 29) | 南部能量源 |
| Mineral K | (44, 31) | 钾矿 |

### 距离估算
- Spawn -> Source 2 (南): ~19 步
- Spawn -> Source 1 (北): ~21 步
- Spawn -> Controller: ~18 步

## Creep 配置

### 基础配置 (200 能量)
```
[WORK, CARRY, MOVE]
- 采集: 2 energy/tick
- 容量: 50 energy
- 移动: 1 tick/tile (平地)
```

### 升级配置 (300 能量) - Level 2 后
```
[WORK, WORK, CARRY, MOVE]
- 采集: 4 energy/tick
- 容量: 50 energy
```

## 关键游戏规则

### 能量经济
- Source 容量: 3000 energy
- Source 再生: 300 ticks
- Spawn 容量: 300 energy
- Spawn 自然恢复: 1 energy/tick

### 控制器升级
- Level 1 -> 2: 200 energy
- Level 2 -> 3: 45000 energy
- 每 tick 可升级: WORK 数量 * 1 energy

### Creep 生命周期
- 寿命: 1500 ticks
- 孵化时间: 每 body part 3 ticks
- [WORK, CARRY, MOVE] = 9 ticks

## CPU 优化技巧

### 高成本操作 (避免/缓存)
- `findClosestByPath()` - 路径计算
- `find()` 带复杂 filter

### 低成本操作
- 直接访问 `Game.creeps[name]`
- 访问 `creep.memory`
- 简单的 `if` 判断

### 策略
1. 缓存频繁查找的结果到 Memory
2. 避免每 tick 重复计算
3. 使用简单的状态机控制 Creep
