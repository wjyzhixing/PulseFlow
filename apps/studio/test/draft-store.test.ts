import { afterEach, describe, expect, it } from 'vitest';
import { validatePageDsl } from '@pulseflow/ui-dsl';
import { clearDraft, getDraftSession, setBlankDraft } from '../src/features/draft/draft-store';

afterEach(clearDraft);

describe('blank drafts', () => {
  it('creates a fresh unsaved draft with a valid unique page ID and empty content', () => {
    const first = setBlankDraft();
    const second = setBlankDraft('客户页面');

    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ fieldsText: '[]', questions: [], revision: 0, dirty: true, saved: false, saving: false });
    expect(second).toMatchObject({ fieldsText: '[]', questions: [], revision: 0, dirty: true, saved: false, saving: false });
    expect(getDraftSession()).not.toBe(second);
    expect(getDraftSession()).toMatchObject(second);

    const firstPage = JSON.parse(first.dslText);
    const secondPage = JSON.parse(second.dslText);
    expect(firstPage).toMatchObject({ schemaVersion: 1, nodes: [] });
    expect(secondPage).toMatchObject({ schemaVersion: 1, title: '客户页面', nodes: [] });
    expect(firstPage.pageId).not.toBe(secondPage.pageId);
    expect(firstPage.pageId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(secondPage.pageId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(validatePageDsl(firstPage, [])).toMatchObject({ ok: true });
    expect(validatePageDsl(secondPage, [])).toMatchObject({ ok: true });
  });

  it('does not expose the stored draft object for external mutation', () => {
    const returned = setBlankDraft();
    returned.fieldsText = '[{"id":"outside"}]';

    expect(getDraftSession()?.fieldsText).toBe('[]');
  });

});
