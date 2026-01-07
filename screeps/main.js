/**
 * Screeps Eternal - Event-Driven v3
 * 
 * 新增: 事件输出系统，与外部 watcher 配合
 * 
 * 事件格式: [EVENT:TYPE:VALUE]
 */

// ========== 事件系统 ==========

function emitEvent(type, value = '') {
    const msg = value ? `[EVENT:${type}:${value}]` : `[EVENT:${type}]`;
    console.log(msg);
}

function checkEvents(room, spawn) {
    const mem = Memory.events || {};
    const controller = room.controller;
    
    // ===== 敌人检测 =====
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0 && !mem.hostileDetected) {
        emitEvent('HOSTILE', hostiles.length);
        mem.hostileDetected = Game.time;
    } else if (hostiles.length === 0) {
        mem.hostileDetected = null;
    }
    
    // ===== Spawn 被攻击 =====
    if (spawn.hits < spawn.hitsMax) {
        emitEvent('SPAWN_ATTACKED', spawn.hits);
    }
    
    // ===== RCL 升级 =====
    if (mem.lastLevel !== undefined && controller.level > mem.lastLevel) {
        emitEvent('RCL_UP', controller.level);
    }
    mem.lastLevel = controller.level;
    
    // ===== 控制器降级警告 (分级) =====
    const ttd = controller.ticksToDowngrade;
    if (ttd < 1000 && mem.downgradeLevel !== 'CRITICAL') {
        emitEvent('DOWNGRADE_CRITICAL', ttd);  // < 1000 ticks (~17分钟)
        mem.downgradeLevel = 'CRITICAL';
    } else if (ttd < 5000 && ttd >= 1000 && mem.downgradeLevel !== 'URGENT') {
        emitEvent('DOWNGRADE_URGENT', ttd);    // < 5000 ticks (~1.4小时)
        mem.downgradeLevel = 'URGENT';
    } else if (ttd < 20000 && ttd >= 5000 && mem.downgradeLevel !== 'WARNING') {
        emitEvent('DOWNGRADE_WARNING', ttd);   // < 20000 ticks (~5.5小时)
        mem.downgradeLevel = 'WARNING';
    } else if (ttd >= 20000) {
        mem.downgradeLevel = null;
    }
    
    // ===== Creep 死亡检测 =====
    const currentCreeps = Object.keys(Game.creeps);
    const lastCreeps = mem.lastCreeps || [];
    
    // 找出死亡的 creep
    for (const name of lastCreeps) {
        if (!Game.creeps[name]) {
            // Creep 死亡，检查之前记录的角色
            const role = mem.creepRoles ? mem.creepRoles[name] : 'unknown';
            emitEvent('CREEP_DIED', `${role}:${name}`);
        }
    }
    
    // 更新 creep 列表和角色记录
    mem.lastCreeps = currentCreeps;
    mem.creepRoles = mem.creepRoles || {};
    for (const name in Game.creeps) {
        mem.creepRoles[name] = Game.creeps[name].memory.role;
    }
    // 清理死亡 creep 的角色记录
    for (const name in mem.creepRoles) {
        if (!Game.creeps[name]) delete mem.creepRoles[name];
    }
    
    // 所有 creep 死亡
    if (currentCreeps.length === 0 && lastCreeps.length > 0) {
        emitEvent('NO_CREEPS');
    }
    
    // ===== Creep 受伤检测 =====
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const lastHits = mem.creepHits ? mem.creepHits[name] : creep.hitsMax;
        
        if (creep.hits < lastHits) {
            // Creep 受伤了
            const role = creep.memory.role;
            const damage = lastHits - creep.hits;
            const hpPercent = Math.round(creep.hits / creep.hitsMax * 100);
            emitEvent('CREEP_HURT', `${role}:${name}:${hpPercent}%`);
        }
        
        mem.creepHits = mem.creepHits || {};
        mem.creepHits[name] = creep.hits;
    }
    // 清理死亡 creep 的血量记录
    if (mem.creepHits) {
        for (const name in mem.creepHits) {
            if (!Game.creeps[name]) delete mem.creepHits[name];
        }
    }
    
    // ===== 低能量 =====
    if (room.energyAvailable < 200 && currentCreeps.length === 0) {
        emitEvent('LOW_ENERGY', room.energyAvailable);
    }
    
    // 检测建筑完成 (每 10 ticks)
    if (Game.time % 10 === 0) {
        const structures = room.find(FIND_MY_STRUCTURES);
        const structureCounts = {};
        for (const s of structures) {
            structureCounts[s.structureType] = (structureCounts[s.structureType] || 0) + 1;
        }
        
        // Extension
        if (mem.extensionCount !== undefined && structureCounts.extension > mem.extensionCount) {
            emitEvent('EXTENSION_BUILT', structureCounts.extension);
        }
        mem.extensionCount = structureCounts.extension || 0;
        
        // Tower
        if (mem.towerCount !== undefined && structureCounts.tower > mem.towerCount) {
            emitEvent('TOWER_BUILT', structureCounts.tower);
        }
        mem.towerCount = structureCounts.tower || 0;
        
        // Storage
        if (mem.storageCount !== undefined && structureCounts.storage > mem.storageCount) {
            emitEvent('STORAGE_BUILT', structureCounts.storage);
        }
        mem.storageCount = structureCounts.storage || 0;
    }
    
    // 能量里程碑 (每 500 ticks)
    if (Game.time % 500 === 0) {
        const harvested = mem.totalHarvested || 0;
        const milestones = [10000, 50000, 100000, 500000, 1000000];
        for (const m of milestones) {
            if (harvested >= m && !mem[`milestone_${m}`]) {
                emitEvent('ENERGY_MILESTONE', m);
                mem[`milestone_${m}`] = true;
            }
        }
    }
    
    Memory.events = mem;
}

