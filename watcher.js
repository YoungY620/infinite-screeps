/**
 * Screeps Event Watcher
 * 使用 WebSocket 监听游戏事件，触发 Agent
 */

import { ScreepsAPI } from 'screeps-api';
import dotenv from 'dotenv';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const EVENTS_FILE = path.join(__dirname, 'events', 'pending.json');
const ROOM = 'W13N45';
const SHARD = 'shard3';
const COOLDOWN = 300000; // 5分钟冷却

// 事件优先级
const PRIORITY = {
  CRITICAL: 'critical',  // 立即处理
  HIGH: 'high',          // 优先处理
  MEDIUM: 'medium',      // 一般处理
  LOW: 'low'             // 可延迟
};

// 上次触发时间
let lastTrigger = 0;
let lastState = {};

// 事件定义
const EVENT_PATTERNS = [
  // 🔴 紧急事件
  { pattern: /\[EVENT:HOSTILE\]/, priority: PRIORITY.CRITICAL, type: 'hostile_detected' },
  { pattern: /\[EVENT:SPAWN_ATTACKED\]/, priority: PRIORITY.CRITICAL, type: 'spawn_attacked' },
  { pattern: /\[EVENT:NO_SPAWN\]/, priority: PRIORITY.CRITICAL, type: 'spawn_destroyed' },
  
  // 🟠 高优先级
  { pattern: /\[EVENT:NO_CREEPS\]/, priority: PRIORITY.HIGH, type: 'no_creeps' },
  { pattern: /\[EVENT:CONTROLLER_DOWNGRADE\]/, priority: PRIORITY.HIGH, type: 'controller_downgrade' },
  { pattern: /\[EVENT:LOW_ENERGY\]/, priority: PRIORITY.HIGH, type: 'low_energy' },
  
  // 🟡 中优先级 - 良性事件
  { pattern: /\[EVENT:RCL_UP:(\d+)\]/, priority: PRIORITY.MEDIUM, type: 'rcl_upgrade' },
  { pattern: /\[EVENT:GCL_UP:(\d+)\]/, priority: PRIORITY.MEDIUM, type: 'gcl_upgrade' },
  { pattern: /\[EVENT:BUILD_COMPLETE:(\w+)\]/, priority: PRIORITY.MEDIUM, type: 'construction_complete' },
  { pattern: /\[EVENT:SPAWN_COMPLETE:(\w+)\]/, priority: PRIORITY.MEDIUM, type: 'creep_spawned' },
  { pattern: /\[EVENT:EXTENSION_BUILT\]/, priority: PRIORITY.MEDIUM, type: 'extension_built' },
  { pattern: /\[EVENT:TOWER_BUILT\]/, priority: PRIORITY.MEDIUM, type: 'tower_built' },
  { pattern: /\[EVENT:STORAGE_BUILT\]/, priority: PRIORITY.MEDIUM, type: 'storage_built' },
  
  // 🟢 低优先级 - 统计/里程碑
  { pattern: /\[EVENT:ENERGY_MILESTONE:(\d+)\]/, priority: PRIORITY.LOW, type: 'energy_milestone' },
  { pattern: /\[EVENT:CREEP_COUNT:(\d+)\]/, priority: PRIORITY.LOW, type: 'creep_milestone' },
  { pattern: /\[EVENT:TICK_MILESTONE:(\d+)\]/, priority: PRIORITY.LOW, type: 'tick_milestone' },
  
  // 错误事件
  { pattern: /Error|error|ERR_/, priority: PRIORITY.HIGH, type: 'code_error' },
];

async function main() {
  console.log('🔌 Connecting to Screeps...');
  
  const api = new ScreepsAPI({
    token: process.env.SCREEPS_TOKEN,
    protocol: 'https',
    hostname: 'screeps.com',
    port: 443,
    path: '/'
  });

  await api.socket.connect();
  console.log('✅ Connected');

  // 订阅控制台
  api.socket.subscribe('console', handleConsole);
  console.log(`📡 Subscribed to console`);

  // 订阅房间
  api.socket.subscribe(`room:${SHARD}/${ROOM}`, handleRoom);
  console.log(`📡 Subscribed to room:${SHARD}/${ROOM}`);

  // 订阅 CPU
  api.socket.subscribe('cpu', handleCPU);
  console.log(`📡 Subscribed to cpu`);

  console.log('');
  console.log('👀 Watching for events...');
  console.log('   Press Ctrl+C to stop');
  console.log('');
}

