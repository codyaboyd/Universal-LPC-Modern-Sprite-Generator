export const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true" &&
      !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
  );
}

export function focusFirst(container: HTMLElement): void {
  (getFocusable(container)[0] ?? container).focus();
}

export function trapTabKey(
  event: KeyboardEvent,
  container: HTMLElement,
  onEscape?: () => void,
): void {
  if (event.key === "Escape" && onEscape) {
    event.preventDefault();
    onEscape();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = getFocusable(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function describeCharacter(
  selections: Record<string, { name?: string; itemId?: string }>,
  bodyType: string,
  animation: string,
): string {
  const equipped = Object.entries(selections)
    .map(
      ([group, selection]) =>
        `${group}: ${selection.name || selection.itemId || "selected"}`,
    )
    .sort();
  const summary = [`Body type ${bodyType}`, `Animation ${animation}`];
  if (equipped.length) summary.push(`Equipped ${equipped.join("; ")}`);
  else summary.push("No equipment selected");
  return summary.join(". ");
}
