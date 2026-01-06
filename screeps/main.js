/**
 * Screeps Eternal - Main Loop
 * 
 * 设计原则:
 * 1. CPU 极度稀缺 (20/tick)，每行代码都有成本
 * 2. 代码必须简单、可靠、高效
 * 3. 生存第一，发展第二
 */

// 角色配置
const ROLES = {
    harvester: {
        body: [WORK, CARRY, MOVE],  // 成本: 200
        run: runHarvester
    },
    upgrader: {
        body: [WORK, CARRY, MOVE],  // 成本: 200
        run: runUpgrader
    },
    builder: {
        body: [WORK, CARRY, MOVE],  // 成本: 200
        run: runBuilder
    }
};

// 期望的 Creep 数量
const CREEP_TARGETS = {
    harvester: 2,
    builder: 1,
    upgrader: 1
};

// Extension 布局 (相对于 Spawn 的位置)
// Spawn1 在 (25, 23)，规划紧凑的 Extension 布局
const EXTENSION_POSITIONS = [
    {x: 24, y: 22},  // 左上
    {x: 26, y: 22},  // 右上
    {x: 24, y: 24},  // 左下
    {x: 26, y: 24},  // 右下
    {x: 27, y: 23},  // 右边
];

module.exports.loop = function () {
    // 1. 清理已死亡 Creep 的内存
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
    
    // 2. 统计各角色数量
    const counts = {};
    for (const role in CREEP_TARGETS) {
        counts[role] = 0;
    }
    for (const name in Game.creeps) {
        const role = Game.creeps[name].memory.role;
        if (counts[role] !== undefined) {
            counts[role]++;
        }
    }
    
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;
    
    // 3. 规划 Extension (Level 2+ 时)
    // 首次或每 100 ticks 检查一次
    if (spawn.room.controller.level >= 2) {
        const extCount = spawn.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        }).length;
        const siteCount = spawn.room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        }).length;
        // 如果没有任何 Extension 或建造点，或者每 100 tick
        if ((extCount === 0 && siteCount === 0) || Game.time % 100 === 0) {
            planExtensions(spawn.room);
        }
    }
    
    // 4. 孵化缺少的 Creep
    if (!spawn.spawning) {
        for (const role in CREEP_TARGETS) {
            if (counts[role] < CREEP_TARGETS[role]) {
                const name = role + Game.time;
                const result = spawn.spawnCreep(ROLES[role].body, name, {
                    memory: { role: role }
                });
                if (result === OK) {
                    console.log('Spawning:', name);
                }
                break;  // 一次只孵化一个
            }
        }
    }
    
    // 5. 运行所有 Creep
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = creep.memory.role;
        if (ROLES[role]) {
            ROLES[role].run(creep);
        }
    }
};

/**
 * 规划 Extension 建造点
 */
function planExtensions(room) {
    // 获取当前控制器等级允许的 Extension 数量
    const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    
    // 统计现有的 Extension 和建造点
    const existingCount = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    
    const sitesCount = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    
    // 需要建造的数量
    const needed = maxExtensions - existingCount - sitesCount;
    
    if (needed > 0) {
        let placed = 0;
        for (const pos of EXTENSION_POSITIONS) {
            if (placed >= needed) break;
            
            // 检查位置是否已有建筑或建造点
            const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
            const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y);
            
            if (structures.length === 0 && sites.length === 0) {
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
                if (result === OK) {
                    console.log('Created Extension site at', pos.x, pos.y);
                    placed++;
                }
            }
        }
    }
}

/**
 * Harvester: 采集能量 -> 送回 Spawn/Extension
 */
function runHarvester(creep) {
    // 状态切换
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
    }
    
    if (creep.memory.working) {
        // 送回能量到 Spawn 或 Extension
        const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
            filter: (s) => (s.structureType === STRUCTURE_SPAWN ||
                          s.structureType === STRUCTURE_EXTENSION) &&
                          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (target) {
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
        } else {
            // 如果存储满了，升级控制器
            const controller = creep.room.controller;
            if (controller) {
                if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller);
                }
            }
        }
    } else {
        // 采集能量
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            }
        }
    }
}

/**
 * Upgrader: 采集能量 -> 升级控制器
 */
function runUpgrader(creep) {
    // 状态切换
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
    }
    
    if (creep.memory.working) {
        // 升级控制器
        const controller = creep.room.controller;
        if (controller) {
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller);
            }
        }
    } else {
        // 采集能量
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            }
        }
    }
}

/**
 * Builder: 采集能量 -> 建造
 */
function runBuilder(creep) {
    // 状态切换
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
        creep.memory.working = false;
    }
    if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
        creep.memory.working = true;
    }
    
    if (creep.memory.working) {
        // 建造最近的建造点
        const target = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
        if (target) {
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target);
            }
        } else {
            // 没有建造点时，升级控制器
            const controller = creep.room.controller;
            if (controller) {
                if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller);
                }
            }
        }
    } else {
        // 采集能量
        const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
        if (source) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            }
        }
    }
}
