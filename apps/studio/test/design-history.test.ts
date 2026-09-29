import { afterEach, describe, expect, it, vi } from 'vitest';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import { createDesignHistory } from '../src/features/design/use-design-history';

const document = (title: string) => ({
  dsl: { ...validPage, title },
  entityFields: validFields
});

describe('createDesignHistory', () => {
  afterEach(() => vi.useRealTimers());

  it('undoes and redoes immutable validated document snapshots', () => {
    const initialDocument = document('初始页面');
    const history = createDesignHistory(initialDocument);
    history.commit(document('第二版'), { description: '修改标题' });

    expect(history.canUndo.value).toBe(true);
    expect(history.undo()).toMatchObject({ dsl: { title: '初始页面' } });
    expect(history.canRedo.value).toBe(true);
    expect(history.redo()).toMatchObject({ dsl: { title: '第二版' } });
    expect(initialDocument.dsl.title).toBe('初始页面');
  });

  it('clears redo entries when a new edit follows undo', () => {
    const history = createDesignHistory(document('初始页面'));
    history.commit(document('第二版'), { description: '修改标题' });
    history.undo();

    history.commit(document('替代内容'), { description: '另一种修改' });

    expect(history.canRedo.value).toBe(false);
    expect(history.redo()).toBeNull();
  });

  it('coalesces edits with the same key within 500 milliseconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T00:00:00Z'));
    const history = createDesignHistory(document('初始页面'));
    history.commit(document('标题 A'), { description: '编辑标题', coalesceKey: 'page-title' });
    vi.advanceTimersByTime(400);
    history.commit(document('标题 AB'), { description: '编辑标题', coalesceKey: 'page-title' });

    expect(history.undo()).toMatchObject({ dsl: { title: '初始页面' } });
  });

  it('starts a new history entry after the 500 millisecond coalescing window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T00:00:00Z'));
    const history = createDesignHistory(document('初始页面'));
    history.commit(document('标题 A'), { description: '编辑标题', coalesceKey: 'page-title' });
    vi.advanceTimersByTime(501);
    history.commit(document('标题 AB'), { description: '编辑标题', coalesceKey: 'page-title' });

    expect(history.undo()).toMatchObject({ dsl: { title: '标题 A' } });
  });

  it('keeps at most 100 snapshots including the initial document', () => {
    const history = createDesignHistory(document('初始页面'));
    for (let index = 1; index <= 105; index += 1) {
      history.commit(document(`页面 ${index}`), { description: `第 ${index} 次修改` });
    }

    let undoCount = 0;
    while (history.undo()) undoCount += 1;
    expect(undoCount).toBe(99);
  });
});
