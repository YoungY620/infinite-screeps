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
