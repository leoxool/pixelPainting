# 动画脚本系统说明书

## 版本: 2.0
## 更新日期: 2026-05-16
## 核心架构: 统一GSAP Timeline

---

## 一、系统架构

### 1.1 统一时间线设计

**核心改变**: 所有动画命令现在都添加到单一 GSAP Timeline，确保 play/pause/seek 完全同步。

```
┌─────────────────────────────────────────────────────────────────┐
│                     Master Timeline (GSAP)                       │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │Camera    │  │ Lights   │  │ Brushes  │  │ Effects  │        │
│  │Movement  │  │Intensity │  │Flight    │  │ DOF/Vign │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │            │            │            │                 │
│       └────────────┴────────────┴────────────┘                 │
│                      │                                          │
│                      ▼                                          │
│            timeline.play() / pause() / seek(t)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**之前的问题**:
- `play()` 和 `executeScript()` 是两套独立逻辑
- BRUSH_FLIGHT/FORMATION 使用 `setTimeout`，无法与 GSAP timeline 同步
- 暂停/跳转只能控制 camera，无法控制 brush movement

**现在的改进**:
- 所有命令统一添加到 `masterTimeline`
- `timeline.play()`, `pause()`, `seek(t)` 同时控制所有动画
- 精确 seek 到任意时间点，所有状态同步更新

### 1.2 命令执行流程

```
用户点击 Run
      │
      ▼
parseAdvancedScript(scriptText)
      │
      ▼
gsap.timeline() ← 创建 master timeline
      │
      ▼
parsed.commands.forEach(cmd => {
  switch(cmd.type) {
    case 'CAMERA_MOVE':
      masterTimeline.to(camera.position, {...}, index)
      break
    case 'FORMATION':
      masterTimeline.call(() => {
        movementController.animateToFormation(..., masterTimeline, index)
      }, [], index)
      break
    // ... 其他命令
  }
})
      │
      ▼
