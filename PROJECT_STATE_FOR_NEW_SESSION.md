# Pixel 项目状态说明书

> 本文档标注了从初始项目规范到当前实现的目标变更

---

## 原始项目愿景 vs 当前实现

### 原始愿景（PROJECT_KNOWLEDGE.md 定义）

| 原始设计 | 当前状态 | 变更说明 |
|----------|----------|----------|
| 50+ 学生提交实体画作到中央教师端 | 目前是教师创建"教室"，学生通过4位房间码加入 | 规模缩小，不再是50+学生的场景 |
| 学生端：拍摄10张实体画作，合成1000x100纹理条上传 | 学生端功能未完整实现，当前仅有房间加入功能 | 学生端"材料创建"功能被简化 |
| 教师端：WebGL渲染15000+网格单元的镶嵌画 | 当前教师端是像素画笔刷编辑器，不是WebGL镶嵌画 | **核心功能变更** - 从实时镶嵌画渲染变成了画笔编辑器 |
| 1fps 广播机制：教师端每1秒发布一次渲染快照 | 废除广播机制 | 实时同步功能未开发 |
| Texture Strip + Luminance Sampling 着色器 | 该用three.js webGL技术 | 功能目标所需 |

---

## 变更历史

### Phase 1: 数据与认证基础
**预期**: Supabase Schema + RLS
**实际**: ✅ 完成 rooms, assets, room_members 表 + RLS策略

### Phase 2: Shader Specialist（未完成）
**预期**: 实现1000x100纹理采样逻辑的GLSL着色器
**实际**: ❌ 未实现，当前没有WebGL渲染管线

### Phase 3: UI Builder（部分完成）
**预期**: 学生10槽位拍摄流程 + 教师舞台队列
**实际**: ⚠️ 部分实现
- 教师端有笔刷编辑（不是学生材料拍摄）
- 相机拍照功能已修复（之前有bug）
- 没有纹理条合成功能

### Phase 4: Streamer（未完成）
**预期**: 1fps快照广播
**实际**: ❌ 废除

---

## 当前系统架构

### 实际已实现功能

#### 教师端 (TeacherStudio)
- 笔刷编辑：100x100画布，支持涂鸦/拍照
- 相机捕获 + 图像调整（亮度、对比度、饱和度、去背景）
- 单个笔刷库管理（CRUD + 分类）
- 笔刷组编辑（10槽位，按灰度排列）
- 拖拽笔刷到槽位

#### 学生端
- 房间列表查看
- 通过4位房间码加入房间
- 昵称选择（预设列表）

#### 数据库
- `rooms` - 教室表
- `room_members` - 房间成员
- `assets` - 素材表
- `single_brushes` - 单个笔刷库（新增）
- `brush_categories` - 笔刷分类（新增）

---

## 进行中的工作

### 笔刷系统重构（进行中）

**原计划**: 无
**变更**: 项目从实时WebGL教学平台转向了"笔刷创作工具"

**目标**: 新增单个笔刷库功能，将原有"笔刷预设"改名为"笔刷组"

**进度**:
- ✅ 数据库变更（single_brushes, brush_categories）
- ✅ 类型定义（SingleBrush, BrushCategory）
- ✅ CRUD API（src/lib/brushLibrary.ts）
- 🔄 TeacherStudio UI 重构（进行中）

**计划文件**: `/Users/leo/.claude/plans/abundant-squishing-pixel.md`

---

## 技术决策记录

### 1. 认证方案：getUser() + getSession() 双保险

**问题**: Supabase 网络不稳定，`getUser()` 会失败导致用户被登出

**决策**: 实现回退机制
```typescript
const { data: userData } = await supabase.auth.getUser();
if (userData?.user) {
  userObj = userData.user;
} else {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.user) {
    userObj = sessionData.user;
  }
}
```

**影响文件**: middleware.ts, teacher/page.tsx, teacher/[roomId]/page.tsx, student/page.tsx, student/[roomId]/page.tsx, TeacherRoomClient.tsx

### 2. 闭包问题处理：useRef 模式

**问题**: useEffect 中调用的函数捕获过期的 state 值

**决策**: 使用 ref 跟踪最新值
```typescript
const removeWhiteBgRef = useRef(false);
useEffect(() => { removeWhiteBgRef.current = removeWhiteBg; }, [removeWhiteBg]);
```

---

## 已修复的问题

| 问题 | 解决方案 |
|------|----------|
| 教师进入房间后被登出 | 添加 getSession 回退 + profile 查询超时 |
| 相机拍摄预览不更新 | 添加 useEffect 触发 applyImageAdjustments |
| 去背景强度滑块消失 | 确认 UI 组件存在 |
| 应用到画布无效 | 使用 getImageData/putImageData |

---

## 待办事项

- [ ] P1 - 相机拍照完整功能测试
- [ ] P1 - 单个笔刷编辑模式 UI
- [ ] P1 - 笔刷组编辑模式 UI + 拖拽
- [ ] P2 - 恢复原项目愿景？WebGL 镶嵌画 + 1fps广播

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/lib/supabase/middleware.ts` | 认证中间件，getUser/getSession双保险 |
| `src/components/teacher/TeacherStudio.tsx` | 笔刷编辑器，相机捕获 |
| `src/lib/brushLibrary.ts` | 单个笔刷 CRUD API |
| `src/lib/supabase/types.ts` | SingleBrush, BrushCategory 类型 |
| `src/app/teacher/page.tsx` | 教师首页 |
| `src/app/student/page.tsx` | 学生首页 |

---


---

## 测试状态

| 功能 | 状态 |
|------|------|
| 教师登录 → 进入房间 | 🔄 待用户确认 |
| 相机拍照预览 | 🔄 代码已修复需实测 |
| 去背景强度滑块 | 🔄 待测试 |
| 单个笔刷保存/加载 | ✅ API完成 |

---

## 快速开始

```bash
cd /Users/leo/code/pixels/pixel
npm run dev
```

---

## 对比：原始 vs 当前

| 维度 | 原始设计 | 当前实现 |
|------|----------|----------|
| 用户规模 | 50+ 学生 | 1对多教室（未定义规模） |
| 学生端 | 10槽拍摄 + 上传 | 仅加入房间 |
| 教师端 | WebGL渲染引擎 | 笔刷编辑器和three.js WEBGL实现渲染输出|
| 渲染方式 | GPU Shader 实时镶嵌 | 客户端Canvas |
| 同步机制 | 1fps广播 | 未实现 |
| 核心交互 | 学生画作 → 教师镶嵌 | 教师创建笔刷 → 学生区域 |

**结论**: 项目正在精进"实时协作教学平台"，废除广播功能，未来目标：注重学生作品实时上传，加强师生互动，实现后端supabase自托管转型