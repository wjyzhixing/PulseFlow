# Task 7 — 设计画布与 Monaco 双向 DSL 编辑

## 组件地图（实现前）

| 组件 / 模块 | 单一责任 | Props | Emits / Actions |
| --- | --- | --- | --- |
| `DesignStudioView` | 路由级组合面：从草稿初始化设计会话，并编排组件面板、画布、属性面板和代码编辑器 | 无 | 调用 design store actions；有效 DSL 变化同步 `draft-store` |
| `ComponentPalette` | 展示白名单组件，并让设计人员点选添加节点 | `items: PaletteItem[]` | `add(type)` |
| `DesignCanvas` | 以层级树显示规范 DSL 节点，提供选择、删除、上下移动和拖放重排 | `nodes`, `selectedNodeId` | `select(nodeId)`, `remove(nodeId)`, `move(payload)` |
| `CanvasNode` | 递归呈现单个节点及其子树，提供同层落点与容器/slot 内部落点 | `node`, `selectedNodeId`, `depth` | `select`, `remove`, `move`, `dropNode` |
| `NodePropertyEditor` | 按节点类型呈现受白名单约束的常用属性输入 | `node`, `entityFields` | `update(patch)` |
| `DslMonacoEditor` | 承载本地 Monaco 实例、即时上报原始缓冲、debounce 提交并显示结构化诊断 | `source`, `diagnostics` | `buffer(source)`, `edit(source)` |
| `design-store` | 维护唯一 `PageDsl` 规范状态及选择、Monaco 缓冲、诊断等辅助状态；所有变更采用不可变更新 | 初始化 DSL、实体字段 | `addNode`, `removeNode`, `moveNode`, `updateNodeProps`, `applyJsonEdit`, `selectNode` |
| `design-diagnostics` | 将 JSON 解析错误与 DSL schema 错误标准化为 code/path/line/col | 纯函数参数 | 返回 diagnostics |

数据流：`PageDsl` 是唯一规范状态。面板、画布和属性编辑器只发动作；store 生成新 DSL 后同步规范 JSON 到草稿。Monaco 每次键入即时写入辅助缓冲，debounce 后再经 `JSON.parse` 与 `validatePageDsl`；仅成功时替换 DSL。画布动作开始前会同步 flush pending 缓冲：有效 JSON 先成为规范 DSL，再在其上应用画布动作；无效 JSON 保留原文与诊断，画布基于最近有效 DSL 更新且不会覆盖错误缓冲。选择、文本缓冲、dirty/pending 标志和诊断都不复制 DSL。

## 视觉设计方向（实现前）

采用“工业制图台”方向，延续现有深青、纸白与荧光黄绿品牌色。页面是高密度三栏工作台：左侧窄组件工具架，中部带网格纸和层级导轨的画布，右侧为属性检查器；底部/侧边 Monaco 使用深色工程终端质感。节点卡片通过编号、类型胶囊和缩进导轨强化树层级，选中态用荧光黄绿描边。交互保持键盘可达，按钮有可读标签，禁用状态明确；不渲染 DSL HTML，也不执行 DSL/CSS/JS。

## TDD 记录

1. 首次 RED：`pnpm --filter @pulseflow/studio test -- design-store.test.ts design-editor.test.ts`
   - `design-store.test.ts` 因设计 store 尚不存在而失败。
   - 5 个编辑器黑盒测试因 `/design` 路由、组件面板和画布行为尚不存在而失败。
   - 失败点覆盖白名单节点、双向同步、无效 JSON 保留、路由回退和重排。
2. Store GREEN：`pnpm --filter @pulseflow/studio exec vitest run test/design-store.test.ts`，8/8 通过；随后补足无效目标、slot 节点和 UI 交互覆盖。
3. Editor GREEN：`pnpm --filter @pulseflow/studio exec vitest run test/design-editor.test.ts`，5/5 通过；随后增加草稿入口、类型属性、嵌套拖放和移除覆盖。
4. slot 层级 RED/GREEN：新增 PageHeader tags slot 添加与重排测试，先得到 `{ ok: false }`，实现 slot 插入后定向测试通过。
5. 首次实现完成时 Studio 测试为 31 个通过；独立复审修复后的最终数字见下节。

### 独立复审修复

复审指出三个交错问题，均先添加行为测试并观察预期 RED：

