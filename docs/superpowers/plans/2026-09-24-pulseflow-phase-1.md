# PulseFlow Phase 1 实现计划

> **For agentic workers:** 实施时使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`，按任务逐项推进。每步用 `- [ ]` 跟踪。

**Goal:** 建成一个可演示的 T2UI 流程：导入需求、确认实体和 UI-DSL、由设计人员修改页面、预览和发布，再由 CLI 安全拉入 Vue 项目。

**Architecture:** 使用 TypeScript workspace 划分 Studio、API、UI-DSL、模型适配器、代码生成、Vue 模板和 CLI。UI-DSL 是规范状态，所有设计编辑、预览和发布围绕同一份 DSL；发布产物不可变，CLI 仅拉取。

**Tech Stack:** Studio 和生成页面使用 Vue 3、TypeScript、Vite、Ant Design Vue 4；计划采用 pnpm workspace、Node.js TypeScript API、Fastify、SQLite、Zod、Mammoth、Cheerio、Monaco Editor、Vitest、Vue Test Utils 和 Playwright。

## Global Constraints

- 页面模板固定使用 Vue 3、TypeScript、Vite、Ant Design Vue 4、确定性表单/表格布局及默认 Ant Design Vue tokens。
- 只允许 `Card`、`PageHeader`、`Form`、`FormItem`、`Input`、`Select`、`Button`、`Table`、`Row`、`Col`、`Tag`、`Badge` 及 DSL 中明确列出的属性、布局和插槽。
- 画布/Monaco 不能执行任意 JavaScript 或 CSS；预览只能渲染白名单 UI-DSL 和 mock handler。
- 字段规则支持必填、枚举、手机号及统一社会信用代码格式预设；未解决的业务语义阻止发布，未指定布局/样式采用默认值。
- `PageHeader.tags`、`Table.bodyCell` 及专线样例中的状态条件展示必须可编辑、可预览、可生成。
- 原始 `.docx` 和原始需求文字只在处理期间存在；确认的 DSL 与生成代码可持久化。
- 模型服务端点由管理员配置；不得设置公共默认模型，不得把 token 或 API key 写入源码、生成物或日志。
- 发布硬门槛为 DSL 校验、预览编译、类型检查、干净模板构建；ESLint 仅提示。
- CLI 使用 `PULSEFLOW_TOKEN`，将最新已发布版本拉到 `src/views/<pageId>`，打印路由片段；本地改动时展示差异并停止，不覆盖。
- API 每个 endpoint 都限流；登录校验和 DOCX 上传使用更严格的限额。所有请求体、文件、DSL、pageId 均在系统边界校验。
- Phase 1 不实现 D2C 输入、离线部署、私有组件适配器、团队角色、SSO、MR 自动化、CLI push 或三方合并。
- 验收覆盖专线样例和一份未参与调试的 holdout 需求；自动化测试覆盖率目标不低于 80%。

---

## 实施前需要确认的技术默认值

规格没有限定内部服务技术栈。下面计划先用这些低耦合默认值拆分文件和接口，开始写代码前请在计划审阅时确认：

1. pnpm workspace；Node.js 22 + TypeScript + Fastify API；SQLite 本地持久化。
2. 模型适配器使用 OpenAI Chat Completions 兼容协议，从 `PULSEFLOW_MODEL_BASE_URL`、`PULSEFLOW_MODEL_NAME` 和 `PULSEFLOW_MODEL_API_KEY` 读取管理员配置；不包含公开模型默认值。
3. Monaco 编辑规范 UI-DSL 的 JSON 视图 AST，不直接编辑生成的 Vue SFC；无效 JSON 保留最近一次有效预览。
4. Studio 与 CLI 共用服务端配置的 workspace token；Studio 只在内存中保留登录 token，CLI 从 `PULSEFLOW_TOKEN` 读取。
5. 当前工作区没有 Git 元数据，也没有专线样例或 holdout 文件。实现时需要先按用户选择初始化/接入 Git；真实需求由用户从工作区外提供并在手工演示时临时上传，不能提交到代码库，也不能拿专线样例同时充当 holdout。

## 文件结构

| 路径 | 职责 |
| --- | --- |
| `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json` | workspace、统一脚本和 TS 配置 |
| `apps/api/src/app.ts`、`apps/api/src/server.ts` | Fastify 应用装配和服务启动 |
| `apps/api/src/config.ts`、`apps/api/src/auth/` | 环境配置和单 workspace token 校验 |
| `apps/api/src/routes/` | 需求解析、草稿、校验、发布、CLI 下载接口 |
| `apps/api/src/db/` | SQLite schema、迁移和 repository |
| `apps/api/src/services/` | 需求解析、T2UI、发布门槛和 artifact 服务 |
| `packages/contracts/src/` | API envelope、draft DTO 和发布 DTO |
| `packages/ui-dsl/src/` | UI-DSL 类型、schema、诊断和字段校验 |
| `packages/requirement-import/src/` | DOCX/文本解析和章节抽取 |
| `packages/model-adapter/src/` | 配置化模型调用、提示构造和响应解析 |
| `packages/page-generator/src/` | DSL 渲染、页面源码、类型和事件接口生成 |
| `packages/vue-template/` | 独立可构建的 Vue 3 + Ant Design Vue 4 页面模板 |
| `packages/cli/src/` | `pulseflow pull`、认证、manifest、冲突检测和 diff |
| `apps/studio/src/features/` | 登录、需求导入、实体确认、设计编辑、预览和发布界面 |
| `tests/e2e/` | 完整 T2UI、人工设计、发布和 CLI 验收流程 |

### 跨包数据契约

```ts
export type ComponentType =
  | 'Card' | 'PageHeader' | 'Form' | 'FormItem' | 'Input' | 'Select'
  | 'Button' | 'Table' | 'Row' | 'Col' | 'Tag' | 'Badge';

