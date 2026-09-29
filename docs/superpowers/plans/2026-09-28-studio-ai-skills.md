# Studio 与开发助手共享 Skill 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Studio 页面 AI 与项目开发助手读取、管理同一套项目级 `.agents/skills/<slug>/SKILL.md`。

**Architecture:** API 负责从受配置的 Skills 根目录安全解析和原子写入 Markdown Skills，并将服务端启用的用途规则注入生成、精修、图片转 DSL 请求。Studio 使用 Token 保护的 API 和 Ant Design Vue 管理面板编辑这些文件；不在数据库复制 Skill 内容。

**Tech Stack:** Fastify、TypeScript、Zod、Node `fs/promises`、Vue 3 Composition API、Ant Design Vue。

## Global Constraints

- 根目录默认 `.agents/skills`，环境变量 `PULSEFLOW_SKILLS_DIR` 可覆盖。
- 每条 Skill 正文上限 8,000 字符，目录最多 50 条。
- 支持用途：`pageGeneration`、`pageRefinement`、`imageToDsl`、`layoutOptimization`。
- Codex 标准 `name` 与目录 slug 一致；Studio 展示名、用途和启用状态写入 `metadata.pulseflow_studio_*`，其他 metadata 字符串及 `license`、`compatibility` 保留。
- 只操作根目录一层下的 `SKILL.md`；拒绝符号链接、路径穿越及未知管理字段。
- Skills 是普通文本，不渲染为 HTML，不执行正文内容。

---

### Task 1: Skill 文件库和安全校验

**Files:**
- Create `apps/api/src/services/skill-library.ts`
- Create `apps/api/test/skill-library.test.ts`
- Modify `.env.example`

- [x] 实现列表、读取用途匹配规则、创建、更新、删除；严格校验 slug、frontmatter、用途、正文、数量及链接目标。
- [x] 使用临时文件和原子重命名；默认读取仓库 `.agents/skills`，支持 `PULSEFLOW_SKILLS_DIR`。
- [x] 补齐并运行 Skill 文件库自动化测试。

### Task 2: 认证 Skill API 与提示词注入

**Files:**
- Create `apps/api/src/routes/skills.ts`
- Modify `apps/api/src/app.ts`
- Modify `apps/api/src/routes/drafts.ts`
- Modify `packages/model-adapter/src/client.ts`
- Modify `packages/model-adapter/src/visual-import.ts`
- Modify `packages/model-adapter/src/prompt.ts`

- [x] 在 Token 保护的 API 下注册 Skill CRUD。
- [x] 将用途匹配的 Skill 文本注入生成、精修和图片转 DSL 的 system prompt；请求体不得覆盖规则。
- [x] 继续使用现有 JSON schema 和 UI-DSL 校验，空 Skills 不改变当前调用行为。

### Task 3: Studio Skill 管理入口

**Files:**
- Create `apps/studio/src/features/skills/skill-api.ts`
- Create `apps/studio/src/features/skills/SkillManagerPanel.vue`
- Modify `apps/studio/src/features/design/DesignStudioView.vue`
- Modify `apps/studio/test/design-studio-view.test.ts`

- [x] 增加 Skill 列表、编辑、新建、用途选择、启用开关、删除和错误反馈。
- [x] 从 Studio 全局工具入口打开管理面板；以文本插值展示 Markdown 内容。

### Task 4: 全链路核对

- [x] 核对四种用途与 API/提示词的映射，特别确认 `layoutOptimization` 可供下一计划调用。
- [x] 更新开发者说明，说明 `.agents/skills` 自动发现及部署目录配置。
- [x] API、Studio 类型检查和生产构建通过；Skill 文件库、API、管理面板相关自动化测试通过。

## 验证记录（2026-09-28）

- API 完整测试 93 项通过，包含 Skill 文件库、Skill API 和布局优化 API；覆盖率：语句 84.95%、分支 80.80%、函数 92.65%、行 91.69%，达到项目 80% 阈值。
- `PULSEFLOW_SKILLS_DIR` 相对路径固定从 PulseFlow 仓库根目录解析；回归测试覆盖相对路径和部署用绝对路径。
- page-generator 完整测试 42 项通过；该包覆盖率为语句 94.04%、分支 81.34%、函数 95.34%、行 98.32%。
- Skill 管理面板及入口相关 Studio 测试通过；本轮布局/导出/Skill/Layers 目标测试合计 22 项通过。
- 全仓类型检查 `pnpm typecheck` 和全仓构建 `pnpm build` 通过。
- Studio 完整测试最近一次为 306 项通过、21 项失败，主要在画布交互及相关旧预期；详细记录见 AI 布局优化计划。
- 未运行浏览器视觉检查；按用户选择暂不打开浏览器。
