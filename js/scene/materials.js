import * as THREE from 'three';

// 障碍物单例几何体与材质（消除重复分配与内存泄漏，纯正交赛博边框）
export const wallBoxGeo = new THREE.BoxGeometry(2.4, 3.2, 0.5);

export const wallEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 3.24, 0.52));

export const lowBoxGeo = new THREE.BoxGeometry(2.4, 0.75, 0.5);

export const lowEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 0.77, 0.52));

export const wallScanGeo = new THREE.BoxGeometry(2.38, 0.08, 0.54);

export const lowScanGeo = new THREE.BoxGeometry(2.38, 0.06, 0.54);

export const wallPylonGeo = new THREE.BoxGeometry(0.06, 3.2, 0.54);

export const lowGuideGeo = new THREE.BoxGeometry(2.4, 0.04, 0.52);

export const wallBodyMat = new THREE.MeshBasicMaterial({ color: 0x160610, transparent: true, opacity: 0.92, depthWrite: true });

export const lowBodyMat = new THREE.MeshBasicMaterial({ color: 0x160d04, transparent: true, opacity: 0.92, depthWrite: true });

export const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xff1155 });

export const lowEdgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00 });

export const wallCoreMat = new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

export const lowCoreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

// 能量球共享单例组件（白炽高能核心 + 青金正交双轴陀螺环，杜绝几何体重复实例化）
export const orbCoreGeo = new THREE.SphereGeometry(0.24, 16, 16);

export const orbCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });

export const orbInnerRingGeo = new THREE.TorusGeometry(0.46, 0.035, 8, 24);

export const orbRingMat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });

export const orbOuterRingGeo = new THREE.TorusGeometry(0.68, 0.026, 8, 24);

export const orbRingMat2 = new THREE.MeshBasicMaterial({ color: 0xffd700, fog: false });

export const pillarGeo = new THREE.BoxGeometry(0.3, 5, 0.3);

export const streakGeo = new THREE.BoxGeometry(0.05, 0.05, 1);

export const pillarMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });

export const streakMat = new THREE.MeshBasicMaterial({
  color: 0x66eeff,
  transparent: true,
  opacity: 0.72,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
});

export const towerGeo1 = new THREE.BoxGeometry(3.6, 26, 3.6);

export const towerCapGeo = new THREE.BoxGeometry(4.0, 0.6, 4.0);

export const towerBeaconGeo = new THREE.CylinderGeometry(0.1, 0.35, 5, 8);

export const towerBodyMat = new THREE.MeshBasicMaterial({ color: 0x070716 });

export const towerCapMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });

export const towerSpireMat = new THREE.MeshBasicMaterial({ color: 0xff0088, fog: false });

export const relayBaseGeo = new THREE.CylinderGeometry(2.2, 3.4, 5, 6);

export const relayPillarGeo = new THREE.CylinderGeometry(0.8, 1.2, 14, 8);

export const relayRingGeo = new THREE.TorusGeometry(2.8, 0.16, 8, 24);

export const relayCoreGeo = new THREE.OctahedronGeometry(0.9);

export const archBeamGeo = new THREE.BoxGeometry(12.4, 0.45, 0.7);

export const archPillarGeo = new THREE.BoxGeometry(0.55, 5.6, 0.7);

export const archNeonGeo = new THREE.BoxGeometry(12.2, 0.12, 0.76);

export const archFrameMat = new THREE.MeshBasicMaterial({ color: 0x0b0b1e });

export const archNeonMat = new THREE.MeshBasicMaterial({ color: 0xff00aa, fog: false });

export const beaconPillarGeo = new THREE.CylinderGeometry(0.35, 0.9, 70, 8);

beaconPillarGeo.translate(0, 35, 0);

export const beaconBaseGeo = new THREE.BoxGeometry(3.2, 2.0, 3.2);

export const beaconCoreGeo = new THREE.SphereGeometry(1.2, 12, 12);

export const beaconBeamMat = new THREE.MeshBasicMaterial({
  color: 0xffaa00,
  transparent: true,
  opacity: 0.45,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
});

export const beaconRingMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, fog: false });

// 悬挂闸门共享单例（顶部垂帘式能量闸：唯有滑铲可过；固定紫色识别色）
// 闸体下沿 ≈ 1.75（贴地滑铲 y≈0.57，悬浮 y≈0.95 视觉近距压迫），向上 2.9m，缆索延伸至 7.25
export const gateBoxGeo = new THREE.BoxGeometry(2.4, 2.9, 0.5);

export const gateEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 2.94, 0.52));

export const gateScanGeo = new THREE.BoxGeometry(2.38, 0.08, 0.54);

export const gateBottomGeo = new THREE.BoxGeometry(2.4, 0.1, 0.54);

export const gateCableGeo = new THREE.BoxGeometry(0.07, 2.6, 0.07);

export const gateBodyMat = new THREE.MeshBasicMaterial({ color: 0x0d0518, transparent: true, opacity: 0.92, depthWrite: true });

export const gateEdgeMat = new THREE.LineBasicMaterial({ color: 0xbb44ff });

export const gateCoreMat = new THREE.MeshBasicMaterial({ color: 0xbb44ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

export const gateCableMat = new THREE.MeshBasicMaterial({ color: 0x1a0a2e });

// 护甲核心共享单例（高饱和绿色大晶体 + 顶天立地光柱，与青白能量球强区分）
export const armorCoreGeo = new THREE.OctahedronGeometry(0.44);

export const armorCoreMat = new THREE.MeshBasicMaterial({ color: 0x22ee55, fog: false });

export const armorRingGeo = new THREE.TorusGeometry(0.78, 0.05, 8, 6);

export const armorRingMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, fog: false });

export const armorPillarGeo = new THREE.CylinderGeometry(0.16, 0.16, 8, 8, 1, true);

armorPillarGeo.translate(0, 4, 0);

export const armorPillarMat = new THREE.MeshBasicMaterial({
  color: 0x44ff66,
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
  side: THREE.DoubleSide
});

// 机体应急护甲笼（八面体线框罩，绕机体旋转，比细环更有装甲存在感）
export const shipArmorGeo = new THREE.OctahedronGeometry(1.08);

export const shipArmorMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, wireframe: true, transparent: true, opacity: 0.55, fog: false });

