/** Мини-хелпер DOM. Текст — только через textContent (никакого innerHTML → нет XSS-поверхности). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

export function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle('hidden', !on);
}