masterTimeline.play(0)
```

---

## 二、指令分类

### 2.1 摄影机指令 (Camera Commands)

| 指令 | 说明 | 同步方式 |
|------|------|----------|
| `CAMERA` | 关键帧移动 | `masterTimeline.to()` 直接动画 |
| `CAMERA_MODE` | 模式切换 | `masterTimeline.call()` |
| `CAMERA_FOLLOW` | 跟随目标 | `masterTimeline.call()` |
| `CAMERA_ORBIT` | 环绕模式 | `masterTimeline.call()` |
| `CAMERA_ZOOM` | FOV缩放 | `masterTimeline.call()` |

#### CAMERA 关键帧
```
CAMERA position: {x, y, z} lookAt: {x, y, z} time: N [fov: N] [transition: ease-in-out]
```
- `time`: 命令在 timeline 上的位置（秒）
- `position`: 相机目标位置
- `lookAt`: 相机注视点
- `fov`: 可选，透视相机的视野角度
- `transition`: 缓动类型 (`linear`, `ease-in-out`, `power2.out`)

**示例**:
```
CAMERA position: {0, 500, 1500} lookAt: {0, 0, 0} time: 0 fov: 60
CAMERA position: {200, 100, 800} lookAt: {0, 0, 0} time: 5 fov: 45
```

#### CAMERA_MODE 运镜模式
```
CAMERA_MODE mode: fixed|follow|orbit time: N
```
- `fixed`: 固定位置
- `follow`: 跟随笔刷
- `orbit`: 环绕中心

**示例**:
```
CAMERA_MODE mode: fixed time: 0
CAMERA_MODE mode: follow time: 10
```

#### CAMERA_FOLLOW 跟随笔刷
```
CAMERA_FOLLOW target: brush_50 offset: {x, y, z} lookAhead: N time: N
```
- `target`: 笔刷 ID（如 `brush_50`）
- `offset`: 相机相对于目标的偏移
- `lookAhead`: 视线提前量

**示例**:
```
CAMERA_FOLLOW target: brush_100 offset: {0, 2, 5} lookAhead: 3 time: 5
```

#### CAMERA_ZOOM FOV缩放
```
CAMERA_ZOOM fov: 45 time: N duration: M
```
- `fov`: 目标视野角度 (30-90)
- `duration`: 动画时长

**示例**:
```
CAMERA_ZOOM fov: 35 time: 8 duration: 2
```

---

### 2.2 灯光指令 (Light Commands)

| 指令 | 说明 | 同步方式 |
|------|------|----------|
| `LIGHT_INTENSITY` | 强度变化 | `masterTimeline.call()` → LightSystem |
| `LIGHT_COLOR` | 颜色变化 | `masterTimeline.call()` → LightSystem |
| `LIGHT_POSITION` | 位置移动 | `masterTimeline.call()` → LightSystem |

#### LIGHT_INTENSITY 强度动画
```
LIGHT_INTENSITY type: ambient|directional|point value: N time: N duration: M
```
- `type`: 灯光类型
- `value`: 目标强度 (0-2+)
- `duration`: 动画时长

**示例**:
```
LIGHT_INTENSITY type: ambient value: 0.3 time: 0 duration: 2
LIGHT_INTENSITY type: directional value: 1.2 time: 5 duration: 1.5
```

#### LIGHT_COLOR 颜色动画
```
LIGHT_COLOR type: ambient|directional|point color: #RRGGBB time: N duration: M
```

**示例**:
```
LIGHT_COLOR type: point color: #ffaa00 time: 4 duration: 2
```

#### LIGHT_POSITION 点光源位置
```
LIGHT_POSITION index: N position: {x, y, z} time: N duration: M
```

**示例**:
```
LIGHT_POSITION index: 0 position: {5, 10, 5} time: 3 duration: 1
```

---

### 2.3 运动指令 (Movement Commands)

| 指令 | 说明 | 同步方式 |
|------|------|----------|
| `BRUSH_FLIGHT` | 飞入动画 | `masterTimeline.call()` → MovementController |
| `FORMATION` | 编队/聚合 | `masterTimeline.call()` → MovementController |
| `SCATTER` | 散开动画 | `masterTimeline.call()` → MovementController |

#### BRUSH_FLIGHT 飞入动画
```
BRUSH_FLIGHT duration: N scatter: M direction: left|right|top|bottom time: N
```
- `duration`: 飞行时长
- `scatter`: 散开幅度
- `direction`: 飞入方向
- `time`: 开始时间

**示例**:
```
BRUSH_FLIGHT duration: 3 scatter: 800 direction: left time: 0
```

#### FORMATION 编队/聚合 ⭐核心功能

**语法一：几何编队**
```
FORMATION type: grid|circle|line|scatter spacing: N time: N duration: M
```

**语法二：参考图聚合**（最常用）
```
FORMATION type: reference index: N time: N duration: M
```

**工作原理**:
1. 根据 `index` 查找参考图
2. 计算每支笔刷的目标位置和层级
3. 添加到 master timeline 同步执行

**示例**:
```
# 聚合成圆形编队
FORMATION type: circle spacing: 30 time: 5 duration: 3

# 聚合成参考图0的图案
FORMATION type: reference index: 0 time: 4 duration: 3

