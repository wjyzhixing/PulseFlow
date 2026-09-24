import type { T2uiResult } from '@pulseflow/contracts';
import { shallowRef } from 'vue';
const draft = shallowRef<T2uiResult | null>(null);
export function getDraft(): T2uiResult | null { return draft.value; }
export function setDraft(value: T2uiResult): void { draft.value = value; }
export function clearDraft(): void { draft.value = null; }
