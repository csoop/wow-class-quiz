/**
 * 评分引擎批量验证脚本（v2 · Node，零依赖）
 * 运行：npm run verify
 * 检查项：
 *   A. 题库结构（84 条、三池、文本规范、权重结构 ≥2 类）
 *   B. 职业池严格区分（怀旧服 9 / 正式服 13；模式标签过滤正确）
 *   C. 采样器（确定性 / 多样性 / 分池配比 / 覆盖约束 / 标签合规 / 还原）
 *   D. 确定性与分享编码（含篡改拒收）
 *   E. 随机轰炸（主副约束、职业/星座可达性、分布健康度）
 *   F. 边界作答（全同意 / 全反对 / 全中立 / 极值策略）不崩溃且结果合理
 */

import { QUESTIONS, POOLS, SAMPLE_RULES, BANNED_WORDS } from '../src/data/questions.js';
import { CLASSES, CLASSIC_EXCLUDED, classPool, DIMENSIONS } from '../src/data/classes.js';
import { ZODIAC } from '../src/data/zodiac.js';
import { computeResult, validateAnswers, resultFingerprint } from '../src/engine/scoring.js';
import { encodeShare, decodeShare } from '../src/engine/share.js';
import { sampleStatements, statementsByIds, ANSWER_LEVELS, LEVEL_MULT, SIGN_QUOTA_PER_KIND } from '../src/engine/sampler.js';

