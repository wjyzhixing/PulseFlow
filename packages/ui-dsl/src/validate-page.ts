import { z } from 'zod';
import { componentProps, containerComponents, isComponentType, tableBodyCellSchema } from './components.js';
import { diagnostic, zodDiagnostics } from './diagnostics.js';
import { conditionSchema, entityFieldSchema, identifierSchema, pageDslSchema } from './schema.js';
import type { Diagnostic, EntityField, PageDsl, ValidationResult } from './types.js';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface NodeContext {
  ids: Set<string>;
  fields?: Map<string, EntityField>;
  diagnostics: Diagnostic[];
  seen: WeakSet<object>;
}

function validateEquality(value: string | number | boolean, field: EntityField, path: string, code: string): Diagnostic[] {
  if (typeof value !== field.type) {
    return [diagnostic(`${code}.type`, path, `Equality value must be ${field.type}`)];
  }
  if (field.rules.some((rule) => rule.kind === 'enum' && !rule.values.includes(String(value)))) {
    return [diagnostic(`${code}.enum`, path, 'Equality value is outside the field enum')];
  }
  return [];
}

function validateSlot(slot: unknown, path: string, type: string, context: NodeContext, depth: number, tableColumns?: Set<string>): void {
  if (!isRecord(slot) || typeof slot.name !== 'string') {
    context.diagnostics.push(diagnostic('slot.invalid', path, 'Slot must have a name'));
    return;
  }
  if (type === 'PageHeader' && slot.name === 'tags') {
    if (Object.keys(slot).some((key) => key !== 'name' && key !== 'children') || !Array.isArray(slot.children)) {
      context.diagnostics.push(diagnostic('slot.invalid', path, 'Tags slot must contain children only'));
      return;
    }
    slot.children.forEach((tag, index) => {
      const tagPath = `${path}.children[${index}]`;
      if (!isRecord(tag) || (tag.type !== 'Tag' && tag.type !== 'Badge')) {
        context.diagnostics.push(diagnostic('slot.invalid', `${tagPath}.type`, 'Only Tag and Badge are allowed'));
      } else {
        validateNode(tag, tagPath, context, depth + 1);
      }
    });
    return;
  }
  if (type === 'Table' && slot.name === 'bodyCell') {
    const parsed = tableBodyCellSchema.safeParse(slot);
    if (!parsed.success) {
      context.diagnostics.push(...zodDiagnostics(parsed.error.issues, path, 'slot.invalid')
        .map((item) => ({ ...item, code: 'slot.invalid' })));
    } else {
      const field = context.fields?.get(parsed.data.field);
      if (context.fields && !field) {
        context.diagnostics.push(diagnostic('field.unbound', `${path}.field`, 'Unknown entity field'));
      }
      if (tableColumns && !tableColumns.has(parsed.data.field)) {
        context.diagnostics.push(diagnostic('slot.field.not-column', `${path}.field`, 'Body cell field must be a Table column'));
      }
      if (field) {
        parsed.data.cases.forEach((item, index) => {
          context.diagnostics.push(...validateEquality(item.equals, field, `${path}.cases[${index}].equals`, 'slot.case'));
        });
      }
    }
    return;
  }
  context.diagnostics.push(diagnostic('slot.unsupported', `${path}.name`, `Unsupported slot: ${slot.name}`));
}

