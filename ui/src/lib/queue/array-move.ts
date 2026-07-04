export function arrayMove<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return [...items];
  }
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }

  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}
