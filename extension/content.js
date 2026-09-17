// Scrapes related-record links from the current NetSuite transaction header
// and sends them to background for display on the Stream Deck.

const BRIDGE_PORT = 9999;
const SCAN_DELAY_MS = 800;

// Containers whose links we never want (sublists, nav bar, breadcrumbs)
const EXCLUDED_SELECTORS = [
  '#div__bodytab',       // sublist tabs
  '.ns-breadcrumb',      // breadcrumb nav
  '#ns-header',          // top navigation bar
  '.uir-list-headerrow', // column headers inside sublists
];

function getRecordType() {
  const match = window.location.pathname.match(/\/app\/[^/]+\/[^/]+\/([^.]+)\.nl/);
  return match ? match[1] : null;
}

function getRecordId() {
  return new URLSearchParams(window.location.search).get('id') || '';
}

let imgJump = null;

function loadImg(url) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

loadImg(chrome.runtime.getURL('btn-jump.png')).then(img => { imgJump = img; });

function generateImage(fieldLabel, recordName) {
  const SIZE = 144;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  if (imgJump) {
    ctx.drawImage(imgJump, 0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = '#1f6b3a';
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  // Field label (small, lighter)
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 2;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '18px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncate(ctx, fieldLabel, 128), SIZE / 2, SIZE / 2 - 22);

  // Record name (larger, white)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
  const lines = wrapText(ctx, recordName, 120, 28);
  const startY = SIZE / 2 + (fieldLabel ? 8 : 0) - ((lines.length - 1) * 28) / 2;
  lines.forEach((line, i) => ctx.fillText(line, SIZE / 2, startY + i * 28));

  return canvas.toDataURL('image/png');
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(ctx, text, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildExcludedSet() {
  const nodes = new Set();
  for (const sel of EXCLUDED_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => nodes.add(el));
  }
  return nodes;
}

function isInsideExcluded(el, excluded) {
  let node = el.parentElement;
  while (node) {
    if (excluded.has(node)) return true;
    node = node.parentElement;
  }
  return false;
}

function scrapeLinks() {
  const currentId = getRecordId();
  const excluded = buildExcludedSet();
  const seen = new Set();
  const results = [];

  document.querySelectorAll('a[href*=".nl?id="]').forEach(a => {
    if (isInsideExcluded(a, excluded)) return;

    let href;
    try { href = new URL(a.href, location.origin).href; } catch { return; }

    const urlId = new URLSearchParams(new URL(href).search).get('id');
    if (!urlId || urlId === currentId) return;
    if (seen.has(href)) return;
    seen.add(href);

    const recordName = a.textContent.trim();
    if (!recordName) return;

    // Walk up to find the nearest <tr> and pull the first cell as the field label
    const row = a.closest('tr');
    const firstCell = row ? [...row.querySelectorAll('td')][0] : null;
    const rawLabel = firstCell?.textContent.trim() ?? '';
    // Avoid using the record name itself or a cell that is just the link wrapper
    const fieldLabel = (rawLabel && rawLabel !== recordName && rawLabel.length < 40)
      ? rawLabel
      : '';

    results.push({
      label: fieldLabel ? `${fieldLabel}: ${recordName}` : recordName,
      url: href,
      image: generateImage(fieldLabel, recordName),
    });
  });

  return results;
}

function sendToBackground(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

let lastUrl = '';
let scanTimer = null;

function triggerScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    const recordType = getRecordType();
    if (!recordType) return;
    const links = scrapeLinks();
    sendToBackground({
      type: 'links',
      recordType,
      recordId: getRecordId(),
      links,
    });
  }, SCAN_DELAY_MS);
}

triggerScan();

const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    triggerScan();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

const bodyObserver = new MutationObserver(triggerScan);
const bodyArea = document.querySelector('#div__bodytab') || document.body;
bodyObserver.observe(bodyArea, { childList: true, subtree: false });
