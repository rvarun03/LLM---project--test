export const EXTENSION_MANIFEST_CONTENT = `{
  "manifest_version": 3,
  "name": "QA Recorder",
  "version": "1.0",
  "description": "Browser extension for QA recording actions",
  "permissions": [
    "activeTab",
    "alarms",
    "scripting",
    "storage",
    "tabs",
    "webNavigation"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["utils.js", "content.js"],
      "run_at": "document_start",
      "all_frames": true,
      "match_about_blank": true
    }
  ]
}
`;

export const EXTENSION_UTILS_JS_CONTENT = `/**
 * Utility functions for the QA Recorder extension
 */

function generateLocatorBundle(el) {
  if (!el) return { primary: { type: 'css', value: 'body', playwright: "page.locator('body')", clickedIndex: 0, matchCount: 1, isUnique: true, confidence: 1 }, alternatives: [] };

  const esc = value => String(value).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
  const cssEsc = value => window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  const add = (list, type, value, playwright, resolver, confidence) => {
    if (!value) return;
    let matches = [];
    try { matches = Array.from(resolver()); } catch (_) { return; }
    const clickedIndex = matches.indexOf(el);
    if (clickedIndex < 0 || matches.length === 0) return;
    const indexed = matches.length > 1 ? \`\${playwright}.nth(\${clickedIndex})\` : playwright;
    list.push({ type, value, playwright: indexed, clickedIndex, matchCount: matches.length, isUnique: matches.length === 1, confidence });
  };

  const candidates = [];
  const testAttrs = ['data-testid', 'data-test', 'test-id'];
  for (const attr of testAttrs) {
    const value = el.getAttribute(attr);
    add(candidates, attr === 'data-testid' ? 'data-testid' : 'data-test', value,
      attr === 'data-testid' ? \`page.getByTestId('\${esc(value)}')\` : \`page.locator('[\${attr}="\${esc(value)}"]')\`,
      () => document.querySelectorAll(\`[\${attr}="\${cssEsc(value)}"]\`), 1);
  }
  if (el.id && !/^\\d+$/.test(el.id)) add(candidates, 'id', \`#\${el.id}\`, \`page.locator('#\${esc(el.id)}')\`, () => document.querySelectorAll(\`#\${cssEsc(el.id)}\`), .99);
  const name = el.getAttribute('name');
  if (name) add(candidates, 'name', name, \`page.locator('[name="\${esc(name)}"]')\`, () => document.querySelectorAll(\`[name="\${cssEsc(name)}"]\`), .96);
  const aria = el.getAttribute('aria-label');
  if (aria) add(candidates, 'aria-label', aria, \`page.getByLabel('\${esc(aria)}', { exact: true })\`, () => Array.from(document.querySelectorAll('[aria-label]')).filter(n => n.getAttribute('aria-label') === aria), .94);

  const roleMap = {
    'BUTTON': 'button',
    'A': 'link',
    'INPUT': el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox',
    'TEXTAREA': 'textbox',
    'SELECT': 'combobox',
    'H1': 'heading', 'H2': 'heading', 'H3': 'heading', 'H4': 'heading', 'H5': 'heading', 'H6': 'heading',
  };
  const role = el.getAttribute('role') || roleMap[el.tagName];
  if (role) {
    const name = el.getAttribute('aria-label') || el.title || el.innerText?.trim().substring(0, 30);
    if (name) {
        const sanitizedName = name.replace(/\\s+/g, ' ').trim();
        add(candidates, 'role', \`\${role}[name="\${sanitizedName}"]\`, \`page.getByRole('\${role}', { name: '\${esc(sanitizedName)}', exact: true })\`, () => Array.from(document.querySelectorAll(role === 'button' ? 'button,[role="button"]' : role === 'link' ? 'a,[role="link"]' : \`[role="\${role}"],\${role === 'textbox' ? 'input,textarea' : role === 'combobox' ? 'select' : '.__never__'}\`)).filter(n => ((n.getAttribute('aria-label') || n.innerText || n.getAttribute('placeholder') || n.getAttribute('value') || '').replace(/\\s+/g, ' ').trim()) === sanitizedName), .92);
    }
  }

  const text = el.innerText?.trim();
  if (text && text.length > 0 && text.length < 40 && !text.includes('\\n')) {
    const sanitizedText = text.replace(/\\s+/g, ' ').trim();
    add(candidates, 'text', sanitizedText, \`page.getByText('\${esc(sanitizedText)}', { exact: true })\`, () => Array.from(document.querySelectorAll('*')).filter(n => n.children.length === 0 && (n.textContent || '').replace(/\\s+/g, ' ').trim() === sanitizedText), .75);
  }

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      add(candidates, 'label', ariaLabel, \`page.getByLabel('\${esc(ariaLabel)}', { exact: true })\`, () => Array.from(document.querySelectorAll('[aria-label]')).filter(n => n.getAttribute('aria-label') === ariaLabel), .9);
    }
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      const labelText = wrappingLabel.innerText
        ?.replace(el.value || '', '').trim();
      if (labelText && labelText.length > 0 && labelText.length < 50) {
        const forId = wrappingLabel.getAttribute('for');
        add(candidates, 'label', labelText, \`page.getByLabel('\${esc(labelText)}', { exact: true })\`, () => forId ? document.querySelectorAll(\`#\${cssEsc(forId)}\`) : wrappingLabel.querySelectorAll('input,textarea,select'), .9);
      }
    }
  }

  if (el.id) {
    const label = document.querySelector(\`label[for="\${el.id}"]\`);
    if (label && label.innerText.trim()) {
        const labelText = label.innerText.trim();
        add(candidates, 'label', labelText, \`page.getByLabel('\${esc(labelText)}', { exact: true })\`, () => document.querySelectorAll(\`#\${cssEsc(el.id)}\`), .9);
    }
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) add(candidates, 'placeholder', placeholder, \`page.getByPlaceholder('\${esc(placeholder)}', { exact: true })\`, () => Array.from(document.querySelectorAll('[placeholder]')).filter(n => n.getAttribute('placeholder') === placeholder), .88);

  for (const attr of Array.from(el.attributes || [])) {
    if (/^(data-(?!react|vue|angular)|title$)/.test(attr.name) && !testAttrs.includes(attr.name) && attr.value && attr.value.length < 80) {
      add(candidates, 'css', \`[\${attr.name}="\${attr.value}"]\`, \`page.locator('[\${attr.name}="\${esc(attr.value)}"]')\`, () => document.querySelectorAll(\`[\${attr.name}="\${cssEsc(attr.value)}"]\`), .82);
    }
  }

  const stableClasses = Array.from(el.classList || []).filter(c => /^[a-zA-Z][\\w-]*$/.test(c) && !/^(active|selected|hover|focus|disabled|ng-|css-|sc-)/i.test(c));
  for (const cls of stableClasses) add(candidates, 'css', \`.\${cls}\`, \`page.locator('.\${esc(cls)}')\`, () => document.querySelectorAll(\`.\${cssEsc(cls)}\`), .8);

  const getUniqueCss = (element) => {
    let path = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selector = element.nodeName.toLowerCase();
      if (element.id && !/^\\d/.test(element.id)) {
        selector = '#' + element.id;
        path.unshift(selector);
        break;
      } else {
        let sibling = element;
        let nth = 1;
        while (sibling = sibling.previousElementSibling) {
          if (sibling.nodeName.toLowerCase() == selector) nth++;
        }
        if (nth != 1) selector += ":nth-of-type("+nth+")";
      }
      path.unshift(selector);
      
      const parent = element.parentNode || (element.getRootNode && element.getRootNode().host);
      element = parent;
    }
    return path.join(" > ");
  };

  const css = getUniqueCss(el);
  add(candidates, 'css', css, \`page.locator('\${esc(css)}')\`, () => document.querySelectorAll(css), .65);
  candidates.sort((a, b) => Number(b.isUnique && b.confidence >= .8) - Number(a.isUnique && a.confidence >= .8) || b.confidence - a.confidence);
  const primary = candidates[0];
  return { primary, alternatives: candidates.slice(1) };
}

function generateSelector(el) { return generateLocatorBundle(el).primary; }

function getElementInfo(el) {
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const roleMap = {
    'BUTTON': 'button',
    'A': 'link',
    'INPUT': el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox',
    'TEXTAREA': 'textbox',
    'SELECT': 'combobox',
  };
  const role = el.getAttribute('role') || roleMap[el.tagName] || el.tagName.toLowerCase();
  
  const locator = generateLocatorBundle(el);
  const locatorInfo = locator.primary;

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id,
    name: el.name,
    role: role,
    text: el.innerText?.trim().substring(0, 100),
    placeholder: el.getAttribute('placeholder'),
    value: el.value,
    type: el.type,
    selector: locatorInfo.value,
    locator,
    elementSnapshot: {
      tagName: el.tagName.toLowerCase(), id: el.id || '', className: el.className || '', name: el.getAttribute('name') || '',
      role, ariaLabel: el.getAttribute('aria-label') || '', textContent: (el.textContent || '').trim().substring(0, 500),
      placeholder: el.getAttribute('placeholder') || '', title: el.getAttribute('title') || '', href: el.getAttribute('href') || '',
      dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('test-id') || '',
      outerHTML: (el.outerHTML || '').substring(0, 2000), cssSelector: locatorInfo.type === 'css' ? locatorInfo.value : ''
    },
    rect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  };
}

window.QA_RECORDER_UTILS = {
  generateSelector,
  getElementInfo
};
`;

