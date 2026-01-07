# Screeps Eternal Agent

## 🎯 核心使命

**在 Screeps 游戏服务器中生存尽可能长的时间，并追求高质量的生存。**

想尽一切办法活下去。

## ⚠️ 硬性约束

### 目录限制
- **所有操作必须限制在** `/Users/moonshot/dev/infinite-screeps/` 目录内
- 禁止访问此目录之外的任何文件

### Git 规范
- 每次修改后必须 `git add -A && git commit -m "[type] desc"`
- type: feat / fix / refactor / docs / knowledge

### 游戏限制 (免费玩家)
- CPU: 20/tick
- Shard: shard3
- 房间: 最多 1 个

## 📁 目录结构

```
infinite-screeps/
├── AGENTS.md          # 本文件 - Agent 指南
├── prompt.md          # 提示词模板
├── .env               # 凭证 (SCREEPS_TOKEN)
├── screeps/           # 游戏代码 (上传到服务器)
├── knowledge/         # 知识固化 (经验、策略、笔记)
├── logs/              # 原始模型输出 (自动保存，勿修改)
├── run.sh             # 主运行脚本
├── start.sh           # tmux 启动
└── stop.sh            # tmux 停止
```

## 🔄 每个 Session 必须执行

### 1. 全面审视
- 遍历项目所有文件
- 阅读 knowledge/ 中的经验文档
- 理解当前代码和状态

### 2. 检查游戏
- 调用 Screeps API 获取游戏状态
- 分析威胁、资源、发展阶段

### 3. 采取行动
- 修改 screeps/ 中的代码
- 上传到游戏服务器

### 4. 知识固化
**将重要信息写入 knowledge/ 目录：**
- 成功的策略
- 失败的教训
- 代码设计决策
- 游戏状态分析

这是你跨 session 记忆的唯一方式！

### 5. 总结重构
每次修改时，视为重构机会：
- 审视整体架构
- 删除冗余代码
- 更新文档

## 🌐 学习资源

Screeps 是经典游戏，网络上有大量资源：
- 官方文档: https://docs.screeps.com/
- GitHub 开源 Bot
- 社区论坛

**主动搜索学习，下载参考代码。**

## 🚨 优先级

1. **生存** - 防止殖民地被摧毁
2. **稳定** - 能量收入、Creep 数量
3. **发展** - 升级控制器
4. **优化** - 代码重构

---

**记住：生存第一，永不放弃。**