export interface UiNode {
  id: string;
  type: ComponentType;
  props: Record<string, unknown>;
  children: UiNode[];
  slots: SlotBinding[];
}

export type SlotBinding =
  | { name: 'tags'; children: UiNode[] }
  | { name: 'bodyCell'; field: string; cases: Array<{ equals: string; label: string; color: 'success' | 'processing' | 'warning' | 'error' | 'default' }> };

export interface EntityField {
  id: string;
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  rules: FieldRule[];
}

export interface SemanticQuestion {
  id: string;
  question: string;
  answer?: string;
}

export interface PageDsl {
  schemaVersion: 1;
  pageId: string;
  title: string;
  nodes: UiNode[];
}

export interface Draft {
  id: string;
  pageId: string;
  pageDsl: PageDsl;
  entityFields: EntityField[];
  semanticQuestions: SemanticQuestion[];
  status: 'draft' | 'confirmed';
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string }; diagnostics?: Diagnostic[] };
```

语义问题在存在空白 `answer` 时视为未解决。JSON DSL 对属性、插槽、组件类型和状态等值条件做严格校验；未知字段或节点给出带路径的 diagnostic。

## Task 1: 建立 workspace 和健康检查纵向切片

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Test: `apps/api/test/health.test.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Interfaces:** `buildApp(): FastifyInstance` 返回可通过 `inject()` 测试的 API 应用；服务启动代码只放在 `server.ts`，导入 `app.ts` 不监听端口。

- [ ] 先写 `health.test.ts`：

```ts
it('returns the health envelope', async () => {
  const response = await buildApp().inject({ method: 'GET', url: '/health' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ok: true });
});
```

- [ ] 运行 `pnpm --filter @pulseflow/api test`，确认失败原因是路由尚不存在。
- [ ] 建立 pnpm workspace、共享 TypeScript/Vitest 配置和最小 Fastify app；实现 `/health`：

```ts
export function buildApp(): FastifyInstance {
  const app = Fastify();
  app.get('/health', async () => ({ ok: true }));
  return app;
}
```

- [ ] 运行 `pnpm --filter @pulseflow/api test`、`pnpm --filter @pulseflow/api typecheck` 和 `pnpm --filter @pulseflow/api build`，三项通过。
- [ ] 将 workspace 的 `dev`、`build`、`typecheck`、`test`、`coverage`、`lint`、`verify` 脚本设为后续统一入口；`verify` 运行 typecheck、tests、coverage 和 build。lint 单独报告；它不改变产品发布时 ESLint 仅提示的规则。

