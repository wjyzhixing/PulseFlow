# PulseFlow Figma 式设计画布实施计划

> **执行说明：** 本计划按 TDD 分任务推进。UI-DSL 是唯一页面事实来源；画布操作只能提交 schema 明确支持的 DSL 属性。

**目标：** 按用户提供的参考图，将 Studio 改造成 Figma 式 Pages/Layers、中央直接操作画布、右侧设计检查器，并让每项操作自动转换为可验证、可渲染、可导出的 UI-DSL。

**架构：** 在现有语义组件之外扩展 Frame、Text、Shape 等基础设计图层。所有图层都支持一个有边界的设计属性对象；Studio 画布、页面预览和生成页面从同一套 UI-DSL renderer/schema 读取。选择、视口和拖动状态不进入 DSL；完成后的坐标、尺寸、文字和外观值进入 DSL。

**技术栈：** Vue 3 Composition API + TypeScript、Zod UI-DSL、共享 Vue renderer、页面 SFC 生成器、Vitest/Vue Test Utils、Playwright。

## 全局约束

- 新设计值只可使用 `design` 白名单字段；不允许 CSS 字符串、脚本或任意 DOM 属性。
- `x/y` 范围为 -8192 至 8192 CSS 像素；尺寸范围为 1 至 8192 像素；旋转范围为 -360 至 360 度。
- 填充/描边只接受 `#RRGGBB`；透明度范围 0 至 1；圆角范围 0 至 256 像素。
- 字体、字重、对齐和 Frame 布局来自枚举；文本仍通过现有 safe text schema。
- 每项画布/检查器变更生成不可变候选，调用 `validatePageDsl`，验证通过后才能写 store/history。
- 默认页面无 `design` 属性时保持旧版 renderer 和生成文件输出兼容。
- 桌面/平板/手机预览映射成 page theme/responsive token；缩放和平移仍是视口状态。

---

## 文件职责图

- `packages/ui-dsl/src/components.ts`：新增 Frame/Text/Shape 语义属性 schema 和容器能力。
- `packages/ui-dsl/src/schema.ts`、`types.ts`、`validate-page.ts`：定义所有节点共享的有限设计属性。
- `packages/ui-dsl/test/validate-page.test.ts`、`components.test.ts`：边界、枚举、未知字段和设计对象验证。
- `packages/page-generator/src/component-registry.ts`：Frame/Text/Shape 的正式 Vue 组件。
- `packages/page-generator/src/render-page.ts`：把 DSL design tokens 映射为静态 Vue style；编辑态提供选择与变换回调。
- `packages/page-generator/src/generate-page.ts`：让生成 SFC 输出同样的 Frame/Text/Shape、layout 和外观值。
- `apps/studio/src/features/design/design-store.ts`：新增 `updateNodeDesign`，所有 design patch 经过 store 校验与 history。
- `apps/studio/src/features/design/inspector-fields.ts`：Figma 检查器属性定义，保持组件业务属性元数据独立。
- `apps/studio/src/features/design/DesignInspector.vue`：绘制 Position/Layout/Appearance/Typography/Fill 分组并发出 typed updates。
- `apps/studio/src/features/design/DesignCanvas.vue`：宽大画布工作区、缩放/平移和 inspector/canvas 事件组合。
- `apps/studio/src/features/design/CanvasTransformOverlay.vue`：选中对象的 8 点尺寸控制柄与拖动/旋转交互。
- `apps/studio/src/features/design/LayersPanel.vue`、`ComponentPalette.vue`：左侧 Pages/Layers/Assets 与 Frame/Text/Shape 插入工具。
- `apps/studio/src/features/design/DesignToolbar.vue`：底部浮动工具栏，加入选择/Frame/Shape/Text/Image 工具。
- `apps/studio/src/features/design/DesignStudioView.vue`：组成顶部项目栏、左侧 rails/resources、中心画布、浮动 AI prompt、右侧 inspector。
- `apps/studio/test/design-geometry.test.ts`、`canvas-transform-overlay.test.ts`、`figma-workspace.test.ts`：schema 到拖动/检查器/布局的闭环验收。
- `docs/PulseFlow机器人官网制作手册-v1.1.md`：补充 Figma 式操作说明和真实截图索引；不将旧界面截图标成新界面。

