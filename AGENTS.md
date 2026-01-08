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
- **RCL: 4** (Progress: ~29K/405000 = 7.2%)
- Extensions: 20/20 ✅ (all built!)
- Storage: under construction (29.7K/30K = 99.1%) - almost done! ⏳
- Tower: 1 ✅ (498 energy)
- Ramparts: 2 ✅ - Spawn (627K HP) + Tower (1.5M HP)
- Creeps: 10 (4h/3b/3u) - healthy! ✅
- Construction Sites: 1 (storage only)
- SafeMode: Active (~76.6M ticks = ~886 days remaining)
- Energy Capacity: 1300 (Spawn 300 + 20 Extensions 1000)
- **Current tasks:**
  - Building Storage (~270 more progress needed) - ETA ~1min!
  - Upgrading to RCL5 (~376K more progress needed) - ETA ~6-7 hours
- **Spawning logic:**
  - Emergency (harvester<2): 200 energy - spawn anything
  - Low harvester (harvester<3): 300 energy - quick recovery
  - Recovery mode: 400 energy - stronger creeps
  - Normal: 550 energy - optimal creeps
  - Preemptive replacement when TTL < 150
- **Defense status:**
  - SafeMode active (~886 days remaining) - very safe!
  - Tower auto-attacks hostiles
  - No hostiles currently
- **Next goal:**
  - Complete Storage construction (~270 progress left) - imminent!
  - Upgrade to RCL5 (requires ~376K more progress)
- RCL5 unlocks:
  - 30 Extensions (10 more)
  - 2 Towers (1 more)
  - 2 Links
- Last updated: 2026-01-09 03:06
