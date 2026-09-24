/**
 * 艾泽拉斯星命罗盘 · 应用主逻辑
 * ------------------------------------------------------------------
 * 路由（hash）：#/  首页 | #/sign 星座选择 | #/quiz 答题 | #/result 结果
 *                #/history 记录 | #/about 关于 | #/share/<code> 分享直达结果
 * 状态：进行中的作答持久化到 localStorage；完成后写入台账记录。
 */

import { CLASSES, MODES, classById } from '../data/classes.js';
import { ZODIAC, zodiacById } from '../data/zodiac.js';
import { KIND_LABELS, ANSWER_SCALE, SAMPLE_RULES } from '../data/questions.js';
import { computeResult, displayFit, ENGINE_VERSION } from '../engine/scoring.js';
import { sampleStatements, statementsByIds, randomSeed } from '../engine/sampler.js';
import { encodeShare, decodeShare } from '../engine/share.js';
import { classEmblem, zodiacConstellation, uiIcon } from './icons.js';
import {
  buildPersonalityReading, buildZodiacReading, buildMainReasons,
  buildSecondaryReasons, fitTier, buildShareText, DIM_META,
} from './copy.js';
import {
  loadSession, saveSession, clearSession, loadLedger, appendRecord,
  removeRecord, clearLedger, storageIsMemory,
} from './store.js';

/* ================= 工具 ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return String(ts); }
}

function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    } catch (e) { reject(e); }
  });
}

const DIM_ORDER = ['courage', 'cunning', 'compassion', 'knowledge', 'freedom', 'faith'];
const DIM_COLORS = {
  courage: '#e06a3a', cunning: '#c9a227', compassion: '#7ec27a',
  knowledge: '#7ac7e8', freedom: '#9d8bf0', faith: '#e8c96a',
};
function dimMaxOf(sample) {
  const max = {};
  DIM_ORDER.forEach((d) => {
    max[d] = (sample || []).reduce((s, st) => s + (((st.dims && st.dims[d]) || 0)), 0);
  });
  return max;
}

function starsHtml(n) {
  return `<span class="stars" aria-label="上手难度 ${n} / 5">${'★'.repeat(n)}<span class="dim">${'☆'.repeat(5 - n)}</span></span>`;
}

/* ================= 全局状态 ================= */
const state = {
  mode: null,
  pendingMode: null,
  sign: null,
  seed: null,
  sample: null,
  answers: Array(SAMPLE_RULES.total).fill(null),
  qIndex: 0,
  startedAt: null,
  advanceLock: false,
  current: null, // { result, record, source, sample, seed }
  route: 'home',
};

/* 种子来源：默认随机；E2E 可用 ?seed=NNN 固定，保证自动化测试确定复现 */
function nextSeed() {
  const override = new URLSearchParams(location.search).get('seed');
  if (override && /^\d+$/.test(override)) return (Number(override) >>> 0) || 1;
  return randomSeed();
}

/* ================= Toast ================= */
function toast(msg, type = '') {
  const region = $('#toastRegion');
  const el = document.createElement('div');
  el.className = `toast${type ? ` toast--${type}` : ''}`;
  el.textContent = msg;
  region.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ================= 确认弹窗 ================= */
function confirmModal({ title, body, confirmText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h3 id="modalTitle">${esc(title)}</h3>
        <p>${body}</p>
        <div class="btn-row btn-row--end">
          <button class="btn btn--ghost btn--sm" data-act="cancel" type="button">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--sm" data-act="ok" type="button">${esc(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const okBtn = $('[data-act="ok"]', mask);
    okBtn.focus();
    const close = (val) => { mask.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
    };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close(false);
      const act = e.target.closest('[data-act]');
      if (act) close(act.dataset.act === 'ok');
    });
    document.addEventListener('keydown', onKey);
  });
}

/* ================= 会话管理 ================= */
function sessionValid() {
  return !!state.mode && !!state.sample;
}

function persistSession() {
  if (!sessionValid()) return;
  saveSession({
    mode: state.mode,
    sign: state.sign || null,
    seed: state.seed,
    sampleIds: state.sample ? state.sample.map((s) => s.id) : [],
    answers: state.answers,
    qIndex: state.qIndex,
    startedAt: state.startedAt || Date.now(),
  });
}

function restoreSession() {
  const s = loadSession();
  if (!s) return;
  if (!s.seed) { clearSession(); return; } // 旧版（v1）会话无法迁移，直接放弃
  state.mode = s.mode;
  state.seed = s.seed >>> 0;
  state.sign = s.sign && ZODIAC.some((z) => z.id === s.sign) ? s.sign : null;
  state.sample = (s.sampleIds && s.sampleIds.length === SAMPLE_RULES.total)
    ? statementsByIds(s.sampleIds)
    : sampleStatements(s.mode, state.seed, state.sign);
  if (!state.sample || state.sample.length !== SAMPLE_RULES.total) { clearSession(); return; }
  state.answers = state.sample.map((st, i) => {
    const a = s.answers[i];
    return Number.isInteger(a) && a >= 0 && a < ANSWER_SCALE.length ? a : null;
  });
  state.startedAt = s.startedAt || null;
  const firstUnanswered = state.answers.findIndex((a) => a === null);
  state.qIndex = Number.isInteger(s.qIndex) && s.qIndex >= 0 && s.qIndex < state.sample.length
    ? s.qIndex
    : (firstUnanswered === -1 ? 0 : firstUnanswered);
}

function resetProgress(mode) {
  if (mode) state.mode = mode;
  state.seed = nextSeed();
  state.sample = state.mode ? sampleStatements(state.mode, state.seed, state.sign || null) : null;
  state.answers = Array(SAMPLE_RULES.total).fill(null);
  state.qIndex = 0;
  state.startedAt = Date.now();
  clearSession();
}

/* ================= 记录（台账） ================= */
function makeRecord(result, seed) {
  return {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    finishedAt: Date.now(),
    mode: result.mode,
    sign: result.zodiac.declared || null,
    seed: (seed || 0) >>> 0,
    sampleIds: result.sampleIds,
    answers: result.answers,
    main: result.main,
    secondary: result.secondary,
    zodiacPrimary: result.zodiac.primary,
    zodiacSecondary: result.zodiac.secondary,
    scores: result.scores.map((s) => ({ classId: s.classId, total: s.total, base: s.base, personal: s.personal, zodiac: s.zodiac })),
    dims: result.dims,
    engineVersion: result.engineVersion,
  };
}