## Task 1：新增经过校验的视觉对象 DSL

**接口：**

```ts
type SizeValue = number | 'hug' | 'fill';
interface NodeDesign {
  position?: { mode: 'flow' | 'absolute'; x: number; y: number };
  size?: { width: SizeValue; height: SizeValue };
  rotation?: number;
  opacity?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  typography?: {
    fontFamily: 'sans' | 'serif' | 'mono' | 'pingfang-sc' | 'noto-sans-sc' | 'inter' | 'roboto' | 'arial';
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    lineHeight: number;
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right';
    color: string;
  };
}
```

- [x] 给 node.design 与 Frame/Text/Shape 写 schema 测试：合法属性通过；越界值和未知字段被拒绝；Frame 可嵌套，Text/Shape 不能容纳子节点。
- [x] 确认 schema 测试在实现前失败。
- [x] 新增 `NodeDesign`、Frame/Text/Shape schema、节点设计属性验证和未知键拒绝。
- [x] 执行 UI-DSL build 与 tests，确认合法设计值通过、越界/任意 CSS 失败。

## Task 2：让共享预览和生成页面输出设计对象

- [x] 给 Frame/Text/Shape registry 和 shared renderer 写测试：结构语义、排版、填充、尺寸、旋转映射到 Vue 输出。
- [x] 确认测试在 registry 和 design style mapper 实现前失败。
- [x] 实现 Frame flex 方向/gap/padding，Text 语义文本节点，Shape rectangle/ellipse 节点。
- [x] 实现受限 `nodeDesignToStyle` 映射；导出模板和实时预览都由同一份设计 token 驱动。
- [x] 给 `generate-page.ts` 增加设计节点和设计样式输出。
- [x] 执行 UI-DSL、page-generator tests/build，确认新增节点可生成。

## Task 3：建立 Figma 右侧属性检查器

- [x] 多选时 Fill/Appearance/Typography 样式应用到全部可编辑目标；位置与尺寸字段明确切换为画布变换操作，避免把所有对象写到同一坐标。
- [x] 写 `DesignInspector` 测试覆盖 Position、Layout、Appearance、Typography、Fill 五组显示和输入事件。
- [x] 写 store 测试：合法设计 patch 提交，非法颜色和数字被拒绝，并可 undo/redo。
- [x] 实现 typed `updateNodeDesign`，候选对象通过 schema 验证后提交。
- [x] 在检查器显示 X/Y、宽高、流式/固定/Hug/Fill、旋转、透明度、圆角、fill 和 stroke。
- [x] 把组件内容字段嵌入同一 Figma 检查器，去除重复属性卡片；多选不再显示只会修改首个图层的组件字段。
- [x] 选中 Text 时追加字体、字号、字重、行高、字距、对齐和文字颜色。
- [x] 按参考图补充 PingFang SC、Noto Sans SC、Inter、Roboto 和 Arial 字体；UI-DSL、截图识别、预览和生成页面使用同一安全字体白名单与映射。
- [x] 执行 inspector/store 测试和 Studio typecheck。

## Task 4：把位置与尺寸操作放到画布上