## Task 2: 建立 UI-DSL、组件白名单和业务字段校验

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/api-result.ts`
- Create: `packages/contracts/src/draft.ts`
- Test: `packages/contracts/test/draft.test.ts`
- Create: `packages/ui-dsl/package.json`
- Create: `packages/ui-dsl/src/types.ts`
- Create: `packages/ui-dsl/src/schema.ts`
- Create: `packages/ui-dsl/src/components.ts`
- Create: `packages/ui-dsl/src/diagnostics.ts`
- Create: `packages/ui-dsl/src/validate-page.ts`
- Create: `packages/ui-dsl/src/validate-field.ts`
- Create: `packages/ui-dsl/src/index.ts`
- Create: `packages/ui-dsl/test/fixtures.ts`
- Test: `packages/ui-dsl/test/validate-page.test.ts`
- Test: `packages/ui-dsl/test/validate-field.test.ts`

**Interfaces:** 导出 `PageDsl`、`UiNode`、`EntityField`、`Diagnostic`；`validatePageDsl(value: unknown): ValidationResult`；`validateFieldValue(field: EntityField, value: unknown): Diagnostic[]`。`ValidationResult` 包含 `ok`、可选的 `dsl` 和 `diagnostics`。

- [ ] 先测试合法白名单页面、未知组件、未知属性、错误插槽、重复节点 ID 和非法条件表达式；断言诊断包含稳定 `code` 与 DSL `path`：

```ts
const result = validatePageDsl(validPage);
expect(result.ok).toBe(true);
expect(validatePageDsl({ ...validPage, nodes: [{ id: 'x', type: 'Script', props: {} }] })).toMatchObject({
  ok: false,
  diagnostics: [{ code: 'component.unsupported', path: 'nodes[0].type' }],
});
```

- [ ] 先测试 required、enum、phone、credit-code 四类字段规则的有效/无效值，并固定 `FormItem.props.fieldId` 到实体字段的绑定方式。
- [ ] 运行 `pnpm --filter @pulseflow/ui-dsl test`，确认新增行为测试先失败。
- [ ] 用 Zod 实现版本化 DSL schema。页面节点包含稳定 `id`、符合 `[A-Za-z0-9_-]+` 的 `pageId`、白名单 `type`、严格 `props`、`children` 和允许的 `slots`；状态条件只支持 DSL 定义的等值表达式，不接受可执行源码。字段规则用判别联合：

```ts
type FieldRule =
  | { kind: 'required' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'format'; format: 'phone' | 'creditCode' };
```

- [ ] 将组件属性和插槽 schema 写入 `components.ts`：Card(title)、PageHeader(title/subtitle)、Form(layout)、FormItem(fieldId/label)、Input(placeholder/disabled)、Select(options/placeholder)、Button(label/variant/event)、Table(columns/dataSourceKey)、Row(gutter)、Col(span 1–24)、Tag(text/color)、Badge(text/status)。`PageHeader.tags` 只接收 Tag/Badge 节点；`Table.bodyCell` 只接收字段名及静态等值→标签/颜色映射。

- [ ] 实现 `packages/contracts/src/draft.ts`，只从 `@pulseflow/ui-dsl` 导入 DSL/字段/诊断类型；运行 contract tests 确认 unresolved 判定对 `answer` 缺失、空白和非空值一致。
- [ ] 在 `types.ts` 固定 `EntityField`（字段名、标签、类型、规则）及 `SemanticQuestion`（稳定 id、问题、可选答案）；`T2uiResult` 和持久化 `Draft` 明确引用这两个类型，未回答的问题保持 unresolved。
- [ ] 运行 `pnpm --filter @pulseflow/contracts test`、`pnpm --filter @pulseflow/ui-dsl test` 及两包 typecheck，全部通过。

## Task 3: 解析需求文字和 DOCX 标题章节，不持久化原文

**Files:**
- Create: `packages/requirement-import/package.json`
- Create: `packages/requirement-import/src/types.ts`
- Create: `packages/requirement-import/src/parse-text.ts`
- Create: `packages/requirement-import/src/parse-docx.ts`
- Create: `packages/requirement-import/src/errors.ts`
- Test: `packages/requirement-import/test/parse-text.test.ts`
- Test: `packages/requirement-import/test/parse-docx.test.ts`

**Interfaces:** `RequirementSection` 为 `{ id: string; heading: string | null; text: string }`；`parseTextSections(text): RequirementSection[]`；`parseDocxSections(buffer): Promise<RequirementSection[]>`。两种输入使用相同章节结构，heading 缺失时由 UI 提供手工选区/粘贴入口。

- [ ] 先测试标题切分、无标题文本、空文本、损坏 DOCX、空 DOCX、超限输入和不支持文件类型。
- [ ] 测试文本入口对相同标题语法产生确定章节：

```ts
expect(parseTextSections('# 订单信息\n字段 A\n## 联系方式\n字段 B')).toEqual([
  { id: 'section-1', heading: '订单信息', text: '字段 A' },
  { id: 'section-2', heading: '联系方式', text: '字段 B' },
]);
```

- [ ] 运行 `pnpm --filter @pulseflow/requirement-import test`，确认解析行为测试先失败。
- [ ] 实现文本解析和 Mammoth DOCX 转换；Cheerio 只用于读取 `h1`-`h6`、`p` 的纯文本，不渲染转换出的 HTML：

```ts
export async function parseDocxSections(buffer: Buffer): Promise<RequirementSection[]> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return parseDocxHtml(value);
}
```

- [ ] 为 HTTP 上传设定大小上限并校验 `.docx` 扩展名与 MIME；错误返回可操作诊断且不返回服务端堆栈。
- [ ] 运行 `pnpm --filter @pulseflow/requirement-import test` 和 typecheck，全部通过。

## Task 4: 实现配置化 T2UI 模型适配器

**Files:**
- Create: `packages/model-adapter/package.json`
- Create: `packages/model-adapter/src/config.ts`
- Create: `packages/model-adapter/src/prompt.ts`
- Create: `packages/model-adapter/src/client.ts`
- Create: `packages/model-adapter/src/errors.ts`
- Test: `packages/model-adapter/test/client.test.ts`
- Test: `packages/model-adapter/test/prompt.test.ts`

**Interfaces:** `T2uiInput` 包含用户选定的 `RequirementSection[]`；`T2uiResult` 为 `{ entityFields: EntityField[]; pageDsl: PageDsl; semanticQuestions: SemanticQuestion[] }`；`generateDraft(input, config): Promise<T2uiResult>`。配置由 `PULSEFLOW_MODEL_BASE_URL`、`PULSEFLOW_MODEL_NAME`、`PULSEFLOW_MODEL_API_KEY` 提供。

- [ ] 先测试提示中包含选中需求和组件白名单，明确要求返回实体草稿、DSL、未解决语义，不推断 API/业务实现。
- [ ] 先写一条确定性客户端测试：注入 fetch mock，断言请求的 `messages` 含所选章节、response_format 为 JSON object，返回文本经解析后得到一个 `T2uiResult`。
- [ ] 先测试合法结构化响应、模型超时、HTTP 非 2xx、错误 JSON、schema 不匹配和缺少 endpoint 配置。
- [ ] 运行 `pnpm --filter @pulseflow/model-adapter test`，确认行为测试先失败。
- [ ] 依确认的 OpenAI-compatible 约定实现 `fetch` 客户端；对响应做 Zod 校验；用可注入 fetch 和时钟保持测试可重复：

```ts
const requestBody = {
  model: config.model,
  messages: [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ],
  response_format: { type: 'json_object' },
};
const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify(requestBody),
  signal: AbortSignal.timeout(config.timeoutMs),
});
```

- [ ] 确保 Authorization/API key 不进入错误信息、请求日志或返回给 Studio 的 DTO。
- [ ] 运行 model-adapter tests 和 typecheck，全部通过。

## Task 5: 实现 API 鉴权、草稿存储和需求处理接口

**Files:**
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/auth/require-workspace-token.ts`
- Create: `apps/api/src/db/schema.sql`
- Create: `apps/api/src/db/database.ts`
- Create: `apps/api/src/db/draft-repository.ts`
- Create: `apps/api/src/db/publication-repository.ts`
- Create: `apps/api/src/routes/session.ts`
- Create: `apps/api/src/routes/requirements.ts`
- Create: `apps/api/src/routes/drafts.ts`
- Create: `apps/api/src/services/draft-service.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/auth.test.ts`
- Test: `apps/api/test/requirements.test.ts`
- Test: `apps/api/test/drafts.test.ts`

