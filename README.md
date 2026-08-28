# NEON RACER — 霓虹狂飙

一款赛博朋克风格的 3D 悬浮艇竞速躲避网页游戏。零依赖、单文件、纯前端，打开即玩。

**▶ 立即游玩：[https://flufy3d.github.io/neon-racer/](https://flufy3d.github.io/neon-racer/)**

![NEON RACER](https://img.shields.io/badge/Three.js-0.160-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## 玩法

驾驶霓虹悬浮艇在无尽赛道上飞驰，躲避障碍、收集能量球，速度会越来越快——你能活多久？

- **连击系统**：2.5 秒内连续吃球叠加倍率（最高 ×6），分数滚雪球
- **擦身而过 +30** / **完美跳跃 +40**：高风险走位有额外奖励
- **机体进化**：收集能量球解锁 5 级形态，外观与场景同步变色
- **动态 BGM**：鼓点节奏随车速实时加快，引擎轰鸣随速度升调

## 形态与能力

| 形态 | 能量球 | 外观 | 能力 |
|------|--------|------|------|
| 初始形态 | 0 | 青色 | — |
| T1 引擎过载 | 15 | 绿色 | 横移速度 +8% |
| T2 能量护盾 | 35 | 黄色 + 光环 | 护盾抵挡一次撞击（30 球充能） |
| T3 磁力场 | 65 | 橙色 | 自动吸附附近能量球 |
| T4 究极形态 | 100 | 品红 | 所有得分 ×2 |

## 操作

| 平台 | 操作 |
|------|------|
| 键盘 | `← →` / `A D` 左右移动 · `↑` / `空格` 跳跃 |
| 触屏 | 按住左右半屏移动 · 上滑跳跃 · 两指分按左右半屏急停并锁定最近跑道 |

支持桌面与移动端（iPad 横屏体验最佳），右下角 ⛶ 可进入全屏。

## 技术

- [Three.js](https://threejs.org/) 渲染 + UnrealBloom 辉光后期
- WebAudio 全程序化合成音效（无任何音频文件）
- 单 HTML 文件，无构建步骤，GitHub Pages 直接托管

## 本地运行

```bash
npx serve .
```

或 `python -m http.server 8000`，然后浏览器打开对应地址（ES 模块需通过 HTTP 访问）。

## 项目结构

```
index.html      页面骨架
style.css       全部样式
js/game.js      主逻辑（场景、循环、碰撞、输入）
js/audio.js     WebAudio 程序化音效
js/ui.js        HUD 与视觉反馈
```

## License

MIT
