import { vi } from 'vitest';

const getStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => getStyle(element);
window.matchMedia = vi.fn().mockImplementation(() => ({
  matches: false,
  addListener: vi.fn(), removeListener: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn()
}));
