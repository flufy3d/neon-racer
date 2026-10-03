// 自适应画质：根据设备档位给出初始渲染分辨率与特效密度，并在运行期按实测帧率
// 动态升降渲染分辨率（必要时继续降低特效密度），避免移动端在特效密集时掉帧。
//
// 渲染分辨率倍率 pixelRatio 同时作用于 WebGLRenderer 的 drawingBuffer 与
// EffectComposer 的离屏 RenderTarget（含 UnrealBloom 的整条 mip 链），因此它
// 是移动端性价比最高的一根性能杠杆。

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

// ?bench=1：测帧率用的自动驾驶模式（见 debug/bench.js）
export const BENCH = params.get('bench') === '1';
// 每局时长（秒），默认 60；排查性能时可加长，如 ?bench=1&benchsec=600
export const BENCH_RUN_SEC = +params.get('benchsec') || 60;

function detectMobile() {
  if (typeof navigator === 'undefined') return false;
  const uaData = navigator.userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile|Silk|Kindle|webOS|BlackBerry|Opera Mini/i.test(ua)) return true;
  // iPadOS 13+ 默认伪装成桌面 Safari：以触摸点 + Mac 平台识别。
  return navigator.maxTouchPoints > 1 && /Macintosh|Mac OS X/.test(ua);
}

function detectLowEnd() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 0;
  const mem = navigator.deviceMemory || 0;
  return (cores > 0 && cores <= 4) || (mem > 0 && mem <= 4);
}

// ── 电视档位 ──
// 由 index.html 头部脚本判定（window.TVShell 或 ?tv=1）并给 <html> 加 tv class。
// 电视盒子 GPU 弱、输出固定 1080p：渲染分辨率按目标高度固定（不看 devicePixelRatio，
// 套壳去掉 dpr 注入后视口可能是 960x540 也可能是 1920x1080），运行期不调档、不重建缓冲。
export const TV = typeof document !== 'undefined' && document.documentElement.classList.contains('tv');
// 渲染高度（物理像素），可用 ?tvres=360 / 405 / 540 覆盖测试
const TV_RENDER_HEIGHT = +params.get('tvres') || 540;
// 辉光档位（?bloom= 覆盖）：full = 原 UnrealBloom；lite = 低分辨率两级辉光；off = 直接渲染无后期
export const TV_BLOOM = ['full', 'lite', 'off'].includes(params.get('bloom')) ? params.get('bloom') : 'lite';
const TV_FX = 0.45;

function tvPixelRatio() {
  return TV_RENDER_HEIGHT / Math.max(1, innerHeight);
}

const mobile = detectMobile();
const lowEnd = mobile && detectLowEnd();
const nativeDpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;

const maxPixelRatio = TV ? tvPixelRatio() : Math.min(nativeDpr, mobile ? 1.5 : 2);
const minPixelRatio = TV ? maxPixelRatio : mobile ? (lowEnd ? 0.7 : 0.8) : 1;

export const quality = {
  tv: TV,
  mobile,
  lowEnd,
  // 特效密度倍率：粒子 / 破片数量统一乘以此值（运行期可继续下调）。
  fx: TV ? TV_FX : mobile ? (lowEnd ? 0.45 : 0.68) : 1,
  pixelRatio: TV ? maxPixelRatio : lowEnd ? Math.min(maxPixelRatio, 1.1) : maxPixelRatio,
  maxPixelRatio,
  minPixelRatio: Math.min(minPixelRatio, maxPixelRatio),
  // 辉光总开关：仅当分辨率与特效密度都已到底仍卡时，才作为最后手段关闭。
  bloom: true
};

let rendererRef = null;
let composerRef = null;
let bloomRef = null;

export function bindQuality(renderer, composer, bloomPass) {
  rendererRef = renderer;
  composerRef = composer;
  bloomRef = bloomPass;
}

// 将当前 pixelRatio 同步到渲染器与后期合成器；仅在倍率变化时调用（会重建 RenderTarget）。
export function applyQuality() {
  if (!rendererRef) return;
  // 电视档位分辨率只随视口高度变化（resize 时），游戏中不调档
  if (TV) quality.pixelRatio = quality.maxPixelRatio = quality.minPixelRatio = tvPixelRatio();
  const pr = quality.pixelRatio;
  rendererRef.setPixelRatio(pr);
  if (composerRef) {
    composerRef.setPixelRatio(pr);
    composerRef.setSize(innerWidth, innerHeight);
  }
  if (bloomRef) bloomRef.enabled = quality.bloom;
}

// ── 运行期自适应 ──
const LOW_FPS = 48;      // 低于此帧率降档
const HIGH_FPS = 57;     // 高于此帧率且连续稳定才升档
const WINDOW_SEC = 1.0;  // 采样窗口
let sampleSum = 0;
let sampleFrames = 0;
let warmup = 1.5;        // 启动 / 刚改过分辨率后忽略采样，防止抖动自激
let goodWindows = 0;

// 分辨率倍率无调节空间（如桌面 1x）时可完全跳过采样开销。
const adaptiveEnabled = !TV && maxPixelRatio > minPixelRatio + 0.01;

export function resetQualityAdaptive() {
  sampleSum = 0;
  sampleFrames = 0;
  warmup = 0.8;
  goodWindows = 0;
}

export function sampleQuality(dt) {
  if (!adaptiveEnabled) return;
  if (!(dt > 0) || dt > 0.25) return; // 后台挂起 / 长卡顿尖峰不纳入采样
  if (warmup > 0) { warmup -= dt; return; }

  sampleSum += dt;
  sampleFrames++;
  if (sampleSum < WINDOW_SEC || sampleFrames < 30) return;

  const fps = sampleFrames / sampleSum;
  sampleSum = 0;
  sampleFrames = 0;

  if (fps < LOW_FPS) {
    goodWindows = 0;
    if (quality.pixelRatio > quality.minPixelRatio + 0.01) {
      quality.pixelRatio = Math.max(quality.minPixelRatio, quality.pixelRatio - 0.15);
      applyQuality();
      warmup = 0.6;
    } else if (quality.fx > 0.4) {
      // 分辨率已到底仍卡：进一步减少粒子 / 破片密度
      quality.fx = Math.max(0.4, quality.fx - 0.12);
      warmup = 0.6;
    } else if (quality.bloom) {
      // 最后手段：关闭辉光后期（对极弱设备，可玩性优先于光效）
      quality.bloom = false;
      applyQuality();
      warmup = 1.0;
    }
  } else if (fps > HIGH_FPS) {
    goodWindows++;
    if (goodWindows >= 2 && quality.pixelRatio < quality.maxPixelRatio - 0.01) {
      goodWindows = 0;
      quality.pixelRatio = Math.min(quality.maxPixelRatio, quality.pixelRatio + 0.05);
      applyQuality();
      warmup = 0.8;
    }
  } else {
    goodWindows = 0;
  }
}
