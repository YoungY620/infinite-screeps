# 代码设计文档

## 当前架构 v2.0 - 激进发展模式

### 设计理念

**利用保护期 (Safe Mode + Novice Zone) 激进发展，同时为保护期结束做防御准备**

### 文件结构
```
screeps/
└── main.js    # 主循环，包含所有逻辑
```

### 发展阶段

| 阶段 | 控制器等级 | 策略 | Creep 配置 |
|------|-----------|------|-----------|
| 1 | Level 2 | 激进发展 | 4 harvester + 3 builder + 3 upgrader |
| 2 | Level 3 | 建造 Tower | 3 harvester + 2 builder + 4 upgrader |
| 3 | Level 4+ | 稳定防御 | 3 harvester + 2 builder + 2 upgrader |

### 动态 Body 配置

根据可用能量自动调整 Creep 体型：

| 能量 | Body | 成本 | 效率 |
|------|------|------|------|
| 550+ | [W,W,W,C,C,M,M,M] | 550 | 6 energy/tick |
| 400+ | [W,W,C,C,M,M] | 400 | 4 energy/tick |
| 300+ | [W,W,C,M] | 300 | 4 energy/tick |
| 200+ | [W,C,M] | 200 | 2 energy/tick |

### CPU 优化

1. **目标缓存**: 将 Source/目标 ID 存入 Memory，避免每 tick 重新查找
2. **路径复用**: `moveTo(target, { reusePath: 5 })` 复用 5 tick 的路径
3. **条件规划**: 建筑规划每 50 tick 执行一次，非每 tick

### 建筑布局

```
Level 2-3 Extension (10个位置):
        (23,22) (24,22)  Spawn  (26,22) (27,22)
                        (25,23)
        (23,24) (24,24)        (26,24) (27,24) (28,23)

Level 3+ Tower:
                (25,21) ← Tower (防御优先)
                
Rampart 保护:
                (25,21) ← 保护 Tower
                (25,23) ← 保护 Spawn
```

### 防御系统

**Tower 自动行为:**
1. 优先攻击敌人 (FIND_HOSTILE_CREEPS)
2. 修复受损建筑 (< 50% 血量)

### 角色行为

#### Harvester
- 采集能量 → 填充 Spawn/Extension/Tower
- 备选: 存储满时升级控制器
- CPU 优化: 缓存目标 ID

#### Builder  
- 采集能量 → 建造 (优先 Tower > Extension)
- 备选: 无建造点时升级控制器

#### Upgrader
- 采集能量 → 升级控制器
- 专注升级，加速到达 Level 3

### 保护期目标

```
Safe Mode 剩余: ~16,000 ticks (~4-5小时)

必须完成:
✅ Controller Level 3 (解锁 Tower)
✅ 建造至少 1 个 Tower
✅ Rampart 保护 Spawn 和 Tower
✅ 储备 Safe Mode 激活次数
```

### CPU 监控

每 100 tick 输出:
```
[CPU] 8.5/20 | Creeps: 8 | Level: 2 | Progress: 5000/45000
```
