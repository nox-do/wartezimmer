const SVG_NS = 'http://www.w3.org/2000/svg';

type IconName = 'copy' | 'check' | 'folder-open' | 'info' | 'rotate-cw';

type IconNode = readonly [
  tagName: 'circle' | 'path' | 'rect',
  attributes: Readonly<Record<string, string>>,
];

const ICON_NODES: Record<IconName, readonly IconNode[]> = {
  copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  'folder-open': [
    [
      'path',
      {
        d: 'm6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
      },
    ],
  ],
  info: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 16v-4' }],
    ['path', { d: 'M12 8h.01' }],
  ],
  'rotate-cw': [
    ['path', { d: 'M21 12a9 9 0 1 1-2.64-6.36L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
  ],
};

export function createLucideIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tagName, attributes] of ICON_NODES[name]) {
    const child = document.createElementNS(SVG_NS, tagName);
    for (const [key, value] of Object.entries(attributes)) {
      child.setAttribute(key, value);
    }
    svg.append(child);
  }
  return svg;
}

export function setButtonIcon(button: HTMLButtonElement, name: IconName): void {
  button.replaceChildren(createLucideIcon(name));
}
