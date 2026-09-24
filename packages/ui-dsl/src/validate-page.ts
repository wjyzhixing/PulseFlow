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
  fieldIds: Set<string>;
  diagnostics: Diagnostic[];
  seen: WeakSet<object>;
}

function validateSlot(slot: unknown, path: string, type: string, context: NodeContext, depth: number): void {
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
    } else if (!context.fieldIds.has(parsed.data.field)) {
      context.diagnostics.push(diagnostic('field.unbound', `${path}.field`, 'Unknown entity field'));
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
  } else if (type === 'FormItem' && 'fieldId' in props.data &&
    typeof props.data.fieldId === 'string' && !context.fieldIds.has(props.data.fieldId)) {
    context.diagnostics.push(diagnostic('field.unbound', `${path}.props.fieldId`, 'Unknown entity field'));
  }

  if (Object.hasOwn(value, 'condition')) {
    const condition = conditionSchema.safeParse(value.condition);
    if (!condition.success) {
      context.diagnostics.push(...zodDiagnostics(condition.error.issues, `${path}.condition`, 'condition.invalid'));
    } else if (!context.fieldIds.has(condition.data.fieldId)) {
      context.diagnostics.push(diagnostic('field.unbound', `${path}.condition.fieldId`, 'Unknown condition field'));
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
      validateSlot(slot, slotPath, type, context, depth);
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

export function validatePageDsl(value: unknown, entityFields: readonly EntityField[] = []): ValidationResult {
  const page = pageDslSchema.safeParse(value);
  if (!page.success) return { ok: false, diagnostics: zodDiagnostics(page.error.issues, '', 'schema.invalid') };

  const fields = z.array(entityFieldSchema).safeParse(entityFields);
  if (!fields.success) return { ok: false, diagnostics: zodDiagnostics(fields.error.issues, 'entityFields', 'field.invalid') };

  const context: NodeContext = {
    ids: new Set(), fieldIds: new Set(fields.data.map((field) => field.id)), diagnostics: [], seen: new WeakSet()
  };
  fields.data.forEach((field, index) => {
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
