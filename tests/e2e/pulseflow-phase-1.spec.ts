import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { validPage } from '../../packages/ui-dsl/test/fixtures.js';

const runFile = promisify(execFile);
const workspaceAuth = ['e2e', 'placeholder', 'token'].join('-');
const apiPort = Number(process.env.PULSEFLOW_E2E_API_PORT ?? 3317);
const cli = resolve('packages/cli/dist/main.js');

test('imports a synthetic requirement, edits and publishes a page, then safely pulls it with CLI', async ({ page }) => {
  test.setTimeout(480_000);
  const target = await mkdtemp(join(tmpdir(), 'pulseflow-e2e-project-'));
  try {
    await page.goto('/');
    await page.getByTestId('token-input').fill(workspaceAuth);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('requirement-text')).toBeVisible();

    await page.getByTestId('requirement-text').fill('Synthetic demo request: list orders with a status field.');
    await page.getByTestId('parse-requirement').click();
    await page.getByTestId(/^select-/).check();
    await page.getByTestId('generate-draft').click();
    await expect(page.getByTestId('draft-ready')).toBeVisible();
    await page.locator('#question-owner').fill('Synthetic Operations');
    await page.getByTestId('confirm-draft').click();
    await expect(page.getByRole('status').filter({ hasText: '校验通过并已保存草稿' })).toBeVisible();

    const editedDsl = {
      ...validPage,
      title: 'Monaco edited demo page',
      nodes: validPage.nodes.map((node, index) => index === 0
        ? { ...node, props: { ...node.props, title: 'Monaco edited demo page' } }
        : node)
    };
    await page.getByTestId('enter-design').click();
    await expect(page.getByTestId('dsl-monaco')).toBeVisible();
    await page.evaluate((source) => {
      const editor = window.__pulseflowMonacoEditor;
      if (!editor) throw new Error('Monaco editor test hook is unavailable');
      editor.setValue(source);
    }, JSON.stringify(editedDsl, null, 2));
    await expect(page.getByText('VALID', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '页面预览' }).getByRole('heading', { name: 'Monaco edited demo page' })).toBeVisible();
    await expect(page.getByTestId('preview-status')).toContainText('预览就绪');
    await page.getByTestId('move-down-header').click();
    const rootNodes = page.locator('.node-stack > [data-testid^="canvas-node-"]');
    await expect(rootNodes.nth(0)).toHaveAttribute('data-testid', 'canvas-node-table');
    await expect(rootNodes.nth(2)).toHaveAttribute('data-testid', 'canvas-node-header');
    await page.getByTestId('publish').getByTestId('publish-action').click();
    await expect(page.getByTestId('publish-status')).toHaveText('已发布', { timeout: 420_000 });
    for (const label of ['DSL', '预览编译', '类型检查', '干净模板构建']) {
      const gate = page.locator('.gates li').filter({ hasText: label });
      await expect(gate.getByText('通过', { exact: true })).toBeVisible({ timeout: 120_000 });
    }

    const baseUrl = `http://127.0.0.1:${apiPort}`;
    const firstPull = await runFile(process.execPath, [cli, 'pull', validPage.pageId, '--base-url', baseUrl], {
      cwd: target, env: { ...process.env, PULSEFLOW_TOKEN: workspaceAuth }
    });
    expect(firstPull.stdout).toContain(`/${validPage.pageId}`);
    const pageFile = join(target, 'src/views', validPage.pageId, 'Page.vue');
    const localEntry = await readFile(pageFile, 'utf8');
    expect(localEntry).toContain('PageHeader');
    const localRouteManifest = await readFile(join(target, 'src/views', validPage.pageId, 'manifest.json'), 'utf8');
    expect(localRouteManifest).toContain(`src/views/${validPage.pageId}/Page.vue`);
    expect(localRouteManifest).toContain('Monaco edited demo page');

    const conflictEdit = `${localEntry}\n<!-- local edit preserved -->\n`;
    await writeFile(pageFile, conflictEdit);
    const originalHash = createHash('sha256').update(await readFile(pageFile)).digest('hex');
    const conflict = await runFile(process.execPath, [cli, 'pull', validPage.pageId, '--base-url', baseUrl], {
      cwd: target, env: { ...process.env, PULSEFLOW_TOKEN: workspaceAuth }
    }).then(() => ({ stdout: '', stderr: '' }), (error: { stdout?: string; stderr?: string; code?: number }) => error);
    expect(conflict.code).toBe(1);
    expect(`${conflict.stdout}\n${conflict.stderr}`).toContain('Local changes conflict');
    expect(`${conflict.stdout}\n${conflict.stderr}`).toContain('@@');
    expect(`${conflict.stdout}\n${conflict.stderr}`).toContain('local edit preserved');
    const finalHash = createHash('sha256').update(await readFile(pageFile)).digest('hex');
    expect(finalHash).toBe(originalHash);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
