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
- **RCL: 4** (Progress: ~4,682/370,000 towards RCL5 - 1.3%)
- Extensions: 13/20 (13 built, 7 under construction)
- Storage: under construction (0/30,000)
- Tower: 1 with 500/1000 energy ✅
- Ramparts: 2 ✅ Very strong! (1.17M + 489K hits)
- Creeps: 9 (3h/3b/3u) - target reached ✅
- Construction Sites: 8 (7 extensions + 1 storage)
- SafeMode: **ENDED** (relying on Tower + Ramparts)
- Energy Capacity: 950 (Spawn + 13 Extensions)
- **Current tasks:**
  - Building 7 Extensions remaining (1 in progress: 750/3000)
  - Building Storage (30,000 progress needed)
  - Upgrading RCL (4,682/370,000)
- **Spawning logic:**
  - Emergency (harvester<2): 200 energy - spawn anything
  - Low harvester (harvester<3): 300 energy - quick recovery
  - Recovery mode: 400 energy - stronger creeps
  - Normal: 550 energy - optimal creeps
- **Defense status:**
  - SafeMode ended - relying on Tower + Ramparts
  - Tower auto-attacks hostiles
  - Ramparts very strong (1.17M + 489K hits)
- **Next goal:**
  - Complete all RCL4 buildings (20 extensions + storage)
  - Upgrade to RCL5 (requires ~365K more energy)
- RCL4 unlocks:
  - 20 Extensions (max)
  - Storage (1 max)
- Last updated: 2026-01-08 17:43