let failures = 0;
let checks = 0;
const log = [];
function ok(name, cond, detail = '') {
  checks += 1;
  if (cond) {
    log.push(`  ✔ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failures += 1;
    log.push(`  ✘ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260916);
const randSeed = () => Math.floor(rng() * 4294967295) + 1;

console.log('=== A. 题库结构 ===');
ok('题库总量 72-96', QUESTIONS.length >= 72 && QUESTIONS.length <= 96, `共 ${QUESTIONS.length} 条`);
ok('三池齐备且各 ≥26', POOLS.lore.length >= 26 && POOLS.zodiac.length >= 26 && POOLS.heart.length >= 26,
  `lore=${POOLS.lore.length} zodiac=${POOLS.zodiac.length} heart=${POOLS.heart.length}`);
const ids = QUESTIONS.map((s) => s.id);
ok('id 唯一', new Set(ids).size === ids.length, `${ids.length} 条`);
ok('id 格式合法', ids.every((id) => /^[LZH]\d{2}$/.test(id)), ids.slice(0, 3).join(','));
ok('kind 与池一致', QUESTIONS.every((s) => POOLS[s.kind] && POOLS[s.kind].includes(s)), '逐条核验');

const textIssues = [];
QUESTIONS.forEach((s) => {
  if (typeof s.text !== 'string' || s.text.length < 8 || s.text.length > 52) textIssues.push(`${s.id} 长度=${(s.text || '').length}`);
});
ok('文本长度 8-52', textIssues.length === 0, textIssues.slice(0, 5).join(' | ') || '全部通过');

const banned = [];
QUESTIONS.forEach((s) => {
  (BANNED_WORDS || []).forEach((w) => { if (s.text.includes(w)) banned.push(`${s.id}:${w}`); });
});
ok('文本无直白词（禁用词扫描）', banned.length === 0, banned.slice(0, 8).join(' | ') || '零命中');

const dupText = [];
const seenText = new Set();
QUESTIONS.forEach((s) => { if (seenText.has(s.text)) dupText.push(s.id); seenText.add(s.text); });
ok('文本无重复', dupText.length === 0, dupText.join(',') || '全部唯一');

let multiCatIssues = [];
let weightIssues = [];
QUESTIONS.forEach((s) => {
  const cats = ['dims', 'classes', 'zodiac'].filter((k) => s[k] && Object.keys(s[k]).length > 0);
  if (cats.length < 2) multiCatIssues.push(`${s.id} 仅 ${cats.join('+')}`);
  for (const [k, map] of Object.entries({ dims: s.dims, classes: s.classes, zodiac: s.zodiac })) {
    if (!map) continue;
    for (const [id, w] of Object.entries(map)) {
      if (typeof w !== 'number' || w <= 0 || w > 3) weightIssues.push(`${s.id}.${k}.${id}=${w}`);
      if (k === 'dims' && !DIMENSIONS.includes(id)) weightIssues.push(`未知维度 ${id}`);
      if (k === 'classes' && !CLASSES.some((c) => c.id === id)) weightIssues.push(`未知职业 ${id}`);
      if (k === 'zodiac' && !ZODIAC.some((z) => z.id === id)) weightIssues.push(`未知星座 ${id}`);
    }
  }
});
ok('每条 ≥2 类权重', multiCatIssues.length === 0, multiCatIssues.slice(0, 5).join(' | ') || '全部通过');
ok('权重数值与 ID 合法', weightIssues.length === 0, weightIssues.slice(0, 5).join(' | ') || '全部通过');
{
  const low = [];
  for (const z of ZODIAC) {
    const per = ['lore', 'zodiac', 'heart'].map((k) => POOLS[k].filter((s) => s.zodiac && s.zodiac[z.id]).length);
    if (Math.min(...per) < 3) low.push(`${z.id}:${per.join('/')}`);
  }
  ok('十二星座每池 ≥3 条（v3）', low.length === 0, low.slice(0, 6).join(' ') || '12 星座全达标');
}

const kindCount = { lore: 0, zodiac: 0, heart: 0 };
QUESTIONS.forEach((s) => { kindCount[s.kind] += 1; });
ok('三类题型齐全', kindCount.lore > 0 && kindCount.zodiac > 0 && kindCount.heart > 0, JSON.stringify(kindCount));

console.log('=== B. 职业池与模式标签 ===');
const classicPool = classPool('classic').map((c) => c.id);
const retailPool = classPool('retail').map((c) => c.id);
ok('怀旧服池 = 9 职业', classicPool.length === 9, classicPool.join(','));
ok('正式服池 = 13 职业', retailPool.length === 13, retailPool.join(','));
ok('怀旧服池不含 DK/DH/武僧/唤魔师', CLASSIC_EXCLUDED.filter((id) => classicPool.includes(id)).length === 0);

{
  const cSet = new Set(classicPool);
  const rSet = new Set(retailPool);
  const bad = [];
  QUESTIONS.forEach((s) => {
    const tags = s.tags || [];
    const cw = Object.entries(s.classes || {}).reduce((sum, [cid, w]) => sum + (cSet.has(cid) ? w : 0), 0);
    const rw = Object.entries(s.classes || {}).reduce((sum, [cid, w]) => sum + (rSet.has(cid) ? w : 0), 0);
    if (!tags.includes('retail') && cw < 2) bad.push(`${s.id} classic可用=${cw}`);
    if (!tags.includes('classic') && rw < 2) bad.push(`${s.id} retail可用=${rw}`);
  });
  ok('各模式可用职业权重 ≥2', bad.length === 0, bad.slice(0, 8).join(' | ') || '全部通过');
}

for (const mode of ['classic', 'retail']) {
  const sizes = ['lore', 'zodiac', 'heart'].map((k) => POOLS[k].filter((s) => {
    const tags = s.tags || [];
    if (mode === 'classic' && tags.includes('retail')) return false;
    if (mode === 'retail' && tags.includes('classic')) return false;
    return true;
  }).length);
  ok(`[${mode}] 各池可用规模 ≥ 采样数+4`, sizes.every((n) => n >= SAMPLE_RULES.perKind.lore + 4), sizes.join('/'));
}

console.log('=== C. 采样器 ===');
// 确定性
{
  let allSame = true;
  for (let i = 0; i < 10; i++) {
    const sd = randSeed();
    const a = sampleStatements('retail', sd).map((s) => s.id).join(',');
    const b = sampleStatements('retail', sd).map((s) => s.id).join(',');
    if (a !== b) allSame = false;
  }
  ok('同种子同题组（确定性）', allSame, '10 个随机种子复验');
}
// 结构合规 + 覆盖
{
  let bad = [];
  let floor2 = 0;
  const N = 500;
  const seenSets = new Set();
  const seenOrders = new Set();
  for (let i = 0; i < N; i++) {
    const sd = randSeed();
    for (const mode of ['classic', 'retail']) {
      const sample = sampleStatements(mode, sd);
      if (sample.length !== SAMPLE_RULES.total) bad.push(`长度 ${sample.length}`);
      if (new Set(sample.map((s) => s.id)).size !== sample.length) bad.push('重复条目');
      const kc = { lore: 0, zodiac: 0, heart: 0 };
      sample.forEach((s) => { kc[s.kind] += 1; });
      if (kc.lore !== SAMPLE_RULES.perKind.lore || kc.zodiac !== SAMPLE_RULES.perKind.zodiac || kc.heart !== SAMPLE_RULES.perKind.heart) {
        bad.push(`分池 ${JSON.stringify(kc)}`);
      }
      const poolIds = mode === 'classic' ? classicPool : retailPool;
      const cov = {};
      poolIds.forEach((id) => { cov[id] = 0; });
      sample.forEach((s) => poolIds.forEach((id) => { cov[id] += (s.classes && s.classes[id]) || 0; }));
      const minCov = Math.min(...poolIds.map((id) => cov[id]));
      if (minCov < 1) bad.push(`[${mode}] 覆盖不足 ${JSON.stringify(cov)}`);
      if (minCov >= 2) floor2 += 1;
      if (mode === 'retail') {
        seenSets.add(sample.map((s) => s.id).slice().sort().join(','));
        seenOrders.add(sample.map((s) => s.id).join(','));
      }
    }
  }
  ok('题组结构合规（数量/去重/分池/覆盖≥1）', bad.length === 0, bad.slice(0, 5).join(' | ') || `${N} 组×2 模式全通过`);
  log.push(`  [统计] 覆盖≥2 比例：${(100 * floor2 / (N * 2)).toFixed(1)}%`);
  ok('采样多样性：集合不重复率 >98%', seenSets.size / N > 0.98, `集合 ${seenSets.size}/${N}`);
  ok('采样多样性：顺序几乎全不同', seenOrders.size / N > 0.99, `顺序 ${seenOrders.size}/${N}`);
}
// 标签合规
{
  let tagBad = [];
  for (let i = 0; i < 100; i++) {
    const sd = randSeed();
    sampleStatements('classic', sd).forEach((s) => { if ((s.tags || []).includes('retail')) tagBad.push(`classic 抽到 retail 条目 ${s.id}`); });
    sampleStatements('retail', sd).forEach((s) => { if ((s.tags || []).includes('classic')) tagBad.push(`retail 抽到 classic 条目 ${s.id}`); });
  }
  ok('模式标签过滤正确', tagBad.length === 0, tagBad.slice(0, 3).join(' | ') || '100 种子×2 模式');
}
// id 还原
{
  const sample = sampleStatements('retail', 777);
  const back = statementsByIds(sample.map((s) => s.id));
  ok('statementsByIds 还原一致', back.length === sample.length && back.every((s, i) => s.id === sample[i].id));
}
// v3 星座加权抽样
{
  const signIds = ZODIAC.map((z) => z.id);
  let detBad = [];
  let quotaBad = [];
  for (const mode of ['classic', 'retail']) {
    for (const sign of signIds) {
      const sd = randSeed();
      const a = sampleStatements(mode, sd, sign);
      const b = sampleStatements(mode, sd, sign);
      if (a.map((s) => s.id).join() !== b.map((s) => s.id).join()) detBad.push(`${mode}/${sign}`);
      const per = { lore: 0, zodiac: 0, heart: 0 };
      a.forEach((s) => { if (s.zodiac && s.zodiac[sign]) per[s.kind] += 1; });
      if (Math.min(per.lore, per.zodiac, per.heart) < SIGN_QUOTA_PER_KIND) quotaBad.push(`${mode}/${sign}:${per.lore}/${per.zodiac}/${per.heart}`);
    }
  }
  ok('v3 抽样：12 星座×双模式确定性', detBad.length === 0, detBad.slice(0, 4).join(' ') || '24 组复验');
  ok('v3 抽样：每池星座题 ≥ 配额', quotaBad.length === 0, quotaBad.slice(0, 4).join(' ') || `配额 ${SIGN_QUOTA_PER_KIND}/池`);
  const sets = new Set(ZODIAC.map((z) => sampleStatements('classic', 4242, z.id).map((s) => s.id).join()));
  ok('v3 抽样：不同星座题组有差异', sets.size >= 10, `去重 ${sets.size}/12`);
}

console.log('=== D. 确定性与分享编码 ===');
const sample18 = sampleStatements('retail', 20260916);
const answers0 = sample18.map((s, i) => (i * 3 + 1) % ANSWER_LEVELS);
ok('作答校验通过', validateAnswers(answers0).ok);
const rr1 = computeResult(sample18, answers0, 'retail');
const rr2 = computeResult(sample18, answers0, 'retail');
ok('同（题组,作答,模式）结果一致', resultFingerprint(rr1) === resultFingerprint(rr2), resultFingerprint(rr1).slice(0, 80));
ok('主副职业不同', rr1.main !== rr1.secondary, `${rr1.main} > ${rr1.secondary}`);
const code = encodeShare(20260916, answers0, 'retail');
const dec = decodeShare(code);
ok('分享编码可解码', !!dec && dec.mode === 'retail' && dec.seed === 20260916 && dec.answers.join('') === answers0.join(''), code.slice(0, 50));
const sampleBack = sampleStatements(dec.mode, dec.seed);
const rr3 = computeResult(sampleBack, dec.answers, dec.mode);
ok('分享复现同一结果', rr1.main === rr3.main && rr1.secondary === rr3.secondary && resultFingerprint(rr1) === resultFingerprint(rr3));
const code3 = encodeShare(20260916, answers0, 'retail', 'leo');
const dec3 = decodeShare(code3);
ok('分享 v3：编码可解码（含星座）', !!dec3 && dec3.mode === 'retail' && dec3.seed === 20260916 && dec3.sign === 'leo' && dec3.answers.join('') === answers0.join(''), code3.slice(0, 50));
{
  const rA = computeResult(sampleStatements('retail', 20260916, 'leo'), answers0, 'retail', 'leo');
  const s3 = sampleStatements(dec3.mode, dec3.seed, dec3.sign);
  const r3 = computeResult(s3, dec3.answers, dec3.mode, dec3.sign);
  ok('分享 v3：复现同一结果', resultFingerprint(r3) === resultFingerprint(rA));
}
ok('分享 v3：星座码损坏被拒绝', decodeShare('v3.r.zzz.abc.012345678901234567.zz') === null);
const legacy2 = decodeShare('v2.r.c29f8.142031420314203142.e4');
ok('v2 旧码仍可解码（无星座）', !!legacy2 && legacy2.sign === null && legacy2.mode === 'retail');
{
  const s2 = sampleStatements(legacy2.mode, legacy2.seed, null);
  const r2 = computeResult(s2, legacy2.answers, legacy2.mode, null);
  ok('v2 旧码可复现结果', !!r2.main && r2.main !== r2.secondary, `${r2.main} > ${r2.secondary}`);
}
ok('损坏分享码被拒绝（校验位）', decodeShare('v2.r.abc.012345678901234567.zz') === null);
ok('损坏分享码被拒绝（长度）', decodeShare('v2.r.abc.0123.ff') === null);
ok('旧版 v1 码被拒绝', decodeShare('v1.r.012301230123012301.zz') === null);

console.log('=== E. 随机轰炸 ===');
const N = 20000;
const stats = { retail: { main: {}, zodiac: {}, minTotal: 1e9, maxTotal: -1e9 }, classic: { main: {}, zodiac: {}, minTotal: 1e9, maxTotal: -1e9 } };
let bombViolation = 0;
for (const mode of ['classic', 'retail']) {
  const poolIds = new Set(mode === 'classic' ? classicPool : retailPool);
  for (let i = 0; i < N; i++) {
    const sd = randSeed();
    const sign = ZODIAC[Math.floor(rng() * ZODIAC.length)].id;
    const sample = sampleStatements(mode, sd, sign);
    const answers = sample.map(() => (rng() < 0.6 ? Math.floor(rng() * 2) : Math.floor(rng() * ANSWER_LEVELS)));
    let res;
    try {
      res = computeResult(sample, answers, mode, sign);
    } catch (e) {
      bombViolation += 1;
      log.push(`  ✘ 轰炸异常 ${e.message}`);
      continue;
    }
    if (res.zodiac.declared !== sign || !(res.zodiac.resonance >= 60 && res.zodiac.resonance <= 100)) { bombViolation += 1; log.push(`  ✘ 星座锚定异常 ${mode} ${sign}`); }
    if (!poolIds.has(res.main) || !poolIds.has(res.secondary)) { bombViolation += 1; log.push(`  ✘ 池外职业 ${mode} ${res.main}/${res.secondary}`); }
    if (res.main === res.secondary) bombViolation += 1;
    stats[mode].main[res.main] = (stats[mode].main[res.main] || 0) + 1;
    stats[mode].zodiac[res.zodiac.primary] = (stats[mode].zodiac[res.zodiac.primary] || 0) + 1;
    const top = res.scores[0].total;
    stats[mode].minTotal = Math.min(stats[mode].minTotal, top);
    stats[mode].maxTotal = Math.max(stats[mode].maxTotal, top);
  }
}
ok('随机轰炸无池外职业 / 主副重复 / 崩溃', bombViolation === 0, `${N * 2} 次随机（题组+作答+星座全随机）`);

for (const mode of ['classic', 'retail']) {
  const pool = mode === 'classic' ? classicPool : retailPool;
  const uncovered = pool.filter((id) => !stats[mode].main[id]);
  ok(`[${mode}] 全职业可达（主职业）`, uncovered.length === 0, uncovered.join(',') || `${pool.length}/${pool.length} 全覆盖`);
  const zUncovered = ZODIAC.filter((z) => !stats[mode].zodiac[z.id]);
  ok(`[${mode}] 星座可达性`, zUncovered.length === 0, zUncovered.map((z) => z.id).join(',') || '12/12 全覆盖');
  const maxShare = Math.max(...pool.map((id) => (stats[mode].main[id] || 0) / N));
  ok(`[${mode}] 无职业垄断（<35%）`, maxShare < 0.35, `最大份额 ${(100 * maxShare).toFixed(1)}%`);
  const zRates = ZODIAC.map((z) => ({ id: z.id, rate: (100 * (stats[mode].zodiac[z.id] || 0)) / N })).sort((a, b) => b.rate - a.rate);
  const ratio = zRates[0].rate / Math.max(0.01, zRates[zRates.length - 1].rate);
  log.push(`  [${mode}] 星座主位率：${zRates[0].id} ${zRates[0].rate.toFixed(1)}% / ${zRates[zRates.length - 1].id} ${zRates[zRates.length - 1].rate.toFixed(1)}%（极差 ${ratio.toFixed(2)}×）`);
  log.push(`  [${mode}] 顶分区间：${stats[mode].minTotal.toFixed(1)} ~ ${stats[mode].maxTotal.toFixed(1)}`);
  const mains = pool.map((id) => ({ id, n: stats[mode].main[id] || 0 })).sort((a, b) => b.n - a.n);
  log.push(`  [${mode}] 主职业分布：` + mains.map((m) => `${m.id}=${(100 * m.n / N).toFixed(1)}%`).join(' '));
}

console.log('=== F. 边界与策略作答 ===');
for (const mode of ['classic', 'retail']) {
  for (const [name, lvl] of [['非常赞同', 0], ['赞同', 1], ['中立', 2], ['不赞同', 3], ['完全不赞同', 4]]) {
    try {
      const sample = sampleStatements(mode, 20260916);
      const res = computeResult(sample, sample.map(() => lvl), mode);
      ok(`[${mode}] 全「${name}」`, res.main !== res.secondary, `主=${res.main} 副=${res.secondary} 顶分=${res.scores[0].total}`);
    } catch (e) {
      ok(`[${mode}] 全「${name}」`, false, e.message);
    }
  }
}
log.push('  [策略作答 → 结果]（供人工核对合理性的典型人格路径）：');
for (const dim of DIMENSIONS) {
  const sample = sampleStatements('retail', 4242);
  const answers = sample.map((s) => ((s.dims && s.dims[dim]) ? 0 : 2));
  const res = computeResult(sample, answers, 'retail');
  const resC = computeResult(sampleStatements('classic', 4242), answers, 'classic');
  log.push(`    偏爱「${dim}」→ 正式服 主=${res.main} 副=${res.secondary}｜怀旧服 主=${resC.main} 副=${resC.secondary}`);
}
{
  const sA = sampleStatements('retail', 777, 'leo');
  const aA = sA.map(() => 0);
  const rLeo = computeResult(sA, aA, 'retail', 'leo');
  const rPis = computeResult(sA, aA, 'retail', 'pisces');
  const diff = rLeo.scores.some((x) => Math.abs(x.zodiac - (rPis.scores.find((y) => y.classId === x.classId) || { zodiac: 0 }).zodiac) > 0.5);
  ok('星座锚定生效（同作答不同星座 → 星辰修正不同）', diff, `leo=${rLeo.main} / pisces=${rPis.main}`);
}

console.log(log.join('\n'));
console.log(`\n=== 汇总 ===`);
console.log(`检查项：${checks}，失败：${failures}`);
if (failures > 0) {
  console.log('结果：❌ 存在失败项');
  process.exit(1);
} else {
  console.log('结果：✅ 全部通过');
}
