# PulseFlow Studio 机器人官网制作手册

**实测日期：2026-09-27**
**适用对象：第一次使用 PulseFlow Studio 的用户**
**本次演示：灵犀机器人官网，从工作区登录到版本发布**

> 本文记录本次 Studio 的实际操作。配图均为本地 Studio 实拍截图，保存在 `docs/pulseflow-studio-manual/screenshots/`。

第一次使用时可以按本文从上往下操作。每个环节都配有对应截图；截图是已有操作记录，当前 Studio 视觉以设计画布步骤中的新版工作区截图为准。

### 流程速览

| 步骤 | 要完成的事 | 截图 |
| --- | --- | --- |
| 1 | 登录工作区 | [01-login.png](pulseflow-studio-manual/screenshots/01-login.png) |
| 2–3 | 输入需求、选择生成范围 | [02](pulseflow-studio-manual/screenshots/02-requirements-import.png)、[03](pulseflow-studio-manual/screenshots/03-requirements-filled.png)、[04](pulseflow-studio-manual/screenshots/04-requirement-scope.png) |
| 4 | 检查草稿、回答问题并校验 | [05](pulseflow-studio-manual/screenshots/05-draft-review.png)、[06](pulseflow-studio-manual/screenshots/06-clarifications-answered.png)、[07](pulseflow-studio-manual/screenshots/07-structure-validated.png) |
| 5–6 | 画布编辑、系统对话与图片 | [09](pulseflow-studio-manual/screenshots/09-design-canvas.png)、[10](pulseflow-studio-manual/screenshots/10-design-chat-image-prompt.png)、[14](pulseflow-studio-manual/screenshots/14-robot-hero-on-canvas.png) |
| 7 | 检查页面、预览并发布 | [13](pulseflow-studio-manual/screenshots/13-design-final-full.png)、[15](pulseflow-studio-manual/screenshots/15-publish-preflight.png)、[16](pulseflow-studio-manual/screenshots/16-desktop-preview.png)、[17](pulseflow-studio-manual/screenshots/17-mobile-preview.png)、[19](pulseflow-studio-manual/screenshots/19-published.png) |

## 1. PulseFlow Studio 是什么

PulseFlow Studio 用来把业务需求整理成可编辑的网页或管理平台。你可以先用文字描述需求，让系统生成页面草稿；再通过对话、画布和属性面板调整内容；最后运行检查并发布一个只读版本。

主要流程是：**登录 → 导入需求 → 选择生成范围 → 检查页面草稿 → 画布与对话迭代 → 发布检查 → 发布版本**。

页面结构由 UI-DSL 描述。可以把 UI-DSL 理解成页面的结构清单：它记录页面有哪些区块、文字、图片、表单和它们之间的关系。Studio 会校验这份清单，通过后才把结果应用到画布或发布。

## 2. 本次完成的页面

本次从空白需求生成了“灵犀机器人”中文企业官网，包含顶部导航、机器人首屏、产品能力、工业巡检/仓储物流/商业服务场景、示例数据、团队介绍、预约演示表单和行动入口。机器人主视觉由方舟 Seedream 生成，并应用为首屏背景。

演示数据已经标注为示例。预约表单目前只展示前端页面，没有连接客户管理或提交后端。截图中显示的发布版本为 **`lingxi-robot-home-v2`**；Studio 发布会保存只读版本，不会自动部署到公网。

## 3. 开始前准备

1. 首次使用时，在项目根目录安装依赖并复制环境变量模板：

       pnpm install
       cp .env.example .env

2. 在 `.env` 中设置工作区令牌和文字模型配置。方舟 Seedream 图片模型可按下面填写；把占位文字替换成本机的有效 API 密钥：

       PULSEFLOW_IMAGE_API_URL=https://ark.cn-beijing.volces.com/api/plan/v3/images/generations
       PULSEFLOW_IMAGE_API_MODE=volcengine-ark-images
       PULSEFLOW_IMAGE_MODEL_NAME=doubao-seedream-5.0-lite
       PULSEFLOW_IMAGE_API_KEY=你的方舟API密钥
       PULSEFLOW_IMAGE_RESULT_HOSTS=ark-acg-cn-beijing.tos-cn-beijing.volces.com

   不要把真实密钥写进需求、对话、截图或 Markdown，也不要提交 `.env`。图片生成可能产生费用；使用前确认服务商配额。

3. 启动 API。保持此终端运行：

       pnpm --filter @pulseflow/api dev

