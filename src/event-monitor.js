/**
 * WebSocket Event Monitor for Screeps
 * 
 * Connects to Screeps socket API, listens for game events,
 * and writes to events/pending.json to trigger agent.
 */

import { ScreepsAPI } from 'screeps-api';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const EVENTS_DIR = join(ROOT_DIR, 'events');

config({ path: join(ROOT_DIR, '.env') });

const TOKEN = process.env.SCREEPS_TOKEN;
const SHARD = process.env.SHARD || 'shard3';

if (!TOKEN) {
    console.error('[ERROR] SCREEPS_TOKEN not found in .env');
    process.exit(1);
}

// 动态获取当前房间
async function getCurrentRoom(api) {
    const overview = await api.raw.user.overview('energyHarvested', 8);
    const rooms = overview?.shards?.[SHARD]?.rooms || [];
    return rooms[0] || null;
}

// Ensure events directory exists
if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
}

// Event priorities (higher = more urgent)
const EVENT_PRIORITY = {
    // === CRITICAL (10) - 立即响应 ===
    HOSTILE: 10,
    SPAWN_ATTACKED: 10,
    NO_SPAWN: 10,
    
    // === SEVERE (9) - 严重 ===
    NO_CREEPS: 9,
    DOWNGRADE_CRITICAL: 9,    // < 1000 ticks
    
    // === HIGH (8) - 高优先 ===
    LOW_ENERGY: 8,
    CREEP_HURT_harvester: 8,  // harvester 受伤
    
    // === ELEVATED (7) - 警告 ===
    DOWNGRADE_URGENT: 7,      // < 5000 ticks
    CREEP_DIED_harvester: 7,  // harvester 死亡
    
    // === MEDIUM (6) - 中等 ===
    CREEP_HURT_upgrader: 6,
    CREEP_HURT_builder: 6,
    CREEP_DIED_upgrader: 6,
    CREEP_DIED_builder: 6,
    
    // === LOW-MEDIUM (5) - 较低 ===
    RCL_UP: 5,
    DOWNGRADE_WARNING: 5,     // < 20000 ticks
    CREEP_HURT: 5,            // 其他角色受伤
    CREEP_DIED: 5,            // 其他角色死亡
    
    // === LOW (4) - 低优先 ===
    TOWER_BUILT: 4,
    STORAGE_BUILT: 4,
    
    // === INFO (1-3) - 仅记录 ===
    EXTENSION_BUILT: 3,
    SPAWN_COMPLETE: 2,
    ENERGY_MILESTONE: 1,
    
    // === SPECIAL ===
    ROOM_CHANGED: 10  // 房间变化，需要立即响应
};

// Minimum seconds between triggering agent for same event type
const EVENT_COOLDOWN = {
    HOSTILE: 60,
    SPAWN_ATTACKED: 30,
    NO_SPAWN: 300,
    NO_CREEPS: 120,
    LOW_ENERGY: 180,
    DOWNGRADE_CRITICAL: 300,
    DOWNGRADE_URGENT: 600,
    DOWNGRADE_WARNING: 1800,
    RCL_UP: 0,
    TOWER_BUILT: 0,
    STORAGE_BUILT: 0,
    CREEP_DIED: 60,
    CREEP_HURT: 30,
    EXTENSION_BUILT: 300,
    SPAWN_COMPLETE: 300
};

const lastEventTime = {};

