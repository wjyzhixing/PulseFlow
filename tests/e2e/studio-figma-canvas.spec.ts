import { expect, test, type Page } from '@playwright/test';
import { validatePageDsl, type PageDsl } from '../../packages/ui-dsl/src/index.js';
import { validFields, validPage } from '../../packages/ui-dsl/test/fixtures.js';

const workspaceAuth = ['e2e', 'placeholder', 'token'].join('-');

async function openBlankCanvas(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('token-input').fill(workspaceAuth);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('start-blank-draft').click();
  await expect(page.locator('.design-canvas')).toContainText('空白画布');
}

test('canvas actions edit one DSL, support undo/redo, and export a valid document', async ({ page }) => {
  await openBlankCanvas(page);

  await page.getByRole('button', { name: '添加文字' }).click();
  await page.locator('.pulseflow-page').click({ position: { x: 160, y: 120 } });
  const layer = page.locator('[data-pf-node-id="text-1"]');
  const text = layer.locator('.pf-text');
  await expect(text).toBeVisible();
  await page.getByRole('button', { name: '选择工具' }).click();

  const initialX = Number(await page.getByRole('spinbutton', { name: 'X 坐标' }).inputValue());
  const box = await layer.boundingBox();
  if (!box) throw new Error('Text layer did not have a measurable canvas position');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 64, box.y + box.height / 2 + 48, { steps: 4 });
  await page.mouse.up();
  const movedX = Number(await page.getByRole('spinbutton', { name: 'X 坐标' }).inputValue());
  expect(movedX).toBeGreaterThan(initialX);
  expect(movedX % 8).toBe(0);

  await text.dblclick();
  await expect(text).toHaveAttribute('contenteditable', 'true');
  await text.fill('机器人研发中心');
  await text.press('Enter');
  await expect(page.locator('.pulseflow-page')).toContainText('机器人研发中心');
  await page.getByRole('spinbutton', { name: '字号' }).fill('32');
  await page.getByRole('spinbutton', { name: '字号' }).press('Tab');
  await expect(page.locator('.pf-text')).toHaveCSS('font-size', '32px');

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.getByRole('spinbutton', { name: '字号' })).toHaveValue('16');
  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.getByRole('spinbutton', { name: '字号' })).toHaveValue('32');

  await page.getByRole('button', { name: '手机预览，390像素' }).click();
  await expect(page.locator('.canvas-stage')).toHaveCSS('width', '390px');
  await page.locator('[data-dsl-export]').click();
  const exportDialog = page.getByRole('dialog', { name: '导出 UI-DSL' });
  const exportedDsl = JSON.parse((await exportDialog.locator('pre code').textContent()) ?? 'null') as unknown;
  const validation = validatePageDsl(exportedDsl);
  expect(validation.ok).toBe(true);
  if (validation.ok) {
    const textNode = validation.dsl.nodes.find((node) => node.id === 'text-1');
    expect(textNode?.props).toMatchObject({ text: '机器人研发中心' });
    expect(textNode?.design?.position?.x).toBe(movedX);
    expect(textNode?.design?.typography?.fontSize).toBe(32);
  }
});

test('zooming around a visible object keeps the pointer position fixed when the artboard is centered', async ({ page }) => {
  await openBlankCanvas(page);
  await page.getByRole('button', { name: '添加文字' }).click();
  await page.locator('.pulseflow-page').click({ position: { x: 220, y: 160 } });
  await page.getByRole('button', { name: '选择工具' }).click();
  const text = page.locator('[data-pf-node-id="text-1"] .pf-text');
  await expect(text).toBeVisible();
  await page.getByRole('button', { name: '适配画布' }).click();
  const workspace = page.locator('.canvas-workspace');
  const workspaceWidth = await workspace.evaluate((element) => (element as HTMLElement).clientWidth);
  const zoom = Number((await page.getByTestId('canvas-zoom').textContent())?.replace('%', ''));
  expect(Math.round(1280 * zoom / 100)).toBeLessThan(workspaceWidth);

  const before = await text.boundingBox();
  if (!before) throw new Error('Text layer did not have a measurable canvas position');
  const pointer = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await page.keyboard.down('Control');
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => Number((await page.getByTestId('canvas-zoom').textContent())?.replace('%', ''))).toBeGreaterThan(zoom);
  const after = await text.boundingBox();
  if (!after) throw new Error('Text layer disappeared after zoom');
  expect(after.x + after.width / 2).toBeCloseTo(pointer.x, 0);
  expect(after.y + after.height / 2).toBeCloseTo(pointer.y, 0);
});