4. 另开一个终端，在项目根目录启动 Studio：

       pnpm --filter @pulseflow/studio dev

5. 打开 Studio 终端显示的地址（通常是 `http://localhost:5173`），进入工作区登录页。若本地 API 或 Studio 地址不同，参照[中文使用指南](中文使用指南.md)调整配置。

服务端会从项目根目录 `.env` 读取方舟图片配置。请只在本机配置文件中保存密钥，并避免在终端录屏或截图中展示它。

## 4. 按页面完成官网

### 第 1 步：登录工作区

在“工作区登录”页面输入 `.env` 中的工作区令牌，然后点击“进入 Studio”。令牌只用于当前本地工作区会话。

![Studio 工作区登录页](pulseflow-studio-manual/screenshots/01-login.png)

登录后会进入需求导入页面。

### 第 2 步：选择页面类型并写需求

在“生成页面类型”选择“企业官网”。需求最好写清品牌、目标用户、导航、首屏标题、主要区块、图片风格和联系方式；如果用 Markdown 标题分段，系统更容易把需求拆成可选择的章节。

![需求导入页面](pulseflow-studio-manual/screenshots/02-requirements-import.png)

本次需求描述了科技风机器人官网、蓝色主色、产品能力、三个行业场景、团队介绍和预约演示入口。

![已填写的机器人官网需求](pulseflow-studio-manual/screenshots/03-requirements-filled.png)

### 第 3 步：选择生成内容

点击“解析需求”后，系统会把文本整理为章节。只勾选要交给生成服务的部分；未命名的一整段需求也可以勾选“选择 无标题内容”。

![需求生成范围选择](pulseflow-studio-manual/screenshots/04-requirement-scope.png)

点击“生成草稿”后等待系统整理页面结构和实体字段。

### 第 4 步：检查草稿并回答问题

在“确认实体结构”页检查 UI-DSL 与实体字段。页面草稿包括网站导航、首屏、产品与场景区块、指标、联系表单等内容。遇到没有真实来源的数据或未接入的表单，要明确告诉系统并保留为示例。

![生成后的官网草稿](pulseflow-studio-manual/screenshots/05-draft-review.png)

回答系统提出的待澄清问题。本次说明指标是示意数据、预约表单暂不接后端。

![待澄清问题的回答](pulseflow-studio-manual/screenshots/06-clarifications-answered.png)

点击“确认结构并校验”。看到“校验通过并已保存草稿”后，再进入设计画布。

![结构校验通过](pulseflow-studio-manual/screenshots/07-structure-validated.png)

### 第 5 步：认识设计画布

设计页采用 Figma 式工作区：左侧活动栏可切换 File、Assets、Tools、Variables；File 中 Pages 和 Layers 同时显示，中间是网页画布，右侧是属性检查器。点击页面对象可选中它；选中后可在画布移动、拖动控制点缩放，也可在右侧调整内容和样式。Position 区可设置 X/Y、旋转和翻转；Appearance 区可切换图层可见性并设置透明度和圆角；修改会校验后写入 UI-DSL。图层树可展开/折叠、隐藏或锁定对象；锁定只阻止画布变换，仍可从图层树重新选择和解锁。按 Delete/Backspace 删除选中图层，按 Ctrl/⌘+Z 撤销。滚轮可平移画布；按住 Shift 滚轮可横向移动；按 Ctrl/⌘ 并滚动可围绕指针缩放。也可按住空格拖动画布，或使用鼠标中键拖动。底部工具栏可切换选择、画框、形状、文字和图片工具，也可切换桌面、平板、手机视口、缩放及撤销/重做。选择画框、形状、文字或图片工具后，在画布上点击可按默认尺寸放置，拖动可按拖动范围创建；按 Esc 或选择箭头工具返回选择模式。每次放置都会作为一次可撤销修改写入 UI-DSL。

图层树中的图层可双击重命名，右侧检查器的“图层名称”字段与它保持同步；名称保存为 UI-DSL 的 `design.name` 元数据，不会成为页面上显示的文字。形状工具旁的下拉菜单可选择矩形、椭圆或直线。按 Esc 会先关闭形状菜单或取消正在进行的画布操作，再退出绘制工具，最后清除选区。

Pages/Layers 左栏与右侧检查器之间的竖向分隔线可以左右拖动；聚焦分隔线后按方向键每次微调 8 像素，按 Shift 加方向键每次调整 24 像素。两侧面板宽度会保存在当前浏览器，下次打开 Studio 时恢复；窄屏会切换为覆盖式面板。

