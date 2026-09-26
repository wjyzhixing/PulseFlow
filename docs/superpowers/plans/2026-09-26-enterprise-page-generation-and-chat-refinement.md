# 企业页面生成与对话迭代实施计划

> **For agentic workers:** Use the approved UI-DSL contracts below as the shared interface. Respect every pre-existing working-tree change. Do not reset, stash, or overwrite unrelated files.

**目标：** 生成有官网或管理平台层次的 Ant Design Vue 页面，并能在画布里通过对话迭代当前草稿。

**架构：** 将页面类型、语义组件和安全约束放入共享 UI-DSL；模型适配器分别构造初次生成与当前页面修改的结构化提示，并对返回草稿做严格校验；API 暴露受校验的 refine 接口；Studio 根据草稿 revision 管理请求结果并只应用当前快照的有效响应。预览和导出共享相同 renderer/主题组件。

**技术栈：** Vue 3、TypeScript、Ant Design Vue 4、Fastify、Zod、现有 UI-DSL、现有模型 completion 客户端。

## 全局约束

- 只允许 schema 白名单中的 DSL 组件和属性；页面类型为 `auto | website | admin`。
- refine 请求包含 `{ instruction, entityFields, pageDsl, semanticQuestions }`，返回完整 `T2uiResult`，保留现有 `pageDsl.pageId`。
- Studio 仅在 DSL 校验通过且请求 revision 仍是当前 revision 时应用模型结果。
- 保留现有 API 鉴权、release gates、不可变发布语义和工作区中全部未提交更改。
- 不生成或执行任意 HTML、CSS、JavaScript、业务 API 请求。

---

### 任务 1：共享 UI-DSL 语义组件与页面主题

**文件：**

- 修改 `packages/ui-dsl/src/components.ts`、`types.ts`、`validate-page.ts`、`index.ts`
- 修改 `packages/page-generator/src/component-registry.ts`、`render-page.ts`、`generate-page.ts`、`generate-header.ts`
- 修改 `packages/vue-template/src/App.vue`
- 修改 `apps/studio/src/features/preview/PreviewPanel.vue`
- 修改 `apps/studio/src/features/design/ComponentPalette.vue` 和 `NodePropertyEditor.vue`

- [ ] 给官网和管理平台添加最小但语义明确的组件集合（官网导航、首屏、内容 section、功能卡片、末尾锚点式转化行动区块；平台指标摘要）；定义严格 props 和容器约束。
- [ ] 将每个新组件加入 validator、拖拽/属性编辑器、preview renderer 和生成 Vue SFC；未知属性、错误子节点和不安全文本保持拒绝。
- [ ] 统一导出 template 与 Studio preview 的 Ant Design 主题：移除模板浅绿底和硬阴影，定义标题、内容区、卡片、栅格和窄屏规则。
- [ ] 确认 release gates 构建结果包含新组件与主题文件，manifest 列出全部生成文件。
- [ ] 运行 `pnpm --filter @pulseflow/studio typecheck`、`pnpm --filter @pulseflow/page-generator typecheck` 和 `pnpm --filter @pulseflow/api typecheck`。

### 任务 2：页面类型与高质量首轮生成

**文件：**

- 修改 `packages/model-adapter/src/prompt.ts`、`client.ts`、`index.ts`
- 修改 `apps/api/src/routes/drafts.ts`
- 修改 `apps/studio/src/features/draft/draft-api.ts`
- 修改 `apps/studio/src/features/requirements/RequirementIntakeView.vue` 及需要的选择器子组件
- 修改 `packages/contracts/src/draft.ts`

- [ ] 在初次生成输入中支持 `auto | website | admin`，默认 `auto`，API 校验 enum 值。
- [ ] 为三种模式编写布局层级规则；官网示例使用导航、hero、差异化内容区块、首屏 CTA 和末尾转化行动区块，管理平台示例使用标题/筛选/指标/数据表，要求真实完整中文业务文案和合理空态。
- [ ] 在需求导入页加入页面类型选择并随已选章节提交；保留自动识别默认路径。
- [ ] 导出 manifest 与生成文件包含可直接展示的完整应用主题。
- [ ] 运行相关 package 和 Studio typecheck/build，手工核对生成 prompt 文本没有要求模型杜撰 API。

### 任务 3：模型对话 refine 与 API

**文件：**

- 修改 `packages/model-adapter/src/prompt.ts`、`client.ts`、`errors.ts`、`index.ts`
- 修改 `apps/api/src/routes/drafts.ts`
- 修改 `apps/api/src/services/draft-service.ts` 或新增同目录 refine 验证模块
- 修改 `packages/contracts/src/draft.ts`

- [ ] 增加 `RefineInput` 类型、严格请求 schema 和非空/长度边界检查。
- [ ] 构造 refine system/user prompt，序列化当前页面作为上下文，要求返回完整草稿并保留 pageId。
- [ ] 复用模型请求的超时/网络/HTTP/JSON 错误处理；校验 entityFields、semanticQuestions 和 page DSL 后返回结果。
- [ ] 增加 `POST /api/drafts/refine`，对输入与模型错误返回既有 `{ ok, error }` envelope。
- [ ] 运行 model-adapter 与 API typecheck/build，检查接口不会访问或写入数据库，也不绕过 workspace auth。

### 任务 4：Studio 对话面板与并发安全

**文件：**

- 修改 `apps/studio/src/features/draft/draft-api.ts`、`draft-store.ts`
- 新建 `apps/studio/src/features/design/DesignChatPanel.vue`
- 修改 `apps/studio/src/features/design/DesignStudioView.vue`、`design-store.ts`
- 修改 `docs/中文使用指南.md` 和 README 链接描述

- [ ] 在设计页加入空态建议、对话历史、输入、提交/等待/错误状态和模型返回摘要。
- [ ] 发请求时捕获 DSL/字段和 draft revision；完成时若 revision 不匹配则拒绝应用，若匹配则经 design-store 校验后替换 DSL/字段。
- [ ] 成功修改同步到现有草稿状态，触发现有 dirty/save/publish 机制；已发布版本继续按现有逻辑开启新草稿。
- [ ] 文档说明如何选择页面类型、提出迭代指令、处理校验错误和重新提交。
- [ ] 运行 API/Studio typecheck 与 build；检查窄屏对话输入和发布操作可访问。

## 自审

- UI-DSL 是预览、生成和发布共同使用的边界，任务 1 先形成接口，任务 2/3 再使用它。
- 对话不是任意文本 patch：完整结果走原有安全校验；revision 防止过期响应覆盖人工编辑。
- 页面类型默认自动识别，保持旧调用方式兼容。
- 本计划未要求任何新依赖、后端业务 API 或任意脚本执行。
