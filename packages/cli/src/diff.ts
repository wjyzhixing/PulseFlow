import { conflictDiffContent, type Conflict } from './conflict-check.js';

function lineChanges(before: string, after: string): string[] {
  const left = before.split(/(?<=\n)/);
  const right = after.split(/(?<=\n)/);
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i]![j] = left[i] === right[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const result: string[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push(` ${left[i]!.replace(/\n$/, '')}`);
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      result.push(`-${left[i]!.replace(/\n$/, '')}`);
      i += 1;
    } else {
      result.push(`+${right[j]!.replace(/\n$/, '')}`);
      j += 1;
    }
  }
  while (i < left.length) result.push(`-${left[i++]!.replace(/\n$/, '')}`);
  while (j < right.length) result.push(`+${right[j++]!.replace(/\n$/, '')}`);
  return result;
}

export function createUnifiedDiff(conflicts: Conflict[]): string {
  return conflicts.map((conflict) => {
    const contents = conflictDiffContent(conflict);
    const changeLines = contents ? lineChanges(contents.local ?? '[deleted]', contents.remote) : [];
    return [
      `--- local/${conflict.path}`,
      `+++ published/${conflict.path}`,
      `@@ ${conflict.reason} @@`,
      ...changeLines
    ].join('\n');
  }).join('\n');
}