**Interfaces:** API DTO 共享 `@pulseflow/contracts`、`@pulseflow/ui-dsl` 和 `@pulseflow/requirement-import` 类型。成功响应为 `{ ok: true, data }`；错误响应为 `{ ok: false, error: { code, message }, diagnostics? }`。`POST /api/session/validate` 接收登录 token 并返回 `ApiResult<{ authenticated: true }>`；`POST /api/requirements/parse` 只返回章节；`POST /api/drafts/generate` 返回 `T2uiResult`；`POST /api/drafts`、`GET /api/drafts/:id`、`PUT /api/drafts/:id` 持久化 `Draft`。除 session 校验外的业务路由要求 workspace bearer token。

- [ ] 先写 API 集成测试：无/错 token 的业务路由返回 `401`；`POST /api/session/validate` 对正确 token 返回 `{ok:true,data:{authenticated:true}}`，错误 token 返回统一错误 envelope 和 `401`。
- [ ] 先写需求接口测试：上传 `.docx` 返回章节但 SQLite 中不出现原始文件、需求全文或文件路径；粘贴文本路径返回同一 DTO。
- [ ] 先写草稿 repository 测试：DSL/实体草稿可保存、读取和更新；非法 DSL 不可保存为有效版本。
- [ ] 草稿契约按下面字段存 JSON；SQLite 不创建原始输入列：

```ts
interface DraftRecord {
  id: string;
  pageId: string;
  pageDslJson: string;
  entityFieldsJson: string;
  semanticQuestionsJson: string;
  status: 'draft' | 'confirmed';
  updatedAt: string;
}
```

