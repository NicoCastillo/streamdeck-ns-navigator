// Scrapes related-record links from the current NetSuite transaction header
// and sends them to background for display on the Stream Deck.

const BRIDGE_PORT = 9999;
const SCAN_DELAY_MS = 800;

// Containers whose links we never want
const EXCLUDED_SELECTORS = [
  '.ns-breadcrumb',      // breadcrumb nav
  '.uir-list-headerrow', // column header rows inside sublists (not data rows)
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

function generateImage(fieldLabel, recordName, amount) {
  const SIZE = 144;
  const MAX_LINES = 2;
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

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxW = 128;

  if (fieldLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
    ctx.fillText(truncate(ctx, fieldLabel, 136), SIZE / 2, 30);
  }

  const hasAmount = amount && amount.length > 0;
  const zoneTop = fieldLabel ? 48 : 0;
  const zoneBot = hasAmount ? SIZE - 46 : SIZE;

  let fontSize = 22;
  let lines;
  do {
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    lines = wrapText(ctx, recordName, maxW);
    if (lines.length <= MAX_LINES) break;
    fontSize -= 2;
  } while (fontSize >= 16);

  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES);
    lines[MAX_LINES - 1] = truncate(ctx, lines[MAX_LINES - 1], maxW);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  const lineH = fontSize + 6;
  const blockH = lines.length * lineH;
  const nameTop = zoneTop + (zoneBot - zoneTop - blockH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, SIZE / 2, nameTop + i * lineH + lineH / 2));

  if (hasAmount) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(truncate(ctx, amount, 136), SIZE / 2, SIZE - 32);
  }

  return canvas.toDataURL('image/png');
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(ctx, text, maxW) {
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

// Only these URL path segments are meaningful related records
const ALLOWED_PATHS = [
  '/app/accounting/transactions/',
  '/app/common/entity/',
  '/app/accounting/project/',
  '/app/accounting/othertrans/',
];

function isAllowedHref(href) {
  return ALLOWED_PATHS.some(p => href.includes(p));
}

function scrapeLinks() {
  const currentId = getRecordId();
  const excluded = buildExcludedSet();
  const seen = new Set();
  const results = [];

  document.querySelectorAll('a[href*=".nl"][href*="id="]').forEach(a => {
    if (isInsideExcluded(a, excluded)) return;

    let href;
    try { href = new URL(a.href, location.origin).href; } catch { return; }

    if (!isAllowedHref(href)) return;

    const urlId = new URLSearchParams(new URL(href).search).get('id');
    if (!urlId || urlId === currentId) return;

    const canonical = href.split('?')[0] + '?id=' + urlId;
    if (seen.has(canonical)) return;
    seen.add(canonical);

    const row = a.closest('tr');
    const cells = row ? [...row.querySelectorAll('td')] : [];

    let recordName = '';
    let fieldLabel = '';

    let amount = '';

    if (row?.id?.startsWith('linksrow')) {
      const type = cells[1]?.textContent.trim() ?? '';
      const number = (cells[2]?.textContent.trim() ?? '').replace(/(\D+)0+(\d+)$/, '$1$2');
      recordName = number || a.textContent.trim();
      fieldLabel = type;
      for (let c = cells.length - 1; c >= 3; c--) {
        const t = cells[c]?.textContent.trim() ?? '';
        if (/^[\d,]+\.\d{2}$/.test(t) && t !== '0.00') { amount = '$' + t; break; }
      }
    } else {
      recordName = a.textContent.trim();
      const wrapper = a.closest('.uir-field-wrapper');
      const rawLabel = wrapper?.dataset.nspsLabel ?? '';
      fieldLabel = (rawLabel && rawLabel !== recordName && rawLabel.length < 40)
        ? rawLabel
        : '';
    }

    if (!recordName) return;

    results.push({
      label: fieldLabel ? `${fieldLabel}: ${recordName}` : recordName,
      url: href,
      image: generateImage(fieldLabel, recordName, amount),
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
    console.log('[NS Navigator] scraped links:', links.map(l => l.label));
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
bodyObserver.observe(bodyArea, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'rescan') triggerScan();
});
