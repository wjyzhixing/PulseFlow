<script setup lang="ts">
type StudioIconName =
  | 'file' | 'assets' | 'tools' | 'variables' | 'select' | 'frame' | 'rectangle' | 'ellipse' | 'line'
  | 'text' | 'image' | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate' | 'group' | 'ungroup'
  | 'desktop' | 'tablet' | 'mobile' | 'fit' | 'search' | 'plus' | 'chevron-down' | 'chevron-right'
  | 'zoom-in' | 'zoom-out' | 'eye' | 'eye-off' | 'lock' | 'unlock' | 'close' | 'arrow-up' | 'arrow-down'
  | 'align-left' | 'align-center-x' | 'align-right' | 'align-top' | 'align-center-y' | 'align-bottom'
  | 'flip-horizontal' | 'flip-vertical';

const props = withDefaults(defineProps<{ name: StudioIconName; size?: number }>(), { size: 18 });

const paths: Record<StudioIconName, string[]> = {
  file: ['M7 3.75h7l4.25 4.5v12A.75.75 0 0 1 17.5 21h-10a.75.75 0 0 1-.75-.75V4.5A.75.75 0 0 1 7.5 3.75Z', 'M14 4v4.25h4.25', 'M9 12h6M9 15.5h6'],
  assets: ['M4.75 5.5 12 2.75l7.25 2.75L12 8.25 4.75 5.5Z', 'M4.75 9.5 12 12.25l7.25-2.75', 'M4.75 13.5 12 16.25l7.25-2.75', 'M4.75 5.5v9l7.25 2.75 7.25-2.75v-9'],
  tools: ['M4 5.5h6M14 5.5h6M4 12h3M11 12h9M4 18.5h8M16 18.5h4', 'M10 3.75v3.5M7 10.25v3.5M12 16.75v3.5'],
  variables: ['M12 2.75 20 7.4v9.2l-8 4.65-8-4.65V7.4l8-4.65Z', 'M8.5 9h7M8.5 12h7M8.5 15h4'],
  select: ['M5 3.5 19 13l-6.5 1.1L9 20.5 5 3.5Z'],
  frame: ['M4 4.5h16v15H4z', 'M8 4.5v3M4 8h3M16 4.5v3M17 8h3M8 16.5v3M4 16h3M16 16.5v3M17 16h3'],
  rectangle: ['M4 5h16v14H4z'],
  ellipse: ['M12 4.25a7.75 7.75 0 1 0 0 15.5 7.75 7.75 0 0 0 0-15.5Z'],
  line: ['M5 19 19 5'],
  text: ['M5 5h14M12 5v14'],
  image: ['M4 4.5h16v15H4z', 'm5 16 4.5-4.5 3.25 3.25 2.25-2.25L19 16', 'M15.75 8.75h.01'],
  undo: ['M9 7 4.5 10.5 9 14', 'M5 10.5h8a6 6 0 0 1 6 6'],
  redo: ['m15 7 4.5 3.5L15 14', 'M19 10.5h-8a6 6 0 0 0-6 6'],
  copy: ['M8 8.25V5.5a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-2.75', 'M5.5 8.25h9.25a1 1 0 0 1 1 1v9.25a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V9.25a1 1 0 0 1 1-1Z'],
  paste: ['M8 5.25H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 20.25h12a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 18 5.25h-2', 'M9 3.75h6v4H9z', 'M8.5 12h7M8.5 15.5h7'],
  duplicate: ['M8 8V5a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H16', 'M5.5 8h9.25a1 1 0 0 1 1 1v9.25a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z'],
  group: ['M4 4.5h6v6H4zM14 4.5h6v6h-6zM4 14.5h6v6H4zM14 14.5h6v6h-6z'],
  ungroup: ['M4 4.5h6v6H4zM14 4.5h6v6h-6zM4 14.5h6v6H4z', 'M14 17.5h6M17 14.5v6'],
  desktop: ['M3.5 4.5h17v12h-17z', 'M8 20h8M12 16.5V20'],
  tablet: ['M6.5 2.75h11a1.5 1.5 0 0 1 1.5 1.5v15.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.75V4.25a1.5 1.5 0 0 1 1.5-1.5Z', 'M11 18.25h2'],
  mobile: ['M8 2.75h8A1.75 1.75 0 0 1 17.75 4.5v15A1.75 1.75 0 0 1 16 21.25H8A1.75 1.75 0 0 1 6.25 19.5v-15A1.75 1.75 0 0 1 8 2.75Z', 'M11 18.25h2'],
  fit: ['M8 3.5H4v4M16 3.5h4v4M20 16.5v4h-4M4 16.5v4h4', 'M4.5 4l5 5M19.5 4l-5 5M4.5 20l5-5M19.5 20l-5-5'],
  search: ['M10.75 3.75a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'm16 16 4.25 4.25'],
  plus: ['M12 5v14M5 12h14'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 6 6 6-6 6'],
  'zoom-in': ['M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Z', 'm15.5 15.5 4.75 4.75', 'M10.5 7.5v6M7.5 10.5h6'],
  'zoom-out': ['M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Z', 'm15.5 15.5 4.75 4.75', 'M7.5 10.5h6'],
  eye: ['M2.75 12s3.25-5.5 9.25-5.5 9.25 5.5 9.25 5.5-3.25 5.5-9.25 5.5S2.75 12 2.75 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  'eye-off': ['M3 3l18 18', 'M10.6 6.65A10.5 10.5 0 0 1 12 6.5c6 0 9.25 5.5 9.25 5.5a15.3 15.3 0 0 1-3.15 3.55', 'M6.2 7.55C3.95 9.05 2.75 12 2.75 12s3.25 5.5 9.25 5.5c.9 0 1.75-.13 2.55-.36'],
  lock: ['M5 10h14v10H5z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v2.5'],
  unlock: ['M5 10h14v10H5z', 'M8 10V7a4 4 0 0 1 7.35-2.2', 'M12 14v2.5'],
  close: ['m6 6 12 12M18 6 6 18'],
  'arrow-up': ['M12 19V5', 'm5.5 11.5 6.5-6.5 6.5 6.5'],
  'arrow-down': ['M12 5v14', 'm5.5 12.5 6.5 6.5 6.5-6.5'],
  'align-left': ['M5 4v16', 'M9 7h10M9 12h7M9 17h10'],
  'align-center-x': ['M12 4v16', 'M5 7h14M8 12h8M5 17h14'],
  'align-right': ['M19 4v16', 'M5 7h10M8 12h7M5 17h10'],
  'align-top': ['M4 5h16', 'M7 9v10M12 9v7M17 9v10'],
  'align-center-y': ['M4 12h16', 'M7 5v14M12 8v8M17 5v14'],
  'align-bottom': ['M4 19h16', 'M7 5v10M12 8v7M17 5v10'],
  'flip-horizontal': ['M12 3v18', 'M4 8h6m0 0-3-3m3 3-3 3', 'M20 16h-6m0 0 3-3m-3 3 3 3'],
  'flip-vertical': ['M3 12h18', 'M8 4v6m0 0L5 7m3 3 3-3', 'M16 20v-6m0 0-3 3m3-3 3 3']
};
</script>

<template>
  <svg :width="props.size" :height="props.size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="(path, index) in paths[props.name]" :key="index" :d="path" />
  </svg>
</template>
