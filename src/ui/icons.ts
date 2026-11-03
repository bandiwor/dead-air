import type { IconPart } from '../content/achievements';

const NS = 'http://www.w3.org/2000/svg';

/** Контурная иконка 24×24 из примитивов (без innerHTML): цвет — currentColor, задаётся редкостью. */
export function iconSvg(parts: readonly IconPart[], size = 34): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('stroke-linejoin', 'miter');
  svg.setAttribute('aria-hidden', 'true');
  for (const part of parts) {
    let el: SVGElement;
    if ('p' in part) {
      el = document.createElementNS(NS, 'path');
      el.setAttribute('d', part.p);
    } else if ('c' in part) {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', String(part.c[0]));
      el.setAttribute('cy', String(part.c[1]));
      el.setAttribute('r', String(part.c[2]));
    } else if ('l' in part) {
      el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', String(part.l[0]));
      el.setAttribute('y1', String(part.l[1]));
      el.setAttribute('x2', String(part.l[2]));
      el.setAttribute('y2', String(part.l[3]));
    } else {
      el = document.createElementNS(NS, 'rect');
      el.setAttribute('x', String(part.r[0]));
      el.setAttribute('y', String(part.r[1]));
      el.setAttribute('width', String(part.r[2]));
      el.setAttribute('height', String(part.r[3]));
    }
    svg.appendChild(el);
  }
  return svg;
}
