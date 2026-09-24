/**
 * 结果解读文案生成器（确定性 · 无随机）
 * ------------------------------------------------------------------
 * 输入引擎结果 → 输出可直接渲染的解读文本。
 * 所有变体选择均基于作答内容的哈希，同一份作答永远得到同一段文字。
 */

import { zodiacById } from '../data/zodiac.js';

/* ---------- 六维人格元数据 ---------- */
export const DIM_META = {
  courage: {
    name: '勇气', tag: '直面',
    high: '你把"向前一步"当作本能：压力越大，你越像被点燃，而不是被压弯。',
    high2: '别人还在权衡时，你的身体已经先动了——这份果决是你的第一生产力。',
    low: '你很少选择正面硬撼——绕路不是怯懦，是你的省力策略，但别忘了偶尔亮剑。',
  },
  cunning: {
    name: '谋略', tag: '机变',
    high: '你习惯先看清棋盘再落子：信息、时机、退路，你都要握在手里。',
    high2: '你擅长在别人的规则里找到空隙，并且总能比对手多想一步。',
    low: '你不喜欢迂回的心计，直来直往让你更舒服——只是棋盘上有时需要假动作。',
  },
  compassion: {
    name: '慈悲', tag: '共情',
    high: '你的雷达天生朝着别人的情绪开着：谁的灯快灭了，你第一个看见。',
    high2: '你愿意为在意的人兜底，这份柔软从来不是软弱，而是韧性。',
    low: '你的温柔是节制的——先把事情做对，再谈情绪；但记得，队友要的有时只是一句"我在"。',
  },
  knowledge: {
    name: '求知', tag: '洞见',
    high: '"为什么"对你来说永远比"是什么"重要：你收集规律，也收集世界的彩蛋。',
    high2: '你相信万事皆有解法，而这世上最好的武器，是提前读过的说明书。',
    low: '比起翻书找答案，你更相信动手试出来的答案——不过偶尔求助，能少走十里路。',
  },
  freedom: {
    name: '自由', tag: '不羁',
    high: '任何规则你都要先闻一闻：是新大陆的味道，还是牢笼的味道？',
    high2: '你受不了一眼望到头的生活，你的路必须在自己的脚下长出来。',
    low: '秩序让你安心：清晰的边界，正是你发挥实力最舒服的舞台。',
  },
  faith: {
    name: '信念', tag: '坚守',
    high: '你心里有一根定海神针：认定的事，风雨不移，这不叫固执，叫坐标。',
    high2: '你答应的每一件事，都会自己走完；这份可靠，是你身上最亮的铠甲。',
    low: '你更相信变化本身——世界每天都在重新洗牌，而你不怕再看一眼底牌。',
  },
};

const DIMS = ['courage', 'cunning', 'compassion', 'knowledge', 'freedom', 'faith'];

/* ---------- 变体工具：由作答内容驱动的稳定哈希 ---------- */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(variants, seed) {
  return variants[seed % variants.length];
}

/* ---------- 人格解读 ---------- */
export function buildPersonalityReading(result) {
  const seed = hashSeed(result.answers.join('') + 'p');
  const ranked = result.dimsRanked;
  const top1 = DIM_META[ranked[0].id];
  const top2 = DIM_META[ranked[1].id];
  const low = DIM_META[ranked[ranked.length - 1].id];
  const top1Raw = ranked[0].value;
  const top2Raw = ranked[1].value;

  const lead = pick([
    `十八道题读完，你的星图轮廓已经清晰——来认领这张只属于你的性格底稿。`,
    `十八道题，其实是一面镜子。镜子里的人是这样站着的：`,
    `你的答案勾勒出了一条清晰的性格曲线，我们逐段来读：`,
  ], seed);

  const p1Variants = [
    `你的核心底色是「${top1.name} · ${top1.tag}」。${top1.high}`,
    `「${top1.name}」（${top1.tag}）是你身上最锋利的那道光。${top1.high}`,
    `先说结论：你最鲜明的特质是「${top1.name}」。${top1.high}`,
  ];
  const p1 = pick(p1Variants, seed >> 3);

  const p2Variants = [
    `紧随其后的是「${top2.name} · ${top2.tag}」：${top2.high2}`,
    `第二根支柱是「${top2.name}」（${top2.tag}）——${top2.high2}`,
    `而「${top2.name}」为你的底色包了一层边：${top2.high2}`,
  ];
  const p2 = pick(p2Variants, seed >> 5);

  const gap = top1Raw - top2Raw;
  const p3 = gap <= 2
    ? `值得一提的是，「${top1.name}」与「${top2.name}」在你身上几乎并驾齐驱（${top1Raw} : ${top2Raw}），这意味着你拥有罕见的双核人格——两条路都是你的路。`
    : `「${top1.name}」领先「${top2.name}」${gap} 分，主次分明——你更习惯用一个内核驱动所有决定。`;

  const p4 = `相对而言，「${low.name}」是你最少动用的武器。${low.low}别把这当成短板清单——它更像一张提示卡：你的队友里，总有人把这一项练到满级。`;

  return {
    lead,
    paragraphs: [p1, p2, p3, p4],
    topNames: [top1.name, top2.name],
    lowName: low.name,
    seed,
  };
}

