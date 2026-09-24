/**
 * 本地存储层：进行中的会话 + 完成记录台账 + 异常兜底
 * ------------------------------------------------------------------
 * localStorage 不可用时（隐私模式等）自动降级为内存存储，功能不中断。
 * 读取时对损坏数据做防御：解析失败返回默认值，绝不让页面白屏。
 */

const NS = 'wow-class-quiz';
const K_SESSION = `${NS}:session:v1`;
const K_LEDGER = `${NS}:ledger:v1`;

function safeStorage() {
  try {
    const t = `${NS}:__test__`;
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    // 内存降级
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      __memory: true,
    };
  }
}

const storage = safeStorage();

function readJSON(key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const val = JSON.parse(raw);
    return val ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, val) {
  try {
    storage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

/* ---------- 进行中的会话 ---------- */
export function loadSession() {
  const s = readJSON(K_SESSION, null);
  if (!s || typeof s !== 'object') return null;
  if (!Array.isArray(s.answers) || !s.mode) return null;
  return s;
}

export function saveSession(session) {
  if (!session) {
    storage.removeItem(K_SESSION);
    return;
  }
  writeJSON(K_SESSION, { ...session, updatedAt: Date.now() });
}

export function clearSession() {
  storage.removeItem(K_SESSION);
}

/* ---------- 完成记录台账 ---------- */
export function loadLedger() {
  const arr = readJSON(K_LEDGER, []);
  if (!Array.isArray(arr)) return [];
  return arr.filter((r) => r && typeof r === 'object' && r.id && r.main && r.secondary);
}

export function appendRecord(record) {
  const arr = loadLedger();
  arr.unshift(record);
  // 上限 100 条，防止无限增长
  const capped = arr.slice(0, 100);
  writeJSON(K_LEDGER, capped);
  return capped.length;
}

export function removeRecord(id) {
  const arr = loadLedger().filter((r) => r.id !== id);
  writeJSON(K_LEDGER, arr);
  return arr;
}

export function clearLedger() {
  writeJSON(K_LEDGER, []);
}

export function storageIsMemory() {
  return !!storage.__memory;
}
