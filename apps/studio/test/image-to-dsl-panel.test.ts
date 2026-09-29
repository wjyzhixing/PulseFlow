import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import ImageToDslPanel from '../src/features/design/ImageToDslPanel.vue';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures';

const mocks = vi.hoisted(() => ({ convertImageToDsl: vi.fn(), prepareImage: vi.fn(), validateFile: vi.fn() }));
vi.mock('../src/features/design/design-api', () => ({ convertImageToDsl: mocks.convertImageToDsl }));
vi.mock('../src/features/design/image-import', () => ({ prepareDesignReferenceImage: mocks.prepareImage, validateDesignReferenceFile: mocks.validateFile }));
const PreviewStub = defineComponent({
  props: { artboardMode: { type: Boolean, default: false } },
  template: '<div data-testid="candidate-preview" :data-artboard-mode="String(artboardMode)" />'
});

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('ImageToDslPanel', () => {
  it('converts a selected screenshot, previews the validated page, and emits it only when accepted', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:reference'), revokeObjectURL: vi.fn() });
    mocks.prepareImage.mockResolvedValue('data:image/jpeg;base64,compressed');
    mocks.convertImageToDsl.mockResolvedValue({ pageDsl: validPage, entityFields: validFields, notes: ['左侧有导航栏'], imageRegions: [] });
    const wrapper = mount(ImageToDslPanel, { props: { currentPageKind: 'admin' }, global: { stubs: { PreviewPanel: PreviewStub } } });
    const file = new File(['design'], 'dashboard.png', { type: 'image/png' });
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [file] });

    try {
      expect(wrapper.get('[data-testid="image-import-apply"]').attributes('disabled')).toBeDefined();
      await wrapper.get('input[type="file"]').trigger('change');
      await wrapper.get('#image-import-instruction').setValue('保留蓝白控制台风格');
      await wrapper.get('[data-testid="image-import-generate"]').trigger('click');
      await flushPromises();

      expect(mocks.prepareImage).toHaveBeenCalledWith(file);
      expect(mocks.convertImageToDsl).toHaveBeenCalledWith({ imageDataUrl: 'data:image/jpeg;base64,compressed', pageType: 'admin', instruction: '保留蓝白控制台风格' });
      expect(wrapper.get('[data-testid="image-import-result"]').text()).toContain('左侧有导航栏');
      expect(wrapper.text()).toContain('DSL 校验通过');
      expect(wrapper.get('[data-testid="candidate-preview"]').attributes('data-artboard-mode')).toBe('true');
      await wrapper.get('[data-testid="image-import-apply"]').trigger('click');
      expect(wrapper.emitted('apply')).toEqual([[{ pageDsl: validPage, entityFields: validFields }]]);
    } finally { wrapper.unmount(); }
  });

  it('keeps the current canvas untouched and displays service errors', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:reference'), revokeObjectURL: vi.fn() });
    mocks.prepareImage.mockResolvedValue('data:image/jpeg;base64,compressed');
    mocks.convertImageToDsl.mockRejectedValue(new Error('模型不支持图片输入'));
    const wrapper = mount(ImageToDslPanel, { global: { stubs: { PreviewPanel: true } } });
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [new File(['design'], 'design.webp', { type: 'image/webp' })] });
    try {
      await wrapper.get('input[type="file"]').trigger('change');
      await wrapper.get('[data-testid="image-import-generate"]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toContain('模型不支持图片输入');
      expect(wrapper.emitted('apply')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });

  it('shows a safe fallback when image preparation rejects with a non-error value', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:reference'), revokeObjectURL: vi.fn() });
    mocks.prepareImage.mockRejectedValue('unexpected image decoder failure');
    const wrapper = mount(ImageToDslPanel, { global: { stubs: { PreviewPanel: true } } });
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [new File(['design'], 'screen.png', { type: 'image/png' })] });
    try {
      await wrapper.get('input[type="file"]').trigger('change');
      await wrapper.get('[data-testid="image-import-generate"]').trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('图片转换失败，请稍后重试。');
      expect(mocks.convertImageToDsl).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('supports drag and drop and clears an invalid selection instead of reusing the prior image', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:reference'), revokeObjectURL: vi.fn() });
    const wrapper = mount(ImageToDslPanel, { global: { stubs: { PreviewPanel: true } } });
    try {
      await wrapper.get('input[type="file"]').trigger('change');
      expect(wrapper.get('[data-testid="image-import-generate"]').attributes('disabled')).toBeDefined();
      const validFile = new File(['design'], 'screen.png', { type: 'image/png' });
      await wrapper.get('[data-testid="image-import-dropzone"]').trigger('drop', { dataTransfer: { files: [validFile] } });
      expect(wrapper.get('img[alt="待转换的设计图预览"]').attributes('src')).toBe('blob:reference');

      mocks.validateFile.mockImplementationOnce(() => { throw new Error('文件格式错误'); });
      const invalidFile = new File(['payload'], 'screen.svg', { type: 'image/svg+xml' });
      await wrapper.get('[data-testid="image-import-dropzone"]').trigger('drop', { dataTransfer: { files: [invalidFile] } });
      expect(wrapper.get('[role="alert"]').text()).toBe('文件格式错误');
      expect(wrapper.find('img[alt="待转换的设计图预览"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="image-import-generate"]').attributes('disabled')).toBeDefined();
    } finally { wrapper.unmount(); }
  });
});
