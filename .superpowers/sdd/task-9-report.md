# Task 9 — 发布门槛、不可变版本与下载 API

## 实现

- `runReleaseGates` 固定执行 DSL/字段/语义校验、SFC 预览编译、Vue 类型检查、干净模板 Vite build；首个失败硬门槛立即停止。ESLint 最后执行，失败只作为 warning。
- API 从已确认草稿确定性生成文件，不接受外部代码作为发布产物。`POST /api/publications` 返回版本与门槛结果；`GET /api/publications/:versionId` 读取指定不可变版本；`GET /api/cli/pages/:pageId/latest` 只返回最新已发布版本。全部在现有 Bearer 鉴权与限流组内。
- SQLite `publication_versions` 保存 DSL、字段、语义答案、manifest 与代码文件。更新/删除版本和更新/删除已发布草稿由 trigger 禁止。发布插入使用 immediate transaction，重新比较当前 confirmed 草稿快照；门槛运行期间有并发修改则返回 409，不插入旧版本。
- 设计页预览下方接入 `PublishPanel`。发布前 flush Monaco、保存当前 DSL 为 confirmed draft；展示四项硬门槛、ESLint 警告、路径诊断和版本。发布后以及发布期间的新设计修改会进入新的草稿。

## TDD

- RED：`pnpm --filter @pulseflow/api exec vitest run --config ../../vitest.config.ts apps/api/test/release-gates.test.ts apps/api/test/publications.test.ts`；新模块缺失，两组 suite 失败。`pnpm --filter @pulseflow/studio exec vitest run test/publish-panel.test.ts`；组件缺失，一组 suite 失败。
- GREEN：API 发布/门槛测试 10/10、Studio 面板及设计交互 15/15。加入真实干净模板门槛测试后 release-gates 8/8 通过。
- 并发回归 RED：`pnpm --filter @pulseflow/api exec vitest run --config ../../vitest.config.ts apps/api/test/publications.test.ts --maxWorkers=1`，新用例得到 201，预期 409；加入事务内快照比较后 4/4 通过。
- Studio 发布期间编辑回归 RED：`pnpm --filter @pulseflow/studio exec vitest run test/design-editor.test.ts --maxWorkers=1`，新用例草稿 ID 没变化；修复后 14/14 通过。

## 验证

- API typecheck、API build、Studio typecheck、Studio build 通过。
- `pnpm lint`、`pnpm audit`、`git diff --check` 通过；audit 无已知漏洞。
- Studio 默认并行 Vitest 在当前机器负载下随机触发 5 秒超时；最终 `pnpm --filter @pulseflow/studio exec vitest run --coverage --maxWorkers=1 --testTimeout=20000` 为 45/45 通过，Statements 89.66%、Branches 83.05%、Functions 89.85%、Lines 93.66%。
- 最终 `pnpm --filter @pulseflow/api exec vitest run --coverage --config ../../vitest.config.ts apps/api/test --maxWorkers=1` 为 43/43 通过，Statements 92.2%、Branches 86.58%、Functions 97.22%、Lines 94.58%。真实干净模板门槛包含在测试中，四个硬门槛通过。

## 合约与风险

- 下载合约：`GET /api/cli/pages/:pageId/latest` → `{ ok: true, data: { pageId, versionId, createdAt, manifest, files } }`。文件路径来自固定生成器，供 Task 10 CLI 使用。
- 真实模板门槛会执行 `vue-tsc` 和 Vite build，机器繁忙时发布需要等待。临时模板目录位于工作树根并在门槛完成后清理。
- 当前 Studio 页面刷新后不会恢复上一轮门槛结果；不可变版本仍可通过 API 查到。