- [ ] 使用每个测试独立的临时 SQLite DB，运行 API tests 并确认新测试先失败。
- [ ] 实现配置加载、constant-time token 比较、DB migrations、repository 和 routes。除 `POST /api/session/validate` 外，所有业务路由要求 bearer token；`@fastify/rate-limit` 全局限制所有 endpoint，并为登录校验和 DOCX 上传设置更严格的限制。Studio token 仅由内存状态带入请求；API 不记录 Authorization header 或登录 body：

```ts
protectedRoutes.addHook('preHandler', async (request, reply) => {
  if (!hasValidBearerToken(request.headers.authorization, config.workspaceToken)) {
    return reply.code(401).send({ ok: false, error: { code: 'auth.invalid', message: 'Unauthorized' } });
  }
});
```

- [ ] 需求 parse/generate 完成后不持久化原始文字或 DOCX buffer；T2UI 错误不得覆盖已有 DSL 草稿。
- [ ] 运行 `pnpm --filter @pulseflow/api test`、`typecheck` 和 `build`，全部通过。

## Task 6: 构建 Studio 登录、需求导入、T2UI 生成和实体确认流程

**Files:**
- Create: `apps/studio/package.json`
- Create: `apps/studio/vite.config.ts`
- Create: `apps/studio/index.html`
- Create: `apps/studio/src/main.ts`
- Create: `apps/studio/src/App.vue`
- Create: `apps/studio/src/router.ts`
- Create: `apps/studio/src/shared/api/client.ts`
- Create: `apps/studio/src/features/auth/LoginView.vue`
- Create: `apps/studio/src/features/auth/auth-store.ts`
- Create: `apps/studio/src/features/requirements/RequirementIntakeView.vue`
- Create: `apps/studio/src/features/requirements/requirement-api.ts`
- Create: `apps/studio/src/features/draft/DraftReviewView.vue`
- Create: `apps/studio/src/features/draft/draft-api.ts`
- Test: `apps/studio/test/requirements-flow.test.ts`

**Interfaces:** 登录成功后 auth store 只在内存保存 token；API client 自动加 `Authorization: Bearer <token>`。需求页返回 `RequirementSection[]`，用户选择章节后生成实体字段、UI-DSL 和 `SemanticQuestion[]`；未回答问题可留在草稿供后续设计，但仍为空白的问题阻止发布。

- [ ] 先写组件测试：未登录时跳登录；上传 DOCX 显示标题章节；无标题时显示手动输入；选择章节后显示生成草稿；模型错误保留输入；确认后显示 DSL/字段校验反馈。
- [ ] 用 `data-testid` 固定测试入口，断言表单输入后调用 API client 且成功返回前保留输入：

```ts
await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段\n企业名称');
await wrapper.get('[data-testid="generate-draft"]').trigger('click');
expect(api.generateDraft).toHaveBeenCalledWith(expect.objectContaining({ sections: expect.any(Array) }));
expect(wrapper.get('[data-testid="requirement-text"]').element.value).toContain('订单字段');
```

- [ ] 运行 `pnpm --filter @pulseflow/studio test`，确认新组件测试先失败。
- [ ] 实现 Vue Router、Ant Design Vue 默认主题、登录页、文本/DOCX intake、章节选择、手动粘贴和实体草稿确认。
- [ ] 校验文件大小/类型；成功处理后清理原始输入状态；API 错误显示友好信息，不清掉已编辑 DSL。
- [ ] 运行 Studio tests、typecheck 和 Vite build，全部通过。

## Task 7: 构建设计画布和 Monaco 双向 DSL 编辑

**Files:**
- Create: `apps/studio/src/features/design/DesignStudioView.vue`
- Create: `apps/studio/src/features/design/design-store.ts`
- Create: `apps/studio/src/features/design/ComponentPalette.vue`
- Create: `apps/studio/src/features/design/DesignCanvas.vue`
- Create: `apps/studio/src/features/design/NodePropertyEditor.vue`
- Create: `apps/studio/src/features/design/DslMonacoEditor.vue`
- Create: `apps/studio/src/features/design/design-diagnostics.ts`
- Test: `apps/studio/test/design-store.test.ts`
- Test: `apps/studio/test/design-editor.test.ts`

**Interfaces:** Store 只维护一份 `PageDsl`；导出 `addNode(type, parentId, index)`、`removeNode(nodeId)`、`moveNode(nodeId, parentId, index)`、`updateNodeProps(nodeId, patch)` 和 `applyJsonEdit(source)`。画布、属性面板、Monaco JSON 编辑器订阅同一 store。

