/**
 * 题组采样器（确定性 · 种子驱动）
 * ------------------------------------------------------------------
 * 每次开局，从「按维度分池」的题库中按规则抽取 18 条陈述：
 *   · 三个分池各抽 6 条：lore（命运抉择）/ zodiac（星辰低语）/ heart（本心试炼）
 *   · 模式过滤：classic 排除「仅正式服」条目；retail 排除「仅怀旧服」条目
 *   · 覆盖约束：尽力保证每个可评判职业在题组中留有基础权重（覆盖不足时取最优尝试）
 *   · 全局洗牌：抽到的 18 条顺序再次打乱，因此每次开局的题组与顺序都不同
 * 同一 (mode, seed) 永远生成同一题组 —— 分享链接依靠它复现完整结果。
 */

import { POOLS, SAMPLE_RULES } from '../data/questions.js';
import { classPool } from '../data/classes.js';
import { ZODIAC } from '../data/zodiac.js';

export const ANSWER_LEVELS = 5; // 五档赞同度：0 非常赞同 … 4 完全不赞同
export const LEVEL_MULT = [1, 0.5, 0, -0.5, -1];
const COVERAGE_FLOOR = 2; // 每个职业在题组内至少可得的职业权重
const COVERAGE_ATTEMPTS = 60;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function modeAllowed(statement, mode) {
  const tags = statement.tags || [];
  if (mode === 'classic' && tags.includes('retail')) return false;
  if (mode === 'retail' && tags.includes('classic')) return false;
  return true;
}

/** 洗牌抽出前 n 条（消耗 rng，确定性） */
function pickSome(cands, n, rng) {
  const arr = cands.slice();
  const m = Math.min(n, arr.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr.slice(0, m);
}

/** 星座加权抽取（v3）：优先取与本星座有共鸣权重的条目（保证配额），其余自由抽取 */
export const SIGN_QUOTA_PER_KIND = 3;
function pickSignAware(cands, n, rng, signId) {
  const aff = [];
  const rest = [];
  cands.forEach((st) => { ((st.zodiac && st.zodiac[signId]) ? aff : rest).push(st); });
  const k = Math.min(SIGN_QUOTA_PER_KIND, aff.length, n);
  return [...pickSome(aff, k, rng), ...pickSome(rest, n - k, rng)];
}

function coverageOf(sample, poolIds) {
  const cov = {};
  poolIds.forEach((id) => { cov[id] = 0; });
  sample.forEach((s) => {
    poolIds.forEach((id) => { cov[id] += (s.classes && s.classes[id]) || 0; });
  });
  return cov;
}

/**
 * 采样题组
 * @param {'classic'|'retail'} mode
 * @param {number} seed 32 位无符号整数
 * @param {string|null} [sign] 选择的星座（v3 星座加权；null 时沿用纯随机口径，保证 v2 旧分享可复现）
 * @returns {Array} 18 条陈述对象（顺序即作答顺序）
 */
export function sampleStatements(mode, seed, sign = null) {
  if (mode !== 'classic' && mode !== 'retail') throw new Error(`未知模式：${mode}`);
  const signId = sign && ZODIAC.some((z) => z.id === sign) ? sign : null;
  const s = (Number(seed) >>> 0) || 1;
  const rng = mulberry32(s);
  const poolIds = classPool(mode).map((c) => c.id);
  const kinds = ['lore', 'zodiac', 'heart'];

  let best = null;
  let bestMin = -1;
  for (let attempt = 0; attempt < COVERAGE_ATTEMPTS; attempt++) {
    const picked = [];
    kinds.forEach((kind) => {
      const cands = (POOLS[kind] || []).filter((st) => modeAllowed(st, mode));
      if (signId) picked.push(...pickSignAware(cands, SAMPLE_RULES.perKind[kind], rng, signId));
      else picked.push(...pickSome(cands, SAMPLE_RULES.perKind[kind], rng));
    });
    // 全局洗牌
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = picked[i]; picked[i] = picked[j]; picked[j] = t;
    }
    const cov = coverageOf(picked, poolIds);
    const minCov = Math.min(...poolIds.map((id) => cov[id]));
    if (minCov >= COVERAGE_FLOOR) return picked;
    if (minCov > bestMin) { bestMin = minCov; best = picked; }
  }
  return best; // 覆盖约束在极端种子下不可达时，返回尝试中最优（仍为确定性）
}

/** 依据 id 列表还原题组（记录回放用，防御缺失 id） */
export function statementsByIds(ids) {
  const all = [...(POOLS.lore || []), ...(POOLS.zodiac || []), ...(POOLS.heart || [])];
  const map = new Map(all.map((s) => [s.id, s]));
  return (Array.isArray(ids) ? ids : []).map((id) => map.get(id)).filter(Boolean);
}

/** 生成一个随机种子（用于新会话；e2e 环境由外部注入固定种子） */
export function randomSeed() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