test('shift selection moves multiple canvas layers together and undo restores their DSL positions', async ({ page }) => {
  await openBlankCanvas(page);

  const artboard = page.locator('.canvas-stage .pulseflow-page');
  await page.getByRole('button', { name: '添加文字' }).click();
  await artboard.click({ position: { x: 160, y: 120 } });
  await page.getByRole('button', { name: '添加文字' }).click();
  await artboard.click({ position: { x: 320, y: 200 } });
  const first = page.locator('[data-pf-node-id="text-1"]');
  const second = page.locator('[data-pf-node-id="text-2"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await page.getByRole('button', { name: '选择工具' }).click();

  await first.locator('.pf-text').click();
  await second.locator('.pf-text').click({ modifiers: ['Shift'] });
  await expect(first).toHaveAttribute('data-pf-node-selected', 'true');
  await expect(second).toHaveAttribute('data-pf-node-selected', 'true');

  const initial = await Promise.all([first, second].map(async (layer) => {
    const style = await layer.getAttribute('style') ?? '';
    return {
      left: Number(style.match(/left:\s*(-?\d+(?:\.\d+)?)px/)?.[1]),
      top: Number(style.match(/top:\s*(-?\d+(?:\.\d+)?)px/)?.[1])
    };
  }));
  const canvasScale = Number((await page.getByTestId('canvas-zoom').textContent())?.replace('%', '')) / 100;
  const secondText = second.locator('.pf-text');
  const box = await secondText.boundingBox();
  if (!box) throw new Error('Second text layer did not have a measurable canvas position');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 64, box.y + box.height / 2 + 48, { steps: 4 });
  await page.mouse.up();

  const moved = await Promise.all([first, second].map(async (layer) => {
    const style = await layer.getAttribute('style') ?? '';
    return {
      left: Number(style.match(/left:\s*(-?\d+(?:\.\d+)?)px/)?.[1]),
      top: Number(style.match(/top:\s*(-?\d+(?:\.\d+)?)px/)?.[1])
    };
  }));
  const expectedDeltaX = Math.round((64 / canvasScale) / 8) * 8;
  const expectedDeltaY = Math.round((48 / canvasScale) / 8) * 8;
  expect(moved[0].left - initial[0].left).toBe(expectedDeltaX);
  expect(moved[1].left - initial[1].left).toBe(expectedDeltaX);
  expect(moved[0].top - initial[0].top).toBe(expectedDeltaY);
  expect(moved[1].top - initial[1].top).toBe(expectedDeltaY);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect.poll(async () => Promise.all([first, second].map(async (layer) => {
    const style = await layer.getAttribute('style') ?? '';
    return [
      Number(style.match(/left:\s*(-?\d+(?:\.\d+)?)px/)?.[1]),
      Number(style.match(/top:\s*(-?\d+(?:\.\d+)?)px/)?.[1])
    ];
  }))).toEqual(initial.map(({ left, top }) => [left, top]));

  await page.locator('[data-dsl-export]').click();
  const exportDialog = page.getByRole('dialog', { name: '导出 UI-DSL' });
  const exportedDsl = JSON.parse((await exportDialog.locator('pre code').textContent()) ?? 'null') as unknown;
  const validation = validatePageDsl(exportedDsl);
  expect(validation.ok).toBe(true);
  if (validation.ok) {
    expect(validation.dsl.nodes.find((node) => node.id === 'text-1')?.design?.position).toMatchObject({ x: initial[0].left, y: initial[0].top });
    expect(validation.dsl.nodes.find((node) => node.id === 'text-2')?.design?.position).toMatchObject({ x: initial[1].left, y: initial[1].top });
  }
});

