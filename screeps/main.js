/**
 * Screeps Eternal - Event-Driven v4
 * 
 * 事件系统: 输出到控制台供 watcher 监听
 * 战斗日志: 使用 room.getEventLog() 记录攻击详情到 Memory
 */

// ========== 事件系统 ==========

function emitEvent(type, value = '') {
    const msg = value ? `[EVENT:${type}:${value}]` : `[EVENT:${type}]`;
    console.log(msg);
}

// 记录战斗日志 (只在检测到战斗时调用)
function recordCombatLog(room, trigger) {
    const events = room.getEventLog();
    
    // 筛选攻击和摧毁事件
    const combatEvents = events.filter(e => 
        e.event === EVENT_ATTACK || 
        e.event === EVENT_OBJECT_DESTROYED
    );
    
    if (combatEvents.length === 0) return;
    
    // 构建战斗日志
    const log = {
        time: Game.time,
        trigger: trigger,
        events: combatEvents.map(e => {
            const attacker = Game.getObjectById(e.objectId);
            const target = e.data.targetId ? Game.getObjectById(e.data.targetId) : null;
            
            return {
                type: e.event === EVENT_ATTACK ? 'ATTACK' : 'DESTROYED',
                attackerId: e.objectId,
                attackerOwner: attacker ? (attacker.owner ? attacker.owner.username : 'unknown') : 'gone',
                targetId: e.data.targetId,
                targetType: e.data.type || (target ? target.structureType || 'creep' : 'unknown'),
                damage: e.data.damage,
                attackType: e.data.attackType
            };
        })
    };
    
    // 保存到 Memory (保留最近 20 条)
    Memory.combatLog = Memory.combatLog || [];
    Memory.combatLog.unshift(log);
    if (Memory.combatLog.length > 20) {
        Memory.combatLog = Memory.combatLog.slice(0, 20);
    }
}

