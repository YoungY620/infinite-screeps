/**
 * Screeps Eternal - Aggressive Development Mode v2
 * 
 * 策略: 利用保护期激进发展，同时为保护期结束做防御准备
 * 
 * v2 改进:
 * - 动态获取 Spawn 位置，不再硬编码
 * - 增加容错性和日志记录
 * - 支持任意房间布局
 */

// ========== 配置 ==========

// 根据控制器等级动态调整 Creep 数量
function getCreepTargets(room) {
    const level = room.controller.level;
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
    
    if (level <= 2) {
        // 保护期激进发展
        return {
            harvester: 4,  // 最大化能量采集
            builder: constructionSites > 0 ? 3 : 1,
            upgrader: 3    // 快速升级
        };
    } else if (level === 3) {
        // Level 3: 优先建造 Tower
        return {
            harvester: 4,
            builder: constructionSites > 0 ? 2 : 1,
            upgrader: 2
        };
    } else {
        // Level 4+: 稳定发展
        return {
            harvester: 3,
            builder: constructionSites > 0 ? 2 : 1,
            upgrader: 2
        };
    }
}

// 根据可用能量动态调整 body
function getBody(role, energyAvailable) {
    if (energyAvailable >= 550) {
        if (role === 'harvester') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; // 550
        } else if (role === 'upgrader') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; // 550
        } else {
            return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]; // 500
        }
    } else if (energyAvailable >= 400) {
        return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; // 400
    } else if (energyAvailable >= 300) {
        return [WORK, WORK, CARRY, MOVE]; // 300
    } else {
        return [WORK, CARRY, MOVE]; // 200
    }
}

// 动态计算建筑位置（基于 Spawn 位置）
function getBuildPositions(spawn) {
    const sx = spawn.pos.x;
    const sy = spawn.pos.y;
    
    return {
        extensions: [
            // 第一圈 (5个 for Level 2)
            {x: sx - 1, y: sy - 1}, {x: sx + 1, y: sy - 1},
            {x: sx - 1, y: sy + 1}, {x: sx + 1, y: sy + 1}, {x: sx + 2, y: sy},
            // 第二圈 (5个 for Level 3)
            {x: sx - 2, y: sy - 1}, {x: sx + 2, y: sy - 1},
            {x: sx - 2, y: sy + 1}, {x: sx + 2, y: sy + 1}, {x: sx + 3, y: sy}
        ],
        towers: [
            {x: sx, y: sy - 2}  // Tower 在 Spawn 上方
        ],
        ramparts: [
            {x: sx, y: sy},      // 保护 Spawn
            {x: sx, y: sy - 2}   // 保护 Tower
        ]
    };
}

// ========== 主循环 ==========

module.exports.loop = function () {
    const cpuStart = Game.cpu.getUsed();
    
    // 1. 清理死亡 Creep 的内存
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    
    // 2. 获取 Spawn (容错: 支持任意名称的 Spawn)
    const spawns = Object.values(Game.spawns);
    if (spawns.length === 0) {
        // 没有 Spawn，记录错误并退出
        if (!Memory.lastError || Game.time - Memory.lastError.time > 100) {
            Memory.lastError = { time: Game.time, msg: 'No spawns available' };
            console.log('[ERROR] No spawns available!');
        }
        return;
    }
    const spawn = spawns[0];
    const room = spawn.room;
    const controller = room.controller;
    
    // 3. 获取动态目标
    const CREEP_TARGETS = getCreepTargets(room);
    
    // 4. 统计各角色数量
    const counts = { harvester: 0, builder: 0, upgrader: 0 };
    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (counts[role] !== undefined) {
            counts[role]++;
        }
    }
    
    // 5. 建筑规划 (每 50 ticks 检查一次)
    if (Game.time % 50 === 0) {
        planBuildings(room, controller.level, spawn);
    }
    
    // 6. 孵化 Creep
    if (!spawn.spawning) {
        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        
        // 优先级: harvester > builder > upgrader
        const priority = ['harvester', 'builder', 'upgrader'];
        
        for (const role of priority) {
            if (counts[role] < CREEP_TARGETS[role]) {
                const minEnergy = energyCapacity >= 400 ? 
                    Math.min(energyCapacity, energyAvailable) : 200;
                
                if (energyAvailable >= minEnergy) {
                    const body = getBody(role, minEnergy);
                    const name = role + Game.time;
                    const result = spawn.spawnCreep(body, name, {
                        memory: { role: role }
                    });
                    if (result === OK) {
                        console.log(`[SPAWN] ${role}: ${name} [${body.length} parts]`);
                    }
                }
                break;
            }
        }
    }
    
    // 7. 运行所有 Creep
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = creep.memory.role;
        
        if (role === 'harvester') {
            runHarvester(creep);
        } else if (role === 'upgrader') {
            runUpgrader(creep);
        } else if (role === 'builder') {
            runBuilder(creep);
        }
    }
    
    // 8. Tower 自动防御
    runTowers(room);
    
    // 9. 状态监控 (每 100 ticks)
    if (Game.time % 100 === 0) {
        const cpuUsed = Game.cpu.getUsed();
        const creepCount = Object.keys(Game.creeps).length;
        console.log(`[STATUS] CPU: ${cpuUsed.toFixed(1)}/20 | Creeps: ${creepCount} | Level: ${controller.level} | Progress: ${controller.progress}/${controller.progressTotal}`);
        
        // 记录状态到 Memory
        Memory.stats = {
            time: Game.time,
            cpu: cpuUsed,
            creeps: creepCount,
            level: controller.level,
            progress: controller.progress
        };
    }
};

