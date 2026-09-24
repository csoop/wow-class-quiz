/**
 * 程序化图形库（原创 · 不含任何暴雪素材）
 * ------------------------------------------------------------------
 * classEmblem(id)   —— 13 职业徽章（48x48 线条图形，按职业色渲染）
 * zodiacConstellation(sign) —— 星座星点连线图
 * uiIcon(name)      —— 界面图标（盾/星/书/箭头等）
 */

const EMBLEMS = {
  warrior: {
    paths: [
      'M24 6 L30 11 V33 L24 42 L18 33 V11 Z',
      'M14 14 L34 34 M34 14 L14 34',
      'M20 24 H28',
    ],
  },
  paladin: {
    paths: [
      'M24 5 L38 11 V25 C38 34 32 40 24 44 C16 40 10 34 10 25 V11 Z',
      'M24 13 V33 M16 21 H32',
      'M24 37 c-2 -2 -2 -4 0 -6 c2 2 2 4 0 6',
    ],
  },
  hunter: {
    paths: [
      'M34 8 C22 12 16 24 18 38',
      'M34 8 L18 38',
      'M28 10 L36 12 L33 19',
      'M14 34 l-4 4 M19 39 l-5 4',
    ],
  },
  rogue: {
    paths: [
      'M12 8 L30 30 M30 30 l4 4 M34 34 l4 4',
      'M36 8 L18 30 M18 30 l-4 4 M14 34 l-4 4',
      'M22 24 a3 3 0 1 0 4 0 a3 3 0 1 0 -4 0',
    ],
  },
  priest: {
    paths: [
      'M24 12 V42',
      'M24 12 a5 5 0 1 1 0.01 0',
      'M14 20 c-3 8 -3 14 0 20 M34 20 c3 8 3 14 0 20',
      'M18 44 H30',
    ],
  },
  shaman: {
    paths: [
      'M18 8 H30 L28 40 H20 Z',
      'M18 16 H30 M18 24 H30 M19 32 H29',
      'M38 10 L31 22 H37 L30 36',
    ],
  },
  mage: {
    paths: [
      'M24 6 a18 18 0 1 0 0.01 0',
      'M24 12 L27 21 L36 24 L27 27 L24 36 L21 27 L12 24 L21 21 Z',
      'M38 38 l4 4 M40 36 l4 4',
    ],
  },
  warlock: {
    paths: [
      'M24 14 a10 12 0 1 0 0.01 0',
      'M14 12 C10 6 12 4 15 6 M34 12 C38 6 36 4 33 6',
      'M21 22 l2 3 M27 22 l-2 3',
      'M24 30 v4 M20 34 h8',
    ],
  },
  monk: {
    paths: [
      'M24 6 a18 18 0 1 0 0.01 0',
      'M24 6 a9 18 0 0 1 0 36 a9 18 0 0 1 0 -36',
      'M24 8 a3.5 3.5 0 1 0 0.01 0',
      'M24 40 a3.5 3.5 0 1 0 0.01 0',
    ],
  },
  druid: {
    paths: [
      'M30 6 A18 18 0 1 0 30 42 A14 14 0 1 1 30 6',
      'M24 20 c6 3 8 9 6 16 c-7 -1 -9 -7 -6 -16',
      'M34 14 l3 -4 M38 22 l4 -2',
    ],
  },
  deathknight: {
    paths: [
      'M24 5 L29 10 V32 L24 40 L19 32 V10 Z',
      'M24 14 l4 4 -4 4 -4 -4 Z',
      'M14 20 l-5 -3 M34 20 l5 -3 M14 30 l-5 3 M34 30 l5 3',
      'M20 40 H28',
    ],
  },
  demonhunter: {
    paths: [
      'M8 40 C20 36 30 26 34 12',
      'M40 40 C28 36 18 26 14 12',
      'M34 12 l3 -6 M14 12 l-3 -6',
      'M20 24 l8 0 M22 19 l4 0',
    ],
  },
  evoker: {
    paths: [
      'M8 38 C14 22 26 12 42 9 C38 17 36 25 32 32 C24 30 15 32 8 38 Z',
      'M18 28 L24 22 L30 28',
      'M20 34 l4 -3 M26 34 l4 -3',
    ],
  },
};

export function classEmblem(id, size = 48) {
  const e = EMBLEMS[id];
  if (!e) return '';
  const inner = e.paths.map((d) => `<path d="${d}" />`).join('');
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export function zodiacConstellation(sign, size = 64) {
  if (!sign || !sign.stars) return '';
  const stars = sign.stars.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 1 ? 2.6 : 2}" class="z-star" />`).join('');
  const links = sign.links.map(([a, b]) => {
    const [x1, y1] = sign.stars[a];
    const [x2, y2] = sign.stars[b];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }).join('');
  return `<svg class="constellation" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><g class="c-links">${links}</g><g fill="currentColor" stroke="none">${stars}</g></svg>`;
}

const UI_ICONS = {
  shield: '<path d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z" />',
  star: '<path d="M12 3 L14.4 9.2 L21 9.6 L15.8 13.8 L17.6 20.2 L12 16.6 L6.4 20.2 L8.2 13.8 L3 9.6 L9.6 9.2 Z" />',
  book: '<path d="M4 5 C7 3.5 10 3.5 12 5.5 C14 3.5 17 3.5 20 5 V19 C17 17.5 14 17.5 12 19.5 C10 17.5 7 17.5 4 19 Z M12 5.5 V19.5" />',
  sword: '<path d="M12 3 V15 M9 6 H15 M12 15 l-2 6 h4 Z" />',
  arrowLeft: '<path d="M14 6 L8 12 L14 18" />',
  arrowRight: '<path d="M10 6 L16 12 L10 18" />',
  share: '<path d="M8 12 L18 7 M8 12 L18 17 M6 12 a2.5 2.5 0 1 0 0.01 0 M19 6 a2.5 2.5 0 1 0 0.01 0 M19 18 a2.5 2.5 0 1 0 0.01 0" />',
  download: '<path d="M12 4 V14 M7 10 L12 15 L17 10 M5 18 H19" />',
  history: '<path d="M12 7 a8 8 0 1 1 -8 8 M4 7 v6 h6 M12 9 V13 L15 15" />',
  refresh: '<path d="M19 12 a7 7 0 1 1 -2 -5 M19 4 v4 h-4" />',
  check: '<path d="M5 12 L10 17 L19 7" />',
  close: '<path d="M6 6 L18 18 M18 6 L6 18" />',
  spark: '<path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" />',
};

export function uiIcon(name, size = 24) {
  const d = UI_ICONS[name];
  if (!d) return '';
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