- [x] 方向键按 1px 微移所选图层，Shift+方向键按 10px 移动；多选作为一条校验后的 DSL/history 操作，编辑控件获得焦点时不拦截方向键。
- [x] 添加画布拖动/缩放测试覆盖当前 zoom、8 个 resize handles 中的方向计算以及 8px 网格吸附。
- [x] 用 DesignCanvas emit 把转换结果交给 store；坐标按 artboard 缩放反算。
- [x] 加入 8 点控制柄、拖动阈值，并在松开指针时一次性提交 DSL 更新。
- [x] Escape 和 pointercancel 会丢弃临时变换，不写入 DSL。
- [x] 添加对齐参考线，并将相对嵌套图层的父级局部坐标纳入变换计算；加入吸附和参考线的几何回归测试。
- [x] 绝对定位对象通过拖动更新父级坐标；流式 Frame 子项在同一 Frame 内按布局方向排序，多选时保留选中项顺序。
- [x] 流式子项拖入另一个 Frame 时以单条校验后的 DSL/history 操作更换父容器并保留流式布局；拖出 Frame 后才切为绝对定位。
- [x] 缩放流式子项只更新尺寸并保留布局模式；检查器可显式切换流式/绝对定位。
- [x] 绘制工具在 Frame 中按指针位置加入流式子项；空白区域会解析最近的 Frame 插入上下文，画板根级对象仍使用绝对坐标。
- [x] 绘制工具在容器内部放置对象时写入父级局部坐标和正确的 children index；画布外仍创建根图层。
- [x] 选中图层可通过画布旋转控制点旋转；角度按设计属性校验并写入同一条 DSL/history 命令。
- [x] 多选图层的检查器对齐按钮按选区边界对齐，并一次性提交经过校验的 DSL/history 更新。
- [x] 多选缩放把画布框变换映回各自父级局部坐标，并根据父级与对象自身旋转换算宽高；无变化轴不产生网格舍入漂移。
- [x] 执行 transform/store/canvas tests，确认几何值进入 DSL history。

## Task 5：按参考图重组设计工作区

- [x] 写工作区集成测试，覆盖 Pages/Layers、画布、浮动对话、右侧检查器、画布双击文字编辑和撤销。
- [x] 参考图布局落地为全屏编辑器：顶部文件栏、左侧工具栏与 Pages/Layers、中间点阵画布、右侧检查器。
- [x] 桌面面板比例对齐参考图（80px 工具栏、330px Pages/Layers、335px 检查器），中等视口提前切换为紧凑栏宽以保留中央画布空间。
- [x] 画布缩放/平移与浮动工具栏不挤占画板空间；AI 对话作为画布浮层显示。
- [x] 加入 Figma 式浅灰工作区、选择边界和浮动底部工具栏。
- [x] 编辑态移除实时预览标题和卡片外框；截图导入的固定根 Frame 按 DSL 宽高作为画板，并同步 stage、shell、适配缩放与缩放锚点尺寸。
- [x] 左侧显示当前 Page 和 Layers；工具架/工具栏可添加 Frame/Text/Shape/Image。
- [x] 把 AI prompt 改为画布下缘浮层，保留对话和图片审核内容。
- [x] 双击 Text 图层进入画布内编辑；Enter 或失焦写入同一 UI-DSL/history，Esc 恢复原值。
- [x] 更新中文手册步骤；本次浏览器截图检查尚未获授权，未把旧图标作新版本实拍。

## Task 6：端到端导出和真实浏览器验收

- [x] 添加 E2E：设计对象编辑、拖动/resize、样式、undo/redo、导出 JSON、截图导入预览与应用流程（`tests/e2e/studio-figma-canvas.spec.ts`；本轮未启动浏览器执行）。
- [x] 运行画布操作与截图导入 E2E；4 项测试通过。
- [ ] 在桌面和手机视口采集截图，核对工作区与生成页面的视觉一致性。
- [ ] 获得浏览器检查授权后，更新手册中的 2.0 真实截图；截图不得含密钥。
- [x] 执行全仓 `pnpm verify`（typecheck、test、coverage、build）、`pnpm lint` 和 `git diff --check`；Studio 分支覆盖率为 80.01%。

## Task 7：Pages 页面集合

