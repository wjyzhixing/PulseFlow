import { computed, shallowRef, type ComputedRef } from 'vue';
import { validatePageDsl, type EntityField, type PageDsl } from '@pulseflow/ui-dsl';

export interface DesignHistoryDocument {
  dsl: PageDsl;
  entityFields: readonly EntityField[];
}

export interface DesignHistorySnapshot extends DesignHistoryDocument {
  description: string;
}

interface HistoryEntry extends DesignHistorySnapshot {
  coalesceKey?: string;
  committedAt: number;
}

interface CommitOptions {
  description: string;
  coalesceKey?: string;
}

export interface DesignHistory {
  current: ComputedRef<DesignHistorySnapshot>;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  commit(document: DesignHistoryDocument, options: CommitOptions): boolean;
  undo(): DesignHistorySnapshot | null;
  redo(): DesignHistorySnapshot | null;
}

const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 500;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateSnapshot(document: DesignHistoryDocument): DesignHistoryDocument | null {
  const fields = clone(document.entityFields);
  const result = validatePageDsl(clone(document.dsl), fields);
  return result.ok ? { dsl: result.dsl, entityFields: fields } : null;
}

function toSnapshot(entry: HistoryEntry): DesignHistorySnapshot {
  return clone({ dsl: entry.dsl, entityFields: entry.entityFields, description: entry.description });
}

export function createDesignHistory(initial: DesignHistoryDocument): DesignHistory {
  const validated = validateSnapshot(initial);
  if (!validated) throw new Error('Initial design history document must pass UI-DSL validation');

  const entries = shallowRef<readonly HistoryEntry[]>([
    { ...validated, description: '初始内容', committedAt: Date.now() }
  ]);
  const cursor = shallowRef(0);
  const current = computed(() => toSnapshot(entries.value[cursor.value]!));
  const canUndo = computed(() => cursor.value > 0);
  const canRedo = computed(() => cursor.value < entries.value.length - 1);

  function commit(document: DesignHistoryDocument, options: CommitOptions): boolean {
    const snapshot = validateSnapshot(document);
    if (!snapshot || !options.description.trim()) return false;
    const committedAt = Date.now();
    const nextEntry: HistoryEntry = {
      ...snapshot,
      description: options.description,
      coalesceKey: options.coalesceKey,
      committedAt
    };
    const isAtEnd = cursor.value === entries.value.length - 1;
    const previous = entries.value[cursor.value];
    const canCoalesce = isAtEnd && Boolean(options.coalesceKey) && previous?.coalesceKey === options.coalesceKey &&
      committedAt - previous.committedAt <= COALESCE_WINDOW_MS;

    if (canCoalesce) {
      entries.value = entries.value.map((entry, index) => index === cursor.value ? nextEntry : entry);
      return true;
    }

    const prefix = entries.value.slice(0, cursor.value + 1);
    const nextEntries = [...prefix, nextEntry];
    const trimmed = nextEntries.length > HISTORY_LIMIT ? nextEntries.slice(nextEntries.length - HISTORY_LIMIT) : nextEntries;
    entries.value = trimmed;
    cursor.value = trimmed.length - 1;
    return true;
  }

  function undo(): DesignHistorySnapshot | null {
    if (!canUndo.value) return null;
    cursor.value -= 1;
    return toSnapshot(entries.value[cursor.value]!);
  }

  function redo(): DesignHistorySnapshot | null {
    if (!canRedo.value) return null;
    cursor.value += 1;
    return toSnapshot(entries.value[cursor.value]!);
  }

  return { current, canUndo, canRedo, commit, undo, redo };
}
