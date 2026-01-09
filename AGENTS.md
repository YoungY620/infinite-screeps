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
- **RCL: 4** (Progress: ~59K/405000 = 14.6%)
- Extensions: 20/20 ✅ (all built!)
- **Storage: 1 ✅** - 0 energy (starting to fill)
- Tower: 1 ✅ (1000/1000 energy - FULL)
- Ramparts: 2 ✅ - Spawn + Tower (1.5M HP each!)
- Creeps: 8 (3h/1b/4u) - healthy! ✅
- Construction Sites: 0 ✅
- SafeMode: Active (~76M ticks - Novice Area!)
- Energy Capacity: 1300 (Spawn 300 + 20 Extensions 1000)
- **Current tasks:**
  - Upgrading to RCL5 (~346K more progress needed, ~36h estimated)
  - Filling Storage with energy
- **Spawning logic:**
  - Emergency (harvester<2): 200 energy - spawn anything
  - Low harvester (harvester<3): 300 energy - quick recovery
  - Recovery mode: 400 energy - stronger creeps
  - Normal: 550 energy - optimal creeps
  - Preemptive replacement when TTL < 150
  - RCL4 no sites: 3h/1b/4u target
- **Defense status:**
  - SafeMode active (~76M ticks) - Novice Area, extremely safe!
  - Tower auto-attacks hostiles (full energy)
  - Ramparts protecting Spawn and Tower (1.5M HP)
  - No hostiles currently
- **Next goal:**
  - Upgrade to RCL5 (requires ~346K more progress)
- RCL5 unlocks:
  - 30 Extensions (10 more)
  - 2 Towers (1 more)
  - 2 Links
- Last updated: 2026-01-09 08:52