Assets 用于浏览内置、生成和导入图片；点击“上传图片”可导入本地 PNG、JPEG 或 WebP，上传后会按当前选择插入图片、替换图片或设置区块背景。Tools 用于添加画框、形状、文字和语义组件；Variables 用于维护实体字段。拖动单个或多个图层的缩放控制点时，按住 Shift 可锁定比例；按住 Alt 可从选区中心缩放。流式布局图层由父容器管理；直接输入 X/Y 会自动切换为绝对定位，画布拖动也会将位置保存为父级坐标。右侧 Layout 可分别将宽高设为固定、Hug 或 Fill：Hug 随内容决定尺寸；Frame 自动布局中的 Fill 会占用主轴剩余空间，交叉轴 Fill 会拉伸到容器可用尺寸。

选择同一容器中连续排列、已对齐且间距一致的一行或一列图层，点击底部“自动布局”或按 Shift+A，可将它们转换为 Frame 自动布局；元素顺序、尺寸和间距会保留，并作为一次可撤销的 UI-DSL 修改保存。选区重叠、间距不一致、未对齐或不属于同一容器时，Studio 会显示原因且不修改页面。普通“组合图层”仍用于保留自由坐标的组合。

文字图层可双击后直接在画布中编辑。按 Enter 提交，Shift+Enter 换行；点击画布其他位置会保存，按 Esc 会恢复编辑前的文字。提交会通过 UI-DSL 校验并进入撤销历史。

![新版 Studio 官网设计画布](pulseflow-studio-manual/screenshots/09-design-canvas.png)

在较宽的桌面视口下，可以同时查看画布、图层与属性；本次的机器人首屏已经应用了生成图片。

![机器人主视觉应用后的官网画布](pulseflow-studio-manual/screenshots/14-robot-hero-on-canvas.png)

完成页面编辑后，可以在画布中检查整页的区块顺序和内容。

![官网设计完成后的整页画布](pulseflow-studio-manual/screenshots/13-design-final-full.png)

桌面和手机预览可分别检查宽屏布局与窄屏下的内容适配。

![桌面预览](pulseflow-studio-manual/screenshots/16-desktop-preview.png)

![手机预览](pulseflow-studio-manual/screenshots/17-mobile-preview.png)

右侧“原型”面板可为按钮、导航、Hero 行动按钮和行动区块设置页面内跳转。目标必须是当前 UI-DSL 中存在的内容区块；预览和导出页面都会使用同一个跳转目标。项目动作标识由接入该页面的业务项目实现。

### 从截图自动生成 UI-DSL

如果你已有 Figma 导出的 PNG/JPEG/WebP 截图，点击页面标题区的“图片转 UI-DSL”。拖入截图或选择文件，选择“自动识别”或指定官网/管理平台，再写可选要求并点击“生成可编辑页面”。Studio 会先压缩图片；视觉模型一次识别页面类型、区域位置、简短标签和容器关系，服务端再把校验通过的区域计划转换成 UI-DSL。最多识别 120 个区域，最终页面最多 150 个图层（含画板），并通过 UI-DSL schema 校验。子图层会尽量保留在识别到的 Frame/Card 容器中；明显成行或成列且没有重叠的内容会生成可重排的自动布局，并在尺寸关系明确时保留固定、Hug 或 Fill 语义；图表和浮层等自由位置内容仍保留固定坐标。如果模型把有重叠子图层的容器误判为自动布局，Studio 会自动改用绝对定位保留截图位置，并在识别说明中提示。

右侧预览显示候选页面和识别说明；识别到的图片区会用浏览器临时裁片即时预览，此时不上传、不保存页面素材。只有点击“应用到画布”才会替换当前画布并保存裁片素材；关闭面板或转换失败不会改动现有设计。应用结果后，仍可像 Figma 一样从图层树选择对象、在画布移动/缩放、在检查器精调，之后使用撤销/重做、预览、导出和发布。

转换出的画板名称使用页面标题，区域标签会保存为对应图层名；可在图层树双击继续调整名称。