export const EXTENSION_BACKGROUND_CONTENT = `/**
 * QA Recorder - Background Service Worker
 */

const DEFAULT_BACKEND_URL = null;

function deriveHttpUrl(wsUrl) {
  try {
    const parsed = new URL(wsUrl);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return \`\${protocol}//\${parsed.host}\`;
  } catch (e) {
    return null;
  }
}

let socket = null;
let isRecording = false;
let currentSessionId = null;
let backendUrl = DEFAULT_BACKEND_URL;
let httpUrl = deriveHttpUrl(DEFAULT_BACKEND_URL);
let reconnectTimer = null;
let isConnecting = false;
let hasLoggedUnconfigured = false;
const pendingStepQueue = [];
let lastRecordedNavigation = { url: '', time: 0 };

let transportMode = 'backend';
let appTabId = null;

function isValidWebSocketUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch (error) {
    return false;
  }
}

function isStaleLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch (e) {
    return false;
  }
}

chrome.storage.local.get(
  ['backendUrl', 'httpUrl', 'isRecording', 'currentSessionId', 'transportMode', 'appTabId'],
  (result) => {
    transportMode = result.transportMode === 'direct' ? 'direct' : 'backend';
    appTabId = typeof result.appTabId === 'number' ? result.appTabId : null;
    if (
      result.backendUrl &&
      isValidWebSocketUrl(result.backendUrl) &&
      !isStaleLocalhostUrl(result.backendUrl)
    ) {
      backendUrl = result.backendUrl;
      httpUrl = result.httpUrl || deriveHttpUrl(backendUrl);
    } else {
      backendUrl = DEFAULT_BACKEND_URL;
      httpUrl = null;
      chrome.storage.local.remove(['backendUrl', 'httpUrl']);
    }

    isRecording = Boolean(result.isRecording);
    currentSessionId = result.currentSessionId || null;

    console.log('[QA Recorder BG] Initialized with state:', {
      backendUrl,
      httpUrl,
      isRecording,
      currentSessionId,
      transportMode
    });

    connectSocket();
  }
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.isRecording !== undefined) {
      isRecording = Boolean(changes.isRecording.newValue);
    }
    if (changes.currentSessionId !== undefined) {
      currentSessionId = changes.currentSessionId.newValue || null;
    }
    if (changes.backendUrl !== undefined && changes.backendUrl.newValue) {
      backendUrl = changes.backendUrl.newValue;
      httpUrl = deriveHttpUrl(backendUrl);
    }
    if (changes.httpUrl !== undefined && changes.httpUrl.newValue) {
      httpUrl = changes.httpUrl.newValue;
    }
    if (changes.transportMode !== undefined && changes.transportMode.newValue) {
      transportMode = changes.transportMode.newValue === 'direct' ? 'direct' : 'backend';
    }
    if (changes.appTabId !== undefined) {
      appTabId = typeof changes.appTabId.newValue === 'number' ? changes.appTabId.newValue : null;
    }
  }
});

function broadcastRecordingStateToTabs(recording, sessionId) {
  try {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      for (const tab of tabs) {
        if (
          tab.id &&
          tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('devtools://') &&
          !tab.url.startsWith('chrome-extension://')
        ) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STATE',
            isRecording: recording,
            sessionId: sessionId
          }).catch(() => {});
        }
      }
    });
  } catch (e) {
    console.warn('[QA Recorder BG] Error broadcasting state to tabs:', e);
  }
}

function connectSocket() {
  if (transportMode === 'direct') return;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (!backendUrl) {
    if (!hasLoggedUnconfigured) {
      hasLoggedUnconfigured = true;
      console.log('[QA Recorder BG] No backend configured yet.');
    }
    return;
  }
  hasLoggedUnconfigured = false;

  if (!isValidWebSocketUrl(backendUrl)) {
    console.error('[QA Recorder BG] Invalid backend URL:', backendUrl);
    return;
  }

  console.log('[QA Recorder BG] Connecting to recorder backend:', backendUrl);
  isConnecting = true;

  try {
    socket = new WebSocket(backendUrl);
  } catch (error) {
    console.error('[QA Recorder BG] Failed to create WebSocket:', error);
    isConnecting = false;
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    isConnecting = false;
    console.log('[QA Recorder BG] Connected to recorder backend:', backendUrl);

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (currentSessionId) {
      try {
        socket.send(
          JSON.stringify({
            type: 'RECORDER_CONNECTED',
            sessionId: currentSessionId
          })
        );
      } catch (err) {
        console.error('[QA Recorder BG] Failed to send connection handshake:', err);
      }
    }

    flushPendingSteps();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[QA Recorder BG] Received backend message:', data);

      if (data.type === 'START_RECORDING') {
        isRecording = true;
        currentSessionId = data.sessionId || \`session-\${Date.now()}\`;

        chrome.storage.local.set({
          isRecording: true,
          currentSessionId
        });

        console.log('[QA Recorder BG] Recording started:', currentSessionId);
        broadcastRecordingStateToTabs(true, currentSessionId);
      } else if (data.type === 'STOP_RECORDING') {
        isRecording = false;
        currentSessionId = null;

        chrome.storage.local.set({
          isRecording: false,
          currentSessionId: null
        });

        console.log('[QA Recorder BG] Recording stopped');
        broadcastRecordingStateToTabs(false, null);
      }
    } catch (err) {
      console.error('[QA Recorder BG] Error processing backend message:', err);
    }
  };

  socket.onclose = (event) => {
    isConnecting = false;
    console.warn('[QA Recorder BG] WebSocket closed:', {
      code: event.code,
      reason: event.reason,
      backendUrl
    });
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.warn('[QA Recorder BG] WebSocket error, fallback to HTTP available:', err);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!backendUrl || transportMode === 'direct') return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, 3000);
}

function deliverStepToApp(payload) {
  if (appTabId === null) return;
  try {
    chrome.tabs
      .sendMessage(appTabId, { type: 'DELIVER_STEP', payload })
      .catch(() => {});
  } catch (e) {}
}

function sendStepToBackend(payload) {
  if (!payload.sessionId && currentSessionId) {
    payload.sessionId = currentSessionId;
  }

  deliverStepToApp(payload);

  if (transportMode === 'direct') {
    console.log('[QA Recorder BG] Step delivered directly to app tab:', payload.action, payload.url);
    return;
  }

  let sentViaWs = false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'STEP', payload }));
      console.log('[QA Recorder BG] Step sent via WebSocket:', payload.action, payload.url);
      sentViaWs = true;
    } catch (err) {
      console.warn('[QA Recorder BG] WebSocket send failed, falling back to HTTP:', err);
    }
  }

  if (!sentViaWs) {
    const targetHttp = httpUrl || deriveHttpUrl(backendUrl);
    if (!targetHttp) {
      console.warn('[QA Recorder BG] No backend configured; queueing step.');
      pendingStepQueue.push(payload);
      return;
    }
    const endpoint = \`\${targetHttp}/api/record-event\`;

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: payload.sessionId || currentSessionId,
        event: payload
      })
    })
      .then((res) => {
        if (!res.ok) throw new Error(\`HTTP status \${res.status}\`);
        return res.json();
      })
      .then((data) => {
        console.log('[QA Recorder BG] Step recorded successfully via HTTP fallback:', payload.action);
      })
      .catch((err) => {
        console.warn('[QA Recorder BG] HTTP fallback failed, queueing step:', err?.message || err);
        pendingStepQueue.push(payload);
        connectSocket();
      });
  }
}

function flushPendingSteps() {
  if (pendingStepQueue.length === 0) return;

  console.log(\`[QA Recorder BG] Flushing \${pendingStepQueue.length} queued steps...\`);
  const toFlush = [...pendingStepQueue];
  pendingStepQueue.length = 0;

  for (const payload of toFlush) {
    sendStepToBackend(payload);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'GET_RECORDING_STATE' || message.type === 'GET_BACKEND_STATUS') {
    sendResponse({
      backendUrl,
      httpUrl,
      transportMode,
      connected:
        transportMode === 'direct'
          ? true
          : Boolean(socket && socket.readyState === WebSocket.OPEN),
      isRecording,
      sessionId: currentSessionId
    });
    return true;
  }

  if (message.type === 'AUTO_CONFIGURE_BACKEND') {
    if (sender.tab && typeof sender.tab.id === 'number') {
      appTabId = sender.tab.id;
      chrome.storage.local.set({ appTabId });
    }
    const newWsUrl = message.backendUrl;
    const newHttpUrl = message.httpUrl || deriveHttpUrl(newWsUrl);

    if (newWsUrl && isValidWebSocketUrl(newWsUrl)) {
      const changed = newWsUrl !== backendUrl;
      backendUrl = newWsUrl;
      httpUrl = newHttpUrl;
      chrome.storage.local.set({ backendUrl, httpUrl });

      if (changed || !socket || socket.readyState !== WebSocket.OPEN) {
        if (socket) {
          try { socket.close(); } catch (_) {}
          socket = null;
        }
        connectSocket();
      }
    }

    sendResponse({
      success: true,
      backendUrl,
      httpUrl,
      isRecording,
      sessionId: currentSessionId
    });
    return true;
  }

  if (message.type === 'START_RECORDING') {
    isRecording = true;
    currentSessionId = message.sessionId || \`session-\${Date.now()}\`;

    if (sender.tab && typeof sender.tab.id === 'number') {
      appTabId = sender.tab.id;
    }

    if (message.transport === 'direct') {
      transportMode = 'direct';
      if (socket) {
        try { socket.close(); } catch (_) {}
        socket = null;
      }
    } else if (message.backendUrl && isValidWebSocketUrl(message.backendUrl)) {
      transportMode = 'backend';
      backendUrl = message.backendUrl;
      httpUrl = message.httpUrl || deriveHttpUrl(backendUrl);
    }

    chrome.storage.local.set({
      isRecording: true,
      currentSessionId,
      backendUrl,
      httpUrl,
      transportMode,
      appTabId
    });

    broadcastRecordingStateToTabs(true, currentSessionId);
    connectSocket();

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            type: 'RECORDER_CONNECTED',
            sessionId: currentSessionId
          })
        );
      } catch (_) {}
    }

    sendResponse({
      success: true,
      sessionId: currentSessionId,
      isRecording: true,
      transportMode
    });
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    isRecording = false;
    currentSessionId = null;

    chrome.storage.local.set({
      isRecording: false,
      currentSessionId: null
    });

    broadcastRecordingStateToTabs(false, null);

    sendResponse({ success: true, isRecording: false });
    return true;
  }

  if (message.type === 'STEP') {
    const incomingPayload = message.payload || {};
    const resolvedSessionId = incomingPayload.sessionId || currentSessionId;
    const tabId = sender.tab?.id;
    const pageId = incomingPayload.pageId || (tabId !== undefined && tabId !== null ? \`tab-\${tabId}\` : 'tab-1');
    const expectedUrl = incomingPayload.expectedUrl || incomingPayload.url || sender.tab?.url || '';
    let expectedOrigin = incomingPayload.expectedOrigin;
    if (!expectedOrigin && expectedUrl) {
      try { expectedOrigin = new URL(expectedUrl).origin; } catch (_) {}
    }

    const payload = {
      ...incomingPayload,
      sessionId: resolvedSessionId,
      tabId: tabId,
      pageId: pageId,
      expectedUrl: expectedUrl,
      expectedOrigin: expectedOrigin,
      tabTitle: sender.tab?.title,
      frameId: sender.frameId,
      recordedAt: Date.now()
    };

    sendStepToBackend(payload);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isRecording) return;
  if (tabId === appTabId) return;

  const tabUrl = tab.url || changeInfo.url;
  if (!tabUrl) return;

  if (
    tabUrl.startsWith('chrome://') ||
    tabUrl.startsWith('chrome-extension://') ||
    tabUrl.startsWith('devtools://') ||
    tabUrl.startsWith('about:blank')
  ) {
    return;
  }

  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      type: 'RECORDING_STATE',
      isRecording: true,
      sessionId: currentSessionId,
      tabId: tabId,
      pageId: \`tab-\${tabId}\`,
      url: tabUrl
    }).catch(() => {
      if (changeInfo.status === 'complete' && chrome.scripting) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['utils.js', 'content.js']
        }).catch(() => {});
      }
    });
  }

  if (changeInfo.url) {
    const now = Date.now();
    if (changeInfo.url === lastRecordedNavigation.url && now - lastRecordedNavigation.time < 1200) {
      return;
    }
    lastRecordedNavigation = { url: changeInfo.url, time: now };

    let expectedOrigin = undefined;
    try { expectedOrigin = new URL(changeInfo.url).origin; } catch (_) {}

    const payload = {
      action: 'navigate',
      url: changeInfo.url,
      expectedUrl: changeInfo.url,
      expectedOrigin,
      sessionId: currentSessionId,
      tabId,
      pageId: \`tab-\${tabId}\`,
      tabTitle: tab.title || '',
      timestamp: now
    };

    sendStepToBackend(payload);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!isRecording) return;
  if (tab.id === appTabId) return;

  const now = Date.now();
  const tabUrl = tab.url || tab.pendingUrl || '';
  let expectedOrigin = undefined;
  if (tabUrl && !tabUrl.startsWith('about:blank') && !tabUrl.startsWith('chrome://')) {
    try { expectedOrigin = new URL(tabUrl).origin; } catch (_) {}
  }

  const payload = {
    action: 'open_tab',
    url: tabUrl || 'about:blank',
    expectedUrl: (tabUrl && tabUrl !== 'about:blank') ? tabUrl : undefined,
    expectedOrigin,
    sessionId: currentSessionId,
    tabId: tab.id,
    pageId: \`tab-\${tab.id}\`,
    openerTabId: tab.openerTabId,
    tabTitle: tab.title || 'New Tab',
    timestamp: now
  };

  sendStepToBackend(payload);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isRecording) return;
  if (tabId === appTabId) return;

  const now = Date.now();
  const payload = {
    action: 'close_tab',
    sessionId: currentSessionId,
    tabId,
    pageId: \`tab-\${tabId}\`,
    timestamp: now
  };

  sendStepToBackend(payload);
});

if (typeof chrome !== 'undefined' && chrome.webNavigation) {
  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (!isRecording || details.frameId !== 0) return;
    if (details.tabId === appTabId) return;
    const url = details.url;
    if (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:blank')
    ) {
      return;
    }

    const now = Date.now();
    if (url === lastRecordedNavigation.url && now - lastRecordedNavigation.time < 1200) {
      return;
    }
    lastRecordedNavigation = { url, time: now };

    let expectedOrigin = undefined;
    try { expectedOrigin = new URL(url).origin; } catch (_) {}

    const payload = {
      action: 'navigate',
      navigationType: 'spa',
      url,
      expectedUrl: url,
      expectedOrigin,
      sessionId: currentSessionId,
      tabId: details.tabId,
      pageId: \`tab-\${details.tabId}\`,
      timestamp: now
    };

    sendStepToBackend(payload);
  });
}

chrome.alarms.create('qaRecorderKeepAlive', {
  periodInMinutes: 0.4
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'qaRecorderKeepAlive') {
    if (!backendUrl || transportMode === 'direct') return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectSocket();
    }
  }
});

console.log('[QA Recorder BG] Background service worker active and ready.');
`;

