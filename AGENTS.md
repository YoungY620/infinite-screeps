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
- **RCL: 4** (Progress: 404,892/405,000 = **99.97%** - ABOUT TO HIT RCL5!)
- Extensions: 20/20 ✅
- Storage: 1 ✅ (0 energy)
- Tower: 1 ✅ (1000 energy - full)
- Walls: 43 ✅
- Ramparts: 2 ✅ - protecting Spawn and Tower
- **Creeps: 10 total** (4h/1b/5u) - running strong
- Construction Sites: 0 ✅
- Container: 1
- Roads: 3
- Energy Capacity: 1300 (Spawn 300 + 20 Extensions 1000)
- **Current tasks:**
  - Final push to RCL5 (~108 progress remaining!)
  - ETA: ~7-8 ticks with 5 upgraders (15 WORK parts)
- **Spawning logic:**
  - Emergency (harvester<2): 200 energy
  - Low harvester (harvester<3): 300 energy
  - Recovery mode (any role under target): 400 energy
  - Normal: 550 energy - optimal creeps
  - Preemptive replacement when TTL < 150
  - RCL4 no sites: 3h/1b/4u = 8 total
- **Defense status:**
  - Tower auto-attacks hostiles (full energy)
  - Ramparts protecting Spawn and Tower
  - No hostiles currently
- **Next goal: RCL5!**
  - RCL5 unlocks: 30 Extensions (+10), 2 Towers (+1), 2 Links (new!)
  - Code already prepared for RCL5 building plans in getBuildPositions()
- **Code version:** Event-Driven v4.1 (deployed 2026-01-11 16:11)
- Last updated: 2026-01-12 11:28
