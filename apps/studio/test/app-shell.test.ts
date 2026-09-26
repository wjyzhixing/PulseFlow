import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import App from '../src/App.vue';
import { createStudioRouter } from '../src/router';
import { clearToken, setToken } from '../src/features/auth/auth-store';

describe('Studio Ant Design application shell', () => {
  afterEach(() => clearToken());

  it('uses Ant Design layout and steps primitives for the workflow shell', async () => {
    setToken('studio-test-token');
    const router = createStudioRouter();
    await router.push('/requirements');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('.ant-layout').exists()).toBe(true);
    expect(wrapper.find('.ant-layout-header').exists()).toBe(true);
    expect(wrapper.find('.ant-layout-sider').exists()).toBe(true);
    expect(wrapper.findAll('.ant-steps-item')).toHaveLength(8);
    expect(wrapper.find('.ant-steps-item-process .ant-steps-item-title').text()).toBe('需求导入');
    expect(wrapper.find('.workflow-semantics [aria-current="step"]').text()).toBe('需求导入');
    expect(wrapper.find('.topbar').exists()).toBe(true);
    expect(wrapper.find('.rail').exists()).toBe(true);
    expect(wrapper.find('.canvas').exists()).toBe(true);
  });
});