- [x] 将左侧静态 Pages 行替换为可搜索页面列表，并支持新建和切换。
- [x] 每个打开的页面保留独立 UI-DSL、字段、草稿会话和撤销历史；切换前拒绝无效 DSL。
- [x] 将页面集合与设计文件一起持久化，重新进入 Studio 后恢复全部页面；项目名称与活动页面名称分开保存。
- [x] 新增项目发布路由：按保存的 Studio 文件 revision 发布全部页面，逐页运行 DSL/预览/构建门禁，并逐页返回版本与诊断。
- [x] 所有页面门禁通过后，在单个 SQLite 事务中写入完整发布集；任一页面失败或文件 revision 过期时不生成部分版本。
- [x] Studio 发布面板使用已保存项目 revision 调用项目发布接口，并逐页展示状态、版本号和失败诊断。
- [x] 增加整份 Studio 项目 JSON 导出：包括项目名、活动页、所有页面、实体字段和待澄清信息，并逐页校验 UI-DSL。

## Task 8：让截图导入画板按参考图尺寸生成

- [x] 测试模型提示包含解码后的参考图宽高及目标画板尺寸。
- [x] 提示模型按截图比例和目标画板缩放坐标。
- [x] 输出缺少根 Frame 时自动包装根画板；已有根 Frame 时统一尺寸并按比例校准绝对几何。
- [x] 重新验证归一化 DSL 并把根画板计入 150 图层限制。
- [x] 执行截图导入测试和 model-adapter 类型检查。

## Task 9：补齐图层复制、粘贴与重复快捷操作

- [x] 在 `design-store.ts` 中增加不可变图层复制快照、重复和粘贴命令；每次产生新 node ID，复制的 Section ID 与内部 CTA 引用同步映射，资源/字段引用保留。
- [x] 多选复制只复制选区中的顶层节点及完整子树；重复后在同一父级插入相邻图层，绝对定位根图层偏移 16px。
- [x] 所有复制/粘贴/重复都通过完整 UI-DSL 校验并作为单条 history 命令；无效引用不改变页面和选择。
- [x] 在设计画布快捷键中加入 Cmd/Ctrl+C、V、D；输入框、文字编辑和按钮焦点保持原有浏览器编辑语义。
- [x] Alt/Option 拖动绝对定位图层在释放位置创建副本；流式图层在 Frame 插入点创建保留布局的副本；都作为单条 UI-DSL/history 操作。
- [x] 加 store 与 Studio 快捷键测试，并用 E2E 验证多选副本可编辑、导出、撤销和重做。

## Task 10：补齐组合与图层锁定语义

- [x] `Ctrl/⌘+G` 将连续、同父容器的绝对定位图层或起始对齐 Frame 中的流式图层组合成透明 Frame；`Ctrl/⌘+Shift+G` 可取消组合。
- [x] 组合/取消组合作为单条经过 UI-DSL 校验的历史命令，更新选区并保留图层顺序。
- [x] 锁定状态沿祖先层级生效，阻止属性编辑、变换、移动和删除；图层面板仍允许解锁自身。
- [x] 更新中文手册中的图层锁定与组合操作说明。
- [x] 执行 Studio typecheck、build 和 `git diff --check`；本轮未运行测试或浏览器。

## 完成审计

- [x] 可拖动 Pages/Layers 与检查器分隔线；支持方向键 8px、Shift+方向键 24px 调整，并在本地记住宽度。
- [x] 通过工具栏或 Shift+A 将对齐、等间距单行/单列选区转换为经过校验的自动布局 Frame；失败不修改页面。

- Frame/Text/Shape、语义组件、Figma 几何/排版/填充属性都能存进 UI-DSL 并由 schema 校验。
- 画布移动、8 点缩放和检查器数值操作会立即反映到 DSL、预览和导出页面。
- 生成的 Vue 页面与 Studio 画布保持节点尺寸/字体/填充一致。
- Pages/Layers 与参考图主要分区对应；画布变换、UI-DSL 提交与截图转 DSL 有单元和组件测试覆盖。真实浏览器 E2E 与桌面/手机截图对照尚未执行。
- Pages 新建和切换、持久化页面集合与多页发布已实现。
- 中文手册记录当前界面截图、登录至导出的完整流程。

