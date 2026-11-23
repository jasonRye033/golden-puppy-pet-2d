const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  screen,
  systemPreferences,
} = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const recordIdx = process.argv.indexOf('--demo-record');
const recordDir = recordIdx >= 0 ? process.argv[recordIdx + 1] : null;
const isDemo = process.argv.includes('--demo') || Boolean(recordDir);

if (recordDir) {
  app.setPath('userData', path.join(recordDir, '_userdata'));
} else {
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  }
}

const WIN_W = 400;
const WIN_H = 340;
const EDGE_MARGIN = 40;

const SCALE_PRESETS = [
  { label: '50%（迷你）', value: 0.5 },
  { label: '75%（小巧）', value: 0.75 },
  { label: '100%（标准）', value: 1.0 },
  { label: '125%（大号）', value: 1.25 },
  { label: '150%（特大）', value: 1.5 },
];

const KEY_ALIASES = {
  Space: '␣',
  Enter: '⏎',
  NumpadEnter: '⏎',
  Backspace: '⌫',
  Tab: '⇥',
  Shift: '⇧',
  ShiftRight: '⇧',
  Ctrl: '⌃',
  CtrlRight: '⌃',
  Alt: '⌥',
  AltRight: '⌥',
  Meta: '⌘',
  MetaRight: '⌘',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  CapsLock: '⇪',
  Delete: 'Del',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
};

function buildKeyMaps() {
  const labelMap = new Map();
  const nameMap = new Map();
  if (!UiohookKey) return { labelMap, nameMap };

  for (const [name, code] of Object.entries(UiohookKey)) {
    if (typeof code !== 'number') continue;
    if (!nameMap.has(code)) {
      nameMap.set(code, name);
    }

    let label = KEY_ALIASES[name];
    if (!label) {
      if (/^[A-Z0-9]$/.test(name) || /^F\d{1,2}$/.test(name)) {
        label = name;
      } else {
        const digitMatch = name.match(/^(?:Digit|Numpad)([0-9])$/);
        if (digitMatch) {
          label = digitMatch[1];
        } else if (name.length <= 3) {
          label = name;
        } else {
          label = '•';
        }
      }
    }
    if (!labelMap.has(code)) {
      labelMap.set(code, label);
    }
  }
  return { labelMap, nameMap };
}

const { labelMap: keyLabelMap, nameMap: keyNameMap } = buildKeyMaps();
const pressedKeys = new Set();

let mainWin = null;
let hideLetters = false;
let currentScale = 1.0;
let dragState = null;
let cursorTimer = null;
let hookStarted = false;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function getPrefsFilePath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPreferences() {
  if (recordDir) return null;
  try {
    const file = getPrefsFilePath();
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch (_) {
    return null;
  }
}

function savePreferences() {
  if (recordDir || !mainWin || mainWin.isDestroyed()) return;
  try {
    const bounds = mainWin.getBounds();
    const data = {
      scale: currentScale,
      x: bounds.x,
      y: bounds.y,
      hideLetters,
    };
    fs.writeFileSync(getPrefsFilePath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {
    // ignore preference write failure
  }
}

function clampWindowBounds(x, y, width, height) {
  const display = screen.getDisplayMatching({ x, y, width, height }) || screen.getPrimaryDisplay();
  const wa = display.workArea;
  const maxX = Math.max(wa.x, wa.x + wa.width - width);
  const maxY = Math.max(wa.y, wa.y + wa.height - height);
  return {
    x: Math.round(Math.max(wa.x, Math.min(maxX, x))),
    y: Math.round(Math.max(wa.y, Math.min(maxY, y))),
    width,
    height,
  };
}

function applyScalePreset(nextScale) {
  if (!mainWin || mainWin.isDestroyed()) return;
  currentScale = nextScale;
  const oldBounds = mainWin.getBounds();
  const anchorRight = oldBounds.x + oldBounds.width;
  const anchorBottom = oldBounds.y + oldBounds.height;

  const newW = Math.round(WIN_W * currentScale);
  const newH = Math.round(WIN_H * currentScale);
  const targetX = anchorRight - newW;
  const targetY = anchorBottom - newH;

  const nextBounds = clampWindowBounds(targetX, targetY, newW, newH);
  mainWin.setBounds(nextBounds, false);
  savePreferences();
}

function createWindow() {
  const prefs = loadPreferences();
  if (prefs) {
    if (SCALE_PRESETS.some((p) => p.value === prefs.scale)) {
      currentScale = prefs.scale;
    }
    if (typeof prefs.hideLetters === 'boolean') {
      hideLetters = prefs.hideLetters;
    }
  }

  const winW = Math.round(WIN_W * currentScale);
  const winH = Math.round(WIN_H * currentScale);
  const { workArea } = screen.getPrimaryDisplay();
  const defaultX = Math.round(workArea.x + workArea.width - winW - EDGE_MARGIN);
  const defaultY = Math.round(workArea.y + workArea.height - winH - EDGE_MARGIN);
  const rawX = prefs && Number.isFinite(prefs.x) ? prefs.x : defaultX;
  const rawY = prefs && Number.isFinite(prefs.y) ? prefs.y : defaultY;
  const initialBounds = clampWindowBounds(rawX, rawY, winW, winH);

  const webPreferences = {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  };
  if (recordDir) {
    webPreferences.offscreen = true;
    webPreferences.backgroundThrottling = false;
  }

  mainWin = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    show: !recordDir,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences,
  });

  mainWin.webContents.on('did-finish-load', () => {
    if (hideLetters && mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('hide-letters', hideLetters);
    }
  });

  if (!recordDir) {
    mainWin.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      mainWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }

  if (isDemo && !recordDir) {
    console.log('DEMO_BOUNDS:', JSON.stringify(mainWin.getBounds()));
  }

  if (recordDir) {
    fs.mkdirSync(recordDir, { recursive: true });
    let latestImage = null;
    let frameIndex = 0;
    let recordTimer = null;

    mainWin.webContents.setFrameRate(30);
    mainWin.webContents.on('paint', (_e, _dirty, image) => {
      latestImage = image;
    });

    mainWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const startedAt = Date.now();
        recordTimer = setInterval(() => {
          if (latestImage) {
            const filename = `frame_${String(frameIndex).padStart(5, '0')}.png`;
            fs.writeFileSync(path.join(recordDir, filename), latestImage.toPNG());
            frameIndex += 1;
          }
          if (Date.now() - startedAt >= 9500) {
            clearInterval(recordTimer);
            recordTimer = null;
            app.quit();
          }
        }, 33);
      }, 300);
    });
  }

  mainWin.loadFile(path.join(__dirname, 'index.html'), {
    query: isDemo ? { demo: '1' } : undefined,
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

function startGlobalInputHook() {
  uIOhook.on('keydown', (event) => {
    if (pressedKeys.has(event.keycode)) return;
    pressedKeys.add(event.keycode);

    if (mainWin && !mainWin.isDestroyed()) {
      const code = keyNameMap.get(event.keycode) || '';
      const label = keyLabelMap.get(event.keycode) || '•';
      mainWin.webContents.send('key', { code, label });
    }
  });

  uIOhook.on('keyup', (event) => {
    pressedKeys.delete(event.keycode);

    if (mainWin && !mainWin.isDestroyed()) {
      const code = keyNameMap.get(event.keycode) || '';
      mainWin.webContents.send('keyup', { code });
    }
  });

  uIOhook.on('mousedown', (event) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('mouse', { down: true, button: event.button });
    }
  });

  uIOhook.on('mouseup', (event) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('mouse', { down: false, button: event.button });
    }
  });

  uIOhook.on('wheel', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('wheel', {});
    }
  });

  try {
    uIOhook.start();
    hookStarted = true;
  } catch (err) {
    console.error('全局键鼠监听启动失败，光标跟随仍可用:', err?.message || err);
  }
}

