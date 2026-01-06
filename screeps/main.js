/**
 * Screeps Eternal - Aggressive Development Mode
 * 
 * 策略: 利用保护期激进发展，同时为保护期结束做防御准备
 * 
 * 阶段 1 (Level 2): 快速建造 Extension，增加能量容量
 * 阶段 2 (Level 3): 立即建造 Tower，开始防御准备
 * 阶段 3 (Level 3+): 建造 Rampart 保护关键建筑
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
            builder: constructionSites > 0 ? 3 : 1,  // 有建造任务时增加
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
        // 大型 Creep
        if (role === 'harvester') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; // 550
        } else if (role === 'upgrader') {
            return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; // 550
        } else {
            return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]; // 500
        }
    } else if (energyAvailable >= 400) {
        // 中型 Creep
        return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; // 400
    } else if (energyAvailable >= 300) {
        return [WORK, WORK, CARRY, MOVE]; // 300
    } else {
        // 最小配置
        return [WORK, CARRY, MOVE]; // 200
    }
}

// 建筑规划位置 (相对于 Spawn1 at 25,23)
const BUILD_PLANS = {
    extensions: [
        {x: 24, y: 22}, {x: 26, y: 22},
        {x: 24, y: 24}, {x: 26, y: 24}, {x: 27, y: 23},
        // Level 3 增加的 5 个
        {x: 23, y: 22}, {x: 27, y: 22},
        {x: 23, y: 24}, {x: 27, y: 24}, {x: 28, y: 23}
    ],
    towers: [
        {x: 25, y: 21}  // Tower 在 Spawn 上方，便于防御
    ],
    ramparts: [
        // 保护 Spawn
        {x: 25, y: 23},
        // 保护 Tower
        {x: 25, y: 21}
    ]
};

// ========== 主循环 ==========

module.exports.loop = function () {
    const cpuStart = Game.cpu.getUsed();
    
    // 1. 清理死亡 Creep 的内存
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    
    const room = spawn.room;
    const controller = room.controller;
    
    // 2. 获取动态目标
    const CREEP_TARGETS = getCreepTargets(room);
    
    // 3. 统计各角色数量
    const counts = { harvester: 0, builder: 0, upgrader: 0 };
    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (counts[role] !== undefined) {
            counts[role]++;
        }
    }
    
    // 4. 建筑规划 (每 50 ticks 检查一次)
    if (Game.time % 50 === 0) {
        planBuildings(room, controller.level);
    }
    
    // 5. 孵化 Creep
    if (!spawn.spawning) {
        // 计算可用能量 (Spawn + Extensions)
        const energyAvailable = room.energyAvailable;
        const energyCapacity = room.energyCapacityAvailable;
        
        // 优先级: harvester > builder (有建造点时) > upgrader
        const priority = ['harvester', 'builder', 'upgrader'];
        
        for (const role of priority) {
            if (counts[role] < CREEP_TARGETS[role]) {
                // 等能量充足再孵化更大的 Creep
                const minEnergy = energyCapacity >= 400 ? 
                    Math.min(energyCapacity, energyAvailable) : 200;
                
                if (energyAvailable >= minEnergy) {
                    const body = getBody(role, minEnergy);
                    const name = role + Game.time;
                    const result = spawn.spawnCreep(body, name, {
                        memory: { role: role }
                    });
                    if (result === OK) {
                        console.log(`Spawning ${role}: ${name} [${body.length} parts]`);
                    }
                }
                break;
            }
        }
    }
    
    // 6. 运行所有 Creep (CPU 优化版本)
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
    
    // 7. Tower 自动防御
    runTowers(room);
    
    // 8. CPU 监控 (每 100 ticks)
    if (Game.time % 100 === 0) {
        const cpuUsed = Game.cpu.getUsed();
        console.log(`[CPU] ${cpuUsed.toFixed(1)}/20 | Creeps: ${Object.keys(Game.creeps).length} | Level: ${controller.level} | Progress: ${controller.progress}/${controller.progressTotal}`);
    }
};

// ========== 建筑规划 ==========

function planBuildings(room, level) {
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
                room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
                console.log(`[BUILD] Extension site at (${pos.x},${pos.y})`);
                placed++;
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
                    room.createConstructionSite(pos.x, pos.y, STRUCTURE_TOWER);
                    console.log(`[BUILD] 🏰 TOWER site at (${pos.x},${pos.y}) - DEFENSE PRIORITY!`);
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
        
        // 其次修复受损建筑 (低于 50% 才修)
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

// ========== Creep 行为 (CPU 优化版) ==========

/**
 * Harvester: 采集能量 -> 填充 Spawn/Extension/Tower
 * CPU 优化: 缓存目标到 Memory
 */
function runHarvester(creep) {
    // 状态切换
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
        delete creep.memory.targetId;  // 清除缓存
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
        delete creep.memory.targetId;
    }
    
    if (creep.memory.working) {
        // 送能量
        let target = Game.getObjectById(creep.memory.targetId);
        
        // 目标无效或已满，重新查找
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
            // 存储满了，转去升级控制器
            const controller = creep.room.controller;
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller, { reusePath: 5 });
            }
        }
    } else {
        // 采集能量 - 缓存 Source
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

/**
 * Upgrader: 采集能量 -> 升级控制器
 */
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

/**
 * Builder: 采集能量 -> 建造 (优先 Tower)
 */
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
            // 优先建造 Tower
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
            // 没有建造点，转为升级控制器
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