// ========== 配置 ==========

function getCreepTargets(room) {
    const level = room.controller.level;
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    
    if (level <= 2) {
        return {
            harvester: 4,
            builder: constructionSites > 0 ? 3 : 1,
            upgrader: 3
        };
    } else if (level === 3) {
        return {
            harvester: 4,
            builder: constructionSites > 0 ? 2 : 1,
            upgrader: 2
        };
    } else {
        return {
            harvester: 3,
            builder: constructionSites > 0 ? 2 : 1,
            upgrader: 2
        };
    }
}

function getBody(role, energyAvailable) {
    if (energyAvailable >= 550) {
        if (role === 'harvester' || role === 'upgrader') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
        } else {
            return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
        }
    } else if (energyAvailable >= 400) {
        return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    } else if (energyAvailable >= 300) {
        return [WORK, WORK, CARRY, MOVE];
    } else {
        return [WORK, CARRY, MOVE];
    }
}

function getBuildPositions(spawn) {
    const sx = spawn.pos.x;
    const sy = spawn.pos.y;
    
    // Extension positions in priority order (RCL 3 = 10, RCL 4 = 20, etc.)
    // Layer 1: Adjacent to spawn (4 corners + right)
    // Layer 2: One more step out
    // Layer 3: Two more steps out
    return {
        extensions: [
            // Layer 1 (RCL 2: 5 extensions)
            {x: sx - 1, y: sy - 1}, {x: sx + 1, y: sy - 1},
            {x: sx - 1, y: sy + 1}, {x: sx + 1, y: sy + 1}, {x: sx + 2, y: sy},
            // Layer 2 (RCL 3: 10 extensions)
            {x: sx - 2, y: sy - 1}, {x: sx + 2, y: sy - 1},
            {x: sx - 2, y: sy + 1}, {x: sx + 2, y: sy + 1}, {x: sx + 3, y: sy},
            // Layer 2 extras (fallback for blocked positions)
            {x: sx - 3, y: sy}, {x: sx - 2, y: sy}, {x: sx + 3, y: sy - 1}, {x: sx + 3, y: sy + 1},
            // Layer 3 (RCL 4+: 20 extensions)
            {x: sx - 3, y: sy - 1}, {x: sx - 3, y: sy + 1},
            {x: sx + 4, y: sy}, {x: sx + 4, y: sy - 1}, {x: sx + 4, y: sy + 1},
            {x: sx - 2, y: sy - 2}, {x: sx + 2, y: sy - 2},
            {x: sx - 2, y: sy + 2}, {x: sx + 2, y: sy + 2},
            {x: sx, y: sy - 3}, {x: sx, y: sy + 3}
        ],
        towers: [{x: sx, y: sy - 2}],
        ramparts: [{x: sx, y: sy}, {x: sx, y: sy - 2}]
    };
}

// ========== 主循环 ==========

