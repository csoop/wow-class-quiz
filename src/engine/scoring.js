/**
 * 评分引擎（纯函数 · 确定性）· v3（星座锚定版）
 * ------------------------------------------------------------------
 * 输入：sample（18 条陈述题组）+ answers（五档下标 0-4）+ mode
 * 五档：0 非常赞同 / 1 赞同 / 2 中立 / 3 不赞同 / 4 完全不赞同
 * 权重映射：[-1, -0.5, 0, +0.5, +1] —— 赞同按权重加分，反对按权重减分。
 * 输出：主职业 / 副职业 / 星座解读 / 六维得分 / 全职业明细
 *
 * 计分公式（总分 0-100）：
 *   总分 = 0.35 × 职业直连分（按「题组机会覆盖率」归一后池内归一化）
 *        + 0.45 × 性格契合分（六维向量 × 职业六维轮廓的标准化余弦相似度）
 *        + 0.20 × 星辰修正分（v3：选择星座 ×1.0 与作答推演星座 ×0.6 混合；职业加成按覆盖率归一）
 * 副职业：全池中「总分 + 定位互补加成（主定位不同 +3）」最高且与主职业不同者。
 * 确定性保证：同一（题组, 作答, 模式）任何时候重算结果完全一致；无随机数、无时间依赖。
 */

import { CLASSES, classPool, DIMENSIONS } from '../data/classes.js';
import { ZODIAC } from '../data/zodiac.js';
import { LEVEL_MULT, ANSWER_LEVELS } from './sampler.js';
import { SAMPLE_RULES } from '../data/questions.js';

export const ENGINE_VERSION = '3.0.0';

/* ---------- 静态预计算：星座对职业的覆盖率（与题库结构无关） ---------- */
const ZODIAC_COVERAGE = {};
{
  const ids = CLASSES.map((c) => c.id);
  ids.forEach((id) => { ZODIAC_COVERAGE[id] = 0; });
  ZODIAC.forEach((z) => {
    ids.forEach((id) => { ZODIAC_COVERAGE[id] += (z.classBias && z.classBias[id]) || 0; });
  });
}

const SIGN_SMOOTHING = 3; // 星座密度平滑强度（向全局密度收缩，压缩低供给星座的方差偏置）

export const WEIGHTS = {
  base: 0.35,
  personal: 0.45,
  zodiac: 0.2,
};

