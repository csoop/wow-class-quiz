/**
 * 台账导出功能验证（Chrome DevTools Protocol · 零依赖）
 * 运行：node scripts/test-exports.mjs   （前提：本地服务器已在 5173 端口运行）
 * 覆盖：导出全部（JSON）/ 导出汇总（CSV）/ 单条记录导出（JSON）
 * 做法：CDP 开启下载目录 → 以种子台账打开历史页 → 点击三个导出按钮 → 校验落盘文件内容
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { computeResult } from '../src/engine/scoring.js';
import { sampleStatements } from '../src/engine/sampler.js';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;
const BASE = 'http://127.0.0.1:5173';
const OUT = mkdtempSync(join(tmpdir(), 'wow-quiz-dl-'));
const PROFILE = mkdtempSync(join(tmpdir(), 'wow-quiz-prof-'));

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail: String(detail) });

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
    '--headless', '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
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
    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval error');
      return r.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // 开启下载（优先 Browser 域，回退 Page 域）
    let dlOk = false;
    try {
      await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
      dlOk = true;
    } catch {
      try {
        await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
        dlOk = true;
      } catch {}
    }
    check('CDP 下载目录已开启', dlOk, OUT);

    await send('Page.navigate', { url: `${BASE}/` });
    await delay(1300);
    const classic = seedRecord('010000000000000000'.split('').map(Number), 'classic', 1001, 26 * 3600e3, 'leo');
    const retail = seedRecord('123012301230123012'.split('').map(Number), 'retail', 2002, 2 * 3600e3, 'aquarius');
    await evalJs(`localStorage.setItem('wow-class-quiz:ledger:v1', ${JSON.stringify(JSON.stringify([retail, classic]))})`);
    await send('Page.navigate', { url: `${BASE}/#/history` });
    await delay(1500);

    const nItems = await evalJs(`document.querySelectorAll('.history-item').length`);
    check('历史页渲染 2 条种子记录', nItems === 2, `实际 ${nItems}`);

    // 三个导出入口
    await evalJs(`document.querySelector('#exportAll').click()`);
    await delay(900);
    await evalJs(`document.querySelector('#exportCsv').click()`);
    await delay(900);
    await evalJs(`document.querySelector('.history-item [data-act="export"]').click()`);
    await delay(1200);

    const files = readdirSync(OUT);
    console.log('下载目录文件：', files);

    const jsonAll = files.find((f) => f.includes('全部记录') && f.endsWith('.json'));
    check('导出全部（JSON）文件已落盘', !!jsonAll, jsonAll || '未找到');
    if (jsonAll) {
      const data = JSON.parse(readFileSync(join(OUT, jsonAll), 'utf8'));
      check('全部 JSON：count=2', data.count === 2, `count=${data.count}`);
      const r0 = data.records?.[0];
      check('全部 JSON：含 18 项作答与完整得分明细', r0?.answers?.length === 18 && (r0?.scores?.length === 9 || r0?.scores?.length === 13),
        `answers=${r0?.answers?.length}, scores=${r0?.scores?.length}`);
      check('全部 JSON：主副职业有值且不重复', !!r0?.main && !!r0?.secondary && r0.main !== r0.secondary);
    }

    const csv = files.find((f) => f.endsWith('.csv'));
    check('导出汇总（CSV）文件已落盘', !!csv, csv || '未找到');
    if (csv) {
      const text = readFileSync(join(OUT, csv), 'utf8');
      check('CSV：带 BOM 且含中文表头（含选择星座列）', text.charCodeAt(0) === 0xFEFF && text.includes('完成时间,模式,选择星座,主职业,副职业,星座'), text.slice(0, 60).replace(/\n/g, '\\n'));
      const rows = text.trim().split('\n');
      check('CSV：数据行数为 2', rows.length === 3, `总行数=${rows.length}`);
      check('CSV：选择星座列有值', text.includes('狮子座') && text.includes('水瓶座'), '');
    }

    const single = files.find((f) => f.endsWith('.json') && !f.includes('全部记录'));
    check('单条导出（JSON）文件已落盘', !!single, single || '未找到');
    if (single) {
      const data = JSON.parse(readFileSync(join(OUT, single), 'utf8'));
      check('单条 JSON：含 record.id 与主职业字段', !!data.record?.id && !!data.record?.main, `${data.record?.id} / ${data.record?.main}`);
    }
  } catch (err) {
    check('导出验证执行', false, err.message);
  } finally {
    chrome.kill();
    try { rmSync(OUT, { recursive: true, force: true }); } catch {}
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }

  console.log('');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  ${r.pass ? '✔' : '✘'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`));
  console.log('');
  console.log(`检查 ${results.length} 项，失败 ${failed.length} 项`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('导出验证失败:', err); process.exit(1); });