module.exports.loop = function () {
    // 清理
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    
    // 获取 Spawn
    const spawns = Object.values(Game.spawns);
    if (spawns.length === 0) {
        emitEvent('NO_SPAWN');
        return;
    }
    const spawn = spawns[0];
    const room = spawn.room;
    const controller = room.controller;
    
    // 检测事件
    checkEvents(room, spawn);
    
    const CREEP_TARGETS = getCreepTargets(room);
    
    // 统计 Creep
    const counts = { harvester: 0, builder: 0, upgrader: 0 };
    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (counts[role] !== undefined) counts[role]++;
    }
    
    // 建筑规划
    if (Game.time % 50 === 0) {
        planBuildings(room, controller.level, spawn);
    }
    
    // 孵化
    if (!spawn.spawning) {
        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        
        for (const role of ['harvester', 'builder', 'upgrader']) {
            if (counts[role] < CREEP_TARGETS[role]) {
                const minEnergy = energyCapacity >= 400 ? Math.min(energyCapacity, energyAvailable) : 200;
                if (energyAvailable >= minEnergy) {
                    const body = getBody(role, minEnergy);
                    const name = role + Game.time;
                    const result = spawn.spawnCreep(body, name, { memory: { role } });
                    if (result === OK) {
                        emitEvent('SPAWN_COMPLETE', name);
                    }
                }
                break;
            }
        }
    }
    
    // 运行 Creep
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = creep.memory.role;
        if (role === 'harvester') runHarvester(creep);
        else if (role === 'upgrader') runUpgrader(creep);
        else if (role === 'builder') runBuilder(creep);
    }
    
    // Tower 防御
    runTowers(room);
    
    // 状态 (每 100 ticks)
    if (Game.time % 100 === 0) {
        const cpu = Game.cpu.getUsed();
        const creepCount = Object.keys(Game.creeps).length;
        console.log(`[STATUS] T:${Game.time} CPU:${cpu.toFixed(1)} Creeps:${creepCount} RCL:${controller.level}`);
    }
};

// ========== 建筑规划 ==========

function planBuildings(room, level, spawn) {
    const BUILD_PLANS = getBuildPositions(spawn);
    
    const maxExt = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level];
    const curExt = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
    const siteExt = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
    
    const needed = maxExt - curExt - siteExt;
    if (needed > 0) {
        let placed = 0;
        for (const pos of BUILD_PLANS.extensions) {
            if (placed >= needed) break;
            if (canBuildAt(room, pos.x, pos.y)) {
                if (room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION) === OK) {
                    placed++;
                }
            }
        }
    }
    
    if (level >= 3) {
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level];
        const curTowers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        const siteTowers = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        
        if (curTowers + siteTowers < maxTowers) {
            for (const pos of BUILD_PLANS.towers) {
                if (canBuildAt(room, pos.x, pos.y)) {
                    room.createConstructionSite(pos.x, pos.y, STRUCTURE_TOWER);
                    break;
                }
            }
        }
    }
}

function canBuildAt(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    const terrain = room.getTerrain().get(x, y);
    return structures.length === 0 && sites.length === 0 && terrain !== TERRAIN_MASK_WALL;
}

// ========== Tower ==========

function runTowers(room) {
    const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
    
    for (const tower of towers) {
        const enemy = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) {
            tower.attack(enemy);
            continue;
        }
        
        const damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.hits < s.hitsMax * 0.5 && 
                        s.structureType !== STRUCTURE_WALL &&
                        s.structureType !== STRUCTURE_RAMPART
        });
        if (damaged && tower.store[RESOURCE_ENERGY] > 500) {
            tower.repair(damaged);
        }
    }
}

// ========== Creep 行为 ==========

function runHarvester(creep) {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
        delete creep.memory.targetId;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
        delete creep.memory.targetId;
    }
    
    if (creep.memory.working) {
        let target = Game.getObjectById(creep.memory.targetId);
        if (!target || (target.store && target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)) {
            target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN ||
                             s.structureType === STRUCTURE_EXTENSION ||
                             s.structureType === STRUCTURE_TOWER) &&
                             s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            creep.memory.targetId = target ? target.id : null;
        }
        
        if (target) {
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { reusePath: 5 });
            }
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { reusePath: 5 });
            }
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { reusePath: 5 });
        }
    }
}

function runUpgrader(creep) {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
    }
    
    if (creep.memory.working) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(creep.room.controller, { reusePath: 5 });
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { reusePath: 5 });
        }
    }
}

function runBuilder(creep) {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
        delete creep.memory.targetId;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
        delete creep.memory.targetId;
    }
    
    if (creep.memory.working) {
        let target = Game.getObjectById(creep.memory.targetId);
        if (!target) {
            const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
            target = sites.find(s => s.structureType === STRUCTURE_TOWER) ||
                     sites.find(s => s.structureType === STRUCTURE_EXTENSION) ||
                     sites[0];
            creep.memory.targetId = target ? target.id : null;
        }
        
        if (target) {
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { reusePath: 5 });
            }
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { reusePath: 5 });
            }
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { reusePath: 5 });
        }
    }
}
