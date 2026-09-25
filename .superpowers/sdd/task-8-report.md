# Task 8 — 安全预览、页面代码生成与 Vue 模板

## 组件与数据流

| 组件 / 模块 | 单一责任 | 输入 / 输出 |
| --- | --- | --- |
| `PreviewPanel` | 对设计 store 的当前 DSL 显示真实组件预览和诊断 | `dsl`, `data`, `handlers`; 默认事件反馈 |
| `mock-handlers` | 为受白名单约束的按钮事件和字段生成内存模拟数据 | DSL、实体字段；模拟事件回调 |
| `renderPage` | 校验 DSL 后，用显式注册表生成 Vue VNode | `dsl`, `data`, `handlers` → VNode；异常为诊断 code |
| `component-registry` | 固定映射 12 种 DSL 类型到 AntDV / 项目页头 | `ComponentType` → Vue component |
| `generatePage` | 确定性产出静态 SFC、类型、事件、纯运行时、页头和 manifest | DSL → `GeneratedFile[]` |
| `vue-template` | 提供独立 Vue 3 + Vite + AntDV4 构建壳和默认 tokens | `src/generated/Page.vue` 入口 |

设计 store 的 `PageDsl` 仍是唯一规范状态。`PreviewPanel` 直接接收其当前 DSL，没有第二份可编辑 DSL。预览使用内存模拟数据，按钮事件只调用显式传入或从已验证 DSL 构造的 mock handler。

## TDD 与实现

- RED：先写 `render-page.test.ts`、`generate-page.test.ts` 和 `preview-panel.test.ts`；`pnpm --filter @pulseflow/page-generator test` 因两个实现模块缺失失败，Studio 预览测试因组件缺失失败。
- GREEN：生成器 14/14、Studio 全量 41/41。覆盖未知组件拒绝、严格属性校验、有效 DSL 文本转义、`<img>` / `javascript:` 标签拒绝、注入式 `pageId` 在生成 SFC 前被 schema 拒绝、页头 tags、表格 bodyCell 静态 case、原始值回退、限定状态条件、own-property handler、SFC 解析、可选属性、恶意 option value 的脚本分隔符编码及字段/集合名称碰撞。
- 预览先调用 `validatePageDsl`。组件来自冻结的显式 registry，属性按组件逐一映射；状态条件是字段与字面量的严格等值比较。没有动态组件导入、`eval`、`v-html`、任意 CSS 或 API 实现。
- 生成页面是显式 AntDV 布局标记；`PageHeader.tags` 和 `Table.bodyCell` 由静态插槽代码承载。`jsLiteral` 对进入脚本的 `<`、`>`、`&` 和特殊换行字符编码。类型和事件文件只描述字段及 handler 契约。
- `GeneratedFile[]` 包含 `src/generated/Page.vue`、`types.ts`、`events.ts`、`runtime.ts`、`components/PageHeader.vue`、`manifest.json`。页面仅相对导入生成的本地文件；manifest 列出全部源文件与 Vue/AntDV 依赖版本，便于 Task 10 CLI 作为完整 bundle 拉取。

## 独立产物验证

在 `/tmp/pulseflow-task8-portable-yZ57K1` 创建仅含 `packages/vue-template` 的全新工作区，将 `generatePage(validPage)` 的全部文件写入其中。工作区不安装 page-generator 或 ui-dsl。`pnpm install --offline --frozen-lockfile`、`pnpm --filter @pulseflow/vue-template typecheck`、`pnpm --filter @pulseflow/vue-template build` 全部通过。生成目录及模板依赖检索没有 `@pulseflow` 私有运行时导入、`fetch`、`eval` 或 `v-html`。另用缺少可选 slot 与事件的简化页面运行模板类型检查，也已通过。

## 验证

- `pnpm verify`：在本次仅测试补充之前通过，全部包 typecheck、tests、coverage 和 build；Studio 41/41，generator 当时 13/13。生成器覆盖率为 Statements 97.29%、Branches 89.26%、Functions 100%、Lines 100%；Studio 为 91.77%、84.44%、90.67%、96.17%。各包均达到 80% 门槛。
- 复核补充：`pnpm --filter @pulseflow/page-generator exec vitest run --config ../../vitest.config.ts packages/page-generator/test/generate-page.test.ts -t 'rejects an injected pageId'`：1/1；`pnpm --filter @pulseflow/page-generator test`：14/14。
- `pnpm lint`、`pnpm audit`、`git diff --check`：通过，audit 无已知漏洞。
- Vue 模板默认状态 build/typecheck 通过；填入完整生成 bundle 后的独立 build/typecheck 通过。

## 风险与范围

- 生成模板只定义页面结构、字段和事件接口。调用方需要将应用数据和事件 handler 传给 `Page`；这属于业务集成边界，生成物没有伪造 API 调用。
- AntDV4 的表格和其他组件使示例独立页面 bundle 约 834 KB（gzip 约 260 KB）。构建通过，但后续可按产品页面实际组件做代码分包。
- 预览模拟值只保存在内存。原始需求文字和 DOCX 未写入模板或生成产物。
