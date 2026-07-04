export function queryRequired<T extends Element>(
  root: ParentNode,
  selector: string,
  context: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${context}: ${selector} fehlt.`);
  }
  return element;
}
