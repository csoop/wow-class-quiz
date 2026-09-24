/**
 * 分布诊断（v2）：分解每个职业的评分分量（base / personal / zodiac），找出偏斜驱动源
 * 运行：node scripts/diagnose-balance.mjs [classic|retail]
 */
import { classPool } from '../src/data/classes.js';
import { computeResult } from '../src/engine/scoring.js';
import { sampleStatements, ANSWER_LEVELS } from '../src/engine/sampler.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = Number(process.env.N || 20000);
const rng = mulberry32(424242);
const mode = process.argv[2] || 'retail';
const pool = classPool(mode).map((c) => c.id);

const acc = Object.fromEntries(pool.map((id) => [id, { wins: 0, base: 0, personal: 0, zodiac: 0, total: 0, top3: 0 }]));

for (let i = 0; i < N; i++) {
  const seed = Math.floor(rng() * 4294967295) + 1;
  const sample = sampleStatements(mode, seed);
  const answers = sample.map(() => Math.floor(rng() * ANSWER_LEVELS));
  const res = computeResult(sample, answers, mode);
  const top3 = new Set(res.scores.slice(0, 3).map((s) => s.classId));
  res.scores.forEach((s, rank) => {
    const a = acc[s.classId];
    a.base += s.base; a.personal += s.personal; a.zodiac += s.zodiac; a.total += s.total;
    if (rank === 0) a.wins += 1;
    if (top3.has(s.classId)) a.top3 += 1;
  });
}

console.log(`mode=${mode}  N=${N}（题组与作答均随机）`);
console.log('class         win%   top3%   avgBase avgPers avgZodi avgTotal');
pool.forEach((id) => {
  const a = acc[id];
  console.log(
    `${id.padEnd(13)} ${(100 * a.wins / N).toFixed(1).padStart(5)} ${(100 * a.top3 / N).toFixed(1).padStart(6)}   ${(a.base / N).toFixed(1).padStart(6)} ${(a.personal / N).toFixed(1).padStart(7)} ${(a.zodiac / N).toFixed(1).padStart(7)} ${(a.total / N).toFixed(1).padStart(7)}`,
  );
});
