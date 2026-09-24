/**
 * 题库平衡分析（v2 · 内部调参工具）
 * 运行：node scripts/analyze-balance.mjs
 * 输出：陈述库各池的职业 / 星座 / 维度权重覆盖统计，以及模式可用性拆分，用于调参参考。
 */
import { QUESTIONS, POOLS } from '../src/data/questions.js';
import { CLASSES, classPool, DIMENSIONS } from '../src/data/classes.js';
import { ZODIAC } from '../src/data/zodiac.js';

const classTotals = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
const classCounts = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
const zodiacTotals = Object.fromEntries(ZODIAC.map((z) => [z.id, 0]));
const zodiacCounts = Object.fromEntries(ZODIAC.map((z) => [z.id, 0]));
const dimTotals = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));

QUESTIONS.forEach((s) => {
  if (s.classes) Object.entries(s.classes).forEach(([c, w]) => { classTotals[c] += w; classCounts[c] += 1; });
  if (s.zodiac) Object.entries(s.zodiac).forEach(([z, w]) => { zodiacTotals[z] += w; zodiacCounts[z] += 1; });
  if (s.dims) Object.entries(s.dims).forEach(([d, w]) => { dimTotals[d] += w; });
});

console.log(`陈述总数：${QUESTIONS.length}`);
console.log(`三池规模：lore=${POOLS.lore.length} zodiac=${POOLS.zodiac.length} heart=${POOLS.heart.length}`);

const modeStats = (mode) => {
  const allow = (s) => {
    const tags = s.tags || [];
    if (mode === 'classic' && tags.includes('retail')) return false;
    if (mode === 'retail' && tags.includes('classic')) return false;
    return true;
  };
  const idSet = new Set(classPool(mode).map((c) => c.id));
  const acc = {};
  idSet.forEach((id) => { acc[id] = { total: 0, count: 0 }; });
  QUESTIONS.forEach((s) => {
    if (!allow(s)) return;
    Object.entries(s.classes || {}).forEach(([cid, w]) => {
      if (acc[cid]) { acc[cid].total += w; acc[cid].count += 1; }
    });
  });
  console.log(`\n—— ${mode} 视角（可用池内职业权重总量；采样随机时近似 = 每局机会量 × 采样比例）——`);
  Object.entries(acc).sort((a, b) => b[1].total - a[1].total).forEach(([id, v]) => {
    console.log(`  ${id.padEnd(13)} 权重和=${String(v.total).padStart(4)}  出现条目数=${String(v.count).padStart(3)}`);
  });
};
modeStats('classic');
modeStats('retail');

console.log('\n—— 全库星座权重总量 ——');
ZODIAC.forEach((z) => {
  console.log(`  ${z.id.padEnd(11)} 权重和=${String(zodiacTotals[z.id]).padStart(3)}  出现条目数=${String(zodiacCounts[z.id]).padStart(3)}`);
});

console.log('\n—— 六维权重总量 ——');
DIMENSIONS.forEach((d) => {
  console.log(`  ${d.padEnd(11)} ${dimTotals[d]}`);
});
