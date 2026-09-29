# Studio 与开发助手共享的全局 Skill 库设计

## 目标

在一个共享目录中管理 Markdown Skills，使 Codex 等项目开发助手能够自动发现它们，Studio 页面 AI 也能按用途读取同一份规则。页面生成、对话修改、图片转 UI-DSL 和导出布局优化共享此目录。

## 现状

- 模型提示词集中在 `packages/model-adapter/src/prompt.ts` 和视觉导入链路。
- API 使用工作区 Bearer Token 保护，Studio 文件数据持久化在 SQLite。
- Codex 项目 Skills 自动发现目录为 `.agents/skills/<skill-name>/SKILL.md`。当前还没有与 Studio AI 共用的目录或管理界面。

## 设计

### 数据和作用域

以项目目录 `.agents/skills/<skill-name>/SKILL.md` 作为唯一来源。frontmatter 遵循 Codex Skill 格式：标准 `name` 必须与目录 slug 一致，`description` 必填；可选保留 `license`、`compatibility` 和 `metadata` 字符串项。Studio 展示名称、用途和启用状态保存在 `metadata` 下的 `pulseflow_studio_*` 键中，不占用开发助手的标准字段。正文是 Markdown 指令。用途包含 `pageGeneration`、`pageRefinement`、`imageToDsl`、`layoutOptimization`。目录对所有 Studio 文件共享，一个 Skill 可用于多个用途。Codex 等读取该目录的项目开发助手可发现这些文件；在当前会话新增或修改的 Skill 于开发助手重新加载项目 Skill 后生效。API 可通过 `PULSEFLOW_SKILLS_DIR` 指向部署环境中的共享 Skills 卷，默认使用仓库 `.agents/skills`；配置的相对路径以仓库根目录为基准，不依赖 API 进程启动目录。

API 提供受 Bearer Token 保护的列表、新建、更新、删除接口，对 Skill 数量、slug、frontmatter、正文长度、用途枚举和未知字段做严格校验。文件操作只能访问配置目录下单层 Skill 文件夹的 `SKILL.md`，拒绝符号链接和路径穿越，并通过临时文件加原子重命名保存。服务端只读取启用且用途匹配的 Skills。Skill 正文作为普通文本插入提示词，Studio 使用文本插值展示，不作为 HTML 执行。

### 管理入口

Studio 顶部提供“AI 技能”入口，打开管理面板。用户可以新增 Skill、编辑名称和规则、勾选用途、启用/停用、删除。面板显示 Skill 名称、用途和项目目录路径。文件保存后，Studio API 读取同一文件；Codex 项目开发助手可从 `.agents/skills` 发现它。

### 提示词接入

在服务端为每类 AI 请求扫描匹配用途且启用的 Skills，并以有边界的“共享工作区规则”段落附加到系统提示词中。调用方不能通过请求体传入或覆盖 Skill 内容。每个系统提示词继续明确要求输出白名单 JSON、禁止任意代码，并强调页面内容和截图是待分析数据而非指令。

生成、精修、图片转 DSL 和布局分析各自只读取对应用途的 Skills。暂无对应启用 Skill 时保持当前提示词行为。图片生成提示词也不自动注入页面布局 Skills。

## 安全与数据完整性

- Skill 管理 API 与其他 Studio API 一样要求有效工作区 Token，并受现有速率限制。
- 所有字段严格校验；每条 Skill 正文上限 8,000 字符，目录最多 50 条。
- 删除或停用 Skill 只影响后续模型请求，不重写已有页面。
- Skill 正文按文本插入系统提示，响应仍经过模型输出 schema、UI-DSL 校验与现有业务约束。
- 开发助手与 Studio 使用同一份项目文件，不生成第二套数据库副本。

## 验收标准

1. 用户可以在 Studio 全局创建、查看、编辑、启用、停用和删除符合目录约束的 Skills。
2. 保存的 `SKILL.md` 可被重新载入项目 Skills 的开发助手发现，且无需维护数据库副本。
3. Skills 在不同 Studio 文件间共享；每个 Skill 可勾选一个或多个 AI 用途。
4. 各 AI 链路只收到启用且匹配用途的 Skill；API 请求不能覆盖服务端 Skills。
5. 无匹配 Skill 时，现有 AI 页面生成、精修和图片导入行为不变。
6. 路径穿越、符号链接、非法用途、超限正文、未知字段和未认证请求均被拒绝；Skill 正文不作为 HTML 渲染。

## 范围

本功能管理 Studio 页面 AI 与项目开发助手共享的规则文件，不尝试修改用户主目录中的用户级 Skills，也不运行 Skill 正文中的代码。