function handleConsole(event) {
  const logs = event.data?.messages?.log || [];
  
  for (const log of logs) {
    // 检查是否匹配任何事件模式
    for (const eventDef of EVENT_PATTERNS) {
      const match = log.match(eventDef.pattern);
      if (match) {
        const eventData = {
          type: eventDef.type,
          priority: eventDef.priority,
          message: log,
          match: match[1] || null,
          timestamp: new Date().toISOString()
        };
        
        console.log(`🎯 [${eventDef.priority.toUpperCase()}] ${eventDef.type}: ${log}`);
        triggerEvent(eventData);
      }
    }
  }
}

function handleRoom(event) {
  const objects = event.data?.objects || {};
  const gameTime = event.data?.gameTime;
  
  // 检测状态变化
  let hasHostile = false;
  let spawnCount = 0;
  let creepCount = 0;
  let controllerLevel = 0;
  
  for (const [id, obj] of Object.entries(objects)) {
    if (!obj) continue;
    
    // 检测敌人
    if (obj.type === 'creep' && obj.user && obj.user !== process.env.SCREEPS_USER_ID) {
      hasHostile = true;
    }
    
    // 统计 Spawn
    if (obj.type === 'spawn') {
      spawnCount++;
    }
    
    // 统计 Creep (自己的)
    if (obj.type === 'creep' && obj.my) {
      creepCount++;
    }
    
    // 控制器等级
    if (obj.type === 'controller' && obj.level !== undefined) {
      controllerLevel = obj.level;
    }
  }
  
  // 比较状态变化
  if (hasHostile && !lastState.hasHostile) {
    triggerEvent({
      type: 'hostile_detected',
      priority: PRIORITY.CRITICAL,
      timestamp: new Date().toISOString()
    });
  }
  
  if (controllerLevel > 0 && lastState.controllerLevel && controllerLevel > lastState.controllerLevel) {
    console.log(`🎉 RCL upgraded to ${controllerLevel}!`);
    triggerEvent({
      type: 'rcl_upgrade',
      priority: PRIORITY.MEDIUM,
      level: controllerLevel,
      timestamp: new Date().toISOString()
    });
  }
  
  // 更新状态
  lastState = {
    hasHostile,
    spawnCount,
    creepCount,
    controllerLevel,
    gameTime
  };
}

function handleCPU(event) {
  const { cpu, memory } = event.data || {};
  
  // CPU 超限警告
  if (cpu > 18) {
    console.log(`⚠️  High CPU usage: ${cpu}/20`);
  }
}

function triggerEvent(eventData) {
  const now = Date.now();
  
  // 冷却检查 (critical 事件忽略冷却)
  if (eventData.priority !== PRIORITY.CRITICAL && now - lastTrigger < COOLDOWN) {
    console.log(`⏳ Cooldown active, skipping trigger`);
    return;
  }
  
  // 写入事件文件
  const events = [];
  if (fs.existsSync(EVENTS_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      if (Array.isArray(existing.events)) {
        events.push(...existing.events);
      }
    } catch (e) {}
  }
  
  events.push(eventData);
  
  fs.writeFileSync(EVENTS_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    priority: eventData.priority,
    events: events
  }, null, 2));
  
  console.log(`📝 Event written to ${EVENTS_FILE}`);
  
  // Critical/High 优先级立即重启 Agent
  if (eventData.priority === PRIORITY.CRITICAL || eventData.priority === PRIORITY.HIGH) {
    restartAgent(eventData);
    lastTrigger = now;
  }
}

function restartAgent(eventData) {
  console.log(`🔄 Restarting agent for: ${eventData.type}`);
  
  try {
    // 停止当前 agent
    execSync('./stop.sh', { cwd: __dirname, stdio: 'inherit' });
    
    // 等待一下
    execSync('sleep 2');
    
    // 启动新 agent
    execSync('./start.sh', { cwd: __dirname, stdio: 'inherit' });
    
    console.log(`✅ Agent restarted`);
  } catch (e) {
    console.error(`❌ Failed to restart agent: ${e.message}`);
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down watcher...');
  process.exit(0);
});

main().catch(console.error);
