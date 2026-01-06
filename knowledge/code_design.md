# 代码设计文档

## 当前架构 v1.0

### 文件结构
```
screeps/
└── main.js    # 主循环，包含所有逻辑
```

### 角色系统

#### Harvester (采集者)
- **职责**: 采集能量，送回 Spawn/Extension
- **备选行为**: 如果存储满了，升级控制器
- **配置**: [WORK, CARRY, MOVE] = 200 能量
- **数量目标**: 2

#### Upgrader (升级者)
- **职责**: 专门升级控制器
- **配置**: [WORK, CARRY, MOVE] = 200 能量
- **数量目标**: 1

#### Builder (建造者)
- **职责**: 建造 Construction Sites
- **备选行为**: 没有建造点时升级控制器
- **配置**: [WORK, CARRY, MOVE] = 200 能量
- **数量目标**: 1

### 主循环流程

```
1. 清理死亡 Creep 内存
2. 统计各角色数量
3. 规划 Extension (Level 2+)
4. 孵化缺少的 Creep (按优先级)
5. 运行所有 Creep 行为
```

### Extension 布局 (Spawn1 周围)

```
        (24,22)  Spawn  (26,22)
                (25,23)
        (24,24)        (26,24) (27,23)
```

### 状态机模式

每个 Creep 使用 `memory.working` 标志:
- `working = false`: 去采集能量
- `working = true`: 执行工作 (送能量/升级)

状态切换条件:
- 能量空 -> working = false
- 能量满 -> working = true

## 待改进

### 短期 (Level 2)
- [x] 添加 Builder 角色建造 Extension ✅
- [ ] 优化路径缓存减少 CPU
- [ ] 添加能量源分配避免拥挤

### 中期 (Level 3+)
- [ ] Tower 防御系统
- [ ] Container 在能量源旁边
- [ ] 多房间探索

### CPU 优化计划
1. 缓存 Source 和 Spawn 位置到 Memory
2. 使用 `moveTo` 的 reusePath 选项
3. 减少 `findClosestByPath` 调用