1. Monaco invalid 文本在画布变更后被格式化 JSON 覆盖；pending 文本在 250ms debounce 前同样被覆盖。
2. 现有 drop payload 只能表达目标节点原来的 parent/index，UI 没有进入 Card/Form/Row 或 PageHeader tags 的落点。
3. 属性 patch 被 schema 拒绝时，界面丢弃 `false`，设计人员看不到失败。

定向 RED 命令：

`pnpm --filter @pulseflow/studio exec vitest run test/design-store.test.ts test/design-editor.test.ts -t 'preserves invalid|preserves a pending|does not overwrite|reparents existing|moves existing|shows property'`

结果为 6 个预期失败；store 的跨层移动/防循环基础测试已通过，确认第二项缺口位于画布 drop target。实现后同一命令 7 个测试通过：

- store 增加 `updateSourceBuffer`、`flushSourceBuffer` 与私有 dirty/pending 辅助标志；canvas action 先 flush pending 输入。有效输入先进入 canonical state，随后叠加画布动作；已验证为 invalid 的 source/diagnostics 在画布 commit 时保持不变，同时用最近有效规范 JSON 同步草稿。
- Monaco `buffer` 事件即时上报每次键入，`edit` 保持 250ms debounce。
- 容器节点显示明确的 `drop-into-*` 落点；Card/Form/FormItem/Row/Col 接收 children，PageHeader 接收 Tag/Badge 到 tags slot；store 仍拒绝移入自身后代。
- 画布移动和属性更新统一检查 action 结果，失败以红色 `role=status` 信息显示，DSL 保持不变。

修复后完整 Studio 测试为 38 个通过。

测试采用用户可见文本、可访问控件和 `data-testid` 交互，不读取组件私有状态。Monaco SDK 在 jsdom 中 mock；store 与 DSL 验证使用真实实现。

## Monaco 本地 worker 配置

- 运行时依赖 `monaco-editor@0.52.2`，没有 CDN 脚本。
- `DslMonacoEditor.vue` 从 `monaco-editor/esm/vs/editor/editor.api` 加载编辑器 API，并显式加载本地 JSON language contribution。
- `monaco-editor/esm/vs/editor/editor.worker?worker` 交给 Vite 生成独立的本地 worker asset；构建产物已确认包含 `editor.worker-*.js`。
- 根 package 入口在 Vite 7 / Vitest 下因缺少可解析的 `main/exports` 而失败，因此使用包内官方 ESM 深入口；jsdom mock 使用相同入口。
- Monaco 输入先通过 `buffer` 事件即时保留原始字符串，250ms debounce 后才提交验证。schema 路径通过 `jsonc-parser` AST 定位到 line/col，并同时写入 Monaco markers 和页面诊断列表。
- 设计路由采用动态 import，Monaco 只在进入 `/design` 后加载。

## 验证

- `pnpm --filter @pulseflow/studio test`：通过，3 files / 38 tests。
- `pnpm --filter @pulseflow/studio coverage`：通过；Statements 91.52%、Branches 84.21%、Functions 89.65%、Lines 95.95%。
- `pnpm --filter @pulseflow/studio typecheck`：通过。
- `pnpm --filter @pulseflow/studio build`：通过；生成本地 Monaco editor worker 和 JSON mode chunk。
- `pnpm --filter @pulseflow/studio lint`：通过。
- `pnpm --filter @pulseflow/ui-dsl typecheck && pnpm --filter @pulseflow/ui-dsl test`：通过，31 tests；验证公共入口新增 `ComponentType` 类型导出不影响现有契约。
- `git diff --check`：通过。

## 风险与限制

- Monaco 设计路由 chunk 约 2.31 MB（gzip 约 602 KB），已通过路由级懒加载隔离，不影响登录、需求导入和草稿页的初始 bundle；后续可按 Monaco feature 进一步裁剪。
- 属性面板覆盖设计人员最常用且可安全约束的字段：title、subtitle、label、placeholder、fieldId、disabled、layout、variant、event、dataSourceKey、gutter、span、text、color/status。Select options、Table columns 和复杂 slot case 继续由经 schema 验证的 JSON 编辑器处理。
- 拖放使用浏览器原生 drag/drop，并保留上下移动按钮作为键盘和触屏可用的确定性替代操作。
- 设计功能只把 DSL 当数据展示，使用 Vue 文本插值；没有 `v-html`、`eval`、动态 CSS/JS 执行。
- `packages/ui-dsl/src/index.ts` 仅增加 `ComponentType` 公共类型导出，使 Studio 从包公共入口引用白名单类型；未更改验证逻辑。
