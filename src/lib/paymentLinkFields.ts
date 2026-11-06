export type FieldPosition = "beginning" | "end";

export function fieldsAtPosition<T extends { position?: string }>(fields: T[], position: FieldPosition): T[] {
  return fields.filter((field) => (field.position === "beginning" ? "beginning" : "end") === position);
}