// ========== 建筑规划 ==========

function planBuildings(room, level, spawn) {
    const BUILD_PLANS = getBuildPositions(spawn);
    
    // Extension 规划
    const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level];
    const currentExtensions = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    
    const neededExtensions = maxExtensions - currentExtensions - extensionSites;
    if (neededExtensions > 0) {
        let placed = 0;
        for (const pos of BUILD_PLANS.extensions) {
            if (placed >= neededExtensions) break;
            if (canBuildAt(room, pos.x, pos.y)) {
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
                if (result === OK) {
                    console.log(`[BUILD] Extension at (${pos.x},${pos.y})`);
                    placed++;
                }
            }
        }
    }
    
    // Level 3+: Tower 规划
    if (level >= 3) {
        const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level];
        const currentTowers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        }).length;
        const towerSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_TOWER
        }).length;
        
        if (currentTowers + towerSites < maxTowers) {
            for (const pos of BUILD_PLANS.towers) {
                if (canBuildAt(room, pos.x, pos.y)) {
                    const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_TOWER);
                    if (result === OK) {
                        console.log(`[BUILD] 🏰 TOWER at (${pos.x},${pos.y}) - PRIORITY!`);
                    }
                    break;
                }
            }
        }
        
        // Rampart 保护关键建筑
        for (const pos of BUILD_PLANS.ramparts) {
            const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
            const hasRampart = structures.some(s => s.structureType === STRUCTURE_RAMPART);
            if (!hasRampart && structures.length > 0) {
                const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y);
                if (!sites.some(s => s.structureType === STRUCTURE_RAMPART)) {
                    room.createConstructionSite(pos.x, pos.y, STRUCTURE_RAMPART);
                    console.log(`[BUILD] 🛡️ Rampart at (${pos.x},${pos.y})`);
                }
            }
        }
    }
}

function canBuildAt(room, x, y) {
    // 边界检查
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    const terrain = room.getTerrain().get(x, y);
    return structures.length === 0 && sites.length === 0 && terrain !== TERRAIN_MASK_WALL;
}

// ========== Tower 防御 ==========

function runTowers(room) {
    const towers = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_TOWER
    });
    
    for (const tower of towers) {
        // 优先攻击敌人
        const enemy = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemy) {
            tower.attack(enemy);
            continue;
        }
        
        // 修复受损建筑 (低于 50% 才修)
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
            const controller = creep.room.controller;
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller, { reusePath: 5 });
            }
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { reusePath: 5 });
            }
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
        const controller = creep.room.controller;
        if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, { reusePath: 5 });
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { reusePath: 5 });
            }
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
            const controller = creep.room.controller;
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller, { reusePath: 5 });
            }
        }
    } else {
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
            creep.memory.sourceId = source ? source.id : null;
        }
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { reusePath: 5 });
            }
        }
    }
}
