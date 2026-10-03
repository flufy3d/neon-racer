// 电视档位开局前预热：消除游戏中途第一次出现某种物体时的着色器编译 / 缓冲上传卡顿。
//
// 1. 提前创建所有懒加载的对象池（粒子、冲击波、破片、尾焰、残骸、护甲核心），
//    原本它们在第一次爆发 / 撞击 / 坠毁时才创建，正好卡在游戏进行中。
// 2. 每种按需新建的场景物体（墙、低障、闸门、拱门、路边塔、中继站、信标）各临时放一个进场景，
//    把场景里所有物体（含隐藏的机体形态部件、对象池）临时设为可见，往一个 1x1 离屏缓冲渲染一帧：
//    这一帧会编译所有着色器程序并上传全部几何体与贴图。之后恢复可见性、移除临时物体。
// 离屏渲染不碰画布，开始页上看不到任何痕迹。
import { lists, view } from '../core/state.js';
import {
  armorPool, gatePool, initArmorPool, lowPool, makeGate, makeLow, makeOverheadArch, makeRoadsideRelay, makeRoadsideStructure, makeWall, makeWarpBeacon, wallPool
} from '../entities/obstacles.js';
import {
  burst, initOrbShardPool, initParticlePool, initShardPool, initShipTrailEmitter, initShipWreckage, initShockwavePool,
  resetParticlePools, spawnShockwave
} from '../entities/particles.js';
import * as THREE from 'three';

export function warmupScene() {
  const t0 = performance.now();
  const { scene, camera, renderer } = view;

  initParticlePool();
  initShockwavePool();
  initShardPool();
  initOrbShardPool();
  initShipTrailEmitter();
  initShipWreckage();
  initArmorPool(scene);

  // 粒子 / 冲击波需要非零绘制区间才会真正发起绘制
  burst({ x: 0, y: 1, z: -10 }, 0xffffff, 0.2, 0.3, 1, 8);
  spawnShockwave({ x: 0, y: 0.1, z: -10 }, 0xffffff, 1);

  const temp = [
    makeWall(0, -20), makeLow(1, -20), makeGate(2, -20), makeOverheadArch(-30),
    makeRoadsideStructure(-1, -25), makeRoadsideRelay(1, -25), makeWarpBeacon(-1, -35)
  ];
  for (const o of temp) scene.add(o);

  const hidden = [];
  scene.traverse(o => {
    if (!o.visible) { hidden.push(o); o.visible = true; }
  });
  for (const sf of lists.sideFibres) sf.material.opacity = Math.max(sf.material.opacity, 0.01);

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
  renderer.compile(scene, camera);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  rt.dispose();

  for (const o of hidden) o.visible = false;
  for (const o of temp) scene.remove(o);
  resetParticlePools();
  for (const o of [...wallPool, ...lowPool, ...gatePool, ...armorPool]) o.matrixWorldAutoUpdate = false;
  console.log(`[warmup] ${(performance.now() - t0).toFixed(0)}ms programs=${renderer.info.programs.length}`);
}
