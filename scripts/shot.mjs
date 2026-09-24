/**
 * 交付级截图脚本（Chrome DevTools Protocol · 零依赖）
 * 运行：node scripts/shot.mjs
 * 前提：本地服务器已在 5173 端口运行（npm run serve）
 * 产物：screenshots/*.webp（桌面 + 手机；首页 / 答题 / 结果 / 记录）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { computeResult } from '../src/engine/scoring.js';
import { sampleStatements } from '../src/engine/sampler.js';
import { encodeShare } from '../src/engine/share.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9223;
const BASE = 'http://127.0.0.1:5173';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/* 用于截图的确定性题组与作答（种子固定） */
const CLASSIC_SEED = 1001;
const RETAIL_SEED = 2002;
const classicAnswers = '010000000000000000'.split('').map(Number);
const retailAnswers = '123012301230123012'.split('').map(Number);
const classicCode = encodeShare(CLASSIC_SEED, classicAnswers, 'classic', 'leo');
const retailCode = encodeShare(RETAIL_SEED, retailAnswers, 'retail', 'aquarius');

/* 台账种子（用于历史页截图） */
function seedRecord(answers, mode, seed, offsetMs, sign = null) {
  const sample = sampleStatements(mode, seed, sign);
  const r = computeResult(sample, answers, mode, sign);
  return {
    id: `r-seed-${mode}`,
    finishedAt: Date.now() - offsetMs,
    mode,
    sign: r.zodiac.declared || null,
    seed,
    sampleIds: r.sampleIds,
    answers,
    main: r.main,
    secondary: r.secondary,
    zodiacPrimary: r.zodiac.primary,
    zodiacSecondary: r.zodiac.secondary,
    scores: r.scores.map((s) => ({ classId: s.classId, total: s.total, base: s.base, personal: s.personal, zodiac: s.zodiac })),
    dims: r.dims,
    engineVersion: r.engineVersion,
  };
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/wow-quiz-shot-profile',
    '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await res.json();
        if (targets && targets.length) break;
      } catch {}
      await delay(250);
    }
    if (!targets) throw new Error('Chrome CDP 未就绪');
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');

    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval error');
      return r.result?.value;
    };

    let curVp = { width: 1440, height: 900, mobile: false, scale: 1 };

    const viewport = async (width, height, mobile = false, scale = 1) => {
      curVp = { width, height, mobile, scale };
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
      await delay(250);
    };

    const shot = async (file, { fullPage = false } = {}) => {
      let restore = false;
      if (fullPage) {
        const { contentSize } = await send('Page.getLayoutMetrics');
        await send('Emulation.setDeviceMetricsOverride', { width: curVp.width, height: Math.ceil(contentSize.height), deviceScaleFactor: curVp.scale, mobile: curVp.mobile });
        await delay(400);
        restore = true;
      }
      const res = await send('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true });
      writeFileSync(`${OUT}${file}`, Buffer.from(res.data, 'base64'));
      console.log('✓', file);
      if (restore) {
        await send('Emulation.setDeviceMetricsOverride', { width: curVp.width, height: curVp.height, deviceScaleFactor: curVp.scale, mobile: curVp.mobile });
        await delay(250);
      }
    };

    const nav = async (url, settle = 1300) => {
      await send('Page.navigate', { url });
      await delay(settle);
    };

    /* ---------- 准备：先访问站点以取得同源上下文，写入截图用种子数据 ---------- */
    await viewport(1440, 900);
    await nav(`${BASE}/`);
    const classicRecord = seedRecord(classicAnswers, 'classic', CLASSIC_SEED, 26 * 3600e3, 'leo');
    const retailRecord = seedRecord(retailAnswers, 'retail', RETAIL_SEED, 2 * 3600e3, 'aquarius');
    await evalJs(`localStorage.setItem('wow-class-quiz:ledger:v1', ${JSON.stringify(JSON.stringify([retailRecord, classicRecord]))})`);

    /* 1. 首页（桌面） */
    await nav(`${BASE}/#/home`);
    await viewport(1440, 900);
    await shot('01-home-desktop.webp', { fullPage: true });

    /* 2. 答题页（桌面）：种一份进行中会话 */
    const classicSample = sampleStatements('classic', CLASSIC_SEED, 'leo');
    const session = {
      mode: 'classic',
      seed: CLASSIC_SEED,
      sign: 'leo',
      sampleIds: classicSample.map((s) => s.id),
      answers: [1, 2, 0, 1, 3, null, null, null, null, null, null, null, null, null, null, null, null, null],
      qIndex: 5,
      startedAt: Date.now() - 120e3,
    };
    await evalJs(`localStorage.setItem('wow-class-quiz:session:v1', ${JSON.stringify(JSON.stringify(session))})`);
    await nav(`${BASE}/#/sign`);
    await viewport(1440, 900);
    await shot('02b-sign-desktop.webp', { fullPage: true });
    await nav(`${BASE}/#/quiz`);
    await viewport(1440, 900);
    await shot('02-quiz-desktop.webp');

    /* 3. 结果页（桌面 · 经典怀旧服，通过分享直达保持确定性） */
    await nav(`${BASE}/#/share/${classicCode}`);
    await viewport(1440, 900);
    await shot('03-result-classic-desktop.webp', { fullPage: true });

    /* 4. 结果页（桌面 · 正式服） */
    await nav(`${BASE}/#/share/${retailCode}`);
    await viewport(1440, 900);
    await shot('04-result-retail-desktop.webp', { fullPage: true });

    /* 5. 历史记录（桌面） */
    await nav(`${BASE}/#/history`);
    await viewport(1440, 900);
    await shot('05-history-desktop.webp', { fullPage: true });

    /* 6. 关于页（桌面） */
    await nav(`${BASE}/#/about`);
    await viewport(1440, 900);
    await shot('06-about-desktop.webp', { fullPage: true });

    /* ---------- 手机视口（390 x 844 @2x） ---------- */
    await viewport(390, 844, true, 2);
    await nav(`${BASE}/#/home`);
    await shot('07-home-mobile.webp', { fullPage: true });
    await nav(`${BASE}/#/sign`);
    await shot('07b-sign-mobile.webp', { fullPage: true });
    await nav(`${BASE}/#/quiz`);
    await shot('08-quiz-mobile.webp');
    await nav(`${BASE}/#/share/${classicCode}`);
    await shot('09-result-mobile.webp', { fullPage: true });
    await nav(`${BASE}/#/history`);
    await shot('10-history-mobile.webp', { fullPage: true });

    console.log('\n截图完成，共 12 张');
  } finally {
    chrome.kill();
  }
}

main().catch((err) => { console.error('截图失败:', err); process.exit(1); });
