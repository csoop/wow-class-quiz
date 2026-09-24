#!/usr/bin/env bash
# ============================================================
# 无头 Chrome 全流程 E2E 运行器（零依赖）
# 用法：
#   bash scripts/e2e.sh                      # 桌面 1440x900
#   SIZE=390,844 bash scripts/e2e.sh /tmp/mobile.html   # 手机视口
# 前提：本地服务器已在 5173 端口运行（脚本自动检测，必要时自启并在退出时关闭）
# 判定：报告 ok=true 退出码 0；否则打印失败项并退出 1
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"
BASE="http://127.0.0.1:${PORT}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="${1:-/tmp/wow-quiz-e2e-dom.html}"
SIZE="${SIZE:-1440,900}"

if ! curl -s -o /dev/null "${BASE}/"; then
  echo "启动本地服务器（端口 ${PORT}）…"
  node scripts/serve.mjs "${PORT}" > /tmp/wow-quiz-serve-e2e.log 2>&1 &
  SERVE_PID=$!
  trap 'kill ${SERVE_PID} 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "${BASE}/" && break
    sleep 0.3
  done
fi

echo "E2E 运行中（视口 ${SIZE}，输出 ${OUT}）…"
"${CHROME}" --headless --disable-gpu --hide-scrollbars \
  --window-size="${SIZE}" \
  --virtual-time-budget=90000 \
  --dump-dom "${BASE}/?e2e=1&seed=2718281828#/home" > "${OUT}" 2>/dev/null

node - "${OUT}" <<'NODE'
const fs = require('fs');
const file = process.argv[2] || '/tmp/wow-quiz-e2e-dom.html';
const raw = fs.readFileSync(file, 'utf8');
const m = raw.match(/<pre id="e2e-report"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('✘ 未在页面中找到 E2E 报告（可能运行超时或被中断）');
  process.exit(2);
}
const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&amp;/g, '&');
let report;
try {
  report = JSON.parse(unesc(m[1]));
} catch (e) {
  console.error('✘ E2E 报告解析失败：', e.message);
  process.exit(2);
}
const s = report.summary || {};
console.log(`E2E ${report.ok ? 'PASS' : 'FAIL'} — 共 ${s.total} 项，通过 ${s.passed}，失败 ${s.failed}，控制台错误 ${s.consoleErrors}`);
(report.checks || []).filter((c) => !c.pass).forEach((c) => console.log(`  ✘ ${c.name} — ${c.detail}`));
if (report.fatal) console.log('FATAL: ' + String(report.fatal).split('\n')[0]);
process.exit(report.ok ? 0 : 1);
NODE
status=$?
exit $status
