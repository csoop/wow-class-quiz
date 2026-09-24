// [v2 注] 本脚本基于 v1「四选项」题库结构；题库 2.0（84 条陈述 + 采样）后暂未迁移，仅作阶段存档。
/**
 * 职业轴归一化方案对比实验：验证「机会覆盖率归一化」能否改善分布公平性（决策记录）
 * 运行：node scripts/experiment-normalization.mjs [mode]
 * 注：最终引擎在此基础上还包含「星座供给归一 + 平滑」与题库权重校准；终值以 `npm run verify` 输出为准。
 */
import { QUESTIONS } from '../src/data/questions.js';
import { CLASSES, DIMENSIONS, classPool } from '../src/data/classes.js';
import { ZODIAC } from '../src/data/zodiac.js';

const mode = process.argv[2] || 'retail';
const pool = classPool(mode);
const poolIds = pool.map((c) => c.id);

// 覆盖率预计算
const baseCov = {};
pool.forEach((c) => {
  let s = 0;
  QUESTIONS.forEach((q) => {
    const m = Math.max(0, ...q.options.map((o) => (o.classes && o.classes[c.id]) || 0));
    s += m;
  });
  baseCov[c.id] = s;
});
const zodCov = {};
pool.forEach((c) => {
  let s = 0;
  ZODIAC.forEach((z) => { s += (z.classBias && z.classBias[c.id]) || 0; });
  zodCov[c.id] = s;
});

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(x) { return Math.round(x * 100) / 100; }

function computeVariant(answers, opts) {
  const dimRaw = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));
  const classRaw = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
  const zodiacRaw = Object.fromEntries(ZODIAC.map((z) => [z.id, 0]));
  answers.forEach((optIdx, qi) => {
    const opt = QUESTIONS[qi].options[optIdx];
    if (opt.dims) Object.entries(opt.dims).forEach(([d, w]) => { dimRaw[d] += w; });
    if (opt.classes) Object.entries(opt.classes).forEach(([c, w]) => { classRaw[c] += w; });
    if (opt.zodiac) Object.entries(opt.zodiac).forEach(([z, w]) => { zodiacRaw[z] += w; });
  });

  // base
  let basePct = {};
  if (opts.covBase) {
    const ratios = {};
    pool.forEach((c) => { ratios[c.id] = baseCov[c.id] > 0 ? classRaw[c.id] / baseCov[c.id] : 0; });
    const maxR = Math.max(0.0001, ...pool.map((c) => ratios[c.id]));
    pool.forEach((c) => { basePct[c.id] = round2(100 * ratios[c.id] / maxR); });
  } else {
    const maxRaw = Math.max(0, ...pool.map((c) => classRaw[c.id]));
    pool.forEach((c) => { basePct[c.id] = maxRaw > 0 ? round2(100 * classRaw[c.id] / maxRaw) : 0; });
  }

  // personal (cosine of z-profiles) —— 与现行引擎一致
  const dimMean = DIMENSIONS.reduce((s, d) => s + dimRaw[d], 0) / 6;
  const dimStd = Math.sqrt(DIMENSIONS.reduce((s, d) => s + (dimRaw[d] - dimMean) ** 2, 0) / 6);
  const uStd = {}; DIMENSIONS.forEach((d) => { uStd[d] = dimStd > 1e-9 ? (dimRaw[d] - dimMean) / dimStd : 0; });
  const uNorm = Math.sqrt(DIMENSIONS.reduce((s, d) => s + uStd[d] ** 2, 0));
  const personalPct = {};
  pool.forEach((c) => {
    const vals = DIMENSIONS.map((d) => c.dims[d]);
    const cMean = vals.reduce((s, v) => s + v, 0) / 6;
    const cStd = Math.sqrt(vals.reduce((s, v) => s + (v - cMean) ** 2, 0) / 6);
    if (uNorm < 1e-9 || cStd < 1e-9) { personalPct[c.id] = 50; return; }
    let dot = 0, cSq = 0;
    DIMENSIONS.forEach((d) => {
      const cz = (c.dims[d] - cMean) / cStd;
      dot += uStd[d] * cz; cSq += cz * cz;
    });
    personalPct[c.id] = round2(100 * (dot / (uNorm * Math.sqrt(cSq)) + 1) / 2);
  });

  // zodiac
  const rank = ZODIAC.map((z, i) => ({ id: z.id, raw: zodiacRaw[z.id], i }))
    .sort((a, b) => (b.raw - a.raw) || (a.i - b.i));
  const s1 = ZODIAC.find((z) => z.id === rank[0].id);
  const s2 = ZODIAC.find((z) => z.id === rank[1].id);
  const bonus = {};
  pool.forEach((c) => {
    const b1 = (s1.classBias && s1.classBias[c.id]) || 0;
    const b2 = (s2.classBias && s2.classBias[c.id]) || 0;
    bonus[c.id] = b1 + 0.5 * b2;
  });
  const zodiacPct = {};
  if (opts.covZodiac) {
    const ratios = {};
    pool.forEach((c) => { ratios[c.id] = zodCov[c.id] > 0 ? bonus[c.id] / zodCov[c.id] : 0; });
    const maxR = Math.max(0.0001, ...pool.map((c) => ratios[c.id]));
    pool.forEach((c) => { zodiacPct[c.id] = round2(100 * ratios[c.id] / maxR); });
  } else {
    const maxB = Math.max(0.01, ...pool.map((c) => bonus[c.id]));
    pool.forEach((c) => { zodiacPct[c.id] = round2(100 * bonus[c.id] / maxB); });
  }

  const total = {};
  pool.forEach((c) => {
    total[c.id] = round2(0.35 * basePct[c.id] + 0.45 * personalPct[c.id] + 0.2 * zodiacPct[c.id]);
  });
  return total;
}

const variants = {
  current: { covBase: false, covZodiac: false },
  covBaseOnly: { covBase: true, covZodiac: false },
  covBoth: { covBase: true, covZodiac: true },
};

const N = 20000;
const results = {};
for (const [name, opts] of Object.entries(variants)) {
  const rng = mulberry32(777777);
  const wins = Object.fromEntries(poolIds.map((id) => [id, 0]));
  for (let i = 0; i < N; i++) {
    const answers = QUESTIONS.map((q) => Math.floor(rng() * q.options.length));
    const total = computeVariant(answers, opts);
    let best = null, bestV = -1;
    poolIds.forEach((id) => { if (total[id] > bestV) { bestV = total[id]; best = id; } });
    wins[best] += 1;
  }
  const rates = poolIds.map((id) => wins[id] / N);
  const max = Math.max(...rates), min = Math.min(...rates);
  const mean = rates.reduce((s, v) => s + v, 0) / rates.length;
  const std = Math.sqrt(rates.reduce((s, v) => s + (v - mean) ** 2, 0) / rates.length);
  results[name] = { wins, rates, max, min, std };
}

console.log(`mode=${mode}  N=${N}`);
console.log('class         current   covBase   covBoth');
poolIds.forEach((id, i) => {
  const r = (v) => (100 * v.rates[i]).toFixed(1).padStart(7);
  console.log(`${id.padEnd(13)}${r(results.current)} ${r(results.covBaseOnly)} ${r(results.covBoth)}`);
});
console.log('');
for (const [name, r] of Object.entries(results)) {
  console.log(`${name.padEnd(12)} max=${(100 * r.max).toFixed(1)}% min=${(100 * r.min).toFixed(1)}% ratio=${(r.max / r.min).toFixed(2)} std=${(100 * r.std).toFixed(2)}`);
}