/* ================= 路由 ================= */
function go(hash) { location.hash = hash; }

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const segs = raw.split('/').filter(Boolean);
  return { seg: segs[0] || 'home', rest: segs.slice(1) };
}

function setNav(active) {
  $$('.nav-link').forEach((b) => {
    if (b.dataset.nav === active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function route() {
  const { seg, rest } = parseRoute();
  state.route = seg;
  const main = $('#main');
  try {
    switch (seg) {
      case 'home': renderHome(main); setNav('home'); document.title = '艾泽拉斯星命罗盘 · 魔兽世界职业测试'; break;
      case 'sign': renderSign(main); setNav(''); document.title = '选择星座 · 艾泽拉斯星命罗盘'; break;
      case 'quiz': renderQuiz(main); setNav(''); document.title = '答题中 · 艾泽拉斯星命罗盘'; break;
      case 'result': renderResult(main); setNav(''); document.title = '测试结果 · 艾泽拉斯星命罗盘'; break;
      case 'history': renderHistory(main); setNav('history'); document.title = '历史记录 · 艾泽拉斯星命罗盘'; break;
      case 'about': renderAbout(main); setNav('about'); document.title = '关于测试 · 艾泽拉斯星命罗盘'; break;
      case 'share': renderShare(main, rest[0]); setNav(''); document.title = '分享结果 · 艾泽拉斯星命罗盘'; break;
      default: renderNotFound(main); setNav('');
    }
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="panel"><h2 class="card-title">出了点小差错</h2>
      <p style="color:var(--ink-dim)">页面渲染失败：${esc(err.message)}。请返回首页重试。</p>
      <div class="btn-row" style="margin-top:16px"><button class="btn btn--primary" data-go="home" type="button">回到首页</button></div></div>`;
    bindGo(main);
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function bindGo(root) {
  $$('[data-go]', root).forEach((el) => el.addEventListener('click', () => go(`#/${el.dataset.go}`)));
}

/* ================= 首页 ================= */
function renderHome(main) {
  const modes = ['classic', 'retail'];
  const resume = state.mode && state.answers.some((a) => a !== null);
  const answeredCount = state.answers.filter((a) => a !== null).length;

  main.innerHTML = `
    <section class="hero">
      <div class="hero-eyebrow">WOW CLASS ORACLE · 职业 × 星辰 × 性格</div>
      <h1 class="hero-title gold-text">艾泽拉斯星命罗盘<span class="line-2">找到你的主职业与副职业</span></h1>
      <div class="hero-title-deco">✦ ✦ ✦</div>
      <p class="hero-lead">先点选你的星座，题目会围绕它从题库中重新抽取——穿越职业背景、星座倾向与性格维度三条线索。<br />
      罗盘转动之后，你将得到：一个主职业、一个副职业，以及它们与你的全部理由。</p>
      <div class="hero-features">
        <span class="hero-feature">${uiIcon('shield')} 双模式职业池：经典怀旧服 9 职业 / 正式服 13 职业</span>
        <span class="hero-feature">${uiIcon('star')} 先选星座：题组从 96 条题库按你的星座加权抽取</span>
        <span class="hero-feature">${uiIcon('book')} 五档赞同度作答 · 星座锚定 + 三轴权重实时累计</span>
      </div>
      <div class="hero-cta">
        <button class="btn btn--primary" id="ctaStart" type="button">${uiIcon('spark')} 开始测试</button>
        <button class="btn btn--ghost" data-go="history" type="button">${uiIcon('history')} 查看历史记录</button>
      </div>
      <div class="emblem-band" aria-label="十三职业徽章">
        ${CLASSES.map((c) => `
          <div class="emblem-chip${!c.modes.classic ? ' emblem-chip--locked' : ''}" style="--class-color:${c.color}" title="${esc(c.name)}${!c.modes.classic ? '（仅正式服）' : ''}">
            ${classEmblem(c.id, 44)}
            <small>${esc(c.name)}</small>
          </div>`).join('')}
      </div>
    </section>

    <section id="modeSection">
      <div style="text-align:center;margin:34px 0 4px">
        <div class="section-kicker">选择你的征途</div>
        <h2 class="gold-text" style="font-size:clamp(24px,4vw,34px);letter-spacing:.14em">先选择服务器的时代</h2>
      </div>

      ${resume ? `
      <div class="resume-banner">
        <div class="rb-text">检测到一份<b>未完成的测试</b>——${esc(MODES[state.mode].name)} · 已答 ${answeredCount} / ${SAMPLE_RULES.total} 题</div>
        <div class="btn-row">
          <button class="btn btn--primary btn--sm" id="resumeBtn" type="button">继续作答</button>
          <button class="btn btn--ghost btn--sm" id="discardBtn" type="button">重新开始</button>
        </div>
      </div>` : ''}

      <div class="mode-grid">
        ${modes.map((m) => {
          const mode = MODES[m];
          const pool = CLASSES.filter((c) => m === 'retail' || c.modes.classic);
          return `
          <button class="mode-card" data-mode="${m}" type="button">
            <h3 class="gold-text">${esc(mode.name)}</h3>
            <div class="mode-sub">${esc(mode.sub)}</div>
            <p class="mode-desc">${esc(mode.desc)}</p>
            <p class="mode-pool">${esc(mode.poolHint)}</p>
            <div class="mode-roster">
              ${pool.map((c) => `<span class="roster-dot" style="--class-color:${c.color}"><i></i>${esc(c.name)}</span>`).join('')}
            </div>
            <span class="mode-cta">进入此模式开始答题 ${uiIcon('arrowRight', 18)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="panel" style="margin-top:34px">
      <div class="card-title">${uiIcon('star')} 测试如何进行</div>
      <ol class="method-steps">
        <li><span class="step-no">1</span><div><strong style="color:var(--gold-pale)">选择模式与星座</strong>：先选经典怀旧服 / 正式服（9 / 13 职业池），再点选你的星座。</div></li>
        <li><span class="step-no">2</span><div><strong style="color:var(--gold-pale)">五档作答 18 题</strong>：题组围绕你的星座从 96 条题库加权抽取；每句用「非常赞同 → 完全不赞同」表态，可随时回退修改。</div></li>
        <li><span class="step-no">3</span><div><strong style="color:var(--gold-pale)">领取结果</strong>：星座锚定 + 加权计分得出主职业与副职业，附完整契合理由与得分明细，可保存、可分享。</div></li>
      </ol>
    </section>
  `;

  bindGo(main);
  $('#ctaStart').addEventListener('click', () => $('#modeSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  $$('.mode-card', main).forEach((card) => {
    card.addEventListener('click', async () => {
      const mode = card.dataset.mode;
      if (sessionValid()) {
        const sameMode = state.mode === mode;
        if (!sameMode) {
          const okSwitch = await confirmModal({
            title: '切换模式',
            body: `当前有一份「${esc(MODES[state.mode].name)}」的未完成进度。切换到「${esc(MODES[mode].name)}」将重新开始作答，之前的进度会被清除。`,
            confirmText: '重新开始',
          });
          if (!okSwitch) return;
        } else {
          go('#/quiz');
          return;
        }
      }
      /* v3：先进入星座选择，选定星座后再落地为新会话 */
      state.pendingMode = mode;
      go('#/sign');
    });
  });

  const resumeBtn = $('#resumeBtn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => go('#/quiz'));
    $('#discardBtn').addEventListener('click', async () => {
      const ok = await confirmModal({ title: '重新开始', body: '将清除当前未完成的进度，从第 1 题重新作答。', confirmText: '清除并重来', danger: true });
      if (ok) { resetProgress(); state.sign = null; state.pendingMode = null; renderHome(main); toast('进度已清除，请选择模式重新开始'); }
    });
  }
}

/* ================= 星座选择（v3） ================= */
function renderSign(main) {
  const mode = state.pendingMode || ((state.mode && sessionValid()) ? state.mode : null);
  if (!mode) {
    toast('请先选择模式', 'error');
    go('#/home');
    return;
  }
  const modeData = MODES[mode];
  main.innerHTML = `
    <div class="sign-wrap">
      <div class="sign-head">
        <div class="section-kicker">星辰起手</div>
        <h1 class="gold-text" style="letter-spacing:.14em">选择你的星座</h1>
        <p class="sign-sub">题目会围绕你的星座性格加权抽取；最终结果由「你的星座 + 你的作答」两套星图共同推演。</p>
        <p class="sign-mode-note">当前模式：${esc(modeData.name)} · ${mode === 'classic' ? '9' : '13'} 职业池</p>
      </div>
      <div class="sign-grid" role="group" aria-label="选择你的星座">
        ${ZODIAC.map((z) => `
          <button class="sign-card" data-sign="${z.id}" type="button" aria-label="选择${esc(z.name)}">
            ${zodiacConstellation(z, 52)}
            <span class="sign-name">${esc(z.name)}</span>
            <span class="sign-en">${esc(z.en)}</span>
            <span class="sign-dates">${esc(z.dateRange)}</span>
            <span class="sign-traits">${esc(z.traits.join(' · '))}</span>
          </button>`).join('')}
      </div>
      <div class="btn-row" style="justify-content:center;margin-top:6px">
        <button class="btn btn--ghost" id="signBack" type="button">${uiIcon('arrowLeft', 17)} 返回选择模式</button>
      </div>
    </div>
  `;
  $('#signBack', main).addEventListener('click', () => { state.pendingMode = null; go('#/home'); });
  $$('.sign-card', main).forEach((card) => {
    card.addEventListener('click', () => {
      const sign = card.dataset.sign;
      state.pendingMode = null;
      state.sign = sign;
      resetProgress(mode);
      persistSession();
      const z = zodiacById(sign);
      toast(`已选择「${z.name}」——题组已按星座加权`);
      go('#/quiz');
    });
  });
}

/* ================= 答题 ================= */
function renderQuiz(main) {
  if (!sessionValid()) {
    toast('尚未开始测试，请先选择模式', 'error');
    go('#/home');
    return;
  }
  const q = state.sample[state.qIndex];
  const answered = state.answers.filter((a) => a !== null).length;
  const cur = state.answers[state.qIndex];
  const kindClass = { lore: 'quiz-kind--lore', zodiac: 'quiz-kind--zodiac', heart: 'quiz-kind--heart' }[q.kind];
  const kindIcon = { lore: 'sword', zodiac: 'star', heart: 'spark' }[q.kind];

  main.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-top">
        <span class="quiz-mode">${esc(MODES[state.mode].name)}</span>
        ${state.sign ? `<span class="quiz-sign" title="题组已按星座加权">✦ ${esc((zodiacById(state.sign) || {}).name || '')}</span>` : ''}
        <span class="quiz-count" aria-live="polite">第 <b>${state.qIndex + 1}</b> / ${state.sample.length} 题</span>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${state.sample.length}" aria-valuenow="${answered}" aria-label="答题进度">
          <div class="progress-fill" style="width:${Math.round((answered / state.sample.length) * 100)}%"></div>
        </div>
        <span class="quiz-top-actions">
          <button class="btn btn--ghost btn--sm" id="quizModeSwitch" type="button">⇄ 切换模式</button>
          <button class="btn btn--ghost btn--sm" id="quizExit" type="button">退出</button>
        </span>
      </div>

      <div class="quiz-card" id="quizCard">
        <div class="quiz-kind ${kindClass}">${uiIcon(kindIcon, 15)} ${esc(KIND_LABELS[q.kind])}</div>
        <p class="quiz-intro">凭第一直觉作答——你有多认同这句话？</p>
        <h2 class="quiz-question" id="quizQuestion" tabindex="-1">${esc(q.text)}</h2>
        <div class="quiz-options quiz-options--scale" role="group" aria-labelledby="quizQuestion">
          ${ANSWER_SCALE.map((label, i) => `
            <button class="opt" type="button" data-opt="${i}" aria-pressed="${cur === i}">
              <span class="opt-key">${i + 1}</span>
              <span class="opt-text">${esc(label)}</span>
              <span class="opt-check">${uiIcon('check', 20)}</span>
            </button>`).join('')}
        </div>
        <div class="quiz-foot">
          <button class="btn btn--ghost btn--sm" id="quizBack" type="button" ${state.qIndex === 0 ? 'disabled' : ''}>${uiIcon('arrowLeft', 17)} 上一题</button>
          <span class="quiz-hint"><kbd>1</kbd>-<kbd>5</kbd> 选择 · <kbd>←</kbd> 上一题 · 选择后自动进入下一题</span>
        </div>
      </div>
    </div>
  `;

  const questionEl = $('#quizQuestion', main);
  questionEl.focus({ preventScroll: true });

  $$('.opt', main).forEach((btn) => {
    btn.addEventListener('click', () => selectOption(Number(btn.dataset.opt)));
  });
  $('#quizBack', main).addEventListener('click', goBack);
  $('#quizExit', main).addEventListener('click', async () => {
    const ok = await confirmModal({ title: '退出答题', body: '当前进度已自动保存，可从首页"继续作答"回来。', confirmText: '退出', cancelText: '继续答题' });
    if (ok) go('#/home');
  });
  $('#quizModeSwitch', main).addEventListener('click', async () => {
    const other = state.mode === 'classic' ? 'retail' : 'classic';
    const ok = await confirmModal({
      title: '切换模式',
      body: `切换到「${esc(MODES[other].name)}」将清空当前作答并重新开始。`,
      confirmText: '切换并重来',
    });
    if (ok) {
      resetProgress(other);
      persistSession();
      renderQuiz(main);
      toast(`已切换到「${MODES[other].name}」，从第 1 题重新开始`);
    }
  });
}

function selectOption(i) {
  if (state.advanceLock || state.route !== 'quiz') return;
  state.answers[state.qIndex] = i;
  persistSession();
  $$('.opt').forEach((el) => {
    el.setAttribute('aria-pressed', String(Number(el.dataset.opt) === i));
  });
  state.advanceLock = true;
  setTimeout(() => {
    state.advanceLock = false;
    if (state.qIndex < state.sample.length - 1) {
      state.qIndex += 1;
      persistSession();
      if (state.route === 'quiz') renderQuiz($('#main'));
    } else {
      finishQuiz();
    }
  }, 340);
}

function goBack() {
  if (state.qIndex > 0) {
    state.qIndex -= 1;
    persistSession();
    renderQuiz($('#main'));
  }
}

function finishQuiz() {
  let result;
  try {
    result = computeResult(state.sample, state.answers, state.mode, state.sign);
  } catch (err) {
    toast(`结果计算失败：${err.message}`, 'error');
    return;
  }
  const record = makeRecord(result, state.seed);
  appendRecord(record);
  clearSession();
  state.answers = Array(SAMPLE_RULES.total).fill(null);
  state.qIndex = 0;
  state.current = { result, record, source: 'fresh', sample: state.sample, seed: state.seed };
  go('#/result');
}

/* ================= 结果页 ================= */
function renderResult(main) {
  if (!state.current) {
    toast('还没有结果，先完成一次测试吧', 'error');
    go('#/home');
    return;
  }
  const { result, record, source } = state.current;
  const dimMax = dimMaxOf(state.current.sample);
  const mainClass = classById(result.main);
  const subClass = classById(result.secondary);
  const zodiacPrimary = zodiacById(result.zodiac.primary);
  const zodiacSecondary = zodiacById(result.zodiac.secondary);
  const zodiacDeclared = result.zodiac.declared ? zodiacById(result.zodiac.declared) : null;
  const modeData = MODES[result.mode];
  const fit = displayFit(result.scores[0].total);
  const tier = fitTier(result.scores[0].total);
  const subFit = displayFit(result.secondaryDetail.total);

  const persona = buildPersonalityReading(result);
  const zodiacRead = buildZodiacReading(result, zodiacPrimary, zodiacSecondary, mainClass);
  const mainWhy = buildMainReasons(result, mainClass, zodiacPrimary);
  const subWhy = buildSecondaryReasons(result, mainClass, subClass, result.secondaryDetail);
  const specs = mainClass.modes[result.mode] ? mainClass.modes[result.mode].specs : [];
  const modeNote = mainClass.modes[result.mode] && mainClass.modes[result.mode].note;

  const sourceNote = source === 'history'
    ? `<div class="source-note">${uiIcon('history', 18)} 正在查看历史记录（${record ? fmtTime(record.finishedAt) : ''}）的结果。</div>`
    : source === 'share'
      ? `<div class="source-note">${uiIcon('share', 18)} 这是一份来自朋友的分享结果——你也可以去测出自己的罗盘指向。</div>`
      : '';

  main.innerHTML = `
    ${sourceNote}
    <section class="result-hero" style="--class-color:${mainClass.color}">
      <div class="result-kicker">星命罗盘 · 你的主职业</div>
      <div class="result-class-emblem">${classEmblem(mainClass.id, 108)}</div>
      <h1 class="result-class-name gold-text">${esc(mainClass.name)}</h1>
      <div class="result-class-en">${esc(mainClass.en)}</div>
      <div class="result-fit">
        <span class="num">${fit}<span class="pct">%</span></span>
        <span class="tier">${esc(tier.label)}</span>
      </div>
      <p class="result-fit-note">${esc(tier.note)}</p>
      <div class="result-meta">
        <span class="badge badge--class">${esc(mainClass.roles.join(' / '))}</span>
        <span class="badge" style="--class-color:${mainClass.color}">${esc(mainClass.armor)} · ${esc(mainClass.resource)}</span>
        <span class="badge badge--dim">上手难度 ${starsHtml(mainClass.difficulty)}</span>
        <span class="badge badge--dim">${esc(modeData.name)}</span>
      </div>
      <p class="result-fit-note" style="margin-top:14px;color:var(--ink-dim);font-family:var(--font-display);font-size:15.5px">「${esc(mainClass.fantasy)}」</p>
    </section>

    <div class="result-grid">
      <section class="panel">
        <div class="card-title">${uiIcon('sword')} 为何是${esc(mainClass.name)}</div>
        <ul class="reason-list">
          ${mainWhy.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </section>

      <section class="panel" style="--class-color:${subClass.color}">
        <div class="card-title">${uiIcon('spark')} 副职业 · 你的另一种可能</div>
        <div class="subclass-head">
          ${classEmblem(subClass.id, 54)}
          <div>
            <h3 class="gold-text">${esc(subClass.name)}</h3>
            <div class="en">${esc(subClass.en)} · 契合度 <span class="subclass-fit">${subFit}%</span></div>
          </div>
        </div>
        <div class="result-meta" style="justify-content:flex-start;margin-top:2px">
          <span class="badge badge--class">${esc(subClass.roles.join(' / '))}</span>
          <span class="badge badge--dim">上手难度 ${starsHtml(subClass.difficulty)}</span>
        </div>
        <ul class="reason-list">
          ${subWhy.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </section>

      <section class="panel">
        <div class="card-title">${uiIcon('book')} 人格解读${persona.topNames ? ` · ${esc(persona.topNames.join(' × '))}` : ''}</div>
        <p style="color:var(--ink-faint);font-size:13.5px;font-style:italic;margin:0 0 14px">${esc(persona.lead)}</p>
        <div class="dim-list" role="img" aria-label="性格六维得分：${DIM_ORDER.map((d) => `${DIM_META[d].name} ${Math.max(0, Math.min(100, Math.round((result.dims[d] / Math.max(1e-9, dimMax[d])) * 100)))}%`).join('，')}">
          ${DIM_ORDER.map((d) => {
            const pct = Math.max(0, Math.min(100, Math.round((result.dims[d] / Math.max(1e-9, dimMax[d])) * 100)));
            return `<div class="dim-row">
              <span class="dim-name">${DIM_META[d].name}</span>
              <div class="dim-bar"><div class="dim-fill" style="width:${pct}%;--dim-color:${DIM_COLORS[d]}"></div></div>
              <span class="dim-val">${pct}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="divider-orn"><span class="diamond"></span></div>
        ${persona.paragraphs.map((p) => `<p style="color:var(--ink-dim);font-size:14.5px;line-height:1.9;margin:0 0 12px">${esc(p)}</p>`).join('')}
      </section>

      <section class="panel zodiac-panel">
        <div class="card-title">${uiIcon('star')} 星座解读 · 星盘主位</div>
        <div class="zodiac-layout">
          <div class="zodiac-side">
            <div class="zodiac-disc">${zodiacConstellation(zodiacPrimary, 76)}</div>
            <h3 class="zodiac-name gold-text">${esc(zodiacPrimary.name)}</h3>
            <div class="z-en">${esc(zodiacPrimary.en)} · ${esc(zodiacPrimary.dateRange)}</div>
            ${zodiacDeclared ? `<div class="z-pick">✦ 你选择：${esc(zodiacDeclared.name)} · 同频度 ${result.zodiac.resonance}%</div>` : ''}
            <div class="zodiac-tags">
              <span class="badge">${esc(zodiacPrimary.element)}象星座</span>
              ${zodiacPrimary.traits.map((t) => `<span class="badge badge--dim">${esc(t)}</span>`).join('')}
            </div>
          </div>
          <div class="zodiac-body">
            ${zodiacRead.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
          </div>
        </div>
      </section>

      <section class="panel result-grid--wide" style="grid-column:1/-1">
        <div class="card-title">${uiIcon('shield')} 职业档案 · ${esc(mainClass.name)}</div>
        <p class="class-blurb">${esc(mainClass.blurb)}</p>
        ${modeNote ? `<p class="kv-line" style="color:var(--gold-dim)">${esc(modeData.name)}注：${esc(modeNote)}</p>` : ''}
        <div class="spec-chips">
          ${specs.map((s) => `<span class="spec-chip"><b>${esc(s.name)}</b> · ${esc(s.role)}</span>`).join('')}
        </div>
        <p class="kv-line"><b>上手建议：</b>${esc(mainClass.advice)}</p>
        <p class="kv-line"><b>核心关键词：</b>${esc(mainClass.keywords.join(' · '))}</p>
      </section>
    </div>

    <div class="details-fold" style="margin-top:22px">
      <details>
        <summary>${uiIcon('book', 18)} 得分明细 · 展开查看全部 ${result.scores.length} 个职业的加权过程</summary>
        <div class="fold-body">
          <table class="score-table">
            <thead><tr><th style="width:46px">#</th><th>职业</th><th class="num">职业背景</th><th class="num">性格契合</th><th class="num">星辰修正</th><th class="num" style="min-width:190px">总分</th></tr></thead>
            <tbody>
              ${result.scores.map((s, i) => {
                const c = classById(s.classId);
                const isMain = s.classId === result.main;
                const isSub = s.classId === result.secondary;
                return `<tr class="${isMain ? 'is-main' : isSub ? 'is-sub' : ''}">
                  <td class="num">${i + 1}</td>
                  <td><span style="color:${c.color}">◆</span> ${esc(c.name)}${isMain ? ' <span class="badge badge--class" style="margin-left:6px">主</span>' : isSub ? ' <span class="badge badge--dim" style="margin-left:6px">副</span>' : ''}</td>
                  <td class="num">${s.base.toFixed(1)}</td>
                  <td class="num">${s.personal.toFixed(1)}</td>
                  <td class="num">${s.zodiac.toFixed(1)}</td>
                  <td class="num">${s.total.toFixed(1)}<span class="mini-bar"><span class="mini-fill" style="width:${Math.max(0, Math.min(100, s.total))}%"></span></span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <p class="kv-line" style="margin-top:12px">计分口径：总分 = 35% 职业背景直连 + 45% 性格六维契合 + 20% 星辰修正；副职业评选含"定位互补加成"（主定位不同 +${3} 分）。同一份作答在任何时候重算，结果完全一致。</p>
        </div>
      </details>
    </div>

    <div class="share-box">
      <div class="card-title" style="font-size:17px">${uiIcon('share', 18)} 分享你的结果</div>
      <p class="kv-line" style="margin-top:0">分享链接内嵌了本局题组与你的 18 道作答，任何人打开都会看到与你完全一致的结果页面。</p>
      <input class="share-url" id="shareUrl" readonly aria-label="分享链接" />
      <div class="share-actions">
        <button class="btn btn--sm" id="copyLink" type="button">${uiIcon('share', 16)} 复制链接</button>
        <button class="btn btn--sm btn--ghost" id="copyTextBtn" type="button">复制分享文案</button>
        ${navigator.share ? '<button class="btn btn--sm btn--ghost" id="sysShare" type="button">系统分享</button>' : ''}
      </div>
    </div>

    <div class="result-actions">
      <button class="btn btn--primary" id="retestSame" type="button">${uiIcon('refresh')} 再测一次（${esc(modeData.name)}）</button>
      <button class="btn" data-go="home" type="button">${uiIcon('shield')} 换个模式试试</button>
      <button class="btn btn--ghost" id="exportSingle" type="button">${uiIcon('download')} 导出本次结果</button>
      <button class="btn btn--ghost" data-go="history" type="button">${uiIcon('history')} 查看历史记录</button>
    </div>
  `;

  bindGo(main);

  const shareCode = encodeShare(state.current.seed, result.answers, result.mode, result.zodiac.declared || state.sign || null);
  const shareUrl = `${location.origin}${location.pathname}#/share/${shareCode}`;
  const shareInput = $('#shareUrl', main);
  shareInput.value = shareUrl;

  $('#copyLink', main).addEventListener('click', () => {
    copyText(shareUrl).then(() => toast('分享链接已复制')).catch(() => toast('复制失败，请手动复制', 'error'));
  });
  $('#copyTextBtn', main).addEventListener('click', () => {
    const text = buildShareText(result, mainClass, subClass, zodiacPrimary);
    copyText(text).then(() => toast('分享文案已复制')).catch(() => toast('复制失败', 'error'));
  });
  const sysShare = $('#sysShare', main);
  if (sysShare) {
    sysShare.addEventListener('click', () => {
      navigator.share({ title: '艾泽拉斯星命罗盘', text: buildShareText(result, mainClass, subClass, zodiacPrimary), url: shareUrl }).catch(() => {});
    });
  }

  $('#retestSame', main).addEventListener('click', () => {
    state.sign = result.zodiac.declared || state.sign || null;
    resetProgress(result.mode);
    persistSession();
    go('#/quiz');
  });

  $('#exportSingle', main).addEventListener('click', () => {
    const payload = record || makeRecord(result, state.current.seed || 1);
    download(`星命罗盘-${mainClass.name}-${result.mode === 'classic' ? '怀旧服' : '正式服'}.json`, JSON.stringify({
      app: '艾泽拉斯星命罗盘',
      engineVersion: ENGINE_VERSION,
      exportedAt: new Date().toISOString(),
      record: payload,
    }, null, 2));
    toast('已导出结果文件');
  });
}

/* ================= 分享直达 ================= */
function renderShare(main, code) {
  const dec = decodeShare(code);
  if (!dec) {
    main.innerHTML = `
      <div class="panel empty-state">
        ${uiIcon('close', 46)}
        <h2 class="gold-text" style="font-size:24px">链接无效</h2>
        <p>这个分享链接似乎被截断了，或者格式不正确。</p>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          <button class="btn btn--primary" data-go="home" type="button">去测自己的罗盘</button>
        </div>
      </div>`;
    bindGo(main);
    return;
  }
  try {
    const sample = sampleStatements(dec.mode, dec.seed, dec.sign);
    const result = computeResult(sample, dec.answers, dec.mode, dec.sign);
    state.current = { result, record: null, source: 'share', sample, seed: dec.seed };
    renderResult(main);
  } catch (err) {
    toast(`分享数据无法解析：${err.message}`, 'error');
    go('#/home');
  }
}

/* ================= 历史记录 ================= */
function renderHistory(main) {
  const records = loadLedger();
  const memoryNote = storageIsMemory()
    ? '<p class="kv-line" style="color:var(--ember)">提示：当前浏览器不支持本地存储，记录仅保留在本次会话中。</p>' : '';

  if (!records.length) {
    main.innerHTML = `
      <div style="text-align:center;margin-bottom:20px">
        <div class="section-kicker">你的罗盘台账</div>
        <h1 class="gold-text" style="font-size:clamp(26px,4.6vw,38px);letter-spacing:.14em">历史记录</h1>
      </div>
      ${memoryNote}
      <div class="panel empty-state">
        ${uiIcon('history', 46)}
        <h2 class="gold-text" style="font-size:22px">还没有任何测试记录</h2>
        <p>完成一次测试后，这里会保存你的时间、模式、逐题选项与完整得分明细，可随时回看与导出。</p>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          <button class="btn btn--primary" data-go="home" type="button">开始第一次测试</button>
        </div>
      </div>`;
    bindGo(main);
    return;
  }

  main.innerHTML = `
    <div style="text-align:center;margin-bottom:22px">
      <div class="section-kicker">你的罗盘台账</div>
      <h1 class="gold-text" style="font-size:clamp(26px,4.6vw,38px);letter-spacing:.14em">历史记录</h1>
    </div>
    <div class="history-toolbar">
      <span class="history-count">共 ${records.length} 条记录（保存在本机浏览器，最多保留 100 条）</span>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" id="exportAll" type="button">${uiIcon('download', 16)} 导出全部（JSON）</button>
        <button class="btn btn--ghost btn--sm" id="exportCsv" type="button">${uiIcon('download', 16)} 导出汇总（CSV）</button>
        <button class="btn btn--danger btn--sm" id="clearAll" type="button">清空全部</button>
      </div>
    </div>
    ${memoryNote}
    <div class="history-list">
      ${records.map((r) => {
        const mc = classById(r.main);
        const sc = classById(r.secondary);
        const zp = zodiacById(r.zodiacPrimary);
        const zs = r.sign ? zodiacById(r.sign) : null;
        const modeName = MODES[r.mode] ? MODES[r.mode].name : r.mode;
        const top = r.scores && r.scores[0] ? displayFit(r.scores[0].total) : '—';
        const legacy = !r.seed && !(r.sampleIds && r.sampleIds.length);
        const recSample = legacy ? [] : ((r.sampleIds && r.sampleIds.length === SAMPLE_RULES.total) ? statementsByIds(r.sampleIds) : sampleStatements(r.mode, r.seed >>> 0, r.sign || null));
        return `
        <div class="history-item" style="--class-color:${mc ? mc.color : '#c9a227'}" data-id="${esc(r.id)}">
          <div class="history-head">
            <div class="history-main">
              ${mc ? classEmblem(mc.id, 34) : ''}
              ${esc(mc ? mc.name : r.main)}
              <small>主 / ${esc(sc ? sc.name : r.secondary)} 副 · 契合 ${top}% · 星盘 ${esc(zp ? zp.name : '')}${zs ? ` · 选择 ${esc(zs.name)}` : ''}</small>
            </div>
            <div class="history-meta">
              <span class="badge badge--dim">${esc(modeName)}</span>${legacy ? '<span class="badge badge--dim">旧版</span>' : ''}
              <span class="history-time">${fmtTime(r.finishedAt)}</span>
              <button class="btn btn--ghost btn--sm" data-act="view" type="button">查看结果</button>
              <button class="btn btn--ghost btn--sm" data-act="export" type="button">导出本条</button>
              <button class="btn btn--ghost btn--sm" data-act="delete" type="button">删除</button>
            </div>
          </div>
          <div class="history-detail" hidden>
            <h4>逐题作答</h4>
            <div class="answer-log">
              ${(r.answers || []).map((a, i) => {
                const st = recSample[i];
                if (!st) return '';
                const level = ANSWER_SCALE[a] || '—';
                return `<div class="log-row"><span class="q">第 ${i + 1} 题</span><span>【${esc(level)}】${esc(st.text)}</span></div>`;
              }).join('')}
            </div>
            <h4>得分明细</h4>
            <table class="score-table">
              <thead><tr><th>职业</th><th class="num">职业背景</th><th class="num">性格契合</th><th class="num">星辰修正</th><th class="num">总分</th></tr></thead>
              <tbody>
                ${(r.scores || []).map((s) => {
                  const c = classById(s.classId);
                  return `<tr>
                    <td>${esc(c ? c.name : s.classId)}</td>
                    <td class="num">${Number(s.base).toFixed(1)}</td>
                    <td class="num">${Number(s.personal).toFixed(1)}</td>
                    <td class="num">${Number(s.zodiac).toFixed(1)}</td>
                    <td class="num">${Number(s.total).toFixed(1)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            <div class="history-actions">
              <button class="btn btn--primary btn--sm" data-act="view" type="button">打开完整结果页</button>
              <button class="btn btn--ghost btn--sm" data-act="export" type="button">导出本条（JSON）</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  bindGo(main);

  $$('.history-item', main).forEach((item) => {
    const id = item.dataset.id;
    const detail = $('.history-detail', item);
    $$('[data-act="view"]', item).forEach((btn) => btn.addEventListener('click', () => {
      const rec = loadLedger().find((x) => x.id === id);
      if (!rec) { toast('记录不存在', 'error'); return; }
      if (!rec.seed && !(rec.sampleIds && rec.sampleIds.length)) {
        toast('这是旧版（v1）记录，引擎升级后无法在本地重现；可先导出留档', 'error');
        return;
      }
      try {
        const sample = (rec.sampleIds && rec.sampleIds.length === SAMPLE_RULES.total)
          ? statementsByIds(rec.sampleIds)
          : sampleStatements(rec.mode, rec.seed >>> 0, rec.sign || null);
        if (!sample || sample.length !== SAMPLE_RULES.total) throw new Error('题组信息缺失');
        const result = computeResult(sample, rec.answers, rec.mode, rec.sign || null);
        state.current = { result, record: rec, source: 'history', sample, seed: rec.seed >>> 0 };
        go('#/result');
      } catch (err) {
        toast(`无法还原该记录：${err.message}`, 'error');
      }
    }));
    $$('[data-act="export"]', item).forEach((btn) => btn.addEventListener('click', () => {
      const rec = loadLedger().find((x) => x.id === id);
      if (!rec) return;
      download(`星命罗盘记录-${rec.id}.json`, JSON.stringify({ app: '艾泽拉斯星命罗盘', exportedAt: new Date().toISOString(), record: rec }, null, 2));
      toast('已导出该条记录');
    }));
    $$('[data-act="delete"]', item).forEach((btn) => btn.addEventListener('click', async () => {
      const ok = await confirmModal({ title: '删除记录', body: '删除后无法恢复，确定删除这条测试记录吗？', confirmText: '删除', danger: true });
      if (!ok) return;
      removeRecord(id);
      toast('记录已删除');
      renderHistory(main);
    }));
    const summaryToggle = () => { detail.hidden = !detail.hidden; };
    $('.history-head', item).addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      summaryToggle();
    });
  });

  $('#exportAll', main).addEventListener('click', () => {
    download(`星命罗盘-全部记录-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({
      app: '艾泽拉斯星命罗盘', exportedAt: new Date().toISOString(), count: records.length, records,
    }, null, 2));
    toast(`已导出 ${records.length} 条记录`);
  });

  $('#exportCsv', main).addEventListener('click', () => {
    const header = '完成时间,模式,选择星座,主职业,副职业,星座,主职业总分,副职业总分';
    const lines = records.map((r) => {
      const mc = classById(r.main);
      const sc = classById(r.secondary);
      const zp = zodiacById(r.zodiacPrimary);
      const zs = r.sign ? zodiacById(r.sign) : null;
      const modeName = MODES[r.mode] ? MODES[r.mode].name : r.mode;
      const mainScore = r.scores && r.scores[0] ? r.scores.find((s) => s.classId === r.main) : null;
      const subScore = r.scores ? r.scores.find((s) => s.classId === r.secondary) : null;
      return [
        fmtTime(r.finishedAt), modeName, zs ? zs.name : '',
        mc ? mc.name : r.main, sc ? sc.name : r.secondary,
        zp ? zp.name : '', mainScore ? mainScore.total.toFixed(1) : '', subScore ? subScore.total.toFixed(1) : '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    // 带 BOM，保证 Excel 打开中文不乱码
    download(`星命罗盘-记录汇总-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${header}\n${lines.join('\n')}`, 'text/csv');
    toast('已导出 CSV 汇总');
  });

  $('#clearAll', main).addEventListener('click', async () => {
    const ok = await confirmModal({ title: '清空全部记录', body: `将删除本机保存的全部 ${records.length} 条测试记录，此操作不可恢复。`, confirmText: '全部清空', danger: true });
    if (!ok) return;
    clearLedger();
    toast('已清空全部记录');
    renderHistory(main);
  });
}

/* ================= 关于页 ================= */
function renderAbout(main) {
  main.innerHTML = `
    <div style="text-align:center;margin-bottom:22px">
      <div class="section-kicker">方法与边界</div>
      <h1 class="gold-text" style="font-size:clamp(26px,4.6vw,38px);letter-spacing:.14em">关于这份测试</h1>
      <p style="color:var(--ink-dim);max-width:620px;margin:14px auto 0">它认真，但请把它当娱乐；它像命运，但答案是你自己写进去的。</p>
    </div>

    <div class="about-grid">
      <section class="panel about-card">
        <h3>${uiIcon('book')} 计分方法</h3>
        <ol class="method-steps">
          <li><span class="step-no">1</span><div><strong style="color:var(--gold-pale)">星座锚定 + 题组抽样</strong>：先在开始页点选你的星座，再从 96 条题库按星座加权抽取 18 条陈述；五档赞同度作答——赞同按权重加分、反对按权重减分，实时累计。</div></li>
          <li><span class="step-no">2</span><div><strong style="color:var(--gold-pale)">维度契合</strong>：你的性格六维向量与 13 个职业的性格模板做标准化余弦比对，考察"形状"而非单项峰值。</div></li>
          <li><span class="step-no">3</span><div><strong style="color:var(--gold-pale)">星辰锚定</strong>：你选择的星座与答题轨迹推演出的共鸣星座两套星图加权合并，再作为第二轮权重修正到职业得分上。</div></li>
          <li><span class="step-no">4</span><div><strong style="color:var(--gold-pale)">主副职业</strong>：全池最高分为主职业；副职业在次高分中优先选择与主职业"定位互补"的那一个（含 +3 互补加成）。</div></li>
        </ol>
        <p style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--gold-line-soft)">总分 = 35% 职业背景 + 45% 性格契合 + 20% 星辰修正。整个算法是确定性的：同一题组与作答，无论何时重算，结果完全一致；分享链接会同时带上题组与作答。</p>
      </section>

      <section class="panel about-card">
        <h3>${uiIcon('star')} 为什么是"星座"</h3>
        <p>星座在这里不是预言，而是一种气质语言：黄道十二星座各自的气质关键词（火象的冲劲、水象的共情、风象的机变、土象的坚韧）恰好能与艾泽拉斯的职业精神互相映照。</p>
        <p>开始测试时，你可以<strong style="color:var(--gold-pale)">直接点选自己的星座</strong>——题组会围绕它的性格气质加权抽取；同时，答题轨迹会再推演出一套"共鸣星图"，两套星图相互印证后给出最终判断。</p>
        <p>本测试<strong style="color:var(--gold-pale)">不采集你的出生日期</strong>等敏感信息；选择的星座仅用于本次推演，解读口径是"与你契合的星辰能量"。</p>
        <p>所有解读仅供娱乐与自我探索参考，不构成任何现实建议。</p>
      </section>

      <section class="panel about-card">
        <h3>${uiIcon('shield')} 双模式职业池</h3>
        <ul>
          <li><strong style="color:var(--gold-pale)">经典怀旧服</strong>：锁定经典旧世的九大职业——战士、圣骑士、猎人、潜行者、牧师、萨满祭司、法师、术士、德鲁伊。</li>
          <li><strong style="color:var(--gold-pale)">正式服</strong>：开放全部 13 职业，包含死亡骑士、恶魔猎手、武僧与唤魔师。</li>
          <li>切换模式时，职业池与计算范围都会随之切换，因此同一份作答在两种模式下可能得到不同的组合。</li>
        </ul>
      </section>

      <section class="panel about-card">
        <h3>${uiIcon('history')} 数据与隐私</h3>
        <ul>
          <li>作答进度与历史记录全部保存在<strong style="color:var(--gold-pale)">你本机的浏览器</strong>（localStorage），不上传任何服务器。</li>
          <li>分享链接把模式、星座、题组种子与 18 道作答编码进 URL，不依赖服务端即可完整还原结果。</li>
          <li>历史记录支持单条导出与整表导出（JSON / CSV），可随时清空。</li>
          <li>本页面为粉丝向同人作品，与 Blizzard Entertainment 无关联；未使用任何官方美术、字体素材。</li>
        </ul>
      </section>
    </div>

    <div class="btn-row" style="justify-content:center;margin-top:30px">
      <button class="btn btn--primary" data-go="home" type="button">${uiIcon('spark')} 去测我的罗盘</button>
    </div>
  `;
  bindGo(main);
}

function renderNotFound(main) {
  main.innerHTML = `
    <div class="panel empty-state">
      ${uiIcon('close', 46)}
      <h2 class="gold-text" style="font-size:24px">页面不存在</h2>
      <p>你要找的页面似乎掉进了扭曲虚空。</p>
      <div class="btn-row" style="justify-content:center;margin-top:16px">
        <button class="btn btn--primary" data-go="home" type="button">回到首页</button>
      </div>
    </div>`;
  bindGo(main);
}

/* ================= 全局键盘 ================= */
document.addEventListener('keydown', (e) => {
  if (state.route !== 'quiz') return;
  if ($('.modal-mask')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (/^[1-5]$/.test(e.key)) {
    e.preventDefault();
    selectOption(Number(e.key) - 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    goBack();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const opts = $$('.opt');
    const idx = opts.indexOf(document.activeElement);
    if (idx !== -1) {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
      opts[next].focus();
    }
  }
});

/* ================= 导航 ================= */
function initNav() {
  $$('.nav-link').forEach((btn) => btn.addEventListener('click', () => {
    go(`#/${btn.dataset.nav}`);
    $('.site-nav')?.classList.remove('is-open');
    $('#navBurger')?.setAttribute('aria-expanded', 'false');
  }));
  const burger = $('#navBurger');
  burger.addEventListener('click', () => {
    const open = $('.site-nav').classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  const brand = $('#brandHome');
  brand.addEventListener('click', () => go('#/home'));
  brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('#/home'); } });
}

/* ================= 启动 ================= */
function boot() {
  initNav();
  restoreSession();
  window.addEventListener('hashchange', route);
  if (storageIsMemory()) {
    setTimeout(() => toast('当前浏览器不支持本地存储，本次记录仅保存在内存中', 'error'), 800);
  }
  route();
}

boot();

/* E2E 驱动挂载（仅当 URL 带 ?e2e= 时加载，不影响正常使用） */
if (new URLSearchParams(location.search).has('e2e')) {
  import('./e2e.js').then((m) => m.runE2E()).catch((err) => console.error('E2E driver failed:', err));
}
