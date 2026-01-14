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
- **RCL: 5** ✅ (Progress: 3,492/1,800,000)
- Extensions: 21 built + 9 under construction (target: 30)
- Storage: 1 ✅ (empty)
- Tower: 1 ✅ (500/1000 energy)
- Ramparts: 2 ✅ (~2M HP each)
- Container: GONE (decayed)
- **Creeps: RECOVERING** 
  - 1 harvester (4 parts: 2W/1C/1M) spawning
  - Target: 3h/3b/3u (RCL5 with sites>5)
- Construction Sites: 9 extensions
- Energy Capacity: ~1350 (300 spawn + 21*50 ext)
- **Safe Mode: ACTIVE** (76M+ ticks = ~886 days)

### Recovery Status (2026-01-14 14:45)
- Code running on server ✅
- First harvester spawning now (4 parts)
- Sources at full energy (3000/3000 x2) - ready to harvest
- Automatic recovery in progress - no intervention needed
- Safe Mode protecting room from attacks
- Estimated full recovery: 10-15 minutes

### Critical Incident (2026-01-14 11:00)
- **CODE WAS EMPTY ON SERVER!** Main.js had 0 bytes
- All creeps died due to no code running
- Container decayed (no maintenance)
- **Fix:** Re-uploaded main.js to server

### Previous Incident (2026-01-12 14:00)
- Multiple creeps killed by player "gone"
- Economy collapsed (0 harvesters)
- **Fix applied:** Emergency recovery mode

- **Spawning logic:**
  - Emergency (harvester<2): 200 energy
  - Low harvester (harvester<3): 300 energy
  - Recovery mode (any role under target): 400 energy
  - Normal: 550 energy - optimal creeps
  - Preemptive replacement when TTL < 150
  - RCL5 with sites>5: 3h/3b/3u
  - RCL5 with sites: 3h/2b/3u
  - RCL5 no sites: 3h/1b/4u
- **Defense status:**
  - Tower auto-attacks hostiles
  - Ramparts protecting Spawn and Tower (~2M HP)
- **RCL5 unlocks:**
  - 30 Extensions (was 20) - building 9 more
  - 2 Towers (was 1) - can add 2nd
  - 2 Links (new!) - for remote energy transfer
- **Next goal: RCL6!**
  - Need 1,800,000 progress (currently 3,492)
  - RCL6 unlocks: 40 Extensions, 2 Towers, 3 Links, Extractor, Terminal
- **Code version:** Event-Driven v4.3
- Last updated: 2026-01-14 12:42
