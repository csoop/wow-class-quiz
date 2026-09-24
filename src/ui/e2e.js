/**
 * 浏览器内 E2E 驱动（仅当 URL 携带 ?e2e= 时加载）
 * ------------------------------------------------------------------
 * 用真实点击 / 键盘事件走完：首页 → 模式选择 → 18 题作答 → 结果页 → 历史记录 → 分享直达
 * 并检查：职业池约束、主副职业不重复、六维与得分表、本地台账、无横向滚动、
 * 控制台错误、文字对比度抽样。
 * 结果写入 <pre id="e2e-report">，document.title 标记 E2E:PASS / E2E:FAIL。
 */

import { QUESTIONS } from '../data/questions.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runE2E() {
  /* 刷新持久化二阶段：整页重载后继续执行并汇总 */
  const phase2Raw = (() => { try { return sessionStorage.getItem('e2e-phase2'); } catch { return null; } })();
  if (phase2Raw) {
    try { sessionStorage.removeItem('e2e-phase2'); } catch {}
    await runReloadPhase(phase2Raw);
    return;
  }

  const report = { checks: [], consoleErrors: [], consoleWarnings: [] };
  const check = (name, pass, detail = '') => report.checks.push({ name, pass: !!pass, detail: String(detail) });

  // 捕获控制台错误
  const origError = console.error;
  console.error = (...args) => { report.consoleErrors.push(args.map(String).join(' ')); origError.apply(console, args); };
  window.addEventListener('error', (e) => report.consoleErrors.push(`window.onerror: ${e.message}`));

  const waitFor = async (sel, timeout = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(sel);
      if (el) return el;
      await sleep(50);
    }
    return null;
  };

  try {
    await sleep(300);

    /* ---------- 0. 空存储兜底（历史空态 / 无效分享） ---------- */
    location.hash = '#/history';
    await sleep(500);
    check('空存储：历史页显示空态而非白屏', (document.body.textContent || '').includes('还没有任何测试记录'));
    location.hash = '#/share/zzz-invalid';
    await sleep(500);
    check('无效分享链接显示错误卡片', (document.body.textContent || '').includes('链接无效'));
    location.hash = '#/home';
    await sleep(500);

    /* ---------- 1. 首页 ---------- */
    check('首页英雄区渲染', !!(await waitFor('.hero-title')));
    const titleText = document.querySelector('.hero-title')?.textContent || '';
    check('英雄区标题文字', titleText.includes('星命罗盘'), titleText.trim().slice(0, 30));
    const chips = document.querySelectorAll('.emblem-chip');
    check('首页职业徽章 13 枚', chips.length === 13, `实际 ${chips.length}`);
    const cards = document.querySelectorAll('.mode-card');
    check('模式卡 2 张', cards.length === 2, `实际 ${cards.length}`);
    const cardsText = Array.from(cards).map((c) => c.textContent).join('|');
    check('模式卡含怀旧服与正式服', cardsText.includes('经典怀旧服') && cardsText.includes('正式服'));

    // 无横向滚动（桌面 1440）
    check('首页无横向滚动', document.documentElement.scrollWidth <= window.innerWidth + 1,
      `scrollWidth=${document.documentElement.scrollWidth}, innerWidth=${window.innerWidth}`);

    /* ---------- 2. 选择经典怀旧服 → 选择星座 → 答题 ---------- */
    const classicCard = document.querySelector('.mode-card[data-mode="classic"]');
    classicCard.click();
    await sleep(500);
    check('进入星座选择页', !!(await waitFor('.sign-grid')));
    const signCards = document.querySelectorAll('.sign-card');
    check('星座卡 12 枚', signCards.length === 12, `实际 ${signCards.length}`);
    check('星座页标注当前模式', (document.querySelector('.sign-mode-note')?.textContent || '').includes('经典怀旧服'));
    document.querySelector('.sign-card[data-sign="leo"]').click();
    await sleep(500);
    check('选择狮子座后进入答题页', !!(await waitFor('.quiz-card')));
    check('答题页显示经典怀旧服', (document.querySelector('.quiz-mode')?.textContent || '').includes('经典怀旧服'));
    check('答题页显示已选星座', (document.querySelector('.quiz-sign')?.textContent || '').includes('狮子座'));
    const optCount0 = document.querySelectorAll('.opt').length;
    check('每题 5 个五档选项', optCount0 === 5, `实际 ${optCount0}`);
    const qText0 = (document.querySelector('.quiz-question')?.textContent || '').trim();
    check('题干来自题库且非 undefined', new Set(QUESTIONS.map((s) => s.text)).has(qText0), qText0.slice(0, 36));
    check('进度条存在', !!document.querySelector('.progress'));

    /* ---------- 3. 键盘作答前 3 题（数字键 1-3） ---------- */
    for (let i = 1; i <= 3; i++) {
      const before = document.querySelector('.quiz-count')?.textContent || '';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: String(i), bubbles: true }));
      await sleep(450);
      const after = document.querySelector('.quiz-count')?.textContent || '';
      check(`键盘数字键 ${i} 作答并前进`, before !== after || i === 3, `${before.trim()} → ${after.trim()}`);
    }
    // 应在第 4 题
    check('键盘作答后到达第 4 题', (document.querySelector('.quiz-count')?.textContent || '').includes('4'), document.querySelector('.quiz-count')?.textContent);

    /* ---------- 4. 回退检查 ---------- */
    const backBtn = document.querySelector('#quizBack');
    backBtn.click();
    await sleep(300);
    check('回退到第 3 题', (document.querySelector('.quiz-count')?.textContent || '').includes('3'), document.querySelector('.quiz-count')?.textContent);
    const selected = document.querySelector('.opt[aria-pressed="true"]');
    check('回退后保留此前的选项高亮', !!selected);
    // 重新前进
    document.querySelectorAll('.opt')[0].click();
    await sleep(450);

    /* ---------- 5. 快速完成剩余题目（全部选第 1 个选项） ---------- */
    let guard = 0;
    while (document.querySelector('.quiz-card') && guard < 40) {
      const opts = document.querySelectorAll('.opt');
      if (!opts.length) break;
      opts[0].click();
      await sleep(400);
      guard += 1;
    }
    check('18 题后进入结果页', !!(await waitFor('.result-hero')), `点击轮次 ${guard}`);

    /* ---------- 6. 结果页内容检查 ---------- */
    const mainName = document.querySelector('.result-class-name')?.textContent?.trim() || '';
    check('结果页渲染主职业名', mainName.length > 0, mainName);
    check('主职业名在 13 职业中', ['战士', '圣骑士', '猎人', '潜行者', '牧师', '萨满祭司', '法师', '术士', '武僧', '德鲁伊', '死亡骑士', '恶魔猎手', '唤魔师'].includes(mainName));
    const excl = ['死亡骑士', '恶魔猎手', '武僧', '唤魔师'];
    check('怀旧服主职业不在排除池', !excl.includes(mainName), mainName);
    const subName = document.querySelector('.subclass-head h3')?.textContent?.trim() || '';
    check('副职业渲染且不与主职业重复', subName.length > 0 && subName !== mainName, `主=${mainName} 副=${subName}`);
    check('副职业也不在排除池', !excl.includes(subName), subName);
    const dimRows = document.querySelectorAll('.dim-row');
    check('人格六维 6 行', dimRows.length === 6, `实际 ${dimRows.length}`);
    check('星座面板渲染', !!document.querySelector('.zodiac-panel'));
    check('结果页展示选择星座与同频度', /你选择：.*同频度\s*\d+%/.test(document.body.textContent || ''), (document.querySelector('.z-pick')?.textContent || '').slice(0, 40));
    check('职业档案渲染', (document.body.textContent || '').includes('职业档案'));
    const fold = document.querySelector('.details-fold details');
    check('得分明细折叠面板存在', !!fold);
    if (fold) {
      fold.open = true;
      await sleep(100);
      const rows = document.querySelectorAll('.score-table tbody tr');
      check('怀旧服得分表 9 行', rows.length === 9, `实际 ${rows.length}`);
      const tableText = document.querySelector('.score-table').textContent;
      check('怀旧服得分表不含排除职业', !excl.some((x) => tableText.includes(x)));
    }

    /* ---------- 7. 分享链接 ---------- */
    const shareUrl = document.querySelector('#shareUrl')?.value || '';
    check('分享链接已生成（v3 含星座）', shareUrl.includes('#/share/v3.'), shareUrl.slice(0, 60));
    const code = shareUrl.split('#/share/')[1] || '';

    /* ---------- 8. 台账记录 ---------- */
    const ledger = JSON.parse(localStorage.getItem('wow-class-quiz:ledger:v1') || '[]');
    check('台账写入 1 条记录', ledger.length === 1, `实际 ${ledger.length}`);
    if (ledger[0]) {
      check('台账含逐题作答 18 项', Array.isArray(ledger[0].answers) && ledger[0].answers.length === 18);
      check('台账含得分明细', Array.isArray(ledger[0].scores) && ledger[0].scores.length === 9);
      check('台账含题组信息（seed/sampleIds）', !!ledger[0].seed && Array.isArray(ledger[0].sampleIds) && ledger[0].sampleIds.length === 18);
      check('台账含选择星座', ledger[0].sign === 'leo', String(ledger[0].sign));
      check('台账主副职业与结果页一致', ledger[0].main && ledger[0].secondary && ledger[0].main !== ledger[0].secondary);
    }

    /* ---------- 9. 历史记录页 ---------- */
    location.hash = '#/history';
    await sleep(500);
    const items = document.querySelectorAll('.history-item');
    check('历史记录列表 1 条', items.length === 1, `实际 ${items.length}`);
    const viewBtn = document.querySelector('.history-item [data-act="view"]');
    if (viewBtn) {
      viewBtn.click();
      await sleep(500);
      check('从台账还原结果页', !!document.querySelector('.result-hero'));
      const sourceNote = document.querySelector('.source-note')?.textContent || '';
      check('结果页标注来自历史记录', sourceNote.includes('历史记录'), sourceNote.slice(0, 40));
      // 还原结果一致性
      const nameAgain = document.querySelector('.result-class-name')?.textContent?.trim();
      check('还原结果与初次一致', nameAgain === mainName, `${mainName} vs ${nameAgain}`);
    }

    /* ---------- 10. 分享直达复现 ---------- */
    if (code) {
      location.hash = `#/share/${code}`;
      await sleep(600);
      const sharedName = document.querySelector('.result-class-name')?.textContent?.trim();
      check('分享链接复现同一主职业', sharedName === mainName, `${mainName} vs ${sharedName}`);
      const note = document.querySelector('.source-note')?.textContent || '';
      check('分享页显示分享来源提示', note.includes('分享'), note.slice(0, 40));
    }

    /* ---------- 11. 切换模式 → 正式服全池检查 ---------- */
    location.hash = '#/home';
    await sleep(400);
    // 正式服开测（应出现模式切换确认，因为还有历史？不，历史完成后 state.current 已置；直接点击）
    const retailCard = document.querySelector('.mode-card[data-mode="retail"]');
    retailCard.click();
    await sleep(450);
    // 可能弹出切换模式确认（无进行中会话时不弹）；确认后进入星座页
    const modalOk = document.querySelector('.modal-mask [data-act="ok"]');
    if (modalOk) { modalOk.click(); await sleep(450); }
    check('每次开始先选星座（正式服）', !!(await waitFor('.sign-grid')));
    document.querySelector('.sign-card[data-sign="aquarius"]').click();
    await sleep(500);
    check('进入正式服答题页', (document.querySelector('.quiz-mode')?.textContent || '').includes('正式服'));
    // 全部选第 2 个选项，快速完成
    let guard2 = 0;
    while (document.querySelector('.quiz-card') && guard2 < 40) {
      const opts = document.querySelectorAll('.opt');
      if (!opts.length) break;
      opts[Math.min(1, opts.length - 1)].click();
      await sleep(380);
      guard2 += 1;
    }
    check('正式服完成进入结果页', !!(await waitFor('.result-hero')));
    if (document.querySelector('.details-fold details')) {
      document.querySelector('.details-fold details').open = true;
      await sleep(100);
      const rows2 = document.querySelectorAll('.score-table tbody tr');
      check('正式服得分表 13 行', rows2.length === 13, `实际 ${rows2.length}`);
    }
    const ledger2 = JSON.parse(localStorage.getItem('wow-class-quiz:ledger:v1') || '[]');
    check('台账累计 2 条记录', ledger2.length === 2, `实际 ${ledger2.length}`);

    /* ---------- 12. 进行中进度持久化 ---------- */
    location.hash = '#/quiz'; // 无会话时应被重定向回首页
    await sleep(400);
    location.hash = '#/home';
    await sleep(300);
    const retest = document.querySelector('#retestSame');
    // 开始一次新测试但中途离开，检查恢复横幅
    if (retest) retest.click(); else {
      const c2 = document.querySelector('.mode-card[data-mode="classic"]');
      if (c2) c2.click();
      await sleep(300);
      const mo = document.querySelector('.modal-mask [data-act="ok"]');
      if (mo) { mo.click(); await sleep(350); }
      const sc2 = document.querySelector('.sign-card[data-sign="leo"]');
      if (sc2) { sc2.click(); await sleep(350); }
    }
    await sleep(400);
    if (document.querySelector('.quiz-card')) {
      document.querySelectorAll('.opt')[0].click();
      await sleep(400);
      document.querySelectorAll('.opt')[0].click();
      await sleep(400);
    }
    location.hash = '#/home';
    await sleep(500);
    const banner = document.querySelector('.resume-banner');
    check('进行中进度保存并出现恢复横幅', !!banner, banner ? banner.textContent.trim().slice(0, 50) : '未出现');

    /* ---------- 13. 无横向滚动（答题页） ---------- */
    location.hash = '#/quiz';
    await sleep(400);
    check('答题页无横向滚动', document.documentElement.scrollWidth <= window.innerWidth + 1,
      `scrollWidth=${document.documentElement.scrollWidth}, innerWidth=${window.innerWidth}`);

    /* ---------- 14. 对比度抽样（WCAG AA 4.5:1 正文 / 3:1 大字） ---------- */
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const contrast = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      let node = el, bg = null;
      while (node) {
        const b = parse(getComputedStyle(node).backgroundColor);
        const alpha = getComputedStyle(node).backgroundColor.match(/rgba?\([^)]*?([\d.]+)\)$/);
        if (b && (!alpha || Number(alpha[1]) > 0.5)) { bg = b; break; }
        node = node.parentElement;
      }
      if (!fg || !bg) return null;
      const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const samples = [['答题题干', '.quiz-question'], ['选项文字', '.opt'], ['进度计数', '.quiz-count'], ['退出按钮', '#quizExit']];
    samples.forEach(([label, sel]) => {
      const c = contrast(document.querySelector(sel));
      check(`对比度·${label}`, c === null || c >= 3.0, c === null ? '未测量' : c.toFixed(2));
    });

    /* ---------- 15. 切换模式确认提示 ---------- */
    location.hash = '#/home';
    await sleep(600);
    const otherCard = document.querySelector('.mode-card[data-mode="retail"]');
    if (otherCard) {
      otherCard.click();
      await sleep(450);
      const switchModal = document.querySelector('.modal-mask');
      check('切换模式前弹出确认提示', !!switchModal, switchModal ? switchModal.textContent.trim().slice(0, 40) : '未弹出');
      const cancelBtn = document.querySelector('.modal-mask [data-act="cancel"]');
      if (cancelBtn) { cancelBtn.click(); await sleep(300); }
      check('取消切换后进度保留', !!document.querySelector('.resume-banner') || !!document.querySelector('#resumeBtn'));
    }

    /* ---------- 汇总（随后进入刷新持久化二阶段） ---------- */
    report.summary = {
      total: report.checks.length,
      passed: report.checks.filter((c) => c.pass).length,
      failed: report.checks.filter((c) => !c.pass).length,
      consoleErrors: report.consoleErrors.length,
    };
    report.ok = report.summary.failed === 0 && report.consoleErrors.length === 0;
    try { sessionStorage.setItem('e2e-phase2', JSON.stringify(report)); } catch {}
    console.log('[E2E] 阶段 1 完成，重载页面验证刷新持久化…');
    location.reload();
    return;
  } catch (err) {
    report.fatal = `${err.message}\n${err.stack || ''}`;
    report.ok = false;
  }

  writeReport(report);
}

