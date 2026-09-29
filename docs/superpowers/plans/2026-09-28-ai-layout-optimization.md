# 导出前 AI 布局优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户可在 Vue 项目导出前让 AI 根据真实页面截图和 UI-DSL 建议将规则排列的绝对定位图层转换为 Flex，并比较后逐页选择导出版。

**Architecture:** Studio 在隔离预览容器渲染并截图选定页面，将截图与 DSL 发给 Token 保护的 API。服务端校验并仅返回现有节点 ID 分组；Studio 以页面 DOM 几何复用 `autoLayoutNodesCommand` 生成不可变候选副本。候选预览与选择仅影响最终 ZIP。

**Tech Stack:** Fastify、现有多模态模型适配器、Vue 3、UI-DSL、`html-to-image`、现有 `fflate` 导出。

## Global Constraints

- AI 只返回分组节点 ID，不得生成代码、CSS 或 DSL。
- 转换复用 `autoLayoutNodesCommand`、现有 UI-DSL 校验及真实 DOM 几何。
- 原始页面、保存文件、历史和发布版本保持不变。
- 单页最多 200 个节点；截图宽度最多 1440 px；保留原始导出回退。
- 绝对定位图表、浮层、装饰及布局条件不合格的节点必须保持原样。

---

### Task 1: 布局分析模型 API

**Files:**
- Modify `packages/model-adapter/src/visual-import.ts`
- Modify `packages/model-adapter/src/index.ts`
- Create `apps/api/src/routes/layout-optimization.ts`
- Modify `apps/api/src/app.ts`

- [x] 增加严格解析 `{ groups: [{ nodeIds: string[] }] }` 的模型适配函数。
- [x] API 严格限制请求字段、PNG data URL、DSL 节点数和序列化大小。
- [x] 拒绝未知或重复节点 ID；从服务端 Skill 库获取 `layoutOptimization` 规则，忽略所有客户端规则字段。

### Task 2: 截图、候选生成与预览状态

**Files:**
- Modify `apps/studio/package.json`
- Create `apps/studio/src/features/design/layout-optimization.ts`
- Modify `apps/studio/src/features/design/design-commands.ts`
- Modify `apps/studio/src/features/design/studio-file-export.ts`
- Modify `apps/studio/src/features/design/StudioFileExportPanel.vue`
- Modify `apps/studio/src/shared/api/client.ts`

- [x] 提供单页预览截图、字体和图片就绪等待及受限 PNG 压缩。
- [x] 对 AI 分组验证 ID 唯一、存在、分组不交叠；测量真实节点相对于画板的几何和父变换。
- [x] 每组复用自动布局命令，逐组合并通过验证的结果；失败组保留原页面并显示原因。
- [x] 结果只存于导出对话框临时状态，不写入 Studio 当前页面。

### Task 3: 导出界面逐页选择和 Vue ZIP

**Files:**
- Modify `apps/studio/src/features/design/StudioFileExportPanel.vue`
- Modify `apps/studio/src/features/design/studio-file-export.ts`
- Modify `apps/studio/test/studio-file-export-panel.test.ts`

- [x] 展示含绝对定位节点的页面清单、AI 选项、分析状态和错误回退。
- [x] 用户可逐页比较原图与候选图，并选择导出版本；未启用 AI 时继续直接导出。
- [x] 只对经既有校验的候选替换导出副本，仍执行图片素材校验并生成 ZIP。

### Task 4: 完整性核对

- [x] 确认未知 ID、重复 ID、模型失败和无候选均不会改变导出原页。
- [x] 确认所选截图与 DSL 来自同一页面，比较图使用同一预览组件和画板尺寸。
- [x] 更新中文使用手册，说明 AI 优化的选择、预览和回退流程。
- [x] 补齐并运行布局分析与导出自动化测试；未做浏览器视觉检查。

## 验证记录（2026-09-28）

- 全仓类型检查 `pnpm typecheck` 通过；先修正 Layers 面板测试中 `get()`/`exists()` 的类型错误。
- 相关 Studio 测试（布局候选、导出面板、Skill 管理、Layers 面板）22 项通过；布局分析模型测试 5 项通过。
- API 完整测试 93 项通过；覆盖率：语句 84.95%、分支 80.80%、函数 92.65%、行 91.69%。
- 全仓构建 `pnpm build` 通过。
- 机器人官网样例从绝对定位节点生成 Flex 候选并导出 ZIP 后，实际执行生成项目 `vue-tsc --noEmit` 和 `vite build` 均通过；修复了生成页面对省略可选属性的类型声明，并统一预览中的线条形状高度。
- page-generator 完整测试 42 项通过；覆盖率：语句 94.04%、分支 81.34%、函数 95.34%、行 98.32%。
- Studio 完整测试仍有 21 项失败（306 项通过，7 个测试文件失败）；集中在画布拖动/坐标预期、旧属性预期和检查器预期，与布局候选及截图缩放测试无关。
- model-adapter 完整测试为 145 通过、4 失败；失败在既有 prompt/视觉导入预期，与布局分析测试无关。
- 布局 API 与 Skill API 的相对 Skills 目录统一以仓库根目录解析，避免 API 从 `apps/api` 启动时与开发助手读取不同目录。
- 未运行浏览器视觉检查；按用户选择暂不打开浏览器。

### 补充核对（2026-09-28）

- 单独运行 `pnpm --filter @pulseflow/studio exec vitest run test/layout-optimization.test.ts`：4 项通过，包含 2880×1600 画板缩放至 1440×800 后输出 PNG 的回归测试。
- `pnpm --filter @pulseflow/studio typecheck` 通过。
- 复跑 Studio 全套测试：327 项中 306 项通过、21 项失败；失败仍集中在既有画布坐标、拖动和检查器行为测试。布局优化测试通过。
