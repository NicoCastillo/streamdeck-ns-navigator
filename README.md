# streamdeck-ns-navigator

Stream Deck plugin that shows one-press jump keys for every related record on the NetSuite transaction you're viewing.

Navigate to an Invoice and your deck populates with keys for the Customer, originating Sales Order, linked Payments, and anything else the record links to. Press a key — Chrome navigates there instantly.

## How it works

```
Chrome Extension (content.js)
  → scans the transaction header for links to other NS records
  → sends list to background.js via chrome.runtime.sendMessage

Chrome Extension (background.js)
  → maintains WebSocket to ws://127.0.0.1:9999
  → forwards link lists to Stream Deck plugin
  → on navigate command: calls chrome.tabs.update with the target URL

Stream Deck Plugin (Node.js)
  → hosts WS server on port 9999
  → on new link list: distributes links to "NS Jump Slot" keys (left→right, top→bottom)
  → on key press: sends navigate command to Chrome extension
```

Each key shows the field label (e.g. "Customer") and the linked record name (e.g. "Acme Corp"). Empty slots go dark.

## Setup

### 1. Stream Deck Plugin

Requires Node.js 20+ and Stream Deck 6.9+.

```bash
cd plugin
npm install
npm run build      # compiles src/ → com.nico.netsuite.navigator.sdPlugin/bin/
npm run link       # symlinks the .sdPlugin into ~/Library/Application Support/com.elgato.StreamDeck/Plugins/
```

Restart Stream Deck. A **NetSuite** category will appear with the **NS Jump Slot** action.

### 2. Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Grant permissions when prompted for `*.netsuite.com`

### 3. Configure your Stream Deck

Drag **NS Jump Slot** actions onto your deck — as many as the maximum number of related records you expect (4–6 is usually enough). They fill left-to-right, top-to-bottom. Empty slots go dark.

## Customizing

- **Exclude a record type**: filter by URL path in `extension/content.js` `scrapeLinks()`
- **Exclude sublist/nav areas**: add selectors to `EXCLUDED_SELECTORS` in `extension/content.js`
- **Slower accounts**: increase `SCAN_DELAY_MS` in `extension/content.js`
- **Port conflict**: change `9999` in `extension/content.js` and `plugin/src/plugin.ts`
- **Key image**: replace `extension/btn-jump.png` with your own 144×144 PNG