# 聚合成参考图1的图案
FORMATION type: reference index: 1 time: 14 duration: 3
```

#### SCATTER 散开
```
SCATTER radius: N time: N duration: M
```

**示例**:
```
SCATTER radius: 500 time: 12 duration: 1.5
```

---

### 2.4 视觉效果指令 (Effect Commands)

| 指令 | 说明 | 同步方式 |
|------|------|----------|
| `DOF_BLUR` | 景深模糊 | `masterTimeline.call()` |
| `DOF_FOCUS` | 焦点距离 | `masterTimeline.call()` |
| `VIGNETTE` | 暗角效果 | `masterTimeline.call()` |

#### DOF_BLUR 景深模糊
```
DOF_BLUR amount: N time: N duration: M
```
- `amount`: 模糊强度 (0-1)

**示例**:
```
DOF_BLUR amount: 0.5 time: 8 duration: 1
```

#### DOF_FOCUS 焦点距离
```
DOF_FOCUS distance: N time: N duration: M
```

**示例**:
```
DOF_FOCUS distance: 0.5 time: 8 duration: 1
```

#### VIGNETTE 暗角
```
VIGNETTE darkness: N offset: M time: N duration: L
```

**示例**:
```
VIGNETTE darkness: 1.2 offset: 1.0 time: 6 duration: 1
```

---

### 2.5 时间轴指令 (Timeline Commands)

| 指令 | 说明 |
|------|------|
| `MARKER` | 标记时间点 |
| `TRANSITION` | 过渡效果 |
| `WAIT` | 等待 |
| `MUSIC` | 音乐同步 |

#### MARKER 标记
```
MARKER name: "name" time: N
```

**示例**:
```
MARKER name: "chorus_start" time: 30
MARKER name: "ref_1_complete" time: 8
```

#### TRANSITION 过渡
```
TRANSITION type: fade|cut|dissolve duration: N time: M
```

---

## 三、完整脚本范例

### 3.1 基础三参考图轮换模板

```yaml
# ============================================================
# 笔刷群动画脚本 - 三参考图轮换
# 前提: 已加载笔刷组 + 添加了3张参考图
# ============================================================

# 初始相机位置 (正视原点)
CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 fov: 60

# 笔刷从左侧飞入 (0-3秒)
BRUSH_FLIGHT duration: 3 scatter: 800 direction: left time: 0

# 参考图1 (index: 0) - 在4秒时开始聚合，耗时3秒
FORMATION type: reference index: 0 time: 4 duration: 3

# 参考图2 (index: 1) - 在9秒时开始聚合
FORMATION type: reference index: 1 time: 9 duration: 3

# 参考图3 (index: 2) - 在14秒时开始聚合
FORMATION type: reference index: 2 time: 14 duration: 3

# 循环回参考图1 - 在19秒时
FORMATION type: reference index: 0 time: 19 duration: 3
```

**时序图**:
```
时间:    0s    3s    4s    7s    9s    12s   14s   17s   19s   22s
        │     │     │     │     │     │     │     │     │     │
笔刷:    ○────→◎────→●────→●────→○────→●────→●────→○────→●────→●
        飞入   聚合  ref0  散开  聚合  ref1  散开  聚合  ref2  ref0
```

---

### 3.2 完整特效脚本

```yaml
# ============================================================
# 完整动画脚本 - 飞入 + 参考图聚合 + 相机特效
# ============================================================

# ---------- Phase 1: 初始设置 (0s) ----------
CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 fov: 60

# 高调摄影灯光
LIGHT_INTENSITY type: ambient value: 0.7 time: 0 duration: 1
LIGHT_INTENSITY type: directional value: 1.0 time: 0 duration: 1

# ---------- Phase 2: 飞入 (0s - 3s) ----------
BRUSH_FLIGHT duration: 3 scatter: 800 direction: left time: 0

MARKER name: "flight_complete" time: 3

# ---------- Phase 3: 聚合成参考图1 (4s - 7s) ----------
FORMATION type: reference index: 0 time: 4 duration: 3

# 灯光随聚合渐亮
LIGHT_INTENSITY type: directional value: 1.2 time: 5 duration: 2

MARKER name: "ref_0_complete" time: 7

# ---------- Phase 4: 相机特写 + DOF (8s - 12s) ----------
CAMERA_ZOOM fov: 35 time: 8 duration: 2
DOF_BLUR amount: 0.3 time: 8 duration: 1

MARKER name: "closeup_start" time: 8

# ---------- Phase 5: 散开 (12s - 14s) ----------
SCATTER radius: 500 time: 12 duration: 1.5

