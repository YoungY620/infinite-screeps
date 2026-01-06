# 教训与经验 (Lessons Learned)

> 记录失败和成功的经验，避免重复犯错

---

## 🔴 重大失败事件

### 2026-01-06: 殖民地丢失 (W48N24 -> W13N45)

**事件**: 殖民地在无人监控期间丢失，原房间被其他玩家占领

**原因分析**:
1. 代码缺乏容错机制
2. 没有监控和告警
3. Session 间隔太长 (2+ 小时)

**教训**:
- 代码必须有健壮的错误处理
- 需要记录关键事件到 Memory
- 需要定期检查游戏状态
- 不能完全依赖 `Game.spawns['Spawn1']`

**改进措施**:
```javascript
// 改进前
const spawn = Game.spawns['Spawn1'];
if (!spawn) return;  // 直接退出，没有任何处理

// 改进后
const spawns = Object.values(Game.spawns);
if (spawns.length === 0) {
    // 记录日志，可能触发告警
    Memory.lastError = { time: Game.time, msg: 'No spawns available' };
    return;
}
const spawn = spawns[0];
```

---

### 2026-01-07: API 调用硬编码房间名称

**事件**: Agent 检查游戏状态时，使用硬编码的房间名称 `W13N45` 调用 API，实际房间已变为 `E13S35`，导致误判"殖民地丢失"

**原因分析**:
1. 知识库中记录了旧房间名 `W13N45`
2. API 调用直接使用硬编码的房间名
3. 没有先查询实际拥有的房间

**正确的 API 调用顺序**:
```bash
# 1. 先获取实际拥有的房间
curl "https://screeps.com/api/user/overview?statName=energyHarvested&interval=8"
# 返回: shards.shard3.rooms = ['E13S35']

# 2. 再用正确的房间名查询对象
curl "https://screeps.com/api/game/room-objects?room=E13S35&shard=shard3"
```

**教训**:
- ❌ 不要硬编码房间名称到知识库或代码中
- ✅ 每次都要先通过 API 获取当前拥有的房间
- ✅ 房间可能因重生、占领、丢失而改变

---

### 2026-01-07: 代码硬编码建筑位置

**事件**: Extension 建造位置硬编码为相对于 (25,23) 的坐标，但新房间 Spawn 位置是 (33,17)，导致 Extension 不会建造

**原因分析**:
```javascript
// 问题代码 - 硬编码位置
const EXTENSION_POSITIONS = [
    {x: 24, y: 22},  // 相对于旧 Spawn (25,23)
    {x: 26, y: 22},
    // ...
];
```

**正确做法**:
```javascript
// 动态计算位置
function getExtensionPositions(spawn) {
    const x = spawn.pos.x;
    const y = spawn.pos.y;
    return [
        {x: x-1, y: y-1},  // 左上
        {x: x+1, y: y-1},  // 右上
        {x: x-1, y: y+1},  // 左下
        {x: x+1, y: y+1},  // 右下
        {x: x+2, y: y},    // 右边
    ];
}
```

**教训**:
- ❌ 不要硬编码任何与房间相关的坐标
- ✅ 所有位置都应该相对于 Spawn 动态计算
- ✅ 代码必须能在任何房间运行

---

## ✅ 成功经验

### 快速发展策略
- 保护期内优先发展，不用担心防御
- Harvester 优先级最高
- Level 2 后立即规划 Extension

### CPU 优化
- 缓存目标 ID 到 Memory
- 使用 `reusePath: 5` 减少寻路
- 非紧急操作每 N tick 执行一次

---

## 📋 检查清单

每次 Session 开始时检查：
- [ ] 控制器等级和 downgrade 时间
- [ ] Creep 数量是否正常
- [ ] Spawn 是否在工作
- [ ] 能量流是否正常
- [ ] 有无敌人

每次代码修改时确认：
- [ ] 本地测试通过
- [ ] 没有硬编码依赖
- [ ] 有适当的错误处理
- [ ] 记录关键日志

---