- [ ] 先测试白名单组件增删、同父节点重排、属性编辑、DSL JSON 编辑反映到画布、画布编辑反映到 Monaco，以及无效 JSON 不改变最后有效 DSL。
- [ ] 将编辑器解析/提交结果固定为 discriminated union，防止解析错误覆盖 DSL：

```ts
type JsonEditResult =
  | { ok: true; dsl: PageDsl; diagnostics: [] }
  | { ok: false; dsl: PageDsl; diagnostics: Diagnostic[] };
```

- [ ] 运行 `pnpm --filter @pulseflow/studio test`，确认同步行为测试先失败。
- [ ] 实现组件面板与画布的拖拽/按钮重排、白名单属性面板和 Monaco JSON AST 编辑器。`applyJsonEdit` 仅在 parse 与 schema 都通过时替换规范状态：

```ts
function applyJsonEdit(source: string): JsonEditResult {
  try {
    const parsed = validatePageDsl(JSON.parse(source) as unknown);
    if (!parsed.ok || !parsed.dsl) {
      return { ok: false, dsl: currentDsl.value, diagnostics: parsed.diagnostics };
    }
    currentDsl.value = parsed.dsl;
    return { ok: true, dsl: parsed.dsl, diagnostics: [] };
  } catch {
    return {
      ok: false,
      dsl: currentDsl.value,
      diagnostics: [{ code: 'json.parse', path: '$', severity: 'error', message: 'Invalid JSON' }],
    };
  }
}
```

- [ ] Monaco 更新经过 parse、`validatePageDsl` 和 debounce；解析失败显示行/列诊断并保留最近有效预览/DSL；拒绝未知语法，不静默删除文本。
- [ ] 运行设计 editor tests、Studio typecheck 和 build，全部通过。

## Task 8: 实现安全预览、代码生成和可构建 Vue 模板

**Files:**
- Create: `packages/page-generator/package.json`
- Create: `packages/page-generator/src/component-registry.ts`
- Create: `packages/page-generator/src/render-page.ts`
- Create: `packages/page-generator/src/generate-page.ts`
- Create: `packages/page-generator/src/generate-types.ts`
- Create: `packages/page-generator/src/generate-events.ts`
- Create: `packages/page-generator/test/render-page.test.ts`
- Create: `packages/page-generator/test/generate-page.test.ts`
- Create: `packages/vue-template/package.json`
- Create: `packages/vue-template/index.html`
- Create: `packages/vue-template/src/main.ts`
- Create: `packages/vue-template/src/App.vue`
- Create: `packages/vue-template/src/components/PageHeader.vue`
- Create: `apps/studio/src/features/preview/PreviewPanel.vue`
- Create: `apps/studio/src/features/preview/mock-handlers.ts`
- Test: `apps/studio/test/preview-panel.test.ts`

**Interfaces:** `renderPage(dsl, data, handlers): VNode` 只从组件注册表取 Vue component；`generatePage(dsl): GeneratedFile[]` 返回相对路径和内容；`GeneratedFile` 包括页面 SFC、类型/事件接口和 manifest 条目。

- [ ] 先测试未知组件被拒绝、文本按文本节点渲染、页面结构映射、`PageHeader.tags`、`Table.bodyCell`、限定状态条件和 mock handler 行为。
- [ ] 先测试 renderer 只接受校验通过的 DSL，并用注册表查组件，不动态导入名称：

```ts
expect(() => renderPage(unknownComponentPage, sampleData, mockHandlers)).toThrow('component.unsupported');
expect(renderPage(validPage, sampleData, mockHandlers)).toBeDefined();
```

`validPage` 从 `packages/ui-dsl/test/fixtures.ts` 导入；`unknownComponentPage` 是其 `nodes[0].type` 被设为未支持字符串的副本。

- [ ] 先测试生成 SFC 可被 Vue compiler-sfc 解析，生成类型/事件接口只描述字段和事件、不生成 API 实现。
- [ ] 运行 generator 和 preview tests，确认测试先失败。
- [ ] 创建独立 Vue 3 + Vite + Ant Design Vue 4 模板；由项目内 `PageHeader.vue` 承载标题和 tags，不依赖 UI 库内置同名组件。
- [ ] 用显式白名单 registry 实现预览；所有内容作为文本/已验证属性绑定，绝不 eval DSL、需求文字或 Monaco 内容：

```ts
const component = componentRegistry[node.type];
if (!component) throw new DslRenderError('component.unsupported', node.id);
return h(component, validateComponentProps(node.type, node.props), renderSlots(node.slots, data));
```

- [ ] 实现 SFC/type/event 代码生成、AntDV 默认 tokens 和确定性表单/表格布局。
- [ ] 运行 generator tests、Studio preview tests，并将 fixture 生成到临时干净模板运行 `pnpm --filter @pulseflow/vue-template build`；全部通过。