function log(msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`);
}

function shouldTrigger(eventType) {
    const now = Date.now();
    const cooldown = (EVENT_COOLDOWN[eventType] || 60) * 1000;
    const lastTime = lastEventTime[eventType] || 0;
    
    if (now - lastTime < cooldown) {
        return false;
    }
    lastEventTime[eventType] = now;
    return true;
}

function writeEvent(eventType, value, raw) {
    // 动态获取优先级（支持角色特定优先级）
    let priority = EVENT_PRIORITY[eventType];
    
    // 处理 CREEP_HURT 和 CREEP_DIED 的角色特定优先级
    if ((eventType === 'CREEP_HURT' || eventType === 'CREEP_DIED') && value) {
        const role = value.split(':')[0];
        const roleSpecificKey = `${eventType}_${role}`;
        priority = EVENT_PRIORITY[roleSpecificKey] || EVENT_PRIORITY[eventType] || 5;
    }
    
    if (priority === undefined) priority = 5;
    const event = {
        type: eventType,
        value: value || null,
        priority,
        timestamp: new Date().toISOString(),
        raw
    };
    
    const pendingFile = join(EVENTS_DIR, 'pending.json');
    let events = [];
    
    // Read existing events
    if (existsSync(pendingFile)) {
        try {
            events = JSON.parse(readFileSync(pendingFile, 'utf8'));
            if (!Array.isArray(events)) events = [];
        } catch {
            events = [];
        }
    }
    
    // Add new event
    events.push(event);
    
    // Sort by priority (descending)
    events.sort((a, b) => b.priority - a.priority);
    
    // Keep max 10 events
    if (events.length > 10) {
        events = events.slice(0, 10);
    }
    
    writeFileSync(pendingFile, JSON.stringify(events, null, 2));
    log(`Event written: ${eventType}=${value} (priority ${priority})`);
}

function parseConsoleMessage(msg) {
    // Match [EVENT:TYPE] or [EVENT:TYPE:VALUE]
    const match = msg.match(/\[EVENT:([A-Z_]+)(?::([^\]]+))?\]/);
    if (match) {
        return {
            type: match[1],
            value: match[2] || null
        };
    }
    return null;
}

async function main() {
    log(`Starting event monitor on ${SHARD}`);
    
    const api = new ScreepsAPI({
        token: TOKEN,
        protocol: 'https',
        hostname: 'screeps.com',
        port: 443,
        path: '/'
    });
    
    try {
        const me = await api.me();
        log(`Connected as: ${me.username}`);
        
        // 动态获取当前房间
        let currentRoom = await getCurrentRoom(api);
        log(`Current room: ${currentRoom || 'none'}`);
        
        await api.socket.connect();
        log('WebSocket connected');
        
        // 订阅控制台
        api.socket.subscribe('console', (event) => {
            if (!event.data || !event.data.messages) return;
            
            const logs = event.data.messages.log || [];
            for (const msg of logs) {
                const parsed = parseConsoleMessage(msg);
                if (parsed) {
                    log(`Game event: ${parsed.type} = ${parsed.value}`);
                    if (shouldTrigger(parsed.type)) {
                        writeEvent(parsed.type, parsed.value, msg);
                    } else {
                        log(`  (cooldown active, not triggering)`);
                    }
                }
            }
        });
        log('Subscribed to console');
        
        // 订阅房间（如果有）
        let roomSubscription = null;
        
        const subscribeToRoom = (room) => {
            if (!room) return;
            if (roomSubscription) {
                api.socket.unsubscribe(roomSubscription);
            }
            roomSubscription = `room:${SHARD}/${room}`;
            api.socket.subscribe(roomSubscription, (event) => {
                if (!event.data || !event.data.objects) return;
                const objects = event.data.objects;
                let hostileCount = 0;
                for (const id in objects) {
                    const obj = objects[id];
                    if (obj && obj.type === 'creep' && obj.user && obj.user !== me._id) {
                        hostileCount++;
                    }
                }
                if (hostileCount > 0) {
                    log(`Room monitor: ${hostileCount} hostile creeps detected`);
                    if (shouldTrigger('HOSTILE_ROOM')) {
                        writeEvent('HOSTILE', hostileCount, 'room monitor');
                    }
                }
            });
            log(`Subscribed to room: ${room}`);
        };
        
        if (currentRoom) subscribeToRoom(currentRoom);
        
        // 定期检查房间变化
        setInterval(async () => {
            try {
                const newRoom = await getCurrentRoom(api);
                if (newRoom && newRoom !== currentRoom) {
                    log(`Room changed: ${currentRoom} -> ${newRoom}`);
                    currentRoom = newRoom;
                    subscribeToRoom(currentRoom);
                    writeEvent('ROOM_CHANGED', newRoom, 'room monitor');
                }
            } catch (e) {
                log(`Error checking room: ${e.message}`);
            }
        }, 60000);
        
        log('Monitoring for events...');
        
        setInterval(() => log('Heartbeat - still monitoring'), 300000);
        
    } catch (err) {
        log(`Error: ${err.message}`);
        process.exit(1);
    }
}

main();
