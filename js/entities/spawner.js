import { LANES } from '../core/constants.js';
import { lists, run, view } from '../core/state.js';
import { makeOrb, spawnPooledObstacle, spawnPooledOrb } from './obstacles.js';

function buildPatternPlan(freeLane) {
  const plan = [];
  for (let lane = 0; lane < 3; lane++) {
    if (lane === freeLane) continue;
    if (Math.random() < 0.75) {
      plan.push({ lane, type: Math.random() < 0.4 ? 'low' : 'wall' });
    } else if (Math.random() < 0.5) {
      plan.push({ lane, type: 'orb' });
    }
  }
  return plan;
}

function isGuidedPattern(plan) {
  return plan.filter(item => item.type === 'wall' || item.type === 'low').length === 2;
}

export function spawnPattern(overshoot = 0, gap = 15) {
  const maxV_safe = 5 + run.speed * 0.27;
  const a = 150;
  const t_acc = maxV_safe / a;
  const x_acc = 0.5 * a * t_acc * t_acc;
  const dx_min_swap = 4.35;
  const t_double_min = dx_min_swap <= x_acc ? Math.sqrt(2 * dx_min_swap / a) : (t_acc + (dx_min_swap - x_acc) / maxV_safe);
  const transTime = run.lastPatternDist === -Infinity ? Infinity : gap / Math.max(run.speed, 1);
  const cannotDoubleSwap = transTime < t_double_min;

  if (Math.random() < 0.18) {
    const lane = (Math.random() * 3) | 0;
    for (let i = 0; i < 5; i++) {
      const o = spawnPooledOrb(view.scene, LANES[lane], 1.2, -140 - i * 2 + overshoot);
      lists.orbs.push(o);
    }
    const nextValid = new Set();
    for (let cur = 0; cur < 3; cur++) {
      for (const prev of run.validPrevLanes) {
        if (!cannotDoubleSwap || Math.abs(cur - prev) <= 1) {
          nextValid.add(cur);
          break;
        }
      }
    }
    run.validPrevLanes = nextValid.size > 0 ? nextValid : new Set([0, 1, 2]);
    run.lastPatternDist = run.dist;
    return;
  }

  let freeLane;
  if (cannotDoubleSwap) {
    // 反向拓扑加权抽样（ch1 + c2）：扣除后置避险守卫向中道注入的额外安全开口偏置（标定值 0.052）
    const r = Math.random();
    freeLane = r < 0.052 ? 1 : (r < 0.526 ? 0 : 2);
  } else {
    freeLane = (Math.random() * 3) | 0;
  }
  let plan = buildPatternPlan(freeLane);

  let obsSet = new Set(
    plan.filter(item => item.type === 'wall' || item.type === 'low').map(item => item.lane)
  );

  if (cannotDoubleSwap) {
    const needFrom0 = run.validPrevLanes.has(0);
    const canReachFrom0 = !obsSet.has(0) || !obsSet.has(1);
    const needFrom2 = run.validPrevLanes.has(2);
    const canReachFrom2 = !obsSet.has(2) || !obsSet.has(1);
    if ((needFrom0 && !canReachFrom0) || (needFrom2 && !canReachFrom2)) {
      let candidateOpenLanes = [];
      if (needFrom0 && needFrom2) {
        candidateOpenLanes = [1];
      } else if (needFrom0) {
        candidateOpenLanes = [0, 1];
      } else if (needFrom2) {
        candidateOpenLanes = [1, 2];
      } else {
        candidateOpenLanes = [0, 1, 2];
      }
      const chosenOpenLane = candidateOpenLanes[(Math.random() * candidateOpenLanes.length) | 0];
      const originalObsCount = obsSet.size;
      if (originalObsCount === 2) {
        // 保阶重构（h1）：将不可达的 2 障碍波次重写为合法可达车道集的 2 障碍排列，按原生概率采样类型
        plan = [];
        obsSet = new Set();
        for (let l = 0; l < 3; l++) {
          if (l === chosenOpenLane) {
            plan.push({ lane: l, type: 'orb' });
          } else {
            const type = Math.random() < 0.4 ? 'low' : 'wall';
            plan.push({ lane: l, type });
            obsSet.add(l);
          }
        }
      } else {
        plan = plan.filter(item => item.lane !== chosenOpenLane || (item.type !== 'wall' && item.type !== 'low'));
        plan.push({ lane: chosenOpenLane, type: 'orb' });
        obsSet.delete(chosenOpenLane);
      }
      freeLane = chosenOpenLane;
    }
  }

  const openLanes = [0, 1, 2].filter(l => !obsSet.has(l));
  const nextValid = new Set();
  for (const cur of openLanes) {
    for (const prev of run.validPrevLanes) {
      if (!cannotDoubleSwap || Math.abs(cur - prev) <= 1) {
        nextValid.add(cur);
        break;
      }
    }
  }
  run.validPrevLanes = nextValid.size > 0 ? nextValid : new Set(openLanes);
  run.lastPatternDist = run.dist;

  for (const item of plan) {
    if (item.type === 'wall' || item.type === 'low') {
      const obj = spawnPooledObstacle(view.scene, item.type, item.lane, -140 + overshoot);
      lists.obstacles.push(obj);
    } else {
      const o = spawnPooledOrb(view.scene, LANES[item.lane], 1.2, -140 + overshoot);
      lists.orbs.push(o);
    }
  }
  if (Math.random() < 0.6) {
    for (let i = 1; i <= 3 + ((Math.random() * 3) | 0); i++) {
      const o = spawnPooledOrb(view.scene, LANES[freeLane], 1.2, -140 - i * 2 + overshoot);
      lists.orbs.push(o);
    }
  }
}

