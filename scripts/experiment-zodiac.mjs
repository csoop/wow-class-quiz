// [v2 注] 本脚本基于 v1「四选项」题库结构；题库 2.0（84 条陈述 + 采样）后暂未迁移，仅作阶段存档。
/**
 * 星座选取归一化方案对比实验（内部调参工具）
 * 运行：node scripts/experiment-zodiac.mjs
 * 对比多种主/副星座选取口径下，随机作答（N=20000）的星座主位率分布：
 *   raw —— 原始分排序（初版）
 *   max —— raw / 每题可得上限之和（审查建议的「与职业轴同构」方案）
 *   sum —— raw / 全题库总权重（期望值归一，随机作答下理论均匀）
 *   sum1/2/3 —— 期望值归一 + α 平滑（α=1/2/3，压缩低供给星座方差偏置）
 */
import { QUESTIONS } from '../src/data/questions.js';
import { ZODIAC } from '../src/data/zodiac.js';

const signs = ZODIAC.map((z) => z.id);
const maxSum = {};
const sumAll = {};
signs.forEach((s) => { maxSum[s] = 0; sumAll[s] = 0; });
QUESTIONS.forEach((q) => {
  signs.forEach((s) => {
    const w = q.options.map((o) => (o.zodiac && o.zodiac[s]) || 0);
    maxSum[s] += Math.max(...w);
    sumAll[s] += w.reduce((a, b) => a + b, 0);
  });
});

console.log('sign         maxSum  sumAll  E[random]');
signs.forEach((s) => console.log(`${s.padEnd(12)} ${String(maxSum[s]).padStart(5)}  ${String(sumAll[s]).padStart(5)}   ${(sumAll[s] / 4).toFixed(2)}`));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 20000;
const wins = { raw: {}, max: {}, sum: {}, sum1: {}, sum2: {}, sum3: {} };
signs.forEach((s) => { wins.raw[s] = 0; wins.max[s] = 0; wins.sum[s] = 0; wins.sum1[s] = 0; wins.sum2[s] = 0; wins.sum3[s] = 0; });
const rng = mulberry32(20260915);
for (let i = 0; i < N; i++) {
  const raw = {};
  signs.forEach((s) => { raw[s] = 0; });
  QUESTIONS.forEach((q) => {
    const opt = q.options[Math.floor(rng() * q.options.length)];
    if (opt.zodiac) Object.entries(opt.zodiac).forEach(([s, w]) => { raw[s] += w; });
  });
  const pick = (keyFn) => signs.reduce((best, s) => (keyFn(s) > keyFn(best) ? s : best), signs[0]);
  wins.raw[pick((s) => raw[s])]++;
  wins.max[pick((s) => raw[s] / (maxSum[s] || 1))]++;
  wins.sum[pick((s) => raw[s] / (sumAll[s] || 1))]++;
  wins.sum1[pick((s) => (raw[s] + 1) / (sumAll[s] / 4 + 1))]++;
  wins.sum2[pick((s) => (raw[s] + 2) / (sumAll[s] / 4 + 2))]++;
  wins.sum3[pick((s) => (raw[s] + 3) / (sumAll[s] / 4 + 3))]++;
}

console.log('');
for (const k of ['raw', 'max', 'sum', 'sum1', 'sum2', 'sum3']) {
  const rates = signs.map((s) => ({ s, r: (100 * wins[k][s]) / N }));
  rates.sort((a, b) => b.r - a.r);
  const ratio = rates[0].r / rates[rates.length - 1].r;
  console.log(
    `${k.padEnd(4)} 最高 ${rates[0].s} ${rates[0].r.toFixed(1)}% / 最低 ${rates[rates.length - 1].s} ${rates[rates.length - 1].r.toFixed(1)}%  极差 ${ratio.toFixed(2)}×  标准差 ${Math.sqrt(rates.reduce((s2, x) => s2 + (x.r - 100 / 12) ** 2, 0) / 12).toFixed(2)}`,
  );
}