test('copy, paste and duplicate shortcuts create selected, undoable DSL layers', async ({ page }) => {
  await openBlankCanvas(page);

  await page.getByRole('button', { name: '添加文字' }).click();
  await page.locator('.pulseflow-page').click({ position: { x: 180, y: 140 } });
  await page.getByRole('button', { name: '选择工具' }).click();
  const original = page.locator('[data-pf-node-id="text-1"]');
  await original.locator('.pf-text').click();
  const originalX = Number(await page.getByRole('spinbutton', { name: 'X 坐标' }).inputValue());

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  const pasted = page.locator('[data-pf-node-id="text-1-copy"]');
  await expect(pasted).toBeVisible();
  await expect(pasted).toHaveAttribute('data-pf-node-selected', 'true');
  await expect(page.getByRole('spinbutton', { name: 'X 坐标' })).toHaveValue(String(originalX + 16));

  await page.keyboard.press('ControlOrMeta+d');
  const repeated = page.locator('[data-pf-node-id="text-1-copy-2"]');
  await expect(repeated).toBeVisible();
  await expect(repeated).toHaveAttribute('data-pf-node-selected', 'true');
  await page.locator('[data-dsl-export]').click();
  const exported = JSON.parse((await page.getByRole('dialog', { name: '导出 UI-DSL' }).locator('pre code').textContent()) ?? 'null') as unknown;
  expect(validatePageDsl(exported).ok).toBe(true);
  await page.getByRole('button', { name: '关闭导出面板' }).click();

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(repeated).toHaveCount(0);
  await expect(pasted).toBeVisible();
  await page.getByRole('button', { name: '重做' }).click();
  await expect(repeated).toBeVisible();
});

test('a reference image becomes a reviewable DSL candidate before replacing the canvas', async ({ page }) => {
  await openBlankCanvas(page);
  const importedPage: PageDsl = {
    ...validPage,
    title: '机器人官网首页',
    pageKind: 'website',
    nodes: validPage.nodes.map((node) => node.id === 'header'
      ? { ...node, props: { ...node.props, title: '机器人官网首页' } }
      : node)
  };
  let requestBody: Record<string, unknown> | undefined;
  await page.route('**/api/drafts/import-image', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ok: true, data: { pageDsl: importedPage, entityFields: validFields, notes: ['识别到官网导航与机器人首屏'] } } });
  });

  await page.getByTestId('open-image-import').click();
  await page.getByLabel('选择设计图').setInputFiles({
    name: 'robot-homepage.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64')
  });
  await page.locator('#image-import-instruction').fill('还原机器人官网的科技蓝白风格');
  await page.getByLabel('页面类型').selectOption('website');
  await page.getByTestId('image-import-generate').click();
  await expect(page.getByTestId('image-import-result')).toContainText('机器人官网首页');
  expect(requestBody?.instruction).toBe('还原机器人官网的科技蓝白风格');
  expect(requestBody?.pageType).toBe('website');
  expect(String(requestBody?.imageDataUrl)).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator('.canvas-stage [data-pf-node-id]')).toHaveCount(0);

  await page.getByTestId('image-import-apply').click();
  await expect(page.locator('.canvas-stage .pulseflow-page')).toContainText('机器人官网首页');
  await expect(page.locator('.canvas-stage [data-pf-node-id="header"]')).toBeVisible();
  await page.locator('[data-dsl-export]').click();
  const exportedDsl = JSON.parse((await page.getByRole('dialog', { name: '导出 UI-DSL' }).locator('pre code').textContent()) ?? 'null') as unknown;
  expect(validatePageDsl(exportedDsl).ok).toBe(true);
});