function checkEvents(room, spawn) {
    const mem = Memory.events || {};
    const controller = room.controller;
    let combatDetected = false;
    let combatTrigger = '';
    
    // ===== 敌人检测 =====
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
        if (!mem.hostileDetected) {
            // 新敌人出现
            const info = hostiles.map(h => `${h.owner.username}(${h.body.length}parts)`).join(',');
            emitEvent('HOSTILE', `${hostiles.length}:${info}`);
            combatDetected = true;
            combatTrigger = 'hostile_detected';
        }
        mem.hostileDetected = Game.time;
    } else {
        mem.hostileDetected = null;
    }
    
    // ===== Spawn 被攻击 =====
    if (spawn.hits < spawn.hitsMax) {
        if (!mem.spawnAttacked) {
            emitEvent('SPAWN_ATTACKED', `${spawn.hits}/${spawn.hitsMax}`);
            mem.spawnAttacked = true;
            combatDetected = true;
            combatTrigger = 'spawn_attacked';
        }
    } else {
        mem.spawnAttacked = false;
    }
    
    // ===== RCL 升级 =====
    if (mem.lastLevel !== undefined && controller.level > mem.lastLevel) {
        emitEvent('RCL_UP', controller.level);
    }
    mem.lastLevel = controller.level;
    
    // ===== 控制器降级警告 (分级) =====
    const ttd = controller.ticksToDowngrade;
    if (ttd < 1000 && mem.downgradeLevel !== 'CRITICAL') {
        emitEvent('DOWNGRADE_CRITICAL', ttd);
        mem.downgradeLevel = 'CRITICAL';
    } else if (ttd < 5000 && ttd >= 1000 && mem.downgradeLevel !== 'URGENT') {
        emitEvent('DOWNGRADE_URGENT', ttd);
        mem.downgradeLevel = 'URGENT';
    } else if (ttd < 20000 && ttd >= 5000 && mem.downgradeLevel !== 'WARNING') {
        emitEvent('DOWNGRADE_WARNING', ttd);
        mem.downgradeLevel = 'WARNING';
    } else if (ttd >= 20000) {
        mem.downgradeLevel = null;
    }
    
    // ===== Creep 死亡检测 =====
    const currentCreeps = Object.keys(Game.creeps);
    const lastCreeps = mem.lastCreeps || [];
    
    for (const name of lastCreeps) {
        if (!Game.creeps[name]) {
            const role = mem.creepRoles ? mem.creepRoles[name] : 'unknown';
            emitEvent('CREEP_DIED', `${role}:${name}`);
            combatDetected = true;
            combatTrigger = `creep_died:${role}`;
        }
    }
    
    mem.lastCreeps = currentCreeps;
    mem.creepRoles = mem.creepRoles || {};
    for (const name in Game.creeps) {
        mem.creepRoles[name] = Game.creeps[name].memory.role;
    }
    for (const name in mem.creepRoles) {
        if (!Game.creeps[name]) delete mem.creepRoles[name];
    }
    
    if (currentCreeps.length === 0 && lastCreeps.length > 0) {
        emitEvent('NO_CREEPS');
    }
    
    // ===== Creep 受伤检测 =====
    mem.creepHits = mem.creepHits || {};
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const lastHits = mem.creepHits[name] !== undefined ? mem.creepHits[name] : creep.hitsMax;
        
        if (creep.hits < lastHits) {
            const role = creep.memory.role;
            const hpPercent = Math.round(creep.hits / creep.hitsMax * 100);
            emitEvent('CREEP_HURT', `${role}:${name}:${hpPercent}%`);
            combatDetected = true;
            combatTrigger = `creep_hurt:${role}`;
        }
        mem.creepHits[name] = creep.hits;
    }
    for (const name in mem.creepHits) {
        if (!Game.creeps[name]) delete mem.creepHits[name];
    }
    
    // ===== Creep 寿命警告 =====
    mem.agingWarned = mem.agingWarned || {};
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.ticksToLive === undefined) continue; // spawning
        const spawnTime = creep.body.length * 3; // CREEP_SPAWN_TIME = 3
        const threshold = spawnTime * 2; // 给余量让替代 creep 孵化
        if (creep.ticksToLive <= threshold && !mem.agingWarned[name]) {
            const role = creep.memory.role;
            emitEvent('CREEP_AGING', `${role}:${name}:${creep.ticksToLive}t`);
            mem.agingWarned[name] = true;
        }
    }
    for (const name in mem.agingWarned) {
        if (!Game.creeps[name]) delete mem.agingWarned[name];
    }
    
    // ===== 低能量 =====
    if (room.energyAvailable < 200 && currentCreeps.length === 0) {
        emitEvent('LOW_ENERGY', room.energyAvailable);
    }
    
    // ===== 记录战斗日志 (只在检测到战斗时) =====
    if (combatDetected) {
        recordCombatLog(room, combatTrigger);
    }
    
    // ===== 建筑完成检测 (每 10 ticks) =====
    if (Game.time % 10 === 0) {
        const structures = room.find(FIND_MY_STRUCTURES);
        const counts = {};
        for (const s of structures) {
            counts[s.structureType] = (counts[s.structureType] || 0) + 1;
        }
        
        if (mem.extensionCount !== undefined && (counts.extension || 0) > mem.extensionCount) {
            emitEvent('EXTENSION_BUILT', counts.extension);
        }
        mem.extensionCount = counts.extension || 0;
        
        if (mem.towerCount !== undefined && (counts.tower || 0) > mem.towerCount) {
            emitEvent('TOWER_BUILT', counts.tower);
        }
        mem.towerCount = counts.tower || 0;
        
        if (mem.storageCount !== undefined && (counts.storage || 0) > mem.storageCount) {
            emitEvent('STORAGE_BUILT', counts.storage);
        }
        mem.storageCount = counts.storage || 0;
    }
    
    Memory.events = mem;
}

// ========== 配置 ==========

function getCreepTargets(room) {
    const level = room.controller.level;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    
    // 2 Sources 最多产 20 energy/tick
    // 3 Harvester (9 WORK) = 18 energy/tick, 足够
    if (level <= 2) {
        return { harvester: 4, builder: sites > 0 ? 3 : 1, upgrader: 3 };
    } else if (level === 3) {
        // RCL3: 优先升级到 RCL4
        return { harvester: 3, builder: sites > 0 ? 2 : 0, upgrader: 4 };
    } else if (level === 4) {
        // RCL4: 建造完成后全力升级
        // 无工地时: 3h + 4u = 最大化升级速度
        return { harvester: 3, builder: sites > 0 ? 2 : 1, upgrader: sites > 0 ? 3 : 4 };
    } else {
        // RCL5+: 平衡配置
        return { harvester: 3, builder: sites > 0 ? 2 : 1, upgrader: 3 };
    }
}

