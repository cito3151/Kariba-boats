// Helpers for the facilities and safety equipment lists, which a boat stores as
// plain arrays of strings. Shared by TagPicker and BoatForm.

/** Whether two items name the same thing, ignoring case and outer spaces. */
export const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Splits typed text on commas into trimmed, non-empty items, the way the old free-text field did. */
export const splitTags = (text: string) =>
  text.split(',').map((x) => x.trim()).filter(Boolean);

/** Adds each item that is not already in the list (ignoring case), keeping the list's order. */
export function mergeTags(list: string[], items: string[]): string[] {
  const next = [...list];
  for (const item of items) if (!next.some((x) => sameTag(x, item))) next.push(item);
  return next;
}
