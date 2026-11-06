export type FieldPosition = "beginning" | "end";

export function fieldsAtPosition<T extends { position?: string }>(fields: T[], position: FieldPosition): T[] {
  return fields.filter((field) => (field.position === "beginning" ? "beginning" : "end") === position);
}

export interface ShowIf { field_id: string; value: string }
type Conditional = { id: string; show_if?: ShowIf | null };

/** A question is shown when it has no condition, or its parent question is shown and answered with the chosen value. */
export function isFieldVisible<T extends Conditional>(field: T, fields: T[], answers: Record<string, string>, depth = 0): boolean {
  const cond = field.show_if;
  if (!cond || !cond.field_id) return true;
  if (depth > 20) return false;
  const parent = fields.find((f) => f.id === cond.field_id);
  if (!parent) return true;
  return isFieldVisible(parent, fields, answers, depth + 1) && (answers[parent.id] || "") === cond.value;
}