## Task 11：让画布对话跟随 Figma 选区

- [x] 对话框显示整页或当前单选/多选图层作为修改目标，并把目标节点 ID 发送给修订接口。
- [x] 模型提示按目标节点和子树生成修订；没有选区时继续使用整页修改模式。
- [x] 服务端以完整候选 DSL 校验后比较选区外节点、页面属性、字段和问题记录；超出选区的候选会被拒绝。
- [x] 截图导入或用户自定义画板不强制套用初次生成网站/后台的标准构成；普通整页修订保留已有完整构成，选区修订遵循 Figma 选区范围。
- [x] 锁定图层不能通过对话修改；目标画框生成图片时只会写入目标画框子树。
- [x] 修订后保留仍存在的画布选区，便于继续操作。
- [x] 执行全仓类型检查、构建和 `git diff --check`；遵循会话偏好，未运行测试或浏览器。

## Task 12：补齐 Prototype 交互面板

- [x] 右侧增加 Prototype 面板，为按钮、导航、Hero 行动按钮和行动区块编辑页面内跳转。
- [x] Button DSL 增加 `targetSectionId`；与业务 `event` 互斥，且目标必须引用已存在的 ContentSection。
- [x] 实时预览和 Vue 页面生成都将 Button 跳转目标渲染为锚点链接。
- [x] 中文手册说明 Prototype 的目标选择与发布预览行为。

## Task 13：支持 Frame 到 Frame 原型连线

- [x] `NodeDesign.prototype` 保存 click trigger 和 `targetNodeId`，使用严格 schema 校验。
- [x] 校验原型来源只能是 Frame，目标必须是不同的现存 Frame。
- [x] Prototype 检查器为选中 Frame 提供目标列表，并排除自身。
- [x] 原型模式在选中 Frame 上显示可拖拽连接点；拖到其他 Frame 会创建 DSL 连线，画布上同步绘制已有连线和正在拖动的连线。
- [x] Studio 编辑模式保留普通画布选中行为；普通预览与生成 Vue 页面点击 Frame 会滚动到稳定 ID 的目标 Frame。
- [x] 中文手册记录 Frame 连线限制和预览行为。
- [x] 执行全仓类型检查、构建和 `git diff --check`；按当前会话偏好不运行测试或浏览器。

## Task 14：支持同一 Page 的多画板画布

- [x] 编辑器中的设计图层保留真实布局盒，使绝对坐标、尺寸和变换能在画布上生效；无设计属性的语义节点仍使用内容流布局。
- [x] 画布工作区根据所有顶层固定尺寸设计对象的最小/最大坐标扩展 artboard bounds；对象顺序不依赖 Frame 必须是首层。
- [x] Frame/Shape/Text/Image 工具在灰色画布空白区创建顶层对象，在现有 Frame 内创建子图层。
- [x] 完成全仓类型检查、构建与 `git diff --check`；不运行测试或浏览器。

## Task 15：提高截图转 UI-DSL 的文案保真度

- [x] 将区域语义名 `label` 与原图可见文案 `text` 分开，避免图层摘要覆盖实际显示文字。
- [x] 提示视觉模型逐字保留可辨识的语言、数字、标点和换行；看不清的文案留空，由语义名作为安全回退。
- [x] 服务端把原始文案写入 Text、Button、Card 和 Input 属性，图层名继续保存在 `design.name`。
- [x] 预览摘要显示递归图层数与 Frame 数，避免根画板使结果看起来只有一个图层。
- [x] 完成全仓类型检查、构建与 `git diff --check`；不运行测试或浏览器。


## Task 16：在属性检查器中切换图层可见性

- [x] Appearance 区增加眼睛图标控件，通过现有 `updateDesign` 事件写入 `NodeDesign.visible`。
- [x] 多选时将可见性作为共享样式应用到未锁定图层；单选锁定图层仍由现有禁用态保护。
- [x] 中文手册补充右侧可见性入口；不采集新浏览器截图，沿用会话中“先不检查”的选择。


