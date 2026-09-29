import type { DesignFontFamily } from '@pulseflow/ui-dsl';

const fontStacks: Record<DesignFontFamily, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'SFMono-Regular, Consolas, "Liberation Mono", monospace',
  'pingfang-sc': '"PingFang SC", "Microsoft YaHei", sans-serif',
  'noto-sans-sc': '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  inter: 'Inter, sans-serif',
  roboto: 'Roboto, sans-serif',
  arial: 'Arial, sans-serif'
};

export function designFontStack(fontFamily: DesignFontFamily | undefined): string {
  return fontStacks[fontFamily ?? 'sans'];
}
