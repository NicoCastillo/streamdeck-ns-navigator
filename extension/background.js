// Bridges the content script and the Stream Deck plugin via WebSocket.

const PLUGIN_WS_URL = 'ws://127.0.0.1:9999';
const RECONNECT_DELAY_MS = 3000;

let ws = null;
let activeTabId = null;

function connect() {
  ws = new WebSocket(PLUGIN_WS_URL);

  ws.onopen = () => {
    console.log('[NS Navigator] connected to plugin');
    // Ask the active NS tab to re-scan now that we have a WS connection
    if (activeTabId != null) {
      chrome.tabs.sendMessage(activeTabId, { type: 'rescan' }).catch(() => {});
    }
  };
  ws.onclose = () => {
    console.log('[NS Navigator] disconnected, retrying...');
    setTimeout(connect, RECONNECT_DELAY_MS);
  };
  ws.onerror = () => ws.close();

  // Plugin → navigate the active tab
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'navigate' && activeTabId != null) {
        chrome.tabs.create({ url: msg.url, openerTabId: activeTabId });
      }
    } catch {}
  };
}

connect();

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url?.includes('netsuite.com/app/')) activeTabId = tabId;
  });
});

// Forward link payloads from content script to plugin
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'links') {
    activeTabId = sender.tab?.id ?? activeTabId;
    console.log('[NS Navigator] received links from content script:', msg.links.length, 'ws state:', ws?.readyState);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      console.log('[NS Navigator] forwarded to plugin');
    } else {
      console.warn('[NS Navigator] WS not open, message dropped');
    }
  }
});