function getBody(role, energy) {
    if (energy >= 550) {
        if (role === 'harvester' || role === 'upgrader') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
        }
        return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    } else if (energy >= 400) {
        return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    } else if (energy >= 300) {
        return [WORK, WORK, CARRY, MOVE];
    }
    return [WORK, CARRY, MOVE];
}

function getBuildPositions(spawn) {
    const sx = spawn.pos.x, sy = spawn.pos.y;
    return {
        // RCL2: 5, RCL3: 10, RCL4: 20, RCL5: 30
        // 包含备用位置以防某些位置被占用
        extensions: [
            // Ring 1 (positions 1-4)
            {x: sx-1, y: sy-1}, {x: sx+1, y: sy-1}, {x: sx-1, y: sy+1}, {x: sx+1, y: sy+1},
            // Ring 2 (positions 5-10) - 注意 sy-2 可能被 Tower 占用
            {x: sx+2, y: sy}, {x: sx-2, y: sy}, {x: sx, y: sy-2}, {x: sx, y: sy+2},
            {x: sx+2, y: sy-1}, {x: sx-2, y: sy-1},
            // Ring 3 (positions 11-22) - for RCL4, 含备用位置
            {x: sx+2, y: sy+1}, {x: sx-2, y: sy+1}, {x: sx+3, y: sy}, {x: sx-3, y: sy},
            {x: sx+3, y: sy-1}, {x: sx-3, y: sy-1}, {x: sx+3, y: sy+1}, {x: sx-3, y: sy+1},
            {x: sx+2, y: sy-2}, {x: sx-2, y: sy-2},
            {x: sx+4, y: sy}, {x: sx-4, y: sy},  // 备用位置
            // Ring 4 (positions 23-34) - for RCL5, 含备用位置
            {x: sx+2, y: sy+2}, {x: sx-2, y: sy+2}, {x: sx+1, y: sy-3}, {x: sx-1, y: sy-3},
            {x: sx+1, y: sy+3}, {x: sx-1, y: sy+3}, {x: sx+3, y: sy-2}, {x: sx-3, y: sy-2},
            {x: sx+3, y: sy+2}, {x: sx-3, y: sy+2},
            {x: sx+4, y: sy-1}, {x: sx-4, y: sy-1}  // 备用位置
        ],
        towers: [{x: sx, y: sy-2}, {x: sx-2, y: sy-2}],  // 2nd tower for RCL5
        storage: [{x: sx-1, y: sy}]  // Storage for RCL4
    };
}

// ========== 主循环 ==========