/* ---------- 星座解读 ---------- */
export function buildZodiacReading(result, zodiacPrimary, zodiacSecondary, mainClass) {
  const seed = hashSeed(result.answers.join('') + 'z');
  const declared = result.zodiac.declared ? zodiacById(result.zodiac.declared) : null;
  const p1 = `你的星盘主位落在「${zodiacPrimary.name}（${zodiacPrimary.en}）」：${zodiacPrimary.description}`;

  const declLine = declared
    ? `入场时你点选的「${declared.name}」与作答轨迹的同频度是 ${result.zodiac.resonance}%——${
        result.zodiac.resonance >= 90
          ? '两套星图几乎重叠，你的直觉与选择彼此认证。'
          : result.zodiac.resonance >= 80
            ? '两套星图相互印证，同一个方向被点亮了两次。'
            : '两套星图略有出入——最终结果按两者加权给出，这正是罗盘存在的意义。'
      }`
    : null;

  const elementLine = pick([
    `这是一枚${zodiacPrimary.element}象星座——${zodiacPrimary.traits.join('、')}，是它递给你的三枚徽章。`,
    `${zodiacPrimary.element}象气质 · ${zodiacPrimary.traits.join('、')}——记住这三个词，它们是你在艾泽拉斯的护身符。`,
  ], seed >> 2);

  const noteSrc = result.zodiac.declaredNote || (zodiacPrimary.biasNote && zodiacPrimary.biasNote[mainClass.id]);
  const p3 = noteSrc
    ? `星辰的罗盘与你职业的指针重合了：${noteSrc}`
    : `星辰为你的选择投了信任票：${zodiacPrimary.name}的能量与${mainClass.name}的道路相互呼应——不喧哗，但笃定。`;

  const p4 = `你的星盘副位是「${zodiacSecondary.name}」——${zodiacSecondary.traits.join('、')}。它藏在主星光的背面，为那些"说不清为什么就是想选它"的瞬间提供了注脚。`;

  return {
    paragraphs: declLine ? [p1, declLine, elementLine, p3, p4] : [p1, elementLine, p3, p4],
    primary: zodiacPrimary,
    secondary: zodiacSecondary,
    declared,
    seed,
  };
}