MARKER name: "scatter_complete" time: 14

# ---------- Phase 6: 聚合成参考图2 (14s - 18s) ----------
FORMATION type: reference index: 1 time: 15 duration: 3

# 相机拉远
CAMERA_ZOOM fov: 60 time: 16 duration: 2
DOF_BLUR amount: 0 time: 16 duration: 1

# ---------- Phase 7: 散开后聚合成参考图3 (18s - 22s) ----------
SCATTER radius: 400 time: 18 duration: 1.5
FORMATION type: reference index: 2 time: 20 duration: 3

# ---------- Phase 8: 收尾 (22s+) ----------
VIGNETTE darkness: 1.5 offset: 1.0 time: 23 duration: 1

MARKER name: "animation_complete" time: 24
```

---

### 3.3 纯编队动画脚本

```yaml
# ============================================================
# 纯编队动画 - 不使用参考图
# ============================================================

CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 fov: 60

# 飞入
BRUSH_FLIGHT duration: 2 direction: left time: 0

# 聚合成网格
FORMATION type: grid spacing: 25 time: 3 duration: 2

# 变圆形
FORMATION type: circle spacing: 30 time: 7 duration: 2

# 变直线
FORMATION type: line spacing: 40 time: 11 duration: 2

# 散开
SCATTER radius: 600 time: 14 duration: 1.5

# 再聚合成参考图 (如果有参考图)
FORMATION type: reference index: 0 time: 17 duration: 3
```

---

### 3.4 灯光变化脚本

```yaml
# ============================================================
# 灯光变化剧本
# ============================================================

CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0

# 暖色调开场
LIGHT_INTENSITY type: ambient value: 0.5 time: 0 duration: 1
LIGHT_COLOR type: directional color: #FFAA80 time: 0 duration: 1

# 逐渐变冷
LIGHT_COLOR type: directional color: #8EC5FF time: 5 duration: 3

# 强调色
LIGHT_COLOR type: point color: #FF6B6B time: 10 duration: 2
LIGHT_INTENSITY type: point value: 1.5 time: 10 duration: 2

# 恢复自然白
LIGHT_COLOR type: directional color: #FFFAF5 time: 15 duration: 2
LIGHT_COLOR type: point color: #FFFFFF time: 15 duration: 2
```

---

## 四、脚本调试

### 4.1 分段测试法

将复杂脚本拆分为小段逐个测试：

```yaml
# 测试1: 只测试飞入
BRUSH_FLIGHT duration: 3 direction: left time: 0

# 测试2: 只测试参考图1
# FORMATION type: reference index: 0 time: 0 duration: 3

# 测试3: 测试相机ZOOM
# CAMERA_ZOOM fov: 40 time: 0 duration: 2
```

### 4.2 使用 MARKER 调试

在关键节点添加 MARKER，检查是否准时触发：

```yaml
MARKER name: "debug_1" time: 0
BRUSH_FLIGHT duration: 3 direction: left time: 0
MARKER name: "debug_2" time: 3
FORMATION type: reference index: 0 time: 4 duration: 3
MARKER name: "debug_3" time: 7
```

### 4.3 快速参数调整

- 即时切换: `duration: 0.1`
- 慢动作观察: `duration: 10`
- 放大效果: `scatter: 2000`
- 缩小效果: `scatter: 200`

---

## 五、时序图解

### 5.1 三参考图轮换时序

```
时间轴:  0     3     4     7     9     12    14    17    19    22    24
        │     │     │     │     │     │     │     │     │     │     │
Camera: │←─────────── Fixed ────────────→│←── Zoom ──→│←─── Fixed ────┤
        │     │     │     │     │     │     │     │     │     │     │
Brush:  ○────→│     │     │     │     │     │     │     │     │     │
        飞入  ↑     │     │     │     │     │     │     │     │     │
               │     │     │     │     │     │     │     │     │
               └─ FORMATION ref:0 ──┘     └─ FORMATION ref:1 ──┘
                                              │     │     │
                                              └─ FORMATION ref:2 ──┘