module.exports.loop = function () {
    // 清理
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) delete Memory.creeps[name];
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
    
    // Creep 管理
    const targets = getCreepTargets(room);
    const counts = { harvester: 0, builder: 0, upgrader: 0 };
    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (counts[role] !== undefined) counts[role]++;
    }
    
    // 建筑规划
    if (Game.time % 50 === 0) planBuildings(room, controller.level, spawn);
    
    // 孵化
    if (!spawn.spawning) {
        const energy = room.energyAvailable;
        const capacity = room.energyCapacityAvailable;
        const totalCreeps = Object.keys(Game.creeps).length;
        const totalNeeded = targets.harvester + targets.builder + targets.upgrader;
        
        // 检查是否有 creep 即将死亡（需要预防性孵化）
        // TTL < 孵化时间(body*3) + 移动到Source时间(~50) + 缓冲(50) ≈ 150 ticks
        const creepsByRole = { harvester: [], builder: [], upgrader: [] };
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            const role = creep.memory.role;
            if (creepsByRole[role]) {
                creepsByRole[role].push(creep);
            }
        }
        
        // 确定孵化优先级和能量门槛
        const isEmergency = counts.harvester < 2;  // 紧急：几乎没有 harvester
        const isLowHarvester = counts.harvester < 3;
        const isRecovery = totalCreeps < totalNeeded;
        
        // 找出需要孵化的角色（按优先级）
        // 1. 首先确保基础 harvester 数量
        // 2. 然后按比例孵化其他角色
        let roleToSpawn = null;
        
        if (counts.harvester < targets.harvester) {
            roleToSpawn = 'harvester';
        } else if (counts.builder < targets.builder) {
            roleToSpawn = 'builder';
        } else if (counts.upgrader < targets.upgrader) {
            roleToSpawn = 'upgrader';
        }
        
        // 如果所有角色都达到目标，检查是否需要预防性替换
        // 只有当角色数量正好等于目标且有 creep 快死时才替换
        if (!roleToSpawn) {
            for (const role of ['harvester', 'builder', 'upgrader']) {
                const roleCreeps = creepsByRole[role];
                const dyingCount = roleCreeps.filter(c => c.ticksToLive && c.ticksToLive < 150).length;
                // 只有当数量刚好等于目标且有 creep 快死时才预防性孵化
                if (dyingCount > 0 && roleCreeps.length === targets[role]) {
                    roleToSpawn = role;
                    break;
                }
            }
        }
        
        // 设置能量门槛
        let minSpawnEnergy;
        if (isEmergency) {
            minSpawnEnergy = 200;  // 最紧急：任何 creep 都行
        } else if (isLowHarvester) {
            minSpawnEnergy = 300;  // 能量采集不足：快速补充
        } else if (isRecovery) {
            minSpawnEnergy = 400;  // 恢复中：孵化较强 creep
        } else {
            minSpawnEnergy = Math.min(550, capacity);  // 正常：等待最强 creep
        }
        
        // 执行孵化
        if (roleToSpawn && energy >= minSpawnEnergy) {
            const useEnergy = Math.min(capacity, energy);
            const body = getBody(roleToSpawn, useEnergy);
            const name = roleToSpawn + Game.time;
            if (spawn.spawnCreep(body, name, { memory: { role: roleToSpawn } }) === OK) {
                emitEvent('SPAWN_COMPLETE', `${name}:${roleToSpawn}`);
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
        console.log(`[STATUS] T:${Game.time} CPU:${cpu.toFixed(1)} Creeps:${Object.keys(Game.creeps).length} RCL:${controller.level}`);
    }
};

// ========== 建筑规划 ==========

function planBuildings(room, level, spawn) {
    const plans = getBuildPositions(spawn);
    
    const maxExt = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level];
    const curExt = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
    const siteExt = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_EXTENSION }).length;
    
    let needed = maxExt - curExt - siteExt;
    for (const pos of plans.extensions) {
        if (needed <= 0) break;
        if (canBuildAt(room, pos.x, pos.y)) {
            if (room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION) === OK) needed--;
        }
    }
    
    // Tower (RCL3+)
    if (level >= 3) {
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level];
        const curTowers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        const siteTowers = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        
        if (curTowers + siteTowers < maxTowers) {
            for (const pos of plans.towers) {
                if (canBuildAt(room, pos.x, pos.y)) {
                    room.createConstructionSite(pos.x, pos.y, STRUCTURE_TOWER);
                    break;
                }
            }
        }
    }
    
    // Storage (RCL4+)
    if (level >= 4 && plans.storage) {
        const curStorage = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_STORAGE }).length;
        const siteStorage = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_STORAGE }).length;
        
        if (curStorage + siteStorage === 0) {
            for (const pos of plans.storage) {
                if (canBuildAt(room, pos.x, pos.y)) {
                    room.createConstructionSite(pos.x, pos.y, STRUCTURE_STORAGE);
                    break;
                }
            }
        }
    }
    
    // Rampart 保护关键建筑 (RCL2+)
    if (level >= 2) {
        // 保护 Spawn
        const spawnRampart = room.lookForAt(LOOK_STRUCTURES, spawn.pos.x, spawn.pos.y)
            .some(s => s.structureType === STRUCTURE_RAMPART);
        const spawnRampartSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, spawn.pos.x, spawn.pos.y)
            .some(s => s.structureType === STRUCTURE_RAMPART);
        if (!spawnRampart && !spawnRampartSite) {
            room.createConstructionSite(spawn.pos.x, spawn.pos.y, STRUCTURE_RAMPART);
        }
        
        // 保护 Tower
        const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
        for (const tower of towers) {
            const hasRampart = room.lookForAt(LOOK_STRUCTURES, tower.pos.x, tower.pos.y)
                .some(s => s.structureType === STRUCTURE_RAMPART);
            const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, tower.pos.x, tower.pos.y)
                .some(s => s.structureType === STRUCTURE_RAMPART);
            if (!hasRampart && !hasSite) {
                room.createConstructionSite(tower.pos.x, tower.pos.y, STRUCTURE_RAMPART);
            }
        }
    }
}

