/**
 * 关键配色对比度检查（WCAG 2.1）
 * 运行：npm run verify:contrast
 * 从 theme.css 中读取设计令牌，对典型前景/背景组合计算对比度：
 *  - 正文级组合（≥ 4.5 : 1，AA 正文）
 *  - 大字/次要级组合（≥ 3.0 : 1）
 * 解析失败或低于阈值 → 退出码 1。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const css = readFileSync(resolve(root, 'assets/css/theme.css'), 'utf8');

function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`未找到设计令牌 --${name}`);
  return m[1];
}

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function lum([r, g, b]) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgHex, bgHex) {
  const [l1, l2] = [lum(hexToRgb(fgHex)), lum(hexToRgb(bgHex))].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const T = {
  bgVoid: token('bg-void'),
  bgDeep: token('bg-deep'),
  bgPanel: token('bg-panel'),
  bgPanel2: token('bg-panel-2'),
  ink: token('ink'),
  inkDim: token('ink-dim'),
  inkFaint: token('ink-faint'),
  inkGhost: token('ink-ghost'),
  gold: token('gold'),
  goldBright: token('gold-bright'),
  goldPale: token('gold-pale'),
  goldDim: token('gold-dim'),
};

const cases = [
  // [名称, 前景, 背景, 阈值, 说明]
  ['正文 · ink on 面板', T.ink, T.bgPanel, 4.5, '正文文字'],
  ['正文 · ink on 更深底', T.ink, T.bgDeep, 4.5, '正文文字'],
  ['次要文字 · ink-dim on 面板', T.inkDim, T.bgPanel, 4.5, '选项/描述'],
  ['弱化文字 · ink-faint on 面板', T.inkFaint, T.bgPanel, 4.5, '引言/元数据'],
  ['幽灵文字 · ink-ghost on 面板', T.inkGhost, T.bgPanel, 3.0, '提示类小字'],
  ['金色标题 · gold-bright on 面板', T.goldBright, T.bgPanel, 4.5, '按钮/标题金'],
  ['浅金标题 · gold-pale on 面板', T.goldPale, T.bgPanel, 4.5, '主标题'],
  ['暗金装饰 · gold on 面板', T.gold, T.bgPanel, 3.0, '徽章/装饰'],
  ['暗金装饰 · gold-dim on 面板', T.goldDim, T.bgPanel, 3.0, '装饰线/图标'],
  ['金色标题 · gold-bright on 深底', T.goldBright, T.bgDeep, 4.5, '结果页标题'],
];

let failed = 0;
console.log('WCAG 对比度检查（阈值来自 WCAG 2.1 AA）\n');
console.log('组合'.padEnd(34) + '对比度'.padEnd(12) + '阈值'.padEnd(8) + '结果');
console.log('-'.repeat(64));
for (const [name, fg, bg, min, note] of cases) {
  const c = contrast(fg, bg);
  const pass = c >= min;
  if (!pass) failed += 1;
  console.log(`${name.padEnd(32)} ${c.toFixed(2).padStart(8)} ${String(min).padStart(7)}   ${pass ? '✔' : '✘'} ${note}`);
}
console.log('');
if (failed) {
  console.log(`❌ ${failed} 项低于阈值`);
  process.exit(1);
} else {
  console.log('✅ 全部通过（正文组合 ≥4.5:1，装饰类 ≥3:1）');
}