## Task 9: 实现发布门槛、不可变版本和下载 API

**Files:**
- Create: `apps/api/src/services/release-gates.ts`
- Create: `apps/api/src/services/publication-service.ts`
- Create: `apps/api/src/routes/publications.ts`
- Create: `apps/api/src/routes/cli-download.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/publication-repository.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/release-gates.test.ts`
- Create: `apps/api/test/fixtures/publish-candidates.ts`
- Create: `apps/api/test/publications.test.ts`
- Create: `apps/studio/src/features/publish/PublishPanel.vue`
- Create: `apps/studio/src/features/publish/publication-api.ts`
- Test: `apps/studio/test/publish-panel.test.ts`

**Interfaces:** `PublishCandidate` 为 `{ pageDsl, entityFields, semanticQuestions, generatedFiles }`。`GateResult` 为 `{ id: 'dsl' | 'preview-compile' | 'typecheck' | 'template-build' | 'eslint'; status: 'passed' | 'failed'; blocking: boolean; diagnostics: Diagnostic[] }`；`runReleaseGates(candidate): Promise<GateResult[]>` 先校验 DSL/字段规则/未回答语义，再按顺序执行预览编译、TypeScript 类型检查、干净模板 build；ESLint 结果为 advisory。发布 API 返回不可变 `{ pageId, versionId, createdAt, manifest, files }`，下载接口仅返回最新已发布版本。

- [ ] 先测试每项硬门槛失败都会阻止创建 publication；ESLint 失败仍允许发布但返回 warning。
- [ ] 先测试成功发布后无法更新该版本、修改 DSL 需新 draft/new version，下载接口只返回已发布版本。
- [ ] 先测试未回答的 semantic question、无效 DSL，以及 required EntityField 没有对应 `FormItem.fieldId` 均阻止发布并返回有路径的 diagnostics。
- [ ] 先测试 gates 使用稳定顺序并停止在第一个失败的硬门槛：

```ts
const result = await runReleaseGates({ ...validCandidate, pageDsl: invalidPage });
expect(result.map(({ id }) => id)).toEqual(['dsl']);
expect(result[0]).toMatchObject({ status: 'failed', blocking: true });
```

测试从 `apps/api/test/fixtures/publish-candidates.ts` 导入 `validCandidate`，仅将 `pageDsl` 换成 Task 2 的 invalid-page fixture。

- [ ] 运行 API integration tests，确认新 gate/publish 测试先失败。
- [ ] 实现顺序执行门槛、SQLite 发布记录及 artifact 持久化；只保存确认 DSL 和生成文件，不保存输入 DOCX/需求正文：

```ts
for (const gate of hardGates) {
  const result = await gate(candidate);
  results.push(result);
  if (result.status === 'failed') return results;
}
```

- [ ] 实现发布面板展示四项硬门槛结果、ESLint 提示、发布版本号和失败诊断。
- [ ] 运行 API/studio tests、typecheck、干净 Vue template build，全部通过。