## Task 17：补齐画布框选与截图导入保真度

- [x] 在画布空白处拖动显示 Figma 风格选框，按住 Shift/Ctrl/⌘ 加入当前选区；锁定、隐藏图层不参与框选。选区状态只存在于 store selection，不写入 UI-DSL。
- [x] 截图识别区域未返回可读文案时，不再用图层语义名伪造可见文字；保留空白、可编辑 Text/Button 图层并在识别说明中提示。
- [x] 截图导入中的可见文案提高至每层 2000 字；保留原始换行和标点，不再静默截断至 120 字，超长块由识别提示拆分为相邻文字图层。
- [x] 识别结果达到 120 区域上限时，在候选说明中提示分块导入，避免用户把受限结果误认为完整页面。
- [x] 把 Card 区域编译为零内边距 Frame，容器标签仅作为图层名称，标题文本作为独立子图层，避免凭空渲染额外标题。
- [x] 视觉分析尺寸提高到 1800px，与浏览器预处理的最大边长保持一致。
- [x] 大图同时向视觉模型提供整图和最多两块原图高清细节，细节坐标映射回整图，帮助逐字识别密集文案和控件。
- [x] Shape Line 使用画板宽高绘制实际对角线；斜率方向保存在受限 `flipY` 设计属性中。
- [x] 画板尺寸变化时，在用户尚未手动调整视口的情况下自动重新适配画布。
- [ ] 在授权的桌面/手机浏览器视口中对照参考图，验收框选、截图转换、画布/预览/发布一致性。


## Task 18：从图层树拖入容器

- [x] Layers 面板拖动对象到可接收子图层的行时高亮目标并将对象嵌套到该容器。
- [x] 保留拖动到容器行前后位置的同级排序；PageHeader 只走现有 tags slot 规则。
- [x] 所有放置继续经由 `moveNodeToTarget`、容器白名单、锁状态、循环引用检查和完整 UI-DSL 校验后提交 history。
- [x] 更新中文手册中的图层树嵌套说明；未运行测试或打开浏览器。


## Task 19：搜索截图生成的图层

- [x] Layers 面板增加搜索入口，按图层名称、ID 和字符串属性过滤。
- [x] 搜索命中子图层时保留祖先路径；命中容器时显示其完整子树，方便理解层级上下文。
- [x] 无结果时提供清晰空状态，并在中文手册中记录入口。

## Task 20：让滚轮导航符合 Figma 画布习惯

- [x] 普通滚轮和触控板滚动平移画布，按 WheelEvent 的像素/行/页模式换算距离；Shift+滚轮横向平移。
- [x] Ctrl/⌘+滚轮将小幅触控板 delta 累积为 1% 缩放步进，并始终以指针位置为锚点。
- [x] 画布滚轮操作阻止页面意外滚动，并避开工具栏、对话框和表单控件。
- [x] 更新中文手册和设计规格；Studio typecheck 与 `git diff --check` 通过。
- [ ] 在授权的浏览器中实际操作普通滚轮、Shift 滚轮、Ctrl/⌘ 滚轮和空格拖动。

## Task 21：让截图导入保留可编辑自动布局

- [x] 将容器布局模式、行列方向、间距、内边距、对齐和分布加入视觉计划的白名单 schema，并限制在 Frame 类区域。
- [x] 提示模型仅对清晰的规则行列推断 flow；重叠、图表和自由定位区域保持 absolute。
- [x] 确定性编译 flow 容器及子图层为 UI-DSL Frame 属性和 flow 定位；旧模型不输出布局属性时保持原有 absolute 行为。
- [x] 同步截图导入规格与中文使用手册。
- [ ] 在授权的浏览器中用带按钮组/表单的真实截图确认流式布局方向、间距、改文案后重排及绝对定位回退。

## Task 22：让 Hug / Fill 具有 Figma 自动布局语义

