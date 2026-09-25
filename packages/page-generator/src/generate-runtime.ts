/** Runtime helpers shipped with each generated page so D2C output has no PulseFlow dependency. */
export function generateRuntime(): string {
  return `import type { PageData, PageRecord } from './types';

function own(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}

export function displayValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

export function fieldValue(data: PageData, fieldId: string): unknown {
  const fields = own(data, 'fields');
  if (fields && typeof fields === 'object' && !Array.isArray(fields) && Object.hasOwn(fields, fieldId)) return own(fields, fieldId);
  return own(data, fieldId);
}

export function matchesCondition(data: PageData, fieldId: string, equals: string | number | boolean): boolean {
  return fieldValue(data, fieldId) === equals;
}

export function invokeEvent(handlers: object, name: string): void {
  const handler = Object.hasOwn(handlers, name) ? (handlers as Record<string, unknown>)[name] : undefined;
  if (typeof handler === 'function') handler();
}

export function bodyCellLabel(value: unknown, cases: readonly { equals: string | number | boolean; label: string; color: string }[]): { text: string; color?: string } {
  const matching = cases.find((item) => item.equals === value);
  return matching ? { text: matching.label, color: matching.color } : { text: displayValue(value) };
}

export function tableCellValue(record: unknown, key: unknown): string {
  return record && typeof record === 'object' && !Array.isArray(record) && typeof key === 'string' ? displayValue(own(record, key)) : '';
}

export function tableColumns(columns: readonly { field: string; title: string }[]): Array<{ dataIndex: string; key: string; title: string }> {
  return columns.map((column) => ({ dataIndex: column.field, key: column.field, title: column.title }));
}

export function tableRows(data: PageData, dataSourceKey: string, columns: readonly { field: string }[]): PageRecord[] {
  const records = own(data, dataSourceKey);
  if (!Array.isArray(records)) return [];
  return records.filter((row) => row && typeof row === 'object' && !Array.isArray(row)).map((row, index) => {
    const safeRow: PageRecord = { key: index };
    for (const column of columns) {
      const value = own(row, column.field);
      safeRow[column.field] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
    }
    return safeRow;
  });
}
`;
}
