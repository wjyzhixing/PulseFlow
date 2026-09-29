import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StudioIcon from '../src/features/design/StudioIcon.vue';

describe('StudioIcon', () => {
  it('renders a decorative vector icon for each editor tool', () => {
    const names = ['file', 'assets', 'tools', 'variables', 'select', 'frame', 'rectangle', 'ellipse', 'line', 'text', 'image', 'undo', 'redo', 'copy', 'paste', 'duplicate', 'group', 'ungroup', 'desktop', 'tablet', 'mobile', 'fit', 'search', 'plus', 'chevron-down', 'chevron-right', 'zoom-in', 'zoom-out', 'eye', 'eye-off', 'lock', 'unlock', 'close', 'arrow-up', 'arrow-down', 'align-left', 'align-center-x', 'align-right', 'align-top', 'align-center-y', 'align-bottom', 'flip-horizontal', 'flip-vertical'] as const;

    for (const name of names) {
      const wrapper = mount(StudioIcon, { props: { name } });
      expect(wrapper.element.tagName).toBe('svg');
      expect(wrapper.attributes('aria-hidden')).toBe('true');
      expect(wrapper.find('path').exists() || wrapper.find('circle').exists()).toBe(true);
    }
  });
});