图像理解模型需要支持 OpenAI 兼容 Chat Completions 的 `image_url` 输入和 JSON 输出。可在 `.env` 配置 `PULSEFLOW_VISION_API_URL`、`PULSEFLOW_VISION_MODEL_NAME` 和 `PULSEFLOW_VISION_API_KEY`；不设置时会沿用通用模型配置。当前 TokenRhythm 配置使用支持视觉输入的 `qwen3.7-flash`。变量示例见项目根目录 `.env.example`。截图会发送给所配置的模型服务，原始整张截图不会作为页面素材保存；点击“应用到画布”后，识别到的图片区会从截图裁切为独立页面素材，以便预览、编辑和发布，取消导入则不会保存这些裁片。使用提供的 Figma 工作区截图进行了一次模型转换，得到 62 个通过校验的节点，包含 Frame、Text、Button、Card 和 Input，并保留了最多两层容器嵌套；实际结果会随截图和模型输出变化。自动识别侧重主要结构，生成后可继续在图层、画布和检查器里补细节。

### 第 6 步：通过系统对话改页面和生成图片

在“对话调整页面”中直接写希望改什么。选中图层后，对话框会显示修改目标；模型只能修改所选图层及其子图层，页面其他部分、数据字段和问题记录保持不变。多选时会把整个选区作为目标；不选图层时则按整页修改。锁定图层需要先在 Layers 面板解锁。候选结果通过 UI-DSL 校验后才会更新画布，且仍可撤销。

![系统对话提出首屏修改](pulseflow-studio-manual/screenshots/09-design-chat-prompt.png)

本次要求生成一张银白色双足服务机器人处于工业实验室的图片，机器人靠右、左侧留白、深蓝和电光青色调，并作为 Hero 背景。

![系统对话中的机器人图片要求](pulseflow-studio-manual/screenshots/10-design-chat-image-prompt.png)

如果系统提示图片生成失败，先确认 API 地址、模型名、密钥和服务商额度，再点击“重新生成”。失败不会自动清除当前页面；先确认画布上的内容，再决定是否重试，避免重复请求。

![图片生成状态与预览](pulseflow-studio-manual/screenshots/11-design-chat-image-result.png)

这张记录展示系统提示和图片预览区域。当前截图里模型提示本次图片请求失败，因此不能把它当作成功凭证；需要时使用下图的重试入口。已应用到画布的机器人主视觉以“机器人主视觉应用后的官网画布”截图为准。

![图片生成重试与移除入口](pulseflow-studio-manual/screenshots/12-image-retry-result.png)

发布前再核对一次示例指标与表单能力：演示数据应标注为示例，预约表单若未连接后端就只能展示页面，不能承诺真实收集线索。此项检查在下方发布检查页面完成。

### 第 7 步：发布检查并发布

发布前检查页面内容、图片、导航和表单说明。然后点击“运行检查并发布”。Studio 会执行 DSL 校验、预览编译和页面构建；全部通过后创建只读发布版本。

![发布前检查页面](pulseflow-studio-manual/screenshots/15-publish-preflight.png)

![发布前的准备状态](pulseflow-studio-manual/screenshots/18-publish-ready.png)

截图显示三项门禁均通过，已发布版本号为 `lingxi-robot-home-v2`。

![发布成功状态](pulseflow-studio-manual/screenshots/19-published.png)

## 5. 下次如何使用

1. 分别启动 API（`pnpm --filter @pulseflow/api dev`）和 Studio（`pnpm --filter @pulseflow/studio dev`），打开 Studio 终端显示的本地地址。
2. 用工作区令牌登录，选择“企业官网”或“管理平台”。
3. 写清需求并解析，选择需要生成的章节。
4. 检查 UI-DSL 与字段，回答所有待澄清问题，再运行结构校验。
5. 在画布中用对话调整文字和图片，也可以用图层、画布与右侧属性面板精修。
6. 核对示例数据、表单能力和图片，再点击“运行检查并发布”。
7. 记录发布版本号。若要部署到实际 Vue 项目或公网，继续阅读[中文使用指南](中文使用指南.md)并使用 PulseFlow CLI；Studio 发布本身不会托管公网网站。

## 6. 常见情况

- **生成范围为 0 章**：回到章节选择，把需要的章节勾选上；整段无标题内容可选择“无标题内容”。
- **草稿结构校验失败**：查看页面提示的诊断路径，修正 UI-DSL 或字段，再重新校验。
- **图片生成失败**：查看图片预览区域的提示，确认图片模型、密钥、配额和网络后再点“重新生成”。
- **发布门禁未通过**：根据 DSL、预览编译或页面构建对应的诊断修复后再发布。
- **想改变画布位置却拖不动**：先点击对象选中；选中对象后再拖动。未选中的图层保留层级拖放行为。

## 截图目录

本次流程截图位于 `docs/pulseflow-studio-manual/screenshots/`，包含登录、需求导入、草稿确认、设计画布、系统对话、图片生成、示例数据和发布状态。
