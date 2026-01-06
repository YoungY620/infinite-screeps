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
    }
};

// 期望的 Creep 数量
const CREEP_TARGETS = {
    harvester: 2,
    upgrader: 1
};

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
    
    // 3. 孵化缺少的 Creep
    const spawn = Game.spawns['Spawn1'];
    if (spawn && !spawn.spawning) {
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
    
    // 4. 运行所有 Creep
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = creep.memory.role;
        if (ROLES[role]) {
            ROLES[role].run(creep);
        }
    }
};

/**
 * Harvester: 采集能量 -> 送回 Spawn
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
            // 如果 Spawn 满了，升级控制器
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