- [x] Frame 直接子图层的主轴 Fill 使用弹性布局分配剩余空间；交叉轴 Fill 拉伸到容器可用尺寸。
- [x] 实时预览和 Vue 页面生成共用同一尺寸规则；绝对定位图层继续按坐标定位。
- [x] 检查器仅允许 Frame 中的流式子图层选择 Fill，并说明不适用时的原因。
- [x] 截图视觉计划可明确返回子图层固定 / Hug / Fill 尺寸；编译只对有效流式子图层采用 Hug / Fill，其他对象保留测量尺寸。
- [x] 更新中文手册和视觉编辑规格；Studio、page-generator、model-adapter 类型检查，page-generator 与 model-adapter 构建及 `git diff --check` 通过。
- [ ] 在授权的浏览器中验证两个 Fill 子图层的空间分配、交叉轴拉伸及发布页面一致性。

## Task 23：让自动布局子图层对齐符合 Figma 语义

- [x] 将 `alignSelf` 加入受限 UI-DSL 属性，并让实时预览和 Vue 页面生成共同映射为 Flexbox 交叉轴对齐。
- [x] Frame 的流式子图层只启用交叉轴对齐；主轴位置仍由图层顺序和 Frame 分布属性控制，不转成绝对坐标。
- [x] 绝对定位图层保留坐标对齐行为；同一 Frame 内多选流式图层时批量设置交叉轴对齐，并将多选流式缩放保留为尺寸更新。
- [x] 多选流式缩放只把实际变化的轴写成固定尺寸；未变化轴保留原来的 Hug/Fill 模式。
- [x] 交叉轴尺寸为 Fill 时禁用无效对齐；流式多选会略过锁定或 Fill 拉伸轴的子图层。
- [x] 混合/跨容器图层不显示无效的多选缩放控制柄；全为绝对定位的选区保留坐标和尺寸比例变换。
- [x] 更新中文手册；UI-DSL、page-generator、Studio 类型检查及 UI-DSL/page-generator/Studio 构建通过。
- [ ] 在授权的浏览器中对照参考图实际拖动、对齐、缩放自动布局子图层，并核对发布结果。

## Task 24：让跨 Frame 拖放命中真实目标容器

- [x] 指针命中测试忽略正在拖动的选区及其子图层，避免预览元素遮住目标 Frame 后错误命中源容器。
- [x] 保留命中真实 Frame 后的 flow 重排/跨容器重挂载；拖出源 Frame 时继续按自由定位提交坐标。
- [x] 绝对定位图层拖入 Frame 时高亮有效目标，按 Frame 内容区换算局部坐标并以单条历史操作重挂载；批量选区读取吸附后的画布几何，保留组内间距并共同提交。旋转/翻转的坐标链不参与高亮，避免视觉跳位。
- [x] 绝对定位图层在同一个父 Frame 内拖动时不触发重新挂载，避免无意改变图层堆叠顺序。
- [x] 流式图层拖动预览会排除已锁定的源图层和目标 Frame，不显示最终无法提交的重排引导线。
- [x] 更新中文手册，记录直接画布拖入 Frame 的操作和坐标限制。
- [x] 完成 Studio 类型检查、构建和 `git diff --check`。
- [ ] 在授权的浏览器中实测从源 Frame 拖入另一个 Frame、在原 Frame 内重排及拖出 Frame 三种落点。

## Task 25：让 AI 对话停在画板旁的空白画布

- [x] 按画板在视口中的真实位置计算左右留白，优先将助手放入足够宽的画布空白区。
- [x] 两侧都没有空间时自动收起为 AI 入口，保留一键展开与完整对话/图片操作。
- [x] 按画布缩放、平移、滚动和工作区尺寸变化重新计算助手位置，并限制最大高度。
- [x] 更新中文手册；Studio 类型检查、构建与 `git diff --check` 通过。
- [ ] 在授权的浏览器中实测宽/窄画布，确认助手不会遮挡画板且展开后对话和图片功能可用。
