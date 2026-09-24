/**
 * 职业数据（13 职业）
 * ------------------------------------------------------------------
 * dims      —— 职业性格向量（六维，1-10），用于与用户性格得分做契合计算
 * roles     —— 细分定位（坦克 / 治疗 / 近战输出 / 远程输出）
 * primaryRole —— 主定位（坦克 / 治疗 / 输出），用于副职业「定位互补」加成
 * modes.classic —— 经典怀旧服（经典旧世）可用性；缺省 = 不在怀旧服职业池
 * modes.*.specs —— 专精列表（含定位）
 * color     —— 社区约定俗成的职业配色
 * 素材说明：本文件全部文案为原创撰写，不含任何暴雪版权文本。
 */

export const DIMENSIONS = ['courage', 'cunning', 'compassion', 'knowledge', 'freedom', 'faith'];

export const CLASSES = [
  {
    id: 'warrior',
    name: '战士',
    en: 'Warrior',
    color: '#C79C6E',
    armor: '板甲',
    resource: '怒气',
    roles: ['近战输出', '坦克'],
    primaryRole: '输出',
    dims: { courage: 9, cunning: 4, compassion: 4, knowledge: 2, freedom: 3, faith: 5 },
    keywords: ['勇气', '坚韧', '正面交锋', '纪律'],
    fantasy: '没有神谕，没有契约，只有钢铁与意志。',
    blurb: '战士是艾泽拉斯最古老的职业之一：没有圣光的庇佑，也没有奥术的捷径，全凭经年累月的锤炼、一柄趁手的武器和不肯后退的脊梁。在同伴眼中，战士就是防线本身——风暴打在ta身上，身后的人才能喘一口气。',
    difficulty: 2,
    advice: '上手最直接的职业之一，技能直观、容错高，武器战与狂暴战节奏清晰。推荐给第一次踏进艾泽拉斯、想"提剑就上"的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '武器', role: '近战输出' },
          { name: '狂暴', role: '近战输出' },
          { name: '防护', role: '坦克' },
        ],
        note: '经典旧世中战士是唯一可靠的坦克，也是练级路上的"硬核体验"；战士的传说从一柄断剑开始。',
      },
      retail: {
        specs: [
          { name: '武器', role: '近战输出' },
          { name: '狂暴', role: '近战输出' },
          { name: '防护', role: '坦克' },
        ],
      },
    },
  },
  {
    id: 'paladin',
    name: '圣骑士',
    en: 'Paladin',
    color: '#F58CBA',
    armor: '板甲',
    resource: '法力 / 圣能',
    roles: ['治疗', '坦克', '近战输出'],
    primaryRole: '坦克',
    dims: { courage: 8, cunning: 3, compassion: 7, knowledge: 3, freedom: 2, faith: 10 },
    keywords: ['誓言', '守护', '公正', '信念'],
    fantasy: '以誓言约束力量，把信念穿成铠甲。',
    blurb: '圣骑士是圣光的骑士，也是誓言的囚徒——只不过他们心甘情愿。一手战锤、一手圣典，为弱者挡刀，为同伴点灯。他们相信公义值得用一生去践行，而"守护"从来不是一句口号，是每一次站到最前面。',
    difficulty: 2,
    advice: '节奏平稳、三线全能（坦克 / 治疗 / 输出），团队里的万金油。适合责任感强、喜欢"站着把队友护住"的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '神圣', role: '治疗' },
          { name: '防护', role: '坦克' },
          { name: '惩戒', role: '近战输出' },
        ],
        note: '经典旧世中圣骑士是联盟专属职业，以祝福与治疗见长，被队友称为"行走的增益图腾"。',
      },
      retail: {
        specs: [
          { name: '神圣', role: '治疗' },
          { name: '防护', role: '坦克' },
          { name: '惩戒', role: '近战输出' },
        ],
      },
    },
  },
  {
    id: 'hunter',
    name: '猎人',
    en: 'Hunter',
    color: '#ABD473',
    armor: '锁甲',
    resource: '集中值 / 法力',
    roles: ['远程输出', '近战输出'],
    primaryRole: '输出',
    dims: { courage: 6, cunning: 9, compassion: 5, knowledge: 4, freedom: 8, faith: 4 },
    keywords: ['野性', '耐心', '自足', '羁绊'],
    fantasy: '与野兽为伴，以荒野为家。',
    blurb: '猎人懂得荒野的法则：耐心比力气重要，距离比速度重要，而一个可靠的伙伴胜过千军万马。ta 箭袋里装着自制的箭，身后跟着从雪原或丛林里救下的野兽——那是战友，不是宠物。',
    difficulty: 1,
    advice: '单练体验极佳：宠物替你扛一半的麻烦，远程输出环境安全。适合喜欢探索大世界、按自己节奏玩的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '野兽控制', role: '远程输出' },
          { name: '射击', role: '远程输出' },
          { name: '生存', role: '近战输出' },
        ],
        note: '经典旧世里猎人是最自由的练级者，抓宠与弹药的乐趣至今无人取代。',
      },
      retail: {
        specs: [
          { name: '野兽控制', role: '远程输出' },
          { name: '射击', role: '远程输出' },
          { name: '生存', role: '近战输出' },
        ],
      },
    },
  },
  {
    id: 'rogue',
    name: '潜行者',
    en: 'Rogue',
    color: '#FFF569',
    armor: '皮甲',
    resource: '能量 / 连击点',
    roles: ['近战输出'],
    primaryRole: '输出',
    dims: { courage: 6, cunning: 10, compassion: 3, knowledge: 5, freedom: 7, faith: 2 },
    keywords: ['谋略', '精准', '自由', '沉默'],
    fantasy: '阴影不会背叛，沉默从不撒谎。',
    blurb: '潜行者不靠蛮力说话。先观察，再靠近，然后——一击。暗巷、屋顶、人群中你注意不到的角落，都是他们熟悉的领地。他们相信计划的价值：最好的战斗，是敌人至死都不知道发生了什么。',
    difficulty: 3,
    advice: '上限极高的职业：能量与连击点的节奏、开锁偷窃的乐趣。适合喜欢"算准时机再出手"的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '刺杀', role: '近战输出' },
          { name: '战斗', role: '近战输出' },
          { name: '敏锐', role: '近战输出' },
        ],
        note: '经典旧世里潜行者叫"盗贼"，匕首淬毒、开锁偷包，是街头与副本里最灵活的影子。',
      },
      retail: {
        specs: [
          { name: '奇袭', role: '近战输出' },
          { name: '狂徒', role: '近战输出' },
          { name: '敏锐', role: '近战输出' },
        ],
      },
    },
  },
  {
    id: 'priest',
    name: '牧师',
    en: 'Priest',
    color: '#FFFFFF',
    armor: '布甲',
    resource: '法力',
    roles: ['治疗', '远程输出'],
    primaryRole: '治疗',
    dims: { courage: 4, cunning: 4, compassion: 10, knowledge: 6, freedom: 3, faith: 8 },
    keywords: ['慈悲', '信仰', '内省', '救赎'],
    fantasy: '在生与死的边界点灯的人。',
    blurb: '牧师站在最安静的战场：生与死的交界线。他们把同伴从死亡边缘一次次拉回来，也直视信仰与暗影的撕裂——有人选择圣光，有人潜入暗影，但他们共同相信：每一个生命都值得被留住。',
    difficulty: 3,
    advice: '治疗者的位置意味着你总被队友需要。戒律 / 神圣适合喜欢"稳住全场"的玩家，暗影路线则适合享受蓄力爆发的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '戒律', role: '治疗' },
          { name: '神圣', role: '治疗' },
          { name: '暗影', role: '远程输出' },
        ],
        note: '经典旧世里暗牧是独树一帜的存在，"暗影形态"曾是无数玩家的执念。',
      },
      retail: {
        specs: [
          { name: '戒律', role: '治疗' },
          { name: '神圣', role: '治疗' },
          { name: '暗影', role: '远程输出' },
        ],
      },
    },
  },
  {
    id: 'shaman',
    name: '萨满祭司',
    en: 'Shaman',
    color: '#0070DE',
    armor: '锁甲',
    resource: '法力',
    roles: ['治疗', '近战输出', '远程输出'],
    primaryRole: '治疗',
    dims: { courage: 6, cunning: 6, compassion: 8, knowledge: 4, freedom: 9, faith: 8 },
    keywords: ['通灵', '平衡', '敬畏', '斡旋'],
    fantasy: '听风说话，替大地说情。',
    blurb: '萨满不"使用"元素，而是与元素商量。ta 听见风的低语、火的咆哮，也听见大地沉默的心跳，并替族人向祖先传话。图腾插下的那一刻，天地人三界达成了短暂的和解——这就是萨满的答案。',
    difficulty: 3,
    advice: '技能面向广（治疗 / 法系 / 近战三线），建议先选定一条路线深入。适合喜欢"与万物对话"气质的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '元素', role: '远程输出' },
          { name: '增强', role: '近战输出' },
          { name: '恢复', role: '治疗' },
        ],
        note: '经典旧世中萨满是部落专属职业，图腾是队友最熟悉的"地面福利"。',
      },
      retail: {
        specs: [
          { name: '元素', role: '远程输出' },
          { name: '增强', role: '近战输出' },
          { name: '恢复', role: '治疗' },
        ],
      },
    },
  },
  {
    id: 'mage',
    name: '法师',
    en: 'Mage',
    color: '#69CCF0',
    armor: '布甲',
    resource: '法力',
    roles: ['远程输出'],
    primaryRole: '输出',
    dims: { courage: 4, cunning: 7, compassion: 4, knowledge: 10, freedom: 5, faith: 3 },
    keywords: ['求知', '理性', '掌控', '创造'],
    fantasy: '把世界的规则读薄，再写成自己的咒语。',
    blurb: '法师相信万事万物都有规律，而规律可以被理解、被计算、被重写。他们研读奥术的语法，把火焰与冰霜驯成工具，顺手还解决了队友的吃饭问题（是的，面包）。对他们来说，知识不是装饰，是力量本身。',
    difficulty: 3,
    advice: '高爆发、高机动的远程核心，但需要用好控制与位移来弥补身板脆。适合喜欢"用头脑改变局势"的玩家。',
    modes: {
      classic: {
        specs: [
          { name: '奥术', role: '远程输出' },
          { name: '火焰', role: '远程输出' },
          { name: '冰霜', role: '远程输出' },
        ],
        note: '经典旧世里法师是"开传送门的人"：一趟趟跑本的路上，人人都爱法师。',
      },
      retail: {
        specs: [
          { name: '奥术', role: '远程输出' },
          { name: '火焰', role: '远程输出' },
          { name: '冰霜', role: '远程输出' },
        ],
      },
    },
  },
  {
    id: 'warlock',
    name: '术士',
    en: 'Warlock',
    color: '#9482C9',
    armor: '布甲',
    resource: '法力 / 灵魂碎片',
    roles: ['远程输出'],
    primaryRole: '输出',
    dims: { courage: 6, cunning: 9, compassion: 2, knowledge: 9, freedom: 7, faith: 1 },
    keywords: ['禁忌', '代价', '洞察', '掌控'],
    fantasy: '世界背过身去的地方，正是我的书房。',
    blurb: '术士研究别人不敢翻开的那几页书：恶魔的真名、灵魂的契约、被封印的火焰。他们比谁都清楚力量的价码，也比谁都愿意支付。别被"暗黑"的外表骗了——术士往往是团队里最冷静的资源管理者。',
    difficulty: 2,
    advice: '血厚、续航强、带魔仆，适合喜欢"掌控节奏、逐步蚕食"的玩家；需要管理灵魂碎片等多种资源，熟练后非常安逸。',
    modes: {
      classic: {
        specs: [
          { name: '痛苦', role: '远程输出' },
          { name: '恶魔学识', role: '远程输出' },
          { name: '毁灭', role: '远程输出' },
        ],
        note: '经典旧世里术士靠"生命分流"和自己的生命值做交易，一句话：命硬。',
      },
      retail: {
        specs: [
          { name: '痛苦', role: '远程输出' },
          { name: '恶魔学识', role: '远程输出' },
          { name: '毁灭', role: '远程输出' },
        ],
      },
    },
  },
  {
    id: 'monk',
    name: '武僧',
    en: 'Monk',
    color: '#00FF96',
    armor: '皮甲',
    resource: '能量 / 真气',
    roles: ['坦克', '治疗', '近战输出'],
    primaryRole: '治疗',
    dims: { courage: 7, cunning: 5, compassion: 7, knowledge: 3, freedom: 9, faith: 5 },
    keywords: ['平衡', '自律', '洒脱', '当下'],
    fantasy: '身体是庙宇，呼吸是钟声。',
    blurb: '武僧的修行不在经卷里，在每一次出拳与呼吸之间。ta 们既能借着酒意稳稳扛住巨兽的撞击，也能用一缕迷雾般的真气把人从鬼门关捞回来。禅意与市井气在武僧身上并不矛盾——会喝酒的圣人，才是真圣人。',
    difficulty: 3,
    advice: '节奏感极强的职业，滚地翻与"醉拳"机制让战斗如舞蹈。适合追求操作乐趣与身心合一的玩家。',
    modes: {
      retail: {
        specs: [
          { name: '酒仙', role: '坦克' },
          { name: '织雾', role: '治疗' },
          { name: '踏风', role: '近战输出' },
        ],
      },
    },
  },
  {
    id: 'druid',
    name: '德鲁伊',
    en: 'Druid',
    color: '#FF7D0A',
    armor: '皮甲',
    resource: '法力 / 能量 / 怒气',
    roles: ['坦克', '治疗', '近战输出', '远程输出'],
    primaryRole: '治疗',
    dims: { courage: 5, cunning: 6, compassion: 9, knowledge: 7, freedom: 9, faith: 5 },
    keywords: ['自然', '循环', '守护', '变幻'],
    fantasy: '一枚种子里的四季，一头熊体内的月光。',
    blurb: '德鲁伊在月与林之间切换形态：可以是挥舞利爪的猛兽，可以是替大地包扎伤口的治愈者，也可以是顶着星辰之怒的枭兽。他们相信循环——死亡供养新生，枯萎孕育春天。没有什么是终结，只有转换。',
    difficulty: 3,
    advice: '一职四形态，内容最丰富：建议先定一个专精方向（比如守护或恢复），再慢慢拓展。适合想在森林与月亮之间生活的人。',
    modes: {
      classic: {
        specs: [
          { name: '平衡', role: '远程输出' },
          { name: '野性', role: '近战输出' },
          { name: '恢复', role: '治疗' },
        ],
        note: '经典旧世里德鲁伊是"辅助之王"：恢复起来是奶妈，变形起来是潜行小猫，还会给人加爪子。',
      },
      retail: {
        specs: [
          { name: '平衡', role: '远程输出' },
          { name: '野性', role: '近战输出' },
          { name: '守护', role: '坦克' },
          { name: '恢复', role: '治疗' },
        ],
      },
    },
  },
  {
    id: 'deathknight',
    name: '死亡骑士',
    en: 'Death Knight',
    color: '#C41E3A',
    armor: '板甲',
    resource: '符文 / 符文能量',
    roles: ['坦克', '近战输出'],
    primaryRole: '坦克',
    dims: { courage: 9, cunning: 6, compassion: 2, knowledge: 4, freedom: 2, faith: 5 },
    keywords: ['悲剧', '纪律', '救赎', '冷冽'],
    fantasy: '从死亡里走回来的人，比谁都明白活着的重量。',
    blurb: '死亡骑士是被从死亡中强行拉回的战争兵器——先为巫妖王而战，而后挣脱锁链。黑锋骑士团的词典里没有"天真"这个词，只有复仇、纪律与负重前行。他们的每一剑都带着霜冻，每一步都踩在过去的影子上。',
    difficulty: 2,
    advice: '开局即高等级、身板极硬，符文系统需要一点学习成本。适合喜欢"冷酷前史 + 强大执行力"设定的玩家。',
    modes: {
      retail: {
        specs: [
          { name: '鲜血', role: '坦克' },
          { name: '冰霜', role: '近战输出' },
          { name: '邪恶', role: '近战输出' },
        ],
      },
    },
  },
  {
    id: 'demonhunter',
    name: '恶魔猎手',
    en: 'Demon Hunter',
    color: '#A330C9',
    armor: '皮甲',
    resource: '恶魔之怒',
    roles: ['坦克', '近战输出'],
    primaryRole: '输出',
    dims: { courage: 9, cunning: 7, compassion: 3, knowledge: 5, freedom: 9, faith: 3 },
    keywords: ['牺牲', '专注', '孤傲', '复仇'],
    fantasy: '烧掉双眼之后，你才第一次看清了世界。',
    blurb: '为了猎杀恶魔而献祭双眼的人。邪能灼烧之后，恶魔猎手看见的是凡人看不见的世界：恶魔的弱点、魔网的裂痕、力量的流向。孤独是他们自己选的——毕竟，只有同类才懂这种代价，而世上已经没有几个同类了。',
    difficulty: 3,
    advice: '机动性天花板，二段跳与滑翔的爽感无可替代，节奏偏快。适合喜欢高机动、正面硬刚的玩家。',
    modes: {
      retail: {
        specs: [
          { name: '浩劫', role: '近战输出' },
          { name: '复仇', role: '坦克' },
        ],
      },
    },
  },
  {
    id: 'evoker',
    name: '唤魔师',
    en: 'Evoker',
    color: '#33937F',
    armor: '锁甲',
    resource: '精华',
    roles: ['治疗', '远程输出'],
    primaryRole: '输出',
    dims: { courage: 6, cunning: 6, compassion: 8, knowledge: 8, freedom: 6, faith: 7 },
    keywords: ['传承', '守护', '多元', '使命'],
    fantasy: '借来的龙焰里，藏着守护艾泽拉斯的誓言。',
    blurb: '唤魔师是巨龙魔法的直接继承者：时间、梦境与大地之力在ta 们手中流转。作为守护巨龙的使者，他们既能在战场上空倾泻龙焰，也能以"恩护"之力把同伴从绝境中唤醒。力量来自龙族，而使命属于这个世界。',
    difficulty: 3,
    advice: '射程较短但节奏独特（蓄力施法），兼具治疗与强大的团队增益。适合想体验"新世代施法者"的玩家。',
    modes: {
      retail: {
        specs: [
          { name: '湮灭', role: '远程输出' },
          { name: '恩护', role: '治疗' },
          { name: '增辉', role: '远程输出' },
        ],
      },
    },
  },
];

/** 经典怀旧服（经典旧世）职业池 —— 排除死亡骑士 / 恶魔猎手 / 武僧 / 唤魔师 */
export const CLASSIC_EXCLUDED = ['deathknight', 'demonhunter', 'monk', 'evoker'];

export function classById(id) {
  return CLASSES.find((c) => c.id === id) || null;
}

export function classPool(mode) {
  return mode === 'classic' ? CLASSES.filter((c) => !!c.modes.classic) : CLASSES.slice();
}

export const MODES = {
  classic: {
    id: 'classic',
    name: '经典怀旧服',
    sub: 'Classic Era · 经典旧世',
    desc: '回到最初的艾泽拉斯：九大职业，从青铜的旅店出发。',
    poolHint: '本模式职业池为经典旧世的 9 个职业——没有死亡骑士、恶魔猎手、武僧与唤魔师。',
  },
  retail: {
    id: 'retail',
    name: '正式服',
    sub: 'Retail · 最新资料片',
    desc: '十三个职业全面开放：从黑暗的符文到巨龙的时间魔法。',
    poolHint: '本模式开放全部 13 个职业，包含死亡骑士、恶魔猎手、武僧与唤魔师。',
  },
};