Lights: ════════════════════════════════════════════════════════════════
        ambient=0.7                                               ↑
        directional=1.0→1.2 (at t=5)                             灯光渐亮

DOF:    ─────────────────────────────────────────────────────────────
        0.0      ↑    0.3 (t=8)        0.0 (t=16)
```

### 5.2 命令执行映射

```
Script Text
    │
    ▼
parseAdvancedScript()
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│ For Each Command in parsed.commands:                        │
│                                                              │
│   case 'CAMERA_MOVE':                                       │
│     masterTimeline.to(camera.position, {...}, index)      │
│                                                              │
│   case 'LIGHT_INTENSITY':                                   │
│     masterTimeline.call(() => {                             │
│       lightSystem.animateIntensity(value, duration,         │
│                                     masterTimeline, index)  │
│     }, [], index)                                           │
│                                                              │
│   case 'FORMATION':                                         │
│     masterTimeline.call(() => {                             │
│       movementController.animateToFormation(...,             │
│                                    masterTimeline, index)   │
│     }, [], index)                                           │
│                                                              │
│   case 'BRUSH_FLIGHT':                                      │
│     masterTimeline.call(() => {                             │
│       movementController.flyInBrushes(...,                   │
│                                  masterTimeline, index)     │
│     }, [], index)                                           │
└────────────────────────────────────────────────────────────┘
    │
    ▼
masterTimeline.play(0)
    │
    ▼
Timeline 控制: play() / pause() / seek(t) / kill()
```

---

## 六、指令速查表

### 摄影机

| 指令 | 语法 |
|------|------|
| 关键帧移动 | `CAMERA position: {x,y,z} lookAt: {x,y,z} time: N [fov: N]` |
| 模式切换 | `CAMERA_MODE mode: fixed\|follow\|orbit time: N` |
| 跟随 | `CAMERA_FOLLOW target: brush_N offset: {x,y,z} lookAhead: N time: N` |
| 缩放 | `CAMERA_ZOOM fov: N time: N duration: M` |

### 灯光

| 指令 | 语法 |
|------|------|
| 强度 | `LIGHT_INTENSITY type: ambient\|directional\|point value: N time: N duration: M` |
| 颜色 | `LIGHT_COLOR type: ... color: #RRGGBB time: N duration: M` |
| 位置 | `LIGHT_POSITION index: N position: {x,y,z} time: N duration: M` |

### 运动

| 指令 | 语法 |
|------|------|
| **参考图聚合** | `FORMATION type: reference index: N time: N duration: M` |
| 几何编队 | `FORMATION type: grid\|circle\|line\|scatter spacing: N time: N duration: M` |
| 散开 | `SCATTER radius: N time: N duration: M` |
| 飞入 | `BRUSH_FLIGHT duration: N direction: left\|right\|top\|bottom time: N` |

### 效果

| 指令 | 语法 |
|------|------|
| 景深模糊 | `DOF_BLUR amount: N time: N duration: M` |
| 焦点距离 | `DOF_FOCUS distance: N time: N duration: M` |
| 暗角 | `VIGNETTE darkness: N offset: M time: N duration: L` |

### 时间轴

| 指令 | 语法 |
|------|------|
| 标记 | `MARKER name: "name" time: N` |
| 过渡 | `TRANSITION type: fade\|cut\|dissolve duration: N time: M` |
| 等待 | `WAIT duration: N time: N` |

---

## 七、已知限制

1. **play() 按钮未整合**: 原来的 `play()` 按钮使用独立逻辑，未与 `executeScript()` 统一
2. **相机跟随未完全测试**: CAMERA_FOLLOW 功能需要更多测试
3. **CAMERA_ORBIT 未实现**: 环绕模式还在开发中

---

*文档版本: 2.0*
*核心更新: 统一GSAP Timeline架构，所有命令同步执行*