function startCursorTracking() {
  cursorTimer = setInterval(() => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = mainWin.getBounds();
    const dx = cursor.x - (bounds.x + bounds.width / 2);
    const dy = cursor.y - (bounds.y + bounds.height / 2);

    const display = screen.getDisplayNearestPoint(cursor);
    const nx = clamp01((cursor.x - display.bounds.x) / Math.max(1, display.bounds.width));
    const ny = clamp01((cursor.y - display.bounds.y) / Math.max(1, display.bounds.height));

    mainWin.webContents.send('cursor', { dx, dy, nx, ny });
  }, 50);
}

function checkMacAccessibilityPermission() {
  if (process.platform !== 'darwin') return;
  if (process.argv.includes('--skip-permission-prompt')) return;

  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    if (!trusted) {
      dialog
        .showMessageBox({
          type: 'info',
          title: '需要辅助功能权限',
          message: '金毛桌宠需要辅助功能权限来响应全局键盘与鼠标动作',
          detail:
            '请前往「系统设置 → 隐私与安全性 → 辅助功能 / 输入监控」开启权限。\n' +
            '• 开发运行阶段请授权给当前终端或 Electron；\n' +
            '• 打包后请授权给「金毛桌宠」。\n\n' +
            '未授权前，眼球跟随光标功能仍可正常使用。',
          buttons: ['去授权', '稍后再说'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            systemPreferences.isTrustedAccessibilityClient(true);
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error('检查 macOS 辅助功能权限失败:', err?.message || err);
  }
}

function setupIpcHandlers() {
  ipcMain.on('drag-start', () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const [x, y] = winGetPos(mainWin);
    dragState = {
      startCursor: cursor,
      startWin: { x, y },
    };
  });

  ipcMain.on('drag-move', () => {
    if (!dragState || !mainWin || mainWin.isDestroyed()) return;
    const cur = screen.getCursorScreenPoint();
    const nextX = dragState.startWin.x + (cur.x - dragState.startCursor.x);
    const nextY = dragState.startWin.y + (cur.y - dragState.startCursor.y);
    mainWin.setPosition(nextX, nextY);
  });

  ipcMain.on('drag-end', () => {
    dragState = null;
    savePreferences();
  });

  ipcMain.on('context-menu', () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const menu = Menu.buildFromTemplate([
      {
        label: '窗口大小',
        submenu: SCALE_PRESETS.map((preset) => ({
          label: preset.label,
          type: 'radio',
          checked: Math.abs(currentScale - preset.value) < 0.01,
          click: () => {
            applyScalePreset(preset.value);
          },
        })),
      },
      { type: 'separator' },
      {
        label: '隐藏字母',
        type: 'checkbox',
        checked: hideLetters,
        click: (menuItem) => {
          hideLetters = Boolean(menuItem.checked);
          savePreferences();
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('hide-letters', hideLetters);
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ]);
    menu.popup({ window: mainWin });
  });
}

function winGetPos(win) {
  return win.getPosition();
}

app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  setupIpcHandlers();
  createWindow();
  if (!recordDir) {
    startGlobalInputHook();
  }
  if (!isDemo) {
    startCursorTracking();
    checkMacAccessibilityPermission();
  }
});

app.on('will-quit', () => {
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  if (hookStarted) {
    try {
      uIOhook.stop();
    } catch (_) {
      // ignore stop errors on exit
    }
    hookStarted = false;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