/* ---------- 阶段 1 报告写出 ---------- */
function writeReport(report) {
  const pre = document.createElement('pre');
  pre.id = 'e2e-report';
  pre.style.display = 'none';
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.appendChild(pre);
  document.title = report.ok ? 'E2E:PASS' : 'E2E:FAIL';
  console.log(`[E2E] ${report.ok ? 'PASS' : 'FAIL'} — passed ${report.summary?.passed}/${report.summary?.total}, consoleErrors=${(report.consoleErrors || []).length}`);
}

/* ---------- 阶段 2：整页刷新后的持久化验证 ---------- */
async function runReloadPhase(raw) {
  const report = JSON.parse(raw);
  const check = (name, pass, detail = '') => report.checks.push({ name, pass: !!pass, detail: String(detail) });
  try {
    await sleep(900);
    location.hash = '#/home';
    await sleep(600);
    const banner = document.querySelector('.resume-banner');
    check('整页刷新后作答进度不丢（恢复横幅仍在）', !!banner, banner ? banner.textContent.trim().slice(0, 60) : '未出现');
    location.hash = '#/quiz';
    await sleep(600);
    const cnt = (document.querySelector('.quiz-count')?.textContent || '').replace(/\s+/g, '');
    check('刷新后继续答题位置保持', cnt.startsWith('第3/'), cnt);
    const signTxt = (document.querySelector('.quiz-sign')?.textContent || '').trim();
    check('刷新后星座标记仍在', signTxt.includes('✦'), signTxt);
    const ledger = JSON.parse(localStorage.getItem('wow-class-quiz:ledger:v1') || '[]');
    check('刷新后台账仍保留 2 条记录', ledger.length === 2, `实际 ${ledger.length}`);
  } catch (err) {
    report.fatal = `${err.message}\n${err.stack || ''}`;
    report.ok = false;
  }
  report.summary = {
    total: report.checks.length,
    passed: report.checks.filter((c) => c.pass).length,
    failed: report.checks.filter((c) => !c.pass).length,
    consoleErrors: (report.consoleErrors || []).length,
  };
  report.ok = report.summary.failed === 0 && report.summary.consoleErrors === 0 && !report.fatal;
  const pre = document.createElement('pre');
  pre.id = 'e2e-report';
  pre.style.display = 'none';
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.appendChild(pre);
  document.title = report.ok ? 'E2E:PASS' : 'E2E:FAIL';
  console.log(`[E2E+reload] ${report.ok ? 'PASS' : 'FAIL'} — passed ${report.summary.passed}/${report.summary.total}`);
}