/* ---------- 主职业契合理由 ---------- */
export function buildMainReasons(result, mainClass, zodiacPrimary) {
  const seed = hashSeed(result.answers.join('') + 'm');
  const dims = DIM_META;
  const ranked = result.dimsRanked;
  const d1 = dims[ranked[0].id];
  const d2 = dims[ranked[1].id];
  const n = result.classChoiceCount[mainClass.id] || 0;

  // 用户 top2 维度与职业 top2 维度零重叠时，改用「互补」措辞，避免「同一种人」被数据打脸
  const userTop2 = [ranked[0].id, ranked[1].id];
  const classTop2 = Object.entries(mainClass.dims)
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 2)
    .map(([k]) => k);
  const overlap = userTop2.filter((d) => classTop2.includes(d)).length;

  const r1 = overlap > 0
    ? `气质对位：你的人格底色是「${d1.name} × ${d2.name}」，而${mainClass.name}的核心气质恰好是「${mainClass.keywords.join(' · ')}」——这不是近似，是同一种人。`
    : `气质对位：你的人格底色是「${d1.name} × ${d2.name}」，与${mainClass.name}惯用的「${mainClass.keywords.join(' · ')}」不是同一路数——但这不是错配：你的${d1.name}正落在它最少伸出的那一侧，彼此补位，比“同一种人”更完整。`;

  const r2Variants = [
    `背景共鸣：18 道题里，有 ${n} 次你的选择与${mainClass.name}的职业背景同频。你一次次把手伸向它，它也在一次次确认你。`,
    `背景共鸣：从第 1 题开始，你的选择有 ${n} 次落在${mainClass.name}的气质扇区里——所谓合适，就是不由自主地一直选它。`,
  ];
  const r2 = pick(r2Variants, seed);

  const biasNote = result.zodiac.declaredNote || (zodiacPrimary.biasNote && zodiacPrimary.biasNote[mainClass.id]);
  const r3 = biasNote
    ? `星辰加护：${biasNote}`
    : `星辰加护：${zodiacPrimary.name}的能量落在你的主职业上，像炉火里添的一根柴——不改变方向，只让火更旺。`;

  const r4 = `职业侧写：${mainClass.fantasy}`;

  return { reasons: [r1, r2, r3, r4], seed };
}

/* ---------- 副职业契合理由 ---------- */
export function buildSecondaryReasons(result, mainClass, secondaryClass, secondaryDetail) {
  const seed = hashSeed(result.answers.join('') + 's');
  const sec = secondaryDetail;
  const roles = [mainClass.primaryRole, secondaryClass.primaryRole];

  const r1 = roles[0] !== roles[1]
    ? `定位互补：主职业站在「${roles[0]}」的位置，副职业则补上「${roles[1]}」的视角——一手主武器，一手暗器，团队里你会是最难被替代的那个人。`
    : `双生同源：${mainClass.name}与${secondaryClass.name}同属「${roles[0]}」之道，但在气质上互为镜像——一个是你现在的手感，一个是你下一步的天花板。`;

  const r2 = `顺位分明：按加权分，${secondaryClass.name}以 ${typeof sec?.total === 'number' ? sec.total.toFixed(0) : '—'} 分紧随主职业之后${sec?.complementBonus ? `（含定位互补加成 +${sec.complementBonus}）` : ''}。若说主职业是"最像你的人"，它就是"你最该试试的另一种可能"。`;

  const r3 = `玩法提示：${secondaryClass.advice}`;

  return { reasons: [r1, r2, r3], seed };
}

/* ---------- 契合度档位 ---------- */
export function fitTier(total) {
  if (total >= 85) return { label: '天作之合', note: '指针几乎完全重合，这是你的宿命职业。' };
  if (total >= 75) return { label: '高度契合', note: '星图高度重叠，放心地把后背交给它。' };
  if (total >= 65) return { label: '稳稳合拍', note: '节奏对得上，是能走很远的关系。' };
  return { label: '缘分使然', note: '指针停在了一个值得探索的方向——留一点惊喜给旅程。' };
}

/* ---------- 分享文案 ---------- */
export function buildShareText(result, mainClass, secondaryClass, zodiacPrimary) {
  const declared = result.zodiac.declared ? zodiacById(result.zodiac.declared) : null;
  const signLine = declared ? `选择星座：${declared.name}（与星盘同频 ${result.zodiac.resonance}%）\n` : '';
  return `⚔️ 我在《艾泽拉斯星命罗盘》做完测了！\n主职业：${mainClass.name} ｜ 副职业：${secondaryClass.name}\n${signLine}星座能量：${zodiacPrimary.name}（${zodiacPrimary.traits[0]}）\n${result.mode === 'classic' ? '模式：经典怀旧服' : '模式：正式服'}\n来测测你的职业命运吧！`;
}

/* ---------- 六维展示顺序 ---------- */
export { DIMS };
