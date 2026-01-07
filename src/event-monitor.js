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
const ROOM = process.env.ROOM || 'W13N45';

if (!TOKEN) {
    console.error('[ERROR] SCREEPS_TOKEN not found in .env');
    process.exit(1);
}

// Ensure events directory exists
if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
}

// Event priorities (higher = more urgent)
const EVENT_PRIORITY = {
    HOSTILE: 10,
    SPAWN_ATTACKED: 10,
    NO_SPAWN: 10,
    NO_CREEPS: 9,
    LOW_ENERGY: 8,
    CONTROLLER_DOWNGRADE: 7,
    RCL_UP: 5,
    TOWER_BUILT: 4,
    STORAGE_BUILT: 4,
    EXTENSION_BUILT: 3,
    SPAWN_COMPLETE: 2,
    ENERGY_MILESTONE: 1
};

// Minimum seconds between triggering agent for same event type
const EVENT_COOLDOWN = {
    HOSTILE: 60,
    SPAWN_ATTACKED: 30,
    NO_SPAWN: 300,
    NO_CREEPS: 120,
    LOW_ENERGY: 180,
    CONTROLLER_DOWNGRADE: 600,
    RCL_UP: 0,  // Always trigger
    TOWER_BUILT: 0,
    STORAGE_BUILT: 0,
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
    const priority = EVENT_PRIORITY[eventType] || 5;
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
    log(`Starting event monitor for ${ROOM} on ${SHARD}`);
    
    const api = new ScreepsAPI({
        token: TOKEN,
        protocol: 'https',
        hostname: 'screeps.com',
        port: 443,
        path: '/'
    });
    
    try {
        // Test connection
        const me = await api.me();
        log(`Connected as: ${me.username}`);
        
        // Connect WebSocket
        await api.socket.connect();
        log('WebSocket connected');
        
        // Subscribe to console
        api.socket.subscribe('console', (event) => {
            if (!event.data || !event.data.messages) return;
            
            const logs = event.data.messages.log || [];
            for (const msg of logs) {
                // Parse for events
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
        
        // Also subscribe to room for additional monitoring
        api.socket.subscribe(`room:${SHARD}/${ROOM}`, (event) => {
            if (!event.data || !event.data.objects) return;
            
            // Check for hostile creeps directly from room data
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
        
        log(`Subscribed to room:${SHARD}/${ROOM}`);
        log('Monitoring for events...');
        
        // Keep alive
        setInterval(() => {
            log('Heartbeat - still monitoring');
        }, 300000); // Every 5 minutes
        
    } catch (err) {
        log(`Error: ${err.message}`);
        process.exit(1);
    }
}

main();
