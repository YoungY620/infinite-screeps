# Screeps Eternal Agent

## 🎯 核心使命

**在 Screeps 游戏服务器中生存尽可能长的时间，并追求高质量的生存。**

想尽一切办法活下去。

## ⚠️ 硬性约束

### 游戏限制 (免费玩家)
- **CPU: 20/tick** ⚠️ 极其有限，必须精打细算
- 房间: 最多 1 个
- 必须通过 API 获取当前 shard、房间等动态信息

### Git 规范
- 每次修改后必须 `git add -A && git commit`
- 提交信息格式: `[type] description`
- type: feat / fix / refactor / docs / stats

## 📚 Screeps 游戏文档

### 官方资源
| 资源 | URL | 说明 |
|------|-----|------|
| **官方文档** | https://docs.screeps.com/ | 游戏规则和 API 参考 |
| **文档源码** | https://github.com/screeps/docs | Markdown 源文件，方便检索 |
| **游戏引擎** | https://github.com/screeps/screeps | 理解底层机制的权威来源 |

### 文档源码结构 (github.com/screeps/docs)
```
screeps/docs/
├── api/                    # API 参考文档
│   ├── source/
│   │   ├── Creep.md       # Creep 类 API
│   │   ├── Room.md        # Room 类 API
│   │   ├── Spawn.md       # Spawn 类 API
│   │   ├── Structure*.md  # 各种建筑 API
│   │   └── ...
├── source/                 # 游戏指南文档
│   ├── introduction.md    # 游戏介绍
│   ├── creeps.md          # Creep 系统
│   ├── control.md         # 控制器和 GCL
│   ├── defense.md         # 防御策略
│   ├── mining.md          # 采矿系统
│   ├── power.md           # Power 系统
│   ├── market.md          # 市场交易
│   └── ...
```

### 关键游戏规则

#### 保护期机制
| 类型 | 持续时间 | 效果 |
|------|----------|------|
| **Safe Mode** | 20,000 ticks (~20小时) | 敌人无法攻击，初始自动激活 |
| **Novice Zone** | 最长 7 天 | 绿色墙壁区域，老玩家无法进入 |
| **Respawn Zone** | 最长 7 天 | 重生玩家专用保护区 |

#### 控制器升级
| Level | 能量需求 | 解锁建筑 |
|-------|----------|----------|
| 1→2 | 200 | 5 Extension |
| 2→3 | 45,000 | 10 Extension, 1 Tower |
| 3→4 | 135,000 | 20 Extension, 1 Storage |
| 4→5 | 405,000 | 30 Extension, 2 Tower, 2 Link |

#### CPU 消耗参考
| 操作 | 大约 CPU | 说明 |
|------|----------|------|
| `Game.getObjectById()` | 0.1 | 推荐使用 |
| `room.find()` | 0.2-2 | 取决于 filter 复杂度 |
| `findClosestByPath()` | 1-10+ | 🔴 最耗 CPU！ |
| `moveTo()` | 0.5-3 | 内部调用寻路 |
| `creep.say()` | 0.2 | 视觉效果 |
| Memory 读写 | 0.1-0.5 | 每 tick 首次解析 |

#### CPU 优化策略
1. **缓存目标 ID** 到 Memory，用 `Game.getObjectById()` 获取
2. **reusePath**: `moveTo(target, { reusePath: 5 })` 复用路径
3. **减少 find 调用**: 缓存结果到 Memory
4. **条件执行**: 非紧急逻辑每 N tick 执行一次

#### Creep Body Parts
| Part | 成本 | 效果 |
|------|------|------|
| MOVE | 50 | 移动速度 |
| WORK | 100 | 采集 2/tick, 建造 5/tick, 升级 1/tick |
| CARRY | 50 | 容量 50 |
| ATTACK | 80 | 近战 30 damage |
| RANGED_ATTACK | 150 | 远程 10 damage |
| HEAL | 250 | 治疗 12/tick |
| TOUGH | 10 | 便宜的血量 |
| CLAIM | 600 | 占领/攻击控制器 |

### HTTP API 端点
```
基础 URL: https://screeps.com/api/

认证:
  Header: X-Token: <token>
  Token 从 .env 文件读取

常用端点:
  GET  /auth/me                    # 用户信息
  GET  /user/rooms                 # 拥有的房间
  GET  /user/memory?shard=shard3   # 读取 Memory
  GET  /game/room-objects?room=XXX&shard=shard3  # 房间对象
  POST /user/code                  # 上传代码
  POST /user/console               # 执行控制台命令
```

## 🧠 决策原则

### CPU 是最稀缺的资源
**20 CPU/tick 极其有限！** 这意味着：
- 每一行代码都有 CPU 成本
- 复杂的寻路、搜索、循环都会消耗大量 CPU
- 必须监控实际 CPU 使用，避免超限
- 代码效率直接决定殖民地规模上限

### 先理解，再行动
**在修改任何代码之前，必须：**
1. **理解游戏规则** - 通过官方文档、知识库了解游戏机制
2. **了解游戏内状态** - 通过 API 获取当前房间、Creep、资源等状态
3. **分析当前代码** - 理解现有逻辑为什么这样写
4. **评估 CPU 影响** - 预估改动对 CPU 消耗的影响

**禁止盲目修改代码！**

### 保护期策略
- **保护期内**: 激进发展，最大化 Creep 数量，快速升级
- **保护期结束前**: 必须建造 Tower 和防御设施
- **储备 Safe Mode**: 紧急时可手动激活

## 📁 目录结构

```
项目根目录/
├── screeps/          # 游戏代码 (上传到服务器)
│   └── main.js
├── knowledge/        # 经验、策略、学习笔记
├── logs/             # Session 日志
├── tools/            # 工具脚本
└── .env              # 凭证 (SCREEPS_TOKEN)
```

## 📝 日志记录

**每个 session 必须记录日志到 `logs/` 目录**

日志格式：
```markdown
# Session Log - YYYYMMDD_HHMMSS

## 🕐 [时间] 阶段标题

### 💭 思考
- 观察到什么
- 分析和推理

### 📋 决策
- 决定做什么
- 为什么

### ⚡ 行动
- 执行了什么
- 结果
```

## 🔄 每个 Session 必须执行

1. **创建日志文件** - 立即开始记录
2. **全面审视** - 遍历项目文件，阅读代码和文档
3. **检查游戏状态** - 调用 API 获取当前状态
4. **采取行动** - 根据状态决策并执行
5. **知识固化** - 更新 knowledge/ 目录
6. **Git 提交** - `git add -A && git commit`

## 🔑 凭证获取

- Token 存储在 `.env` 文件: `SCREEPS_TOKEN=xxx`
- 通过 API `/auth/me` 获取当前用户名
- 通过 API `/user/rooms` 获取当前房间
- **不要在代码中硬编码用户信息，因为死亡后可能改变**

## 🚨 优先级

1. **生存** - 防止殖民地被摧毁
2. **稳定** - 能量收入、Creep 数量
3. **发展** - 升级控制器
4. **优化** - 代码重构

## 💰 Token 节省

**如果没有紧急任务，不要空转消耗 token！**

当殖民地运行稳定时，应该：
1. 编写监听程序（轮询或信号触发）
2. 让程序在后台运行，等待特定条件触发
3. 只有异常或需要决策时才唤醒 Agent

触发条件示例：
- Creep 数量低于阈值
- CPU 使用率异常
- 控制器即将降级
- 检测到敌人

---

**记住：生存第一，永不放弃。充分利用保护期，为防御做好准备。**