function validateNode(value: unknown, path: string, context: NodeContext, depth: number): void {
  if (!isRecord(value)) {
    context.diagnostics.push(diagnostic('node.invalid', path, 'Node must be an object'));
    return;
  }
  if (depth > 32 || context.seen.has(value)) {
    context.diagnostics.push(diagnostic('node.invalid', path, 'Node graph is too deep or cyclic'));
    return;
  }
  context.seen.add(value);
  for (const key of Object.keys(value)) {
    if (!['id', 'type', 'props', 'children', 'slots', 'condition'].includes(key)) {
      context.diagnostics.push(diagnostic('node.property.unsupported', `${path}.${key}`, `Unsupported node property: ${key}`));
    }
  }

  const id = identifierSchema.safeParse(value.id);
  if (!id.success) {
    context.diagnostics.push(diagnostic('node.id.invalid', `${path}.id`, 'Node ID must be a stable identifier'));
  } else if (context.ids.has(id.data)) {
    context.diagnostics.push(diagnostic('node.id.duplicate', `${path}.id`, `Duplicate node ID: ${id.data}`));
  } else {
    context.ids.add(id.data);
  }

  if (typeof value.type !== 'string' || !isComponentType(value.type)) {
    context.diagnostics.push(diagnostic('component.unsupported', `${path}.type`, 'Unsupported component'));
    return;
  }
  const type = value.type;
  const props = componentProps[type].safeParse(value.props);
  if (!props.success) {
    context.diagnostics.push(...zodDiagnostics(props.error.issues, `${path}.props`, 'component.prop.invalid'));
  } else if (type === 'FormItem' && context.fields && 'fieldId' in props.data &&
    typeof props.data.fieldId === 'string' && !context.fields.has(props.data.fieldId)) {
    context.diagnostics.push(diagnostic('field.unbound', `${path}.props.fieldId`, 'Unknown entity field'));
  }

  let tableColumns: Set<string> | undefined;
  if (type === 'Table' && props.success) {
    const tableProps = componentProps.Table.safeParse(value.props);
    if (tableProps.success) {
      tableColumns = new Set(tableProps.data.columns.map((column) => column.field));
      if (context.fields) {
        tableProps.data.columns.forEach((column, index) => {
          if (!context.fields?.has(column.field)) {
            context.diagnostics.push(diagnostic('field.unbound', `${path}.props.columns[${index}].field`, 'Unknown entity field'));
          }
        });
      }
    }
  }

  if (Object.hasOwn(value, 'condition')) {
    const condition = conditionSchema.safeParse(value.condition);
    if (!condition.success) {
      context.diagnostics.push(...zodDiagnostics(condition.error.issues, `${path}.condition`, 'condition.invalid'));
    } else if (context.fields) {
      const field = context.fields.get(condition.data.fieldId);
      if (!field) {
        context.diagnostics.push(diagnostic('field.unbound', `${path}.condition.fieldId`, 'Unknown condition field'));
      } else {
        context.diagnostics.push(...validateEquality(condition.data.equals, field, `${path}.condition.equals`, 'condition'));
      }
    }
  }

  if (!Array.isArray(value.slots)) {
    context.diagnostics.push(diagnostic('slot.invalid', `${path}.slots`, 'Slots must be an array'));
  } else {
    const slotNames = new Set<string>();
    value.slots.forEach((slot, index) => {
      const slotPath = `${path}.slots[${index}]`;
      if (isRecord(slot) && typeof slot.name === 'string') {
        if (slotNames.has(slot.name)) context.diagnostics.push(diagnostic('slot.duplicate', `${slotPath}.name`, 'Duplicate slot'));
        slotNames.add(slot.name);
      }
      validateSlot(slot, slotPath, type, context, depth, tableColumns);
    });
  }

  if (!Array.isArray(value.children)) {
    context.diagnostics.push(diagnostic('node.children.invalid', `${path}.children`, 'Children must be an array'));
  } else if (!containerComponents.has(type) && value.children.length > 0) {
    context.diagnostics.push(diagnostic('node.children.unsupported', `${path}.children`, 'Component cannot have children'));
  } else {
    value.children.forEach((child, index) => validateNode(child, `${path}.children[${index}]`, context, depth + 1));
  }
}

/**
 * Validate the page shape and, when entityFields is provided, cross-check field references.
 * Omitting the field context intentionally skips reference existence/type checks.
 */
export function validatePageDsl(value: unknown, entityFields?: readonly EntityField[]): ValidationResult {
  const page = pageDslSchema.safeParse(value);
  if (!page.success) return { ok: false, diagnostics: zodDiagnostics(page.error.issues, '', 'schema.invalid') };

  const fields = entityFields === undefined ? undefined : z.array(entityFieldSchema).safeParse(entityFields);
  if (fields && !fields.success) return { ok: false, diagnostics: zodDiagnostics(fields.error.issues, 'entityFields', 'field.invalid') };

  const context: NodeContext = {
    ids: new Set(), fields: fields?.success ? new Map(fields.data.map((field) => [field.id, field])) : undefined,
    diagnostics: [], seen: new WeakSet()
  };
  if (fields?.success) fields.data.forEach((field, index) => {
    if (fields.data.findIndex((item) => item.id === field.id) !== index) {
      context.diagnostics.push(diagnostic('field.id.duplicate', `entityFields[${index}].id`, 'Duplicate field ID'));
    }
    if (fields.data.findIndex((item) => item.key === field.key) !== index) {
      context.diagnostics.push(diagnostic('field.key.duplicate', `entityFields[${index}].key`, 'Duplicate field key'));
    }
  });
  page.data.nodes.forEach((node, index) => validateNode(node, `nodes[${index}]`, context, 0));
  if (context.diagnostics.length > 0) return { ok: false, diagnostics: context.diagnostics };
  return { ok: true, dsl: value as PageDsl, diagnostics: [] };
}
