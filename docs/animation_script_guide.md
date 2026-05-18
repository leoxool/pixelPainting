# 动画脚本说明书 v2.0

> 本说明书详细介绍了 Pixel 动画系统的脚本语法、22个动画命令的功能参数、时序控制技巧以及电影化镜头语言的实现方法。

---

## 目录

1. [脚本基础语法](#1-脚本基础语法)
2. [时间与时序控制](#2-时间与时序控制)
3. [相机命令](#3-相机命令)
4. [灯光命令](#4-灯光命令)
5. [笔刷形态动画](#5-笔刷形态动画)
6. [数组效果](#6-数组效果)
7. [转场效果](#7-转场效果)
8. [后处理效果](#8-后处理效果)
9. [电影化镜头语言](#9-电影化镜头语言)
10. [脚本范例](#10-脚本范例)

---

## 1. 脚本基础语法

### 1.1 基本格式

```
指令名 参数名: 值 time: 秒数 [duration: 秒数]
```

- 注释以 `#` 开头
- 参数以空格分隔
- 向量格式: `{x, y, z}`
- 时间单位: 秒 (seconds)

### 1.2 时间参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `time` | 命令开始时间 | `time: 0` 表示动画开始时立即执行 |
| `duration` | 动画持续时间 | `duration: 3` 表示持续3秒 |

### 1.3 向量格式

```javascript
// 二维/三维坐标
position: {500, 400, 0}
offset: {0, 2, 5}

// 颜色 (HEX格式)
color: #ffaa00
color: #1a1a2e
```

---

## 2. 时间与时序控制

### 2.1 时间是最关键的参数

```javascript
# 错误示例 - 命令堆积在时间点0
CAMERA position: {0, 0, 1000} time: 0    // 实际在 0s 执行
LIGHT_INTENSITY type: ambient value: 0.5 time: 0  // 也在 0s 执行
FORMATION type: circle spacing: 50 time: 0        // 也在 0s 执行

# 正确示例 - 合理分配时间
CAMERA position: {0, 0, 1000} time: 0          // 相机在 0s 开始移动
LIGHT_INTENSITY type: ambient value: 0.5 time: 0 duration: 2  // 灯光在 0s 渐亮
FORMATION type: circle spacing: 50 time: 3 duration: 3       // 队形在 3s 开始形成
```

### 2.2 时序编排原则

```
0s ──────────────────────────────────────────────── 20s

[相机移动]     ══════════════►  (2s)
                    [灯光渐亮]  ═══►        (1s)
                              [队形变化]        ════════════════►  (3s)
                                          [相机旋转]  ══════════►  (持续)
```

### 2.3 并发与串行

```javascript
# 并发执行 - 同一time值
CAMERA position: {0, 0, 800} time: 2 duration: 2
LIGHT_INTENSITY type: ambient value: 0.8 time: 2 duration: 2
// 相机移动和灯光变化同时开始

# 串行执行 - 交错time值
CAMERA position: {0, 0, 800} time: 2 duration: 2
CAMERA position: {500, 200, 1000} time: 5 duration: 2
// 第一个相机移动完成后，第二个才开始
```

### 2.4 衔接时间计算

```javascript
# 计算: 当前time = 之前time + 之前duration
CAMERA position: {0, 0, 800} time: 0 duration: 2   // 0s开始, 2s结束
LIGHT_INTENSITY type: ambient value: 0.8 time: 2 duration: 1  // 2s开始(正确)
// 错误: time: 1 会导致灯光在相机移动还未完成时就开始
```

---

## 3. 相机命令

### 3.1 CAMERA - 基础相机移动

```javascript
CAMERA position: {x, y, z} lookAt: {x, y, z} time: N [duration: M] [fov: N] [transition: ease-in-out]
```

**参数说明:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `position` | Vector3 | 相机目标位置 |
| `lookAt` | Vector3 | 相机注视点 |
| `time` | number | 开始时间 |
| `duration` | number | 移动持续时间 (默认2s) |
| `fov` | number | 视野角度 (默认60°) |
| `transition` | string | 缓动函数: `linear`, `ease-in-out` |

**示例:**
```javascript
# 基础相机移动
CAMERA position: {900, 450, 1000} lookAt: {0, 0, 0} time: 0 duration: 2

# 带FOV动画的推进
CAMERA position: {500, 250, 600} lookAt: {0, 0, 0} time: 5 duration: 3 fov: 40

# 平滑过渡到侧面视角
CAMERA position: {1000, 0, 500} lookAt: {0, 0, 0} time: 10 duration: 4 transition: ease-in-out
```

### 3.2 CAMERA_ZOOM - 焦距变化

```javascript
CAMERA_ZOOM fov: 度数 time: N duration: M
```

**示例:**
```javascript
# 快速推进 (FOV减小 = 放大)
CAMERA_ZOOM fov: 30 time: 2 duration: 1

# 拉远镜头 (FOV增大 = 缩小)
CAMERA_ZOOM fov: 90 time: 8 duration: 2
```

### 3.3 CAMERA_MODE - 相机模式

```javascript
CAMERA_MODE mode: fixed|follow|orbit time: N
```

**模式说明:**

| 模式 | 说明 |
|------|------|
| `fixed` | 固定相机位置 |
| `follow` | 跟随目标笔刷 |
| `orbit` | 环绕模式 |

**示例:**
```javascript
CAMERA_MODE mode: orbit time: 15
```

### 3.4 CAMERA_ORBIT - 环绕轨道

```javascript
CAMERA_ORBIT radius: 数值 speed: 数值 height: 数值 time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `radius` | 轨道半径 | 500-2000 |
| `speed` | 旋转速度 (弧度/s) | 0.05-0.3 |
| `height` | 轨道高度 | 0-500 |

**示例:**
```javascript
# 缓慢环绕 (10秒一圈: speed = 2π/10 ≈ 0.628)
CAMERA_ORBIT radius: 1000 speed: 0.15 height: 300 time: 4

# 快速环绕
CAMERA_ORBIT radius: 800 speed: 0.5 height: 200 time: 10
```

### 3.5 CAMERA_SHAKE - 相机抖动

```javascript
CAMERA_SHAKE intensity: 数值 frequency: 数值 duration: 数值 time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `intensity` | 抖动强度 (像素) | 5-30 |
| `frequency` | 抖动频率 (Hz) | 3-10 |
| `duration` | 持续时间 | 0.3-2 |

**示例:**
```javascript
# 轻微抖动 (如手持摄影)
CAMERA_SHAKE intensity: 5 frequency: 5 duration: 0.5 time: 3

# 剧烈抖动 (如爆炸冲击)
CAMERA_SHAKE intensity: 30 frequency: 10 duration: 1 time: 8
```

### 3.6 CAMERA_PATH - 路径动画

```javascript
CAMERA_PATH points: [{x1,y1,z1},{x2,y2,z2},{x3,y3,z3}] time: N duration: M
```

**示例:**
```javascript
# 三点路径穿过动画
CAMERA_PATH points: [{0,0,1000},{500,500,800},{1000,0,1000}] time: 2 duration: 5

# 弧形路径
CAMERA_PATH points: [{0,0,1000},{500,800,600},{1000,0,1000}] time: 0 duration: 4
```

### 3.7 ORBIT_BRUSH - 环绕笔刷

```javascript
ORBIT_BRUSH brushId: ID radius: 数值 speed: 数值 height: 数值 time: N
```

**示例:**
```javascript
ORBIT_BRUSH brushId: brush_50 radius: 200 speed: 0.2 height: 50 time: 5
```

### 3.8 RANDOM_FOLLOW - 随机跟随

```javascript
RANDOM_FOLLOW speed: 数值 radius: 数值 time: N duration: M
```

**示例:**
```javascript
# 随机在笔刷间切换跟随目标
RANDOM_FOLLOW speed: 0.5 radius: 300 time: 3 duration: 10
```

### 3.9 RANDOM_ORBIT_BRUSH - 随机目标环绕

```javascript
RANDOM_ORBIT_BRUSH radius: 数值 speed: 数值 [height: 数值] [changeInterval: 数值] time: N duration: M
```

**参数说明:**

| 参数 | 说明 |
|------|------|
| `radius` | 环绕半径 |
| `speed` | 环绕速度 (弧度/秒) |
| `height` | 高度偏移 (默认50) |
| `changeInterval` | 目标切换间隔 (秒，默认2) |

**示例:**
```javascript
# 相机环绕随机笔刷，每2秒切换目标
RANDOM_ORBIT_BRUSH radius: 200 speed: 0.3 height: 50 changeInterval: 2 time: 0 duration: 8

# 快速环绕
RANDOM_ORBIT_BRUSH radius: 150 speed: 0.5 height: 30 changeInterval: 1 time: 5 duration: 5
```

---

## 4. 灯光命令

### 4.1 LIGHT_INTENSITY - 灯光强度

```javascript
LIGHT_INTENSITY type: ambient|directional|point value: 0-1 time: N duration: M
```

**示例:**
```javascript
# 环境光渐亮
LIGHT_INTENSITY type: ambient value: 0.8 time: 0 duration: 2

# 主光灯减弱
LIGHT_INTENSITY type: directional value: 0.3 time: 5 duration: 3
```

### 4.2 LIGHT_COLOR - 灯光颜色

```javascript
LIGHT_COLOR type: ambient|directional|point color: #RRGGBB time: N duration: M
```

**色温示例:**
```javascript
# 暖色调 (日出/日落效果)
LIGHT_COLOR type: ambient color: #ffaa66 time: 0 duration: 2
LIGHT_COLOR type: directional color: #ffcc88 time: 0 duration: 2

# 冷色调 (夜景/月光)
LIGHT_COLOR type: ambient color: #4466aa time: 10 duration: 3

# 蓝紫色调 (超现实效果)
LIGHT_COLOR type: point color: #aa44ff time: 5 duration: 2
```

### 4.3 BACKGROUND_COLOR - 背景颜色

```javascript
BACKGROUND_COLOR color: #RRGGBB time: N duration: M
```

**示例:**
```javascript
# 渐变到深蓝色背景
BACKGROUND_COLOR color: #0a0a1a time: 8 duration: 3

# 纯白过渡 (闪光效果)
BACKGROUND_COLOR color: #ffffff time: 15 duration: 0.5
```

### 4.4 FOG - 雾效

```javascript
FOG near: 数值 far: 数值 color: #RRGGBB time: N duration: M
```

**参数说明:**

| 参数 | 说明 |
|------|------|
| `near` | 雾效近裁面 |
| `far` | 雾效远裁面 |
| `color` | 雾的颜色 |

**示例:**
```javascript
# 淡雾效果
FOG near: 100 far: 2000 color: #1a1a2e time: 3 duration: 2

# 浓雾 (隐藏远处笔刷)
FOG near: 500 far: 1500 color: #0a0a0a time: 10 duration: 4
```

### 4.5 SPOT_LIGHT - 聚光灯

```javascript
SPOT_LIGHT position: {x,y,z} target: {x,y,z} intensity: N angle: N penumbra: N time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `position` | 灯光位置 | - |
| `target` | 照射目标 | - |
| `intensity` | 强度 | 0.5-2 |
| `angle` | 照射角度 | 0.3-0.8 |
| `penumbra` | 半影 (柔和度) | 0.2-0.5 |

**示例:**
```javascript
SPOT_LIGHT position: {500, 500, 500} target: {0, 0, 0} intensity: 1.5 angle: 0.5 penumbra: 0.3 time: 5
```

---

## 5. 笔刷形态动画

### 5.1 SWIRL - 漩涡动画

```javascript
SWIRL centerX: 数值 centerY: 数值 radius: 数值 speed: 数值 [direction: cw|ccw] time: N duration: M
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `centerX` | 漩涡中心X | 画布中心 |
| `centerY` | 漩涡中心Y | 画布中心 |
| `radius` | 旋转半径 | 200-500 |
| `speed` | 旋转速度 (圈/秒) | 0.1-1 |
| `direction` | 方向: `cw`(顺时针)/`ccw`(逆时针) | cw |

**示例:**
```javascript
# 中心漩涡
SWIRL centerX: 500 centerY: 400 radius: 300 speed: 0.3 time: 2 duration: 4

# 大范围缓慢漩涡
SWIRL centerX: 500 centerY: 400 radius: 500 speed: 0.1 direction: ccw time: 0 duration: 6
```

### 5.2 AERIAL_DANCE - 空中舞蹈

```javascript
AERIAL_DANCE height: 数值 frequency: 数值 phase: 数值 [amplitude: 数值] time: N duration: M
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `height` | 上升高度 | 50-200 |
| `frequency` | 波动频率 (Hz) | 0.2-1 |
| `phase` | 相位偏移 | 0-6.28 |
| `amplitude` | 横向振幅 | 20-50 |

**示例:**
```javascript
# 轻柔飘动
AERIAL_DANCE height: 100 frequency: 0.3 phase: 0 amplitude: 30 time: 3 duration: 5

# 波浪起伏
AERIAL_DANCE height: 150 frequency: 0.5 phase: 1.57 amplitude: 40 time: 0 duration: 4
```

### 5.3 ORBIT_AXIS - 轴向环绕

```javascript
ORBIT_AXIS axis: x|y|z radius: 数值 speed: 数值 [heightAmplitude: 数值] time: N duration: M
```

**轴向说明:**

| 轴 | 效果 |
|----|------|
| `x` | 笔刷在X轴平面内旋转 |
| `y` | 笔刷在Y轴平面内旋转 (常用) |
| `z` | 笔刷在Z轴平面内旋转 |

**示例:**
```javascript
# Y轴旋转 (水平旋转)
ORBIT_AXIS axis: y radius: 200 speed: 0.3 heightAmplitude: 50 time: 2 duration: 4

# 垂直旋转
ORBIT_AXIS axis: x radius: 150 speed: 0.4 heightAmplitude: 30 time: 5 duration: 3
```

### 5.4 BEZIER_FLIGHT - 贝塞尔飞行

```javascript
BEZIER_FLIGHT cp1: {x,y,z} cp2: {x,y,z} cp3: {x,y,z} time: N duration: M
```

**参数说明:**

| 参数 | 说明 |
|------|------|
| `cp1` | 控制点1 (起始点) |
| `cp2` | 控制点2 (曲线弯曲) |
| `cp3` | 控制点3 (结束点) |

**示例:**
```javascript
# 弧形飞行路径
BEZIER_FLIGHT cp1: {0,0,0} cp2: {500,300,100} cp3: {1000,0,0} time: 0 duration: 3

# 波浪路径
BEZIER_FLIGHT cp1: {0,500,0} cp2: {500,-200,200} cp3: {1000,500,0} time: 3 duration: 4
```

---

## 6. 单笔刷控制

### 6.1 ROTATE_BRUSH - 单笔刷旋转

```javascript
ROTATE_BRUSH axis: x|y|z speed: 数值 [duration: 数值] time: N
```

**参数说明:**

| 参数 | 说明 |
|------|------|
| `axis` | 旋转轴 (x/y/z) |
| `speed` | 旋转速度 (度/秒) |
| `duration` | 持续时间 (秒，默认3) |

**示例:**
```javascript
# Z轴旋转
ROTATE_BRUSH axis: z speed: 90 time: 2 duration: 3

# Y轴旋转
ROTATE_BRUSH axis: y speed: 120 time: 0 duration: 2

# X轴旋转
ROTATE_BRUSH axis: x speed: 60 time: 5 duration: 4
```

### 6.2 RANDOM_ROAM - 笔刷随机漫游

```javascript
RANDOM_ROAM speed: 数值 amplitude: 数值 [changeInterval: 数值] [duration: 数值] time: N
```

**参数说明:**

| 参数 | 说明 |
|------|------|
| `speed` | 移动速度 |
| `amplitude` | 漫游幅度 (离原始位置的最大偏移) |
| `changeInterval` | 方向切换间隔 (秒，默认2) |
| `duration` | 持续时间 (秒) |

**示例:**
```javascript
# 缓慢漫游
RANDOM_ROAM speed: 0.3 amplitude: 80 time: 0 duration: 6

# 快速漫游
RANDOM_ROAM speed: 0.8 amplitude: 120 changeInterval: 1.5 time: 3 duration: 5
```

---

## 7. 数组效果

### 6.1 WAVE - 波浪效果

```javascript
WAVE direction: x|y|diagonal amplitude: 数值 frequency: 数值 [speed: 数值] time: N duration: M
```

**示例:**
```javascript
# 垂直波浪
WAVE direction: y amplitude: 50 frequency: 2 speed: 0.5 time: 2 duration: 4

# 斜向波浪
WAVE direction: diagonal amplitude: 40 frequency: 1.5 speed: 0.3 time: 0 duration: 5

# 横向波浪
WAVE direction: x amplitude: 30 frequency: 3 speed: 0.8 time: 3 duration: 3
```

### 6.2 OSCILLATE - 振荡效果

```javascript
OSCILLATE centerX: 数值 centerY: 数值 amplitudeX: 数值 amplitudeY: 数值 frequency: 数值 [phase: 数值] time: N duration: M
```

**示例:**
```javascript
# 中心点振荡
OSCILLATE centerX: 500 centerY: 400 amplitudeX: 100 amplitudeY: 50 frequency: 0.5 phase: 0 time: 2 duration: 4

# 不同相位差的多组振荡
OSCILLATE centerX: 500 centerY: 400 amplitudeX: 80 amplitudeY: 80 frequency: 0.3 phase: 1.57 time: 0 duration: 6
```

### 6.3 PULSE - 脉冲效果

```javascript
PULSE centerX: 数值 centerY: 数值 minScale: 数值 maxScale: 数值 speed: 数值 time: N duration: M
```

**示例:**
```javascript
# 轻微脉动
PULSE centerX: 500 centerY: 400 minScale: 0.8 maxScale: 1.2 speed: 1 time: 2 duration: 4

# 强烈脉动 (呼吸效果)
PULSE centerX: 500 centerY: 400 minScale: 0.5 maxScale: 1.5 speed: 0.5 time: 0 duration: 6
```

### 6.4 ARRAY_ROTATE - 数组旋转

```javascript
ARRAY_ROTATE centerX: 数值 centerY: 数值 speed: 数值 [direction: cw|ccw] time: N duration: M
```

**示例:**
```javascript
# 顺时针旋转
ARRAY_ROTATE centerX: 500 centerY: 400 speed: 30 direction: cw time: 2 duration: 4

# 逆时针快速旋转
ARRAY_ROTATE centerX: 500 centerY: 400 speed: 60 direction: ccw time: 5 duration: 3
```

### 6.5 ARRAY_SCALE - 数组缩放

```javascript
ARRAY_SCALE centerX: 数值 centerY: 数值 minScale: 数值 maxScale: 数值 speed: 数值 time: N duration: M
```

**示例:**
```javascript
# 呼吸式缩放
ARRAY_SCALE centerX: 500 centerY: 400 minScale: 0.7 maxScale: 1.3 speed: 0.5 time: 0 duration: 6

# 放大后缩小
ARRAY_SCALE centerX: 500 centerY: 400 minScale: 0.3 maxScale: 1.8 speed: 0.3 time: 3 duration: 5
```

---

## 7. 转场效果

### 7.1 EXPLOSION - 爆炸扩散

```javascript
EXPLOSION centerX: 数值 centerY: 数值 [centerZ: 数值] speed: 数值 time: N duration: M
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `centerX` | 爆炸中心X | - |
| `centerY` | 爆炸中心Y | - |
| `centerZ` | 爆炸中心Z (可选) | 0 |
| `speed` | 扩散速度 | 200-800 |

**示例:**
```javascript
# 中心爆炸
EXPLOSION centerX: 500 centerY: 400 speed: 500 time: 2 duration: 1.5

# 从左上角爆炸
EXPLOSION centerX: 0 centerY: 0 speed: 600 time: 5 duration: 2
```

### 7.2 IMPLOSION - 内爆聚拢

```javascript
IMPLOSION centerX: 数值 centerY: 数值 [centerZ: 数值] speed: 数值 time: N duration: M
```

**示例:**
```javascript
# 向中心聚拢
IMPLOSION centerX: 500 centerY: 400 speed: 300 time: 8 duration: 2

# 聚拢后爆炸
IMPLOSION centerX: 500 centerY: 400 speed: 400 time: 2 duration: 1.5
EXPLOSION centerX: 500 centerY: 400 speed: 600 time: 4 duration: 1.5
```

### 7.3 COLOR_FLASH - 颜色闪烁

```javascript
COLOR_FLASH color: #RRGGBB duration: 数值 [intensity: 数值] time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `color` | 闪光颜色 | - |
| `duration` | 闪光持续时间 | 0.1-1 |
| `intensity` | 闪光强度 | 0.3-1 |

**示例:**
```javascript
# 白色闪光 (如相机闪光灯)
COLOR_FLASH color: #ffffff duration: 0.3 intensity: 0.8 time: 3

# 红色闪烁 (警示效果)
COLOR_FLASH color: #ff0000 duration: 0.5 intensity: 0.6 time: 8

# 黄色闪光 (爆炸前兆)
COLOR_FLASH color: #ffaa00 duration: 0.2 intensity: 0.9 time: 5
```

### 7.4 STROBE - 频闪效果

```javascript
STROBE color: #RRGGBB frequency: 数值 [duration: 数值] time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `color` | 频闪颜色 | - |
| `frequency` | 闪烁频率 (次/秒) | 5-20 |
| `duration` | 持续时间 | 0.5-3 |

**示例:**
```javascript
# 快速白色频闪 (迪斯科效果)
STROBE color: #ffffff frequency: 10 duration: 2 time: 10

# 红色危险频闪
STROBE color: #ff0000 frequency: 5 duration: 1.5 time: 3
```

### 7.5 RACK_FOCUS - 焦点拉动

```javascript
RACK_FOCUS startDistance: 数值 endDistance: 数值 [duration: 数值] time: N
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `startDistance` | 起始焦距 | 0.1-0.5 |
| `endDistance` | 结束焦距 | 0.5-1 |
| `duration` | 过渡时间 | 0.5-2 |

**示例:**
```javascript
# 从近景拉到远景
RACK_FOCUS startDistance: 0.1 endDistance: 0.9 duration: 1.5 time: 5

# 浅景深效果 (焦距从大到小)
RACK_FOCUS startDistance: 0.8 endDistance: 0.2 duration: 1 time: 2
```

---

## 8. 后处理效果

### 8.1 DOF_BLUR - 景深模糊

```javascript
DOF_BLUR amount: 0-1 time: N duration: M
```

**示例:**
```javascript
# 逐渐模糊背景
DOF_BLUR amount: 0.5 time: 3 duration: 2

# 强烈模糊
DOF_BLUR amount: 0.8 time: 8 duration: 1
```

### 8.2 DOF_FOCUS - 焦点设置

```javascript
DOF_FOCUS distance: 0-1 time: N duration: M
```

**示例:**
```javascript
# 聚焦到远处
DOF_FOCUS distance: 0.8 time: 5 duration: 2

# 聚焦到近处
DOF_FOCUS distance: 0.2 time: 2 duration: 1.5
```

### 8.3 VIGNETTE - 暗角效果

```javascript
VIGNETTE darkness: 数值 offset: 数值 time: N duration: M
```

**参数说明:**

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `darkness` | 暗角深度 | 0.8-1.5 |
| `offset` | 暗角范围 | 0.5-1.5 |

**示例:**
```javascript
# 电影感暗角
VIGNETTE darkness: 1.2 offset: 1.0 time: 0 duration: 1

# 强烈暗角 (晕影效果)
VIGNETTE darkness: 1.5 offset: 0.8 time: 5 duration: 2
```

---

## 9. 电影化镜头语言

### 9.1 开场建立镜头

```javascript
# 缓慢从远拉近
CAMERA position: {0, 0, 2000} lookAt: {500, 400, 0} time: 0
CAMERA position: {500, 400, 800} lookAt: {500, 400, 0} time: 4 duration: 6 fov: 60

# 环境灯光渐亮
LIGHT_INTENSITY type: ambient value: 0.2 time: 0 duration: 1
LIGHT_INTENSITY type: ambient value: 0.7 time: 3 duration: 4

# 展示队形
FORMATION type: circle spacing: 40 time: 6 duration: 4
```

### 9.2 推进特写镜头

```javascript
# 稳定推进 ( Dolly Zoom 效果)
CAMERA position: {500, 400, 1200} lookAt: {500, 400, 0} time: 0 fov: 60
CAMERA position: {500, 400, 400} lookAt: {500, 400, 0} time: 5 duration: 4 fov: 30

# 相机抖动 (手持感)
CAMERA_SHAKE intensity: 3 frequency: 4 duration: 0.5 time: 9
```

### 9.3 环绕镜头

```javascript
# 开始队形
FORMATION type: reference index: 0 time: 0 duration: 3

# 相机开始环绕
CAMERA_MODE mode: orbit time: 3
CAMERA_ORBIT radius: 1200 speed: 0.1 height: 200 time: 3

# 保持环绕直到结束
CAMERA_MODE mode: orbit time: 15
```

### 9.4 爆炸转场

```javascript
# 建立场景
CAMERA position: {500, 400, 1000} lookAt: {500, 400, 0} time: 0
FORMATION type: circle spacing: 50 time: 2 duration: 3

# 爆炸
EXPLOSION centerX: 500 centerY: 400 speed: 600 time: 6 duration: 1.5

# 闪光过渡
COLOR_FLASH color: #ffffff duration: 0.3 intensity: 1 time: 7.5

# 切换到新场景 (颜色变化)
BACKGROUND_COLOR color: #0a0a1a time: 8 duration: 1
LIGHT_INTENSITY type: ambient value: 0.3 time: 8 duration: 2

# 新队形
FORMATION type: grid spacing: 60 time: 10 duration: 3
```

### 9.5 焦点拉动转场

```javascript
# 前景笔刷清晰
DOF_BLUR amount: 0.3 time: 0 duration: 1
DOF_FOCUS distance: 0.2 time: 0 duration: 1

# 缓慢拉动焦点到背景
RACK_FOCUS startDistance: 0.2 endDistance: 0.9 duration: 3 time: 4

# 背景清晰后，切换队形
DOF_FOCUS distance: 0.9 time: 7 duration: 1
FORMATION type: reference index: 1 time: 8 duration: 3
```

### 9.6 波浪转场

```javascript
# 第一阶段: 波浪效果
WAVE direction: y amplitude: 80 frequency: 2 speed: 0.5 time: 0 duration: 4

# 第二阶段: 脉冲过渡
PULSE centerX: 500 centerY: 400 minScale: 0.6 maxScale: 1.4 speed: 2 time: 4 duration: 2

# 第三阶段: 新队形
FORMATION type: circle spacing: 40 time: 6 duration: 3
```

### 9.7 频闪剪辑

```javascript
# 建立场景
CAMERA position: {500, 400, 800} lookAt: {500, 400, 0} time: 0
FORMATION type: circle spacing: 50 time: 2 duration: 3

# 频闪效果
STROBE color: #ffffff frequency: 15 duration: 0.5 time: 6

# 快速切换
BACKGROUND_COLOR color: #000000 time: 6.5 duration: 0.1

# 新场景
DOF_BLUR amount: 0.6 time: 7 duration: 1
CAMERA position: {0, 0, 1500} lookAt: {500, 400, 0} time: 7 duration: 2
FORMATION type: grid spacing: 40 time: 8 duration: 3
```

### 9.8 升格镜头 (Slow Motion 效果)

通过组合灯光和笔刷动画实现"升格"感:

```javascript
# 灯光闪烁营造氛围
LIGHT_INTENSITY type: ambient value: 0.4 time: 0
LIGHT_COLOR type: point color: #ff6600 time: 0 duration: 3

# 缓慢的队形变化
FORMATION type: circle spacing: 40 time: 2 duration: 8

# 相机缓慢环绕
CAMERA_ORBIT radius: 1500 speed: 0.05 height: 100 time: 2

# 波浪起伏
WAVE direction: y amplitude: 40 frequency: 0.5 speed: 0.2 time: 5 duration: 10
```

### 9.9 降格镜头 (Speed Ramp)

```javascript
# 开场: 慢动作感 (远距离)
CAMERA position: {500, 400, 1500} lookAt: {500, 400, 0} time: 0 fov: 50
LIGHT_INTENSITY type: ambient value: 0.5 time: 0 duration: 2

# 中段: 加速推进
CAMERA position: {500, 400, 800} lookAt: {500, 400, 0} time: 5 duration: 3 fov: 40
CAMERA_SHAKE intensity: 8 frequency: 6 duration: 0.5 time: 8

# 结尾: 快速定镜
CAMERA position: {500, 400, 400} lookAt: {500, 400, 0} time: 10 duration: 1 fov: 30
EXPLOSION centerX: 500 centerY: 400 speed: 800 time: 11 duration: 1
```

---

## 10. 脚本范例

### 10.1 完整开场动画

```javascript
# ═══════════════════════════════════════════════════════════
# 电影化开场 - 笔刷从散乱到聚合成图像
# ═══════════════════════════════════════════════════════════

# 初始状态 - 笔刷散落, 相机远景
CAMERA position: {0, 0, 2500} lookAt: {500, 400, 0} time: 0 fov: 60

# 灯光设置 - 冷色调开始
LIGHT_INTENSITY type: ambient value: 0.2 time: 0 duration: 1
LIGHT_COLOR type: ambient color: #334466 time: 0 duration: 2

# 阶段1: 笔刷飞入聚拢 (0-4秒)
BRUSH_FLIGHT duration: 3 scatter: 800 time: 0 direction: left

# 阶段2: 聚合成圆形 (4-8秒)
FORMATION type: circle spacing: 50 time: 4 duration: 4

# 灯光渐暖
LIGHT_INTENSITY type: ambient value: 0.6 time: 4 duration: 3
LIGHT_COLOR type: ambient color: #fffaF0 time: 4 duration: 3

# 阶段3: 相机推进 (8-12秒)
CAMERA position: {500, 400, 1200} lookAt: {500, 400, 0} time: 8 duration: 4 fov: 45

# 阶段4: 转换到参考图 (12-16秒)
COLOR_FLASH color: #ffffff duration: 0.3 intensity: 0.7 time: 12
BACKGROUND_COLOR color: #0a0a0a time: 12 duration: 0.5
FORMATION type: reference index: 0 time: 13 duration: 3

# 阶段5: 最终定镜 (16-20秒)
CAMERA position: {500, 400, 800} lookAt: {500, 400, 0} time: 16 duration: 3 fov: 35
VIGNETTE darkness: 1.3 offset: 1.0 time: 17 duration: 2
```

### 10.2 节奏感音乐同步

```javascript
# ═══════════════════════════════════════════════════════════
# BPM 120 - 每拍 0.5秒, 每小节 8拍/4秒
# ═══════════════════════════════════════════════════════════

# 开场定镜 (第1-2小节)
CAMERA position: {500, 400, 1000} lookAt: {500, 400, 0} time: 0 fov: 50

# 第3小节: 灯光渐亮
LIGHT_INTENSITY type: ambient value: 0.5 time: 4 duration: 2
LIGHT_INTENSITY type: directional value: 0.7 time: 4 duration: 2

# 第4小节: 相机开始移动
CAMERA_ORBIT radius: 1200 speed: 0.1 height: 200 time: 8
CAMERA_MODE mode: orbit time: 8

# 第5-6小节: 队形变化 + 波浪
FORMATION type: circle spacing: 45 time: 8 duration: 4
WAVE direction: y amplitude: 50 frequency: 2 speed: 0.5 time: 12 duration: 4

# 第7小节: 笔刷飞舞
ARRAY_ROTATE centerX: 500 centerY: 400 speed: 45 direction: cw time: 16 duration: 4

# 第8小节: 高潮 - 爆炸效果
EXPLOSION centerX: 500 centerY: 400 speed: 700 time: 20 duration: 2
COLOR_FLASH color: #ffffff duration: 0.4 intensity: 1 time: 22

# 第9小节: 收尾 - 聚拢
CAMERA position: {500, 400, 600} lookAt: {500, 400, 0} time: 24 duration: 3 fov: 35
IMPLOSION centerX: 500 centerY: 400 speed: 400 time: 24 duration: 3
```

### 10.3 焦点拉动测试

```javascript
# 测试焦点拉动效果
CAMERA position: {500, 400, 800} lookAt: {500, 400, 0} time: 0

# 近景清晰
DOF_BLUR amount: 0.2 time: 0 duration: 1
DOF_FOCUS distance: 0.15 time: 0 duration: 1

# 等待2秒
# 拉动焦点到远处
RACK_FOCUS startDistance: 0.15 endDistance: 0.9 duration: 2 time: 3

# 等待2秒
# 再拉回来
RACK_FOCUS startDistance: 0.9 endDistance: 0.15 duration: 2 time: 7
```

### 10.4 笔刷动画形态测试

```javascript
# 测试各种笔刷形态

# 先聚合笔刷
FORMATION type: circle spacing: 40 time: 0 duration: 3

# 1. 漩涡效果 (3-8秒)
SWIRL centerX: 500 centerY: 400 radius: 300 speed: 0.3 time: 3 duration: 5

# 2. 空中舞蹈 (8-13秒)
AERIAL_DANCE height: 150 frequency: 0.4 phase: 0 amplitude: 40 time: 9 duration: 5

# 3. 轴向环绕 (13-18秒)
ORBIT_AXIS axis: y radius: 200 speed: 0.3 heightAmplitude: 50 time: 15 duration: 5
```

### 10.5 灯光氛围测试

```javascript
# 灯光和背景氛围测试

# 日出效果
LIGHT_INTENSITY type: ambient value: 0.3 time: 0 duration: 2
LIGHT_COLOR type: ambient color: #ff6633 time: 0 duration: 3
LIGHT_COLOR type: directional color: #ffaa55 time: 0 duration: 3

# 渐变到夜景
BACKGROUND_COLOR color: #0a0a1a time: 5 duration: 5
LIGHT_INTENSITY type: ambient value: 0.15 time: 5 duration: 5
LIGHT_COLOR type: ambient color: #223366 time: 5 duration: 5
FOG near: 200 far: 1500 color: #0a0a1a time: 5 duration: 5

# 聚光灯效果
SPOT_LIGHT position: {500, 800, 500} target: {500, 400, 0} intensity: 1.2 angle: 0.6 penumbra: 0.4 time: 12
```

### 10.6 综合电影化镜头

```javascript
# ═══════════════════════════════════════════════════════════
# 电影化镜头综合示例
# 包含: 环绕、景深、灯光变化、转场
# ═══════════════════════════════════════════════════════════

# 初始状态
CAMERA position: {0, 0, 2000} lookAt: {500, 400, 0} time: 0 fov: 55
LIGHT_INTENSITY type: ambient value: 0.4 time: 0 duration: 2

# 阶段1: 建立场景 (0-4秒)
CAMERA position: {500, 400, 1500} lookAt: {500, 400, 0} time: 2 duration: 3 fov: 50
FORMATION type: circle spacing: 50 time: 3 duration: 3

# 阶段2: 相机环绕 (4-12秒)
CAMERA_ORBIT radius: 1500 speed: 0.08 height: 300 time: 6
CAMERA_MODE mode: orbit time: 6

# 灯光变化 - 暖色调
LIGHT_COLOR type: ambient color: #fffaF0 time: 6 duration: 4
LIGHT_INTENSITY type: directional value: 0.9 time: 6 duration: 4

# 阶段3: 波浪效果 (8-14秒)
WAVE direction: y amplitude: 60 frequency: 1.5 speed: 0.4 time: 10 duration: 6

# 阶段4: 推进特写 (14-18秒)
CAMERA position: {500, 400, 600} lookAt: {500, 400, 0} time: 16 duration: 4 fov: 30
CAMERA_SHAKE intensity: 5 frequency: 5 duration: 0.5 time: 20

# 阶段5: 爆炸转场 (20-23秒)
EXPLOSION centerX: 500 centerY: 400 speed: 800 time: 20 duration: 1.5
COLOR_FLASH color: #ffffff duration: 0.3 intensity: 0.9 time: 21.5

# 阶段6: 新场景 (23-28秒)
BACKGROUND_COLOR color: #050510 time: 22 duration: 1
CAMERA position: {500, 400, 1000} lookAt: {500, 400, 0} time: 23 duration: 2 fov: 45
FORMATION type: grid spacing: 60 time: 24 duration: 4

# 阶段7: 收尾暗角
VIGNETTE darkness: 1.4 offset: 1.1 time: 26 duration: 2
```

---

## 附录: 命令速查表

### 相机命令

| 命令 | 用途 |
|------|------|
| `CAMERA` | 相机位置/注视点移动 |
| `CAMERA_ZOOM` | FOV焦距变化 |
| `CAMERA_MODE` | 相机模式切换 |
| `CAMERA_ORBIT` | 环绕轨道运动 |
| `CAMERA_SHAKE` | 相机抖动 |
| `CAMERA_PATH` | 路径动画 |
| `ORBIT_BRUSH` | 环绕笔刷 |
| `RANDOM_FOLLOW` | 随机跟随 |
| `RANDOM_ORBIT_BRUSH` | 随机目标环绕 |

### 灯光命令

| 命令 | 用途 |
|------|------|
| `LIGHT_INTENSITY` | 灯光强度 |
| `LIGHT_COLOR` | 灯光颜色 |
| `BACKGROUND_COLOR` | 背景颜色 |
| `FOG` | 雾效 |
| `SPOT_LIGHT` | 聚光灯 |

### 笔刷形态

| 命令 | 用途 |
|------|------|
| `SWIRL` | 漩涡动画 |
| `AERIAL_DANCE` | 空中舞蹈 |
| `ORBIT_AXIS` | 轴向环绕 |
| `BEZIER_FLIGHT` | 贝塞尔飞行 |

### 单笔刷控制

| 命令 | 用途 |
|------|------|
| `ROTATE_BRUSH` | 单笔刷旋转 |
| `RANDOM_ROAM` | 笔刷随机漫游 |

### 数组效果

| 命令 | 用途 |
|------|------|
| `WAVE` | 波浪效果 |
| `OSCILLATE` | 振荡效果 |
| `PULSE` | 脉冲效果 |
| `ARRAY_ROTATE` | 数组旋转 |
| `ARRAY_SCALE` | 数组缩放 |

### 转场效果

| 命令 | 用途 |
|------|------|
| `EXPLOSION` | 爆炸扩散 |
| `IMPLOSION` | 内爆聚拢 |
| `COLOR_FLASH` | 颜色闪烁 |
| `STROBE` | 频闪效果 |
| `RACK_FOCUS` | 焦点拉动 |

### 后处理

| 命令 | 用途 |
|------|------|
| `DOF_BLUR` | 景深模糊 |
| `DOF_FOCUS` | 焦点设置 |
| `VIGNETTE` | 暗角效果 |

---

*文档版本: 2.1*
*更新时间: 2026-05-18*