## Task 10: 实现 `pulseflow pull` 和本地改动保护

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/pull-command.ts`
- Create: `packages/cli/src/api-client.ts`
- Create: `packages/cli/src/manifest.ts`
- Create: `packages/cli/src/conflict-check.ts`
- Create: `packages/cli/src/diff.ts`
- Create: `packages/cli/test/pull-command.test.ts`
- Create: `packages/cli/test/conflict-check.test.ts`

**Interfaces:** `PublishedBundle` 为 `{ pageId, versionId, files: Array<{ path: string; content: string; sha256: string }> }`；`PullResult` 为成功信息或包含 `conflicts`、`diff` 的失败信息。`pullPublishedPage({pageId, baseUrl, token, cwd}): Promise<PullResult>`；API client 暴露 `fetchLatest(pageId, token): Promise<PublishedBundle>`；manifest 记录 `pageId`、`versionId`、每个受管相对路径和 SHA-256。`readManagedFiles(target): Promise<Map<string, string>>`；`checkConflicts(previousManifest, localFiles, remoteBundle): Conflict[]`；`stageAndVerify(bundle): Promise<StagedBundle>`；`createUnifiedDiff(conflicts): string`；`applyStagedFilesAtomically(staged, target): Promise<void>`。页面 ID 只允许单路径段字符 `[A-Za-z0-9_-]+`。

- [ ] 先测空目录首次 pull 创建正确文件、输出版本和路由片段；测试 API 鉴权失败和网络失败不改目标文件。
- [ ] 先测已有 manifest 且文件未变时可升级；任一受管文件被改后输出 diff 并不改动任何目标文件。
- [ ] 先测非空目录已存在但没有 PulseFlow manifest 时拒绝覆盖；空目录允许首次 pull。测试 `../`、斜线、反斜线等 pageId 在访问文件系统前被拒绝。
- [ ] 先写纯函数冲突测试：

```ts
const previousManifest = { pageId: 'orders', versionId: 'v1', files: [{ path: 'src/views/orders/List.vue', sha256: 'old-hash' }] };
const localFiles = new Map([['src/views/orders/List.vue', 'designer-edited source']]);
const remoteBundle = { pageId: 'orders', versionId: 'v2', files: [{ path: 'src/views/orders/List.vue', content: 'new source', sha256: 'new-hash' }] };
expect(checkConflicts(previousManifest, localFiles, remoteBundle)).toEqual([
  { path: 'src/views/orders/List.vue', reason: 'locally-modified' },
]);
```

- [ ] 运行 CLI tests，确认冲突/路径安全测试先失败。
- [ ] 实现 Commander CLI；从 `PULSEFLOW_TOKEN` 读 token，不把 token 写入 manifest、日志或源码。下载到临时目录、校验 manifest/checksum 后再原子写入新/干净目标：

```ts
const bundle = await client.fetchLatest(pageId, token);
const staged = await stageAndVerify(bundle);
const conflicts = checkConflicts(previousManifest, await readManagedFiles(target), bundle);
if (conflicts.length > 0) return { ok: false, conflicts, diff: createUnifiedDiff(conflicts) };
await applyStagedFilesAtomically(staged, target);
```

- [ ] 对冲突使用统一 diff 输出，返回非零退出码并保持目标树逐字节不变。
- [ ] 运行 CLI tests、typecheck 和 build，全部通过。

## Task 11: 完成端到端演示、holdout 验收和开发文档

**Files:**
- Create: `tests/e2e/pulseflow-phase-1.spec.ts`
- Create: `tests/e2e/fixtures/`（仅测试工具，不复制真实需求原文）
- Create: `.env.example`
- Create: `README.md`
- Create: `apps/api/test/demo-flow.test.ts`

**Interfaces:** E2E 使用可注入的确定性模型 fake；API、Studio、CLI 对外契约与之前任务相同。端到端测试可在临时 DB、临时 artifact 根目录和临时用户项目目录运行。

- [ ] 先编写 API demo flow 测试，断言 parse → generate → confirm → edit → validate → publish 的数据契约和原始输入未落盘。
- [ ] 配置 Playwright 测试：输入/上传需求、选章节、生成 DSL、画布重排组件、Monaco 编辑 AST、预览状态标签、发布通过四项门槛：

```ts
await page.getByTestId('requirement-text').fill('订单列表需要状态展示');
await page.getByTestId('generate-draft').click();
await expect(page.getByTestId('draft-ready')).toBeVisible();
await page.getByTestId('move-node-down-status').click();
await page.getByTestId('publish').click();
await expect(page.getByTestId('publish-status')).toHaveText('已发布');
```

- [ ] 在 Playwright 中对干净用户项目运行 CLI pull，断言页面文件和路由片段；再修改一个受管文件，断言 CLI 输出 diff 且文件 hash 不变。
- [ ] 为解析器单测在系统临时目录中程序化构造最小 DOCX；真实专线样例和 holdout 由用户从工作区外提供，仅在手工演示时上传，处理后删除，不提交到 Git 或写入产品数据库。当前工作区不存在这两份样例；没有用户提供的文件前，不得伪造“holdout 已通过”的结论。
- [ ] 使用 fake model 跑重复确定性的 E2E；对两份真实样例分别完成手工验收，不把原文或可还原原文的结果摘要持久化。
- [ ] 编写 README：Node/pnpm 版本、安装、环境变量、模型 endpoint 约定、启动 Studio/API、CLI pull 示例、演示验收步骤和 Phase 1 限制。
- [ ] 运行 `pnpm verify`、`pnpm e2e` 和 `pnpm --filter @pulseflow/cli test`；覆盖率达到 80%，四项发布门槛和本地文件保护都通过。

## 整体完成标准

- `pnpm verify` 通过，单元/集成测试覆盖率不低于 80%，Playwright 的关键流程通过。
- 专线样例和独立 holdout 样例都完成 T2UI、人工设计修改、预览和发布；生成的 Vue 页面通过 clean-template build。
- 发布包含不可变 DSL/代码版本，CLI 能将最新版本安全拉入空目录；本地修改冲突时不覆盖。
- 原始 DOCX 和需求文字处理后不落盘；token/API key 不进入源码、artifact 或日志。
- README 足以让另一个前端开发者从干净环境启动 demo 并集成 CLI 输出。
