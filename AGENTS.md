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
- **RCL: 4** (Progress: 3,946/370,000 towards RCL5 - 1.1%)
- Extensions: 12/20 (12 built, 8 under construction)
- Storage: under construction (0/30,000)
- Tower: 1 with 510/1000 energy ✅
- Ramparts: 2 ✅ Very strong!
- Creeps: 7 (2h/2b/3u) - recovering (target: 3/3/3)
- Construction Sites: 9 (8 extensions + 1 storage)
  - 1 extension at 8.3% progress
  - 7 extensions at 0%
  - 1 storage at 0%
- Energy: 300/900 (waiting for 400 to spawn)
- SafeMode: **ACTIVE** - large buffer remaining
- **Current tasks:**
  - Spawning more creeps (need 2 more to reach target 9)
  - Building 8 Extensions (~24K energy remaining)
  - Building Storage (30,000 progress needed)
  - Total: ~54K energy needed
- **Spawning logic:**
  - Recovery mode: waits for 400 energy to spawn stronger creeps
  - This is working as designed - quality over quantity
- **Next goal:**
  - Complete all RCL4 buildings (20 extensions + storage)
  - Upgrade to RCL5 (requires ~366K more energy)
- RCL4 unlocks:
  - 20 Extensions (max)
  - Storage (1 max)
- Last updated: 2026-01-08 16:45
