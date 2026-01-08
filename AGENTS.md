# Infinite Screeps - Agent System

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Screeps       │     │  Event Monitor  │     │    AI Agent     │
│   Game Server   │     │  (Node.js)      │     │    (kimi)       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ main.js emits   │────>│ WebSocket       │────>│ Reads events/   │
│ [EVENT:TYPE]    │     │ listens for     │     │ pending.json    │
│ via console.log │     │ console events  │     │ Takes action    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Components

### Game Code (`screeps/main.js`)
- Runs in Screeps server
- Emits events via `console.log("[EVENT:TYPE:VALUE]")`
- Event types: HOSTILE, SPAWN_ATTACKED, NO_SPAWN, NO_CREEPS, RCL_UP, EXTENSION_BUILT, TOWER_BUILT, etc.

### Event Monitor (`src/event-monitor.js`)
- Node.js script using screeps-api WebSocket
- Subscribes to `console` and `room:shard3/W13N45`
- Parses [EVENT:...] messages
- Writes to `events/pending.json` with priority

### Event Watcher (`event-watcher.sh`)
- Manages event-monitor.js (WebSocket)
- Backup REST API polling every 60s
- Triggers agent restart on high-priority events

### Agent Loop (`agent-loop.sh`)
- Runs kimi with prompt.md every 30 min
- Logs to logs/ directory
- Git commits after each session

## Event Priorities

| Priority | Events | Action |
|----------|--------|--------|
| 10 | HOSTILE, SPAWN_ATTACKED, NO_SPAWN | Immediate restart |
| 9 | NO_CREEPS | Immediate restart |
| 7-8 | LOW_ENERGY, CONTROLLER_DOWNGRADE | Restart |
| 4-5 | RCL_UP, TOWER_BUILT | Restart |
| 1-3 | SPAWN_COMPLETE, EXTENSION_BUILT | Logged only |

## Running

```bash
# Start
./start.sh

# Stop  
./stop.sh

# View sessions
tmux attach -t screeps-agent
tmux attach -t screeps-watcher
```

## Scripts

| Script | Purpose |
|--------|--------|
| `start.sh` | Start agent + watcher |
| `stop.sh` | Stop all |
| `agent-loop.sh` | Agent main loop (30min interval) |
| `event-watcher.sh` | WebSocket + polling monitor |
| `src/event-monitor.js` | WebSocket client |

## Environment Variables (.env)

```
SCREEPS_TOKEN=xxx
SHARD=shard3
ROOM=W13N45
```

## Current Status

- Room: E13S35 (shard3)
- **RCL: 4** (Progress: ~23.8K/405000 = 5.9%)
- Extensions: 20/20 ✅ (all built!)
- Storage: under construction (17530/30000 = 58.4%)
- Tower: 1 ✅ (493 energy)
- Ramparts: 2 ✅ - Spawn (1.48M HP) + Tower (461K HP)
- Creeps: 9 (3h/3b/3u) - healthy! ✅
- Construction Sites: 1 (storage only)
- SafeMode: Active (76.6M+ ticks remaining)
- Energy Capacity: 1300 (Spawn 300 + 20 Extensions 1000)
- **Current tasks:**
  - Building Storage (12470 more progress needed)
  - Upgrading to RCL5 (381K more progress needed)
- **Spawning logic:**
  - Emergency (harvester<2): 200 energy - spawn anything
  - Low harvester (harvester<3): 300 energy - quick recovery
  - Recovery mode: 400 energy - stronger creeps
  - Normal: 550 energy - optimal creeps
  - Preemptive replacement when TTL < 150
- **Defense status:**
  - SafeMode active (76.6M+ ticks remaining)
  - Tower auto-attacks hostiles
  - No hostiles currently
- **Next goal:**
  - Complete Storage construction (~12.5K progress left)
  - Upgrade to RCL5 (requires ~381K more progress)
- RCL5 unlocks:
  - 30 Extensions (10 more)
  - 2 Towers (1 more)
  - 2 Links
- Last updated: 2026-01-09 01:00
