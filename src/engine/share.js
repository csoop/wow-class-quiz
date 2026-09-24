/**
 * 分享链接编码（确定性引擎 + 种子采样 ⇒ 题组与作答可完整复现）
 * ------------------------------------------------------------------
 * 格式：v3.<c|r>.<星座 3 字码|non>.<种子 36 进制>.<18 位作答数字 0-4>.<2 位校验>
 * v2 旧码仍可解码（无星座选择，结果按纯作答推演复现）。
 * 说明：题组由 (mode, seed, sign) 确定性生成，因此链接只需编码星座、种子与作答，
 * 任何设备打开都能复现同一次测试的题组与结果。
 * 校验算法：对星座码 + 种子字符与作答数字做加权求和后对 1296 取模，36 进制 2 位。
 */

import { SAMPLE_RULES } from '../data/questions.js';
import { ANSWER_LEVELS } from './sampler.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 星座 ↔ 3 字码（分享链接紧凑编码） */
const SIGN_CODES = {
  aries: 'ari', taurus: 'tau', gemini: 'gem', cancer: 'can', leo: 'leo', virgo: 'vir',
  libra: 'lib', scorpio: 'sco', sagittarius: 'sag', capricorn: 'cap', aquarius: 'aqu', pisces: 'pis',
};
const CODE_SIGNS = Object.fromEntries(Object.entries(SIGN_CODES).map(([k, v]) => [v, k]));

export { SIGN_CODES, CODE_SIGNS };

function checksum(seedStr, answers) {
  let sum = 0;
  for (let i = 0; i < seedStr.length; i++) sum += (i + 5) * seedStr.charCodeAt(i);
  answers.forEach((a, i) => { sum += (i + 2) * (a + 1); });
  const mod = sum % 1296;
  return ALPHABET[Math.floor(mod / 36)] + ALPHABET[mod % 36];
}

export function encodeShare(seed, answers, mode, sign = null) {
  const m = mode === 'classic' ? 'c' : 'r';
  const sc = sign && SIGN_CODES[sign] ? SIGN_CODES[sign] : 'non';
  const seedStr = (Number(seed) >>> 0).toString(36);
  return `v3.${m}.${sc}.${seedStr}.${answers.join('')}.${checksum(sc + seedStr, answers)}`;
}

export function decodeShare(code) {
  if (typeof code !== 'string') return null;
  const parts = code.trim().split('.');
  const version = parts[0];

  /* v2 旧格式：v2.<m>.<seed>.<answers>.<check>（无星座） */
  if (version === 'v2') {
    if (parts.length !== 5) return null;
    const mode = parts[1] === 'c' ? 'classic' : parts[1] === 'r' ? 'retail' : null;
    if (!mode) return null;
    if (!/^[0-9a-z]{1,8}$/.test(parts[2])) return null;
    const seed = (parseInt(parts[2], 36) >>> 0) || 1;
    if (!/^[0-4]+$/.test(parts[3]) || parts[3].length !== SAMPLE_RULES.total) return null;
    const answers = parts[3].split('').map(Number);
    if (answers.some((a) => a >= ANSWER_LEVELS)) return null;
    if (checksum(parts[2], answers) !== parts[4]) return null;
    return { mode, seed, answers, sign: null };
  }

  /* v3 新格式：v3.<m>.<sign|non>.<seed>.<answers>.<check> */
  if (version === 'v3') {
    if (parts.length !== 6) return null;
    const mode = parts[1] === 'c' ? 'classic' : parts[1] === 'r' ? 'retail' : null;
    if (!mode) return null;
    const sc = parts[2];
    if (sc !== 'non' && !CODE_SIGNS[sc]) return null;
    if (!/^[0-9a-z]{1,8}$/.test(parts[3])) return null;
    const seed = (parseInt(parts[3], 36) >>> 0) || 1;
    if (!/^[0-4]+$/.test(parts[4]) || parts[4].length !== SAMPLE_RULES.total) return null;
    const answers = parts[4].split('').map(Number);
    if (answers.some((a) => a >= ANSWER_LEVELS)) return null;
    if (checksum(sc + parts[3], answers) !== parts[5]) return null;
    return { mode, seed, answers, sign: sc === 'non' ? null : CODE_SIGNS[sc] };
  }

  return null;
}