export const EXTENSION_CONTENT_JS_CONTENT = `/**
 * QA Recorder - Content Script
 */

(() => {
  if (window.__QA_RECORDER_INITIALIZED__) {
    return;
  }
  window.__QA_RECORDER_INITIALIZED__ = true;

  let isPageRecording = false;
  let currentSessionId = null;
  let currentTabId = null;
  let currentPageId = 'tab-1';
  let isStateResolved = false;
  const earlyEventBuffer = [];

  let inputDebounceTimer = null;
  let pendingInputStep = null;
  let lastHoverElement = null;
  let lastHoverTime = 0;
  let scrollTimer = null;
  let indicatorElement = null;

  function isExtensionContextValid() {
    try {
      return Boolean(
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id
      );
    } catch (error) {
      return false;
    }
  }

  function safeRuntimeSendMessage(message, callback, retryCount = 0) {
    if (!isExtensionContextValid()) {
      console.warn('[QA Recorder Content] Cannot send message: extension context invalid.');
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (
            retryCount < 3 &&
            (errMsg.includes('Receiving end does not exist') ||
             errMsg.includes('Could not establish connection') ||
             errMsg.includes('context invalidated'))
          ) {
            setTimeout(() => {
              safeRuntimeSendMessage(message, callback, retryCount + 1);
            }, 150 * (retryCount + 1));
            return;
          }
          return;
        }

        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (error) {
      console.warn('[QA Recorder Content] Exception sending message:', error);
    }
  }

  let isAutomatiQaPage = false;

  const pageProto = window.location.protocol;
  const wsProto = pageProto === 'https:' ? 'wss:' : 'ws:';
  const sameOriginBackendUrl =
    pageProto === 'http:' || pageProto === 'https:'
      ? \`\${wsProto}//\${window.location.host}/recorder\`
      : null;
  const sameOriginHttpUrl =
    pageProto === 'http:' || pageProto === 'https:' ? window.location.origin : null;

  function announceExtension() {
    isAutomatiQaPage = true;
    window.__QA_RECORDER_EXTENSION_ACTIVE__ = true;
    const detail = { version: '2.1', extensionId: (chrome.runtime && chrome.runtime.id) || null };
    window.postMessage({ type: 'AUTOMATIQA_EXTENSION_ACTIVE', ...detail }, '*');
    document.dispatchEvent(new CustomEvent('automatiqa:extension-active', { detail }));
    updateVisualIndicator(false, null);
  }

  function handleAppCommand(data, respond) {
    if (data.type === 'AUTOMATIQA_CHECK_EXTENSION') {
      announceExtension();
      return;
    }

    if (data.type === 'AUTOMATIQA_CONFIGURE_BACKEND') {
      isAutomatiQaPage = true;
      const wsUrl = data.backendUrl || sameOriginBackendUrl;
      if (wsUrl) {
        safeRuntimeSendMessage({
          type: 'AUTO_CONFIGURE_BACKEND',
          backendUrl: wsUrl,
          httpUrl: data.httpUrl || sameOriginHttpUrl
        }, (res) => {
          respond({
            type: 'AUTOMATIQA_EXTENSION_ACK',
            action: 'CONFIGURE_BACKEND',
            success: Boolean(res && res.success),
            backendUrl: res && res.backendUrl
          });
        });
      }
      announceExtension();
      return;
    }

    if (data.type === 'AUTOMATIQA_START_RECORDING') {
      isAutomatiQaPage = true;
      const transport = data.transport === 'direct' || !data.backendUrl ? 'direct' : 'backend';
      console.log('[QA Recorder Content] START_RECORDING from web app:', data.sessionId, transport);
      safeRuntimeSendMessage(
        {
          type: 'START_RECORDING',
          sessionId: data.sessionId,
          transport,
          backendUrl: transport === 'backend' ? data.backendUrl || sameOriginBackendUrl : null,
          httpUrl: transport === 'backend' ? data.httpUrl || sameOriginHttpUrl : null
        },
        (res) => {
          respond({
            type: 'AUTOMATIQA_EXTENSION_ACK',
            action: 'START_RECORDING',
            success: Boolean(res && res.success),
            sessionId: (res && res.sessionId) || data.sessionId,
            transport
          });
        }
      );
      return;
    }

    if (data.type === 'AUTOMATIQA_STOP_RECORDING') {
      console.log('[QA Recorder Content] STOP_RECORDING from web app');
      safeRuntimeSendMessage({ type: 'STOP_RECORDING', sessionId: data.sessionId }, (res) => {
        respond({ type: 'AUTOMATIQA_EXTENSION_ACK', action: 'STOP_RECORDING', success: true });
      });
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (!data.type.startsWith('AUTOMATIQA_')) return;
    if (event.source !== window) return;

    handleAppCommand(data, (payload) => window.postMessage(payload, '*'));
  });

  document.addEventListener('automatiqa:start-recording', (e) => {
    handleAppCommand({ type: 'AUTOMATIQA_START_RECORDING', ...(e.detail || {}) }, (payload) => {
      document.dispatchEvent(new CustomEvent('automatiqa:extension-ack', { detail: payload }));
    });
  });

  document.addEventListener('automatiqa:stop-recording', (e) => {
    handleAppCommand({ type: 'AUTOMATIQA_STOP_RECORDING', ...(e.detail || {}) }, (payload) => {
      document.dispatchEvent(new CustomEvent('automatiqa:extension-ack', { detail: payload }));
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAnnounceToKnownApp, { once: true });
  } else {
    maybeAnnounceToKnownApp();
  }

  function maybeAnnounceToKnownApp() {
    const looksLikeApp = Boolean(
      document.querySelector('meta[name="qa-recorder-backend-url"]') ||
      window.__AUTOMATIQA_APP__ ||
      (document.title || '').includes('AutomatiQA')
    );
    if (!looksLikeApp) return;

    if (sameOriginBackendUrl) {
      safeRuntimeSendMessage({
        type: 'AUTO_CONFIGURE_BACKEND',
        backendUrl: sameOriginBackendUrl,
        httpUrl: sameOriginHttpUrl
      });
    }
    announceExtension();
  }

  function updateVisualIndicator(recording, sessionId) {
    if (isAutomatiQaPage || window.top !== window.self) return;

    if (recording) {
      if (!indicatorElement) {
        indicatorElement = document.createElement('div');
        indicatorElement.id = '__qa_recorder_status_badge__';
        indicatorElement.innerHTML = \`
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:8px;animation:qaPulse 1.5s infinite;"></span>
          <span style="font-weight:600;font-size:12px;letter-spacing:0.3px;">QA Recording Active</span>
          <span style="font-size:10px;opacity:0.8;margin-left:6px;">(\${sessionId ? sessionId.substring(0, 6) : 'Ready'})</span>
        \`;
        indicatorElement.style.cssText = \`
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 2147483647;
          background: rgba(15, 23, 42, 0.92);
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 9999px;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1);
          pointer-events: none;
          display: flex;
          align-items: center;
          transition: opacity 0.2s ease;
        \`;

        if (!document.getElementById('__qa_pulse_style__')) {
          const style = document.createElement('style');
          style.id = '__qa_pulse_style__';
          style.textContent = \`
            @keyframes qaPulse {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.3; transform: scale(0.85); }
              100% { opacity: 1; transform: scale(1); }
            }
          \`;
          document.head.appendChild(style);
        }

        document.body ? document.body.appendChild(indicatorElement) : document.documentElement.appendChild(indicatorElement);
      }
    } else {
      if (indicatorElement) {
        indicatorElement.remove();
        indicatorElement = null;
      }
    }
  }

  function updateRecordingState(recording, sessionId, tabId, pageId) {
    isPageRecording = Boolean(recording);
    if (sessionId) {
      currentSessionId = sessionId;
    }
    if (tabId !== undefined && tabId !== null) {
      currentTabId = tabId;
    }
    if (pageId) {
      currentPageId = pageId;
    } else if (currentTabId !== null) {
      currentPageId = \`tab-\${currentTabId}\`;
    }
    isStateResolved = true;

    updateVisualIndicator(isPageRecording, currentSessionId);

    if (isPageRecording && earlyEventBuffer.length > 0) {
      while (earlyEventBuffer.length > 0) {
        const bufferedStep = earlyEventBuffer.shift();
        if (!bufferedStep.sessionId && currentSessionId) {
          bufferedStep.sessionId = currentSessionId;
        }
        sendStep(bufferedStep);
      }
    } else if (!isPageRecording) {
      earlyEventBuffer.length = 0;
    }
  }

  function refreshRecordingState() {
    if (!isExtensionContextValid()) return;

    try {
      chrome.storage.local.get(['isRecording', 'currentSessionId'], (result) => {
        if (!chrome.runtime.lastError && result) {
          if (result.isRecording !== undefined) {
            updateRecordingState(result.isRecording, result.currentSessionId);
          }
        }
      });
    } catch (e) {}

    safeRuntimeSendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
      if (response && response.isRecording !== undefined) {
        updateRecordingState(response.isRecording, response.sessionId);
      }
    });
  }

  refreshRecordingState();

  if (isExtensionContextValid()) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          if (changes.isRecording !== undefined || changes.currentSessionId !== undefined) {
            const nextRecording = changes.isRecording !== undefined ? changes.isRecording.newValue : isPageRecording;
            const nextSession = changes.currentSessionId !== undefined ? changes.currentSessionId.newValue : currentSessionId;
            updateRecordingState(nextRecording, nextSession);
          }
        }
      });
    } catch (e) {}
  }

  if (isExtensionContextValid()) {
    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.type === 'START_RECORDING') {
          updateRecordingState(true, message.sessionId, message.tabId, message.pageId);
        } else if (message.type === 'STOP_RECORDING') {
          updateRecordingState(false, null, null, null);
        } else if (message.type === 'RECORDING_STATE') {
          updateRecordingState(message.isRecording, message.sessionId, message.tabId, message.pageId);
        } else if (message.type === 'DELIVER_STEP') {
          if (!isAutomatiQaPage) return;
          window.postMessage(
            { type: 'AUTOMATIQA_RECORDED_STEP', step: message.payload, sessionId: message.payload?.sessionId },
            '*'
          );
          document.dispatchEvent(
            new CustomEvent('automatiqa:recorded-step', { detail: message.payload })
          );
        }
      });
    } catch (e) {}
  }

  window.addEventListener('focus', () => {
    refreshRecordingState();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshRecordingState();
    }
  });

  function getRealTarget(event) {
    if (event && typeof event.composedPath === 'function') {
      const path = event.composedPath();
      if (path && path.length > 0 && path[0] instanceof Element) {
        return path[0];
      }
    }
    return event?.target instanceof Element ? event.target : null;
  }

  function getInteractiveElement(target) {
    if (!target || !(target instanceof Element)) return null;
    if (target.closest('#__qa_recorder_status_badge__')) return null;

    const interactive = target.closest(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"], [role="option"], [role="menuitem"], [role="tab"], label, [tabindex]'
    );
    return interactive || target;
  }

  function isSensitiveElement(element) {
    if (!element || !(element instanceof Element)) return false;

    if (element instanceof HTMLInputElement) {
      const type = (element.type || '').toLowerCase();
      if (type === 'password') return true;
    }

    const attrs = [
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.getAttribute('autocomplete')
    ].filter(Boolean).join(' ').toLowerCase();

    return /password|passwd|pin|ssn|cvv|creditcard|secret|token|apikey|otp/i.test(attrs);
  }

  function getElementValue(element) {
    if (!element) return '';
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || '';
    }
    if (element instanceof HTMLSelectElement) {
      return element.value || (element.selectedOptions?.[0]?.textContent || '').trim();
    }
    return (element.innerText || element.textContent || '').trim();
  }

  function getElementInfo(element) {
    if (!element || !(element instanceof Element)) return null;

    try {
      if (window.QA_RECORDER_UTILS && typeof window.QA_RECORDER_UTILS.getElementInfo === 'function') {
        return window.QA_RECORDER_UTILS.getElementInfo(element);
      }
    } catch (e) {}

    const tagName = element.tagName.toLowerCase();
    const id = element.id ? \`#\${element.id}\` : '';
    const selector = id || tagName;
    return {
      tagName,
      id: element.id || '',
      name: element.getAttribute('name') || '',
      role: element.getAttribute('role') || tagName,
      text: (element.innerText || element.textContent || '').trim().substring(0, 100),
      placeholder: element.getAttribute('placeholder') || '',
      value: getElementValue(element),
      selector,
      locator: {
        primary: {
          type: 'css',
          value: selector,
          playwright: \`page.locator('\${selector}')\`
        },
        alternatives: []
      }
    };
  }

  function highlightElement(element) {
    if (!element || !(element instanceof Element)) return;
    try {
      const origOutline = element.style.outline;
      const origTransition = element.style.transition;
      element.style.outline = '2px solid #2563eb';
      element.style.transition = 'outline 0.15s ease';
      setTimeout(() => {
        try {
          element.style.outline = origOutline;
          element.style.transition = origTransition;
        } catch (_) {}
      }, 350);
    } catch (_) {}
  }

  function createStep(action, element, extra = {}) {
    const info = getElementInfo(element) || {};
    const rect = element?.getBoundingClientRect?.();
    const sensitive = isSensitiveElement(element);

    let val = '';
    if (!sensitive) {
      val = extra.value !== undefined ? extra.value : (info.value || getElementValue(element));
    } else {
      val = '[MASKED]';
    }

    let locator = info.locator;
    let selector = info.selector;
    if (!locator || !locator.primary) {
      const fallbackSel = selector || (element?.tagName ? element.tagName.toLowerCase() : 'body');
      locator = {
        primary: {
          type: 'css',
          value: fallbackSel,
          playwright: \`page.locator('\${fallbackSel}')\`
        },
        alternatives: []
      };
    }

    const isIframe = window !== window.top;
    const frameUrl = isIframe ? window.location.href : undefined;
    const pageId = currentPageId || (currentTabId !== null ? \`tab-\${currentTabId}\` : 'tab-1');

    return {
      action,
      url: window.location.href,
      pageUrl: window.location.href,
      expectedUrl: window.location.href,
      expectedOrigin: window.location.origin,
      pageId,
      tabId: currentTabId,
      frameUrl,
      scopedLocator: info.scopedLocator || locator.scopedLocator,
      title: document.title,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      selector: locator.primary.value || selector || '',
      locator,
      structuredLocator: info.structuredLocator || locator.structuredLocator || locator.primary?.structuredLocator,
      elementName:
        info.text ||
        info.placeholder ||
        info.name ||
        element?.getAttribute?.('aria-label') ||
        element?.getAttribute?.('name') ||
        element?.id ||
        info.tagName ||
        'Element',
      role: info.role || element?.getAttribute?.('role') || '',
      tagName: info.tagName || element?.tagName?.toLowerCase() || '',
      text: info.text || (element?.innerText || element?.textContent || '').trim().substring(0, 100),
      value: val,
      masked: sensitive,
      targetBox: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      coordinates: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null,
      ...extra
    };
  }

  function sendStep(step) {
    if (!isStateResolved) {
      earlyEventBuffer.push(step);
      refreshRecordingState();
      return;
    }

    if (!isPageRecording) {
      return;
    }

    if (isAutomatiQaPage) {
      return;
    }

    if (!isExtensionContextValid()) {
      return;
    }

    if (!step.sessionId && currentSessionId) {
      step.sessionId = currentSessionId;
    }

    safeRuntimeSendMessage({
      type: 'STEP',
      payload: step
    });
  }

  function flushPendingInput() {
    if (pendingInputStep) {
      clearTimeout(inputDebounceTimer);
      const step = pendingInputStep;
      pendingInputStep = null;
      sendStep(step);
    }
  }

  document.addEventListener(
    'click',
    (event) => {
      flushPendingInput();
      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      highlightElement(element);

      const step = createStep('click', element, {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        x: event.pageX,
        y: event.pageY,
        viewportX: event.clientX,
        viewportY: event.clientY,
        recordedViewport: { width: window.innerWidth, height: window.innerHeight }
      });

      sendStep(step);
    },
    true
  );

  document.addEventListener(
    'dblclick',
    (event) => {
      flushPendingInput();
      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      highlightElement(element);

      const step = createStep('dblclick', element, {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        x: event.pageX,
        y: event.pageY,
        viewportX: event.clientX,
        viewportY: event.clientY,
        recordedViewport: { width: window.innerWidth, height: window.innerHeight }
      });

      sendStep(step);
    },
    true
  );

  document.addEventListener(
    'mouseover',
    (event) => {
      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      const now = Date.now();
      if (element === lastHoverElement && now - lastHoverTime < 800) {
        return;
      }
      lastHoverElement = element;
      lastHoverTime = now;
    },
    true
  );

  document.addEventListener(
    'input',
    (event) => {
      const realTarget = getRealTarget(event);
      if (!realTarget) return;

      if (
        realTarget instanceof HTMLInputElement ||
        realTarget instanceof HTMLTextAreaElement ||
        realTarget.isContentEditable
      ) {
        clearTimeout(inputDebounceTimer);

        const isSensitive = isSensitiveElement(realTarget);
        const val = isSensitive ? '[MASKED]' : (realTarget.value || realTarget.textContent || '');

        pendingInputStep = createStep('fill', realTarget, {
          value: val,
          masked: isSensitive
        });

        inputDebounceTimer = setTimeout(() => {
          flushPendingInput();
        }, 500);
      }
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      const realTarget = getRealTarget(event);
      if (!realTarget) return;

      if (realTarget instanceof HTMLSelectElement) {
        const val = realTarget.value || (realTarget.selectedOptions?.[0]?.textContent || '').trim();
        const step = createStep('selectOption', realTarget, {
          value: val
        });
        sendStep(step);
      } else if (realTarget instanceof HTMLInputElement) {
        if (realTarget.type === 'checkbox') {
          const action = realTarget.checked ? 'check' : 'uncheck';
          const step = createStep(action, realTarget, {
            checked: realTarget.checked,
            value: realTarget.checked ? 'checked' : 'unchecked'
          });
          sendStep(step);
        } else if (realTarget.type === 'radio') {
          if (realTarget.checked) {
            const step = createStep('check', realTarget, {
              checked: true,
              value: realTarget.value || 'checked'
            });
            sendStep(step);
          }
        }
      }
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (['Enter', 'Tab', 'Escape'].includes(event.key)) {
        flushPendingInput();

        const realTarget = getRealTarget(event);
        const element = getInteractiveElement(realTarget) || document.activeElement;
        if (!element) return;

        const step = createStep('press', element, {
          key: event.key,
          value: event.key
        });

        sendStep(step);
      }
    },
    true
  );

  document.addEventListener(
    'submit',
    (event) => {
      flushPendingInput();

      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;

      const step = createStep('submit', form, {
        value: form.getAttribute('action') || window.location.href
      });

      sendStep(step);
    },
    true
  );

  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (!isPageRecording) return;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        if (scrollY > 150) {
          sendStep({
            action: 'scroll',
            url: window.location.href,
            pageUrl: window.location.href,
            title: document.title,
            timestamp: Date.now(),
            sessionId: currentSessionId,
            selector: 'window',
            elementName: 'Window Scroll',
            value: \`scroll(\${scrollX}, \${scrollY})\`,
            scrollX,
            scrollY
          });
        }
      }, 600);
    },
    { passive: true }
  );

  console.log('[QA Recorder Content] Content script initialized successfully on:', window.location.href);
})();
`;