function canBuildAt(room, x, y) {
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    return room.lookForAt(LOOK_STRUCTURES, x, y).length === 0 &&
           room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length === 0 &&
           room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL;
}

// ========== Tower ==========

function runTowers(room) {
    const towers = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
    
    for (const tower of towers) {
        // 优先攻击敌人
        const enemy = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) { tower.attack(enemy); continue; }
        
        // 修复受损建筑 (不含 walls)
        const damaged = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.hits < s.hitsMax * 0.5 && 
                        s.structureType !== STRUCTURE_WALL
        });
        if (damaged && tower.store[RESOURCE_ENERGY] > 500) { tower.repair(damaged); continue; }
        
        // 空闲时加固 Ramparts (目标 100K HP，与 builder 保持一致)
        const weakRampart = tower.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < 100000
        });
        if (weakRampart && tower.store[RESOURCE_ENERGY] > 700) tower.repair(weakRampart);
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
            // 优先填充 Spawn 和 Extensions (用于孵化)
            target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN ||
                             s.structureType === STRUCTURE_EXTENSION) &&
                             s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });
            // 其次填充 Tower (保持防御)
            if (!target) {
                target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_TOWER &&
                                 s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                });
            }
            // 最后存入 Storage
            if (!target) {
                target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_STORAGE &&
                                 s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                });
            }
            creep.memory.targetId = target ? target.id : null;
        }
        if (target) {
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(target, {reusePath: 5});
        } else {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller, {reusePath: 5});
        }
    } else {
        // 优先从 Storage 取能量
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 0) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {reusePath: 5});
            }
            return;
        }
        // 否则采集
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source, {reusePath: 5});
    }
}

function runUpgrader(creep) {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) creep.memory.working = false;
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) creep.memory.working = true;
    
    if (creep.memory.working) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller, {reusePath: 5});
    } else {
        // 优先从 Storage 取能量
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 0) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, {reusePath: 5});
            }
            return;
        }
        // 否则采集
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source, {reusePath: 5});
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
        
        // 验证目标是否仍然有效
        if (target) {
            // 如果是 Rampart 且已达到目标 HP，清除缓存
            if (target.structureType === STRUCTURE_RAMPART && target.hits >= 100000) {
                target = null;
                delete creep.memory.targetId;
            }
        }
        
        if (!target) {
            // 优先级: 工地 > 弱 Ramparts > 升级控制器
            const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
            target = sites.find(s => s.structureType === STRUCTURE_TOWER) ||
                     sites.find(s => s.structureType === STRUCTURE_EXTENSION) ||
                     sites[0];
            
            // 如果没有工地，修复 Ramparts (目标 100K HP)
            if (!target) {
                // 找最弱的 Rampart 优先修复
                const weakRamparts = creep.room.find(FIND_MY_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_RAMPART && s.hits < 100000
                });
                if (weakRamparts.length > 0) {
                    weakRamparts.sort((a, b) => a.hits - b.hits);
                    target = weakRamparts[0];
                }
            }
            creep.memory.targetId = target ? target.id : null;
        }
        
        if (target) {
            // 判断是建造还是修复
            if (target.progressTotal !== undefined) {
                // Construction site
                if (creep.build(target) === ERR_NOT_IN_RANGE) creep.moveTo(target, {reusePath: 5});
            } else {
                // Repair rampart
                if (creep.repair(target) === ERR_NOT_IN_RANGE) creep.moveTo(target, {reusePath: 5});
            }
        } else {
            // 没有任务时升级控制器
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) creep.moveTo(creep.room.controller, {reusePath: 5});
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source, {reusePath: 5});
    }
}
