/** Check if an element is visually perceivable */
export function isElementVisible(el: HTMLElement): boolean {
  const cs = getComputedStyle(el)
  if (cs.opacity === "0") return false
  if (cs.visibility === "hidden") return false
  if (cs.display === "none") return false
  if (el.getAttribute("aria-hidden") === "true") return false
  return true
}

/** Find the first visible element at a screen point, skipping overlayEl */
export function visibleElementAtPoint(
  x: number,
  y: number,
  fallback: HTMLElement,
  overlayEl?: HTMLElement | null,
): HTMLElement {
  const elements = document.elementsFromPoint(x, y) as HTMLElement[]
  for (const el of elements) {
    if (overlayEl && (el === overlayEl || overlayEl.contains(el))) continue
    if (isElementVisible(el)) return el
  }
  return fallback
}

/**
 * Plain JS string containing isElementVisible and visibleElementAtPoint
 * for injection into string-based content scripts (e.g., handle-app webview).
 */
export const visibleElementAtPointSnippet = `
  function isElementVisible(el) {
    var cs = getComputedStyle(el);
    if (cs.opacity === "0") return false;
    if (cs.visibility === "hidden") return false;
    if (cs.display === "none") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function visibleElementAtPoint(x, y, fallback, overlayEl) {
    var elements = document.elementsFromPoint(x, y);
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (overlayEl && (el === overlayEl || overlayEl.contains(el))) continue;
      if (isElementVisible(el)) return el;
    }
    return fallback;
  }
`