/** 副职业「定位互补」加成：与主职业主定位不同时 +3 分 */
export const SECONDARY_COMPLEMENT_BONUS = 3;

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** 校验作答数组：必须为 18 个合法五档下标（0-4） */
export function validateAnswers(answers) {
  const errors = [];
  if (!Array.isArray(answers) || answers.length !== SAMPLE_RULES.total) {
    errors.push(`需要 ${SAMPLE_RULES.total} 题作答，实际 ${Array.isArray(answers) ? answers.length : '非数组'}`);
    return { ok: false, errors };
  }
  answers.forEach((a, i) => {
    if (!Number.isInteger(a) || a < 0 || a >= ANSWER_LEVELS) {
      errors.push(`第 ${i + 1} 题作答非法：${JSON.stringify(a)}（应为 0-${ANSWER_LEVELS - 1}）`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * 计算完整测试结果
 * @param {Array} sample 18 条陈述题组（来自采样器，顺序即作答顺序）
 * @param {number[]} answers 18 个五档下标（0-4）
 * @param {'classic'|'retail'} mode
 * @param {string|null} [sign] 开始前选择的星座（v3）；null 时按纯作答推演（v2 兼容）
 */
export function computeResult(sample, answers, mode, sign = null) {
  if (!Array.isArray(sample) || sample.length !== SAMPLE_RULES.total) {
    throw new Error(`题组数量异常：${Array.isArray(sample) ? sample.length : '非数组'}`);
  }
  const check = validateAnswers(answers);
  if (!check.ok) {
    throw new Error(`作答数据不完整：${check.errors.join('；')}`);
  }
  if (mode !== 'classic' && mode !== 'retail') {
    throw new Error(`未知模式：${mode}`);
  }
  const signId = sign && ZODIAC.some((z) => z.id === sign) ? sign : null;

  const pool = classPool(mode); // classic: 9 职业；retail: 13 职业

  // ---------- 1. 原始累加（符号化五档：赞同加、反对减） ----------
  const dimRaw = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));
  const classRaw = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
  const zodiacRaw = Object.fromEntries(ZODIAC.map((z) => [z.id, 0]));

  answers.forEach((lvl, i) => {
    const st = sample[i];
    const m = LEVEL_MULT[lvl] ?? 0;
    if (!m) return;
    if (st.dims) DIMENSIONS.forEach((d) => { if (st.dims[d]) dimRaw[d] += st.dims[d] * m; });
    if (st.classes) Object.entries(st.classes).forEach(([cid, w]) => { if (cid in classRaw) classRaw[cid] += w * m; });
    if (st.zodiac) Object.entries(st.zodiac).forEach(([zid, w]) => { zodiacRaw[zid] += w * m; });
  });

  // ---------- 2. 职业直连分（题组机会覆盖率归一 → 池内归一化） ----------
  const coverage = {};
  pool.forEach((c) => { coverage[c.id] = 0; });
  sample.forEach((st) => {
    pool.forEach((c) => { coverage[c.id] += Math.max(0, (st.classes && st.classes[c.id]) || 0); });
  });
  const baseRatio = {};
  pool.forEach((c) => {
    baseRatio[c.id] = coverage[c.id] > 0 ? classRaw[c.id] / coverage[c.id] : 0;
  });
  const ratios = pool.map((c) => baseRatio[c.id]);
  const maxR = Math.max(...ratios);
  const minR = Math.min(...ratios);
  const basePct = {};
  const effRatio = (c) => (coverage[c.id] > 0 ? baseRatio[c.id] : minR - 1); // 无机会覆盖的职业不占先
  const eMin = Math.min(...pool.map(effRatio));
  const eMax = Math.max(...pool.map(effRatio));
  pool.forEach((c) => {
    if (maxR < 1e-9) {
      // 全池非正（极端背离作答）：线性映射到 50-100，保持稳定与单调
      basePct[c.id] = round2(50 + (50 * (effRatio(c) - eMin)) / Math.max(1e-9, eMax - eMin));
    } else {
      basePct[c.id] = round2((100 * baseRatio[c.id]) / maxR);
    }
  });

  // ---------- 3. 性格契合分（标准化轮廓余弦相似度） ----------
  const dimMean = DIMENSIONS.reduce((s, d) => s + dimRaw[d], 0) / DIMENSIONS.length;
  const dimStd = Math.sqrt(
    DIMENSIONS.reduce((s, d) => s + (dimRaw[d] - dimMean) ** 2, 0) / DIMENSIONS.length,
  );
  const uStd = {};
  DIMENSIONS.forEach((d) => {
    uStd[d] = dimStd > 1e-9 ? (dimRaw[d] - dimMean) / dimStd : 0;
  });
  const uStdNorm = Math.sqrt(DIMENSIONS.reduce((s, d) => s + uStd[d] ** 2, 0));
  const personalPct = {};
  pool.forEach((c) => {
    const vals = DIMENSIONS.map((d) => c.dims[d]);
    const cMean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const cStd = Math.sqrt(vals.reduce((s, v) => s + (v - cMean) ** 2, 0) / vals.length);
    if (uStdNorm < 1e-9 || cStd < 1e-9) {
      personalPct[c.id] = 50; // 完全平坦的作答 / 职业向量 → 中性分
      return;
    }
    let dot = 0;
    let cSq = 0;
    DIMENSIONS.forEach((d) => {
      const cz = (c.dims[d] - cMean) / cStd;
      dot += uStd[d] * cz;
      cSq += cz * cz;
    });
    const cos = dot / (uStdNorm * Math.sqrt(cSq));
    personalPct[c.id] = round2((100 * (cos + 1)) / 2);
  });

  // ---------- 4. 星辰修正（供给密度平滑选取） ----------
  const signSupply = {};
  ZODIAC.forEach((z) => { signSupply[z.id] = 0; });
  sample.forEach((st) => {
    if (!st.zodiac) return;
    Object.entries(st.zodiac).forEach(([zid, w]) => { signSupply[zid] += w; });
  });
  const totalSupply = ZODIAC.reduce((s, z) => s + signSupply[z.id], 0);
  const totalRaw = ZODIAC.reduce((s, z) => s + zodiacRaw[z.id], 0);
  const meanDensity = totalSupply > 0 ? totalRaw / totalSupply : 0;
  const zodiacRank = ZODIAC.map((z, idx) => {
    const supply = signSupply[z.id];
    const smoothed = (zodiacRaw[z.id] + SIGN_SMOOTHING * meanDensity) / (supply + SIGN_SMOOTHING);
    return { id: z.id, raw: zodiacRaw[z.id], supply, smoothed, idx };
  }).sort((a, b) => (b.smoothed - a.smoothed) || (b.raw - a.raw) || (a.idx - b.idx));
  const signPrimary = zodiacRank[0];
  const signSecondary = zodiacRank[1];
  const signPrimaryData = ZODIAC.find((z) => z.id === signPrimary.id);
  const signSecondaryData = ZODIAC.find((z) => z.id === signSecondary.id);

  const declaredSignData = signId ? ZODIAC.find((z) => z.id === signId) : null;
  const zodiacBonus = {};
  pool.forEach((c) => {
    const b1 = (signPrimaryData.classBias && signPrimaryData.classBias[c.id]) || 0;
    const b2 = (signSecondaryData.classBias && signSecondaryData.classBias[c.id]) || 0;
    const inferred = b1 + 0.5 * b2;
    const declared = declaredSignData ? (declaredSignData.classBias && declaredSignData.classBias[c.id]) || 0 : 0;
    zodiacBonus[c.id] = round2(declaredSignData ? declared + 0.6 * inferred : inferred);
  });
  const zodiacRatio = {};
  pool.forEach((c) => {
    zodiacRatio[c.id] = ZODIAC_COVERAGE[c.id] > 0 ? zodiacBonus[c.id] / ZODIAC_COVERAGE[c.id] : 0;
  });
  const maxZodiacRatio = Math.max(1e-9, ...pool.map((c) => zodiacRatio[c.id]));
  const zodiacPct = {};
  pool.forEach((c) => {
    zodiacPct[c.id] = round2((100 * zodiacRatio[c.id]) / maxZodiacRatio);
  });

  // 星座共振度（展示用：与选取口径一致的平滑密度，相对最高值归一到 0-100）
  const maxSmoothed = Math.max(1e-9, ...zodiacRank.map((z) => z.smoothed));
  const zodiacScores = zodiacRank.map((z) => ({
    id: z.id,
    name: ZODIAC.find((x) => x.id === z.id).name,
    raw: z.raw,
    pct: maxSmoothed > 1e-9 ? round2(Math.max(0, (100 * z.smoothed) / maxSmoothed)) : 50,
  }));

  // ---------- 5. 总分 ----------
  const scores = pool.map((c) => {
    const total = round2(
      WEIGHTS.base * basePct[c.id] + WEIGHTS.personal * personalPct[c.id] + WEIGHTS.zodiac * zodiacPct[c.id],
    );
    return {
      classId: c.id,
      name: c.name,
      total,
      base: basePct[c.id],
      personal: personalPct[c.id],
      zodiac: zodiacPct[c.id],
      zodiacBonus: zodiacBonus[c.id],
      raw: classRaw[c.id],
    };
  });
  scores.sort((a, b) => (b.total - a.total) || (CLASSES.findIndex((c) => c.id === a.classId) - CLASSES.findIndex((c) => c.id === b.classId)));

  // ---------- 6. 主职业 ----------
  const mainScore = scores[0];
  const mainClass = CLASSES.find((c) => c.id === mainScore.classId);

  // 星座锚定展示数据（v3）：选择星座与作答推演的同频度、专属共鸣短句
  let resonance = null;
  let declaredNote = null;
  if (declaredSignData) {
    const sameElement = declaredSignData.element === signPrimaryData.element;
    resonance = signId === signPrimary.id ? 98 : signId === signSecondary.id ? 90 : sameElement ? 80 : 68;
    declaredNote = (declaredSignData.biasNote && declaredSignData.biasNote[mainClass.id]) || null;
  }

  // ---------- 7. 副职业（定位互补加成） ----------
  let secondaryScore = null;
  let secondaryClass = null;
  let bestAdj = -Infinity;
  for (const s of scores) {
    if (s.classId === mainClass.id) continue;
    const cand = CLASSES.find((c) => c.id === s.classId);
    const bonus = cand.primaryRole !== mainClass.primaryRole ? SECONDARY_COMPLEMENT_BONUS : 0;
    const adj = s.total + bonus;
    if (
      adj > bestAdj ||
      (adj === bestAdj &&
        secondaryScore &&
        s.total > secondaryScore.total)
    ) {
      bestAdj = adj;
      secondaryScore = { ...s, complementBonus: bonus, adjusted: round2(adj) };
      secondaryClass = cand;
    }
  }

  // ---------- 8. 六维排名 ----------
  const dimsRanked = DIMENSIONS.map((d) => ({ id: d, value: dimRaw[d] })).sort((a, b) => b.value - a.value || DIMENSIONS.indexOf(a.id) - DIMENSIONS.indexOf(b.id));

  // ---------- 9. 直连共鸣统计（用于理由文案：赞同且带该职业权重的条目数） ----------
  const classChoiceCount = {};
  pool.forEach((c) => { classChoiceCount[c.id] = 0; });
  answers.forEach((lvl, i) => {
    const m = LEVEL_MULT[lvl] ?? 0;
    if (m <= 0) return;
    const st = sample[i];
    if (!st.classes) return;
    Object.keys(st.classes).forEach((cid) => {
      if (cid in classChoiceCount) classChoiceCount[cid] += 1;
    });
  });

  return {
    engineVersion: ENGINE_VERSION,
    mode,
    sampleIds: sample.map((s) => s.id),
    main: mainClass.id,
    secondary: secondaryClass.id,
    zodiac: {
      primary: signPrimary.id,
      secondary: signSecondary.id,
      declared: signId,
      resonance,
      declaredNote,
      scores: zodiacScores,
      note: '星座解读综合了你在开始前选择的星座与答题轨迹推演出的共鸣星座，代表与你契合的星辰能量。',
    },
    dims: dimRaw,
    dimsRanked,
    scores, // 全池明细（已排序）
    secondaryDetail: secondaryScore, // 副职业的调整明细（含互补加成）
    classChoiceCount, // 主副职业的直连共鸣次数
    answers: answers.slice(),
  };
}

/** 把结果压缩为稳定的指纹字符串（用于验证与台账去重校验） */
export function resultFingerprint(result) {
  return `${result.mode}:${result.zodiac && result.zodiac.declared ? result.zodiac.declared : '-'}:${(result.sampleIds || []).join(',')}:${result.answers.join('')}:${result.main}>${result.secondary}:${result.engineVersion}`;
}

/** 便捷函数：直接得到可显示的契合度整数 */
export function displayFit(total) {
  return Math.round(total);
}
