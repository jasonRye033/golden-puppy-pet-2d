(() => {
  const META = {
    headWidth: 480,
    headHeight: 356,
    leftEye: { cx: 167.18, cy: 157.61, rx: 27.0, ry: 25.0 },
    rightEye: { cx: 311.96, cy: 157.54, rx: 27.0, ry: 25.0 },
    torsoWidth: 307,
    torsoHeight: 326,
    tailWidth: 157,
    tailHeight: 201,
  };

  const canvas = document.getElementById('pet-canvas');
  const ctx = canvas.getContext('2d');

  const imgHeadSmile = document.getElementById('img-head-smile');
  const imgHeadHappy = document.getElementById('img-head-happy');
  const imgHeadSleep = document.getElementById('img-head-sleep');
  const imgHeadBlink = document.getElementById('img-head-blink');
  const imgMaskSmile = document.getElementById('img-mask-smile');
  const imgMaskHappy = document.getElementById('img-mask-happy');
  const imgTorso = document.getElementById('img-torso');
  const imgChestBib = document.getElementById('img-chest-bib');
  const imgTail = document.getElementById('img-tail');

  // 离屏眼球合成画布（480x356 原生分辨率，用 eye_mask 精确裁剪可动虹膜与双高光）
  const irisCanvas = document.createElement('canvas');
  irisCanvas.width = META.headWidth;
  irisCanvas.height = META.headHeight;
  const irisCtx = irisCanvas.getContext('2d');

  // 1. 构建 180° 第一人称旋转的 60% ANSI 机械键盘布局
  // 标准第一人称行定义（第 0 行为数字行，第 4 行为空格行；L 为小狗左手=屏幕右侧，R 为小狗右手=屏幕左侧）
  const ANSI_ROWS = [
    [
      ['Backquote', 1, 'L', '#F28C28', 'ESC'],
      ['1', 1, 'L', null, '1'],
      ['2', 1, 'L', null, '2'],
      ['3', 1, 'L', null, '3'],
      ['4', 1, 'L', null, '4'],
      ['5', 1, 'L', null, '5'],
      ['6', 1, 'R', null, '6'],
      ['7', 1, 'R', null, '7'],
      ['8', 1, 'R', null, '8'],
      ['9', 1, 'R', null, '9'],
      ['0', 1, 'R', null, '0'],
      ['Minus', 1, 'R', null, '-'],
      ['Equal', 1, 'R', null, '='],
      ['Backspace', 2, 'R', null, '⌫'],
    ],
    [
      ['Tab', 1.5, 'L', null, 'TAB'],
      ['Q', 1, 'L', null, 'Q'],
      ['W', 1, 'L', null, 'W'],
      ['E', 1, 'L', null, 'E'],
      ['R', 1, 'L', null, 'R'],
      ['T', 1, 'L', null, 'T'],
      ['Y', 1, 'R', null, 'Y'],
      ['U', 1, 'R', null, 'U'],
      ['I', 1, 'R', null, 'I'],
      ['O', 1, 'R', null, 'O'],
      ['P', 1, 'R', null, 'P'],
      ['BracketLeft', 1, 'R', null, '['],
      ['BracketRight', 1, 'R', null, ']'],
      ['Backslash', 1.5, 'R', null, '\\'],
    ],
    [
      ['CapsLock', 1.75, 'L', null, 'CAPS'],
      ['A', 1, 'L', null, 'A'],
      ['S', 1, 'L', null, 'S'],
      ['D', 1, 'L', null, 'D'],
      ['F', 1, 'L', null, 'F'],
      ['G', 1, 'L', null, 'G'],
      ['H', 1, 'R', null, 'H'],
      ['J', 1, 'R', null, 'J'],
      ['K', 1, 'R', null, 'K'],
      ['L', 1, 'R', null, 'L'],
      ['Semicolon', 1, 'R', null, ';'],
      ['Quote', 1, 'R', null, "'"],
      ['Enter', 2.25, 'R', null, '⏎'],
    ],
    [
      ['Shift', 2.25, 'L', null, '⇧'],
      ['Z', 1, 'L', null, 'Z'],
      ['X', 1, 'L', null, 'X'],
      ['C', 1, 'L', null, 'C'],
      ['V', 1, 'L', null, 'V'],
      ['B', 1, 'L', null, 'B'],
      ['N', 1, 'R', null, 'N'],
      ['M', 1, 'R', null, 'M'],
      ['Comma', 1, 'R', null, ','],
      ['Period', 1, 'R', null, '.'],
      ['Slash', 1, 'R', null, '/'],
      ['ShiftRight', 2.75, 'R', null, '⇧'],
    ],
    [
      ['Ctrl', 1.25, 'L', null, '⌃'],
      ['Alt', 1.25, 'L', null, '⌥'],
      ['Meta', 1.25, 'L', null, '⌘'],
      ['Space', 6.25, 'ANY', null, ''],
      ['MetaRight', 1.25, 'R', null, '⌘'],
      ['AltRight', 1.25, 'R', null, '⌥'],
      ['_fn', 1.25, 'R', null, 'FN'],
      ['CtrlRight', 1.25, 'R', '#F28C28', '⌃'],
    ],
  ];

  const KEY_CODE_ALIASES = {
    Escape: 'Backquote',
    NumpadEnter: 'Enter',
  };

  // 键盘梯形微透视参数：旋转 180° 后，第 4 行（空格行）在最上方紧贴小狗肚子，第 0 行（数字行）在最下方靠近观众
  const KB_CX = 250;
  const KB_TOP_Y = 238;
  const KB_ROW_PITCH = 14.4;
  const KB_KEY_H = 12.2;
  const keyMap = {};
  const keyList = [];

  for (let rIdx = 0; rIdx < 5; rIdx += 1) {
    // 180° 翻转：rIdx=4 (空格行) 对应视觉第 0 行 (最上方 y 最小)；rIdx=0 (数字行) 对应视觉第 4 行 (最下方 y 最大)
    const visRow = 4 - rIdx;
    const rowT = visRow / 4; // 0 在顶行，1 在底行
    const rowWidth = 236 + rowT * 14; // 微梯形透视：上方略窄 236，下方略宽 250
    const unitW = rowWidth / 15;
    const rowLeftX = KB_CX - rowWidth / 2;
    const rowY = KB_TOP_Y + visRow * KB_ROW_PITCH;

    // 180° 翻转：行内从右往左排列（小狗右手 R 在屏幕左侧，小狗左手 L 在屏幕右侧）
    const reversedRow = [...ANSI_ROWS[rIdx]].reverse();
    let uCursor = 0;

    reversedRow.forEach(([name, units, hand, accent, legend]) => {
      const x = rowLeftX + uCursor * unitW + 1.1;
      const w = units * unitW - 2.2;
      const h = KB_KEY_H;
      const cx = x + w / 2;
      const cy = rowY + h / 2;

      const entry = {
        name,
        x,
        y: rowY,
        w,
        h,
        cx,
        cy,
        hand,
        accent,
        legend,
        pressed: false,
        glowUntil: 0,
        safetyTimer: null,
      };
      keyList.push(entry);
      if (!name.startsWith('_')) {
        keyMap[name] = entry;
      }
      uCursor += units;
    });
  }

  // 左侧鼠标垫与 180° 第一人称鼠标范围
  const PAD_BOUNDS = {
    minX: 48,
    maxX: 88,
    minY: 262,
    maxY: 296,
  };

  const mouseState = {
    x: 68,
    y: 278,
    targetX: 68,
    targetY: 278,
    btnL: false,
    btnR: false,
    wheelFlashUntil: 0,
  };

  // 小狗左右爪默认定位键：右爪（屏幕左）在 J 键，左爪（屏幕右）在 F 键（落在键帽上半部以露出下方发光键帽）
  const HOME_R = { x: keyMap.J.cx, y: keyMap.J.cy - 6 };
  const HOME_L = { x: keyMap.F.cx, y: keyMap.F.cy - 6 };
  const SLEEP_PAW_R = { x: 198, y: 231 };
  const SLEEP_PAW_L = { x: 258, y: 231 };

  const pawR = {
    x: HOME_R.x,
    y: HOME_R.y,
    targetX: HOME_R.x,
    targetY: HOME_R.y,
    press: 0,
    pressUntil: 0,
    lastUse: 0,
  };

  const pawL = {
    x: HOME_L.x,
    y: HOME_L.y,
    targetX: HOME_L.x,
    targetY: HOME_L.y,
    press: 0,
    pressUntil: 0,
    lastUse: 0,
  };

  // 交互与动画状态
  let lastActivity = Date.now();
  let keyTimes = [];
  let recentKeys = [];
  let hideLetters = false;
  let isSleeping = false;
  let isExcited = false;
  let belowThresholdSince = null;
  let wagFastUntil = 0;
  let rightMode = 'keyboard'; // 'keyboard' | 'mouse' (小狗右爪在屏幕左侧控鼠)
  let lastKeyHand = 'L';
  let lastWakeCursor = null;
  let prevCursor = null;

  // 视线跟随平滑状态
  let cursorDx = 0;
  let cursorDy = 0;
  let targetGazeX = 0;
  let targetGazeY = 0;
  let currentGazeX = 0;
  let currentGazeY = 0;

  // 躯干与头部骨骼联动状态
  let currentTorsoX = 0;
  let currentTorsoY = 0;
  let currentTorsoRot = 0;
  let currentHeadX = 0;
  let currentHeadY = 0;
  let currentHeadRot = 0;
  let blinkVal = 0;
  let earBounce = 0;
  let sleepAmount = 0;

  // 飘浮键帽与鼠标点击波纹池
  const floaters = [];
  const mouseRipples = [];

  // 摸头（撸狗）交互状态
  let petRubScore = 0;
  let pettingAmount = 0;
  let pettingActiveUntil = 0;
  let petTiltTarget = 0;
  let petTiltCurrent = 0;
  let lastPetPoint = null;
  let lastPetSignX = 0;

  function handleHeadPetMove(logicalX, logicalY) {
    const headCx = 226 + currentHeadX;
    const headCy = 116 + currentHeadY;
    const normX = (logicalX - headCx) / 88;
    const normY = (logicalY - headCy) / 68;
    const inHeadZone = normX * normX + normY * normY <= 1.05;

    if (!inHeadZone) {
      lastPetPoint = null;
      return;
    }

    const now = performance.now();
    if (!lastPetPoint || now - lastPetPoint.time > 350) {
      lastPetPoint = { x: logicalX, y: logicalY, time: now };
      return;
    }

    const dx = logicalX - lastPetPoint.x;
    const dy = logicalY - lastPetPoint.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.5) return;

    lastPetPoint = { x: logicalX, y: logicalY, time: now };

    const signX = Math.abs(dx) > 1.8 ? Math.sign(dx) : lastPetSignX;
    const reversedX = signX !== 0 && lastPetSignX !== 0 && signX !== lastPetSignX;
    if (signX !== 0) {
      lastPetSignX = signX;
    }

    // 来回换向揉搓加分更高，连续滑动也累加
    const gain = Math.min(26, dist * (reversedX ? 1.55 : 0.72));
    petRubScore = Math.min(130, petRubScore + gain);
    petTiltTarget = Math.max(-1, Math.min(1, dx / 18));

    // 揉搓累计超过阈值（约来回 2~3 下）正式激活享受摸头状态
    if (petRubScore >= 42) {
      markActivity();
      pettingActiveUntil = Date.now() + 950;
      wagFastUntil = Math.max(wagFastUntil, Date.now() + 1250);
    }
  }

  function clearAllKeys() {
    Object.values(keyMap).forEach((k) => {
      k.pressed = false;
      k.glowUntil = 0;
      if (k.safetyTimer) {
        clearTimeout(k.safetyTimer);
        k.safetyTimer = null;
      }
    });
  }

  function setSleeping(sleeping) {
    if (isSleeping === sleeping) return;
    isSleeping = sleeping;
    if (sleeping) {
      wagFastUntil = 0;
      isExcited = false;
      belowThresholdSince = null;
      rightMode = 'keyboard';
      pawR.pressUntil = 0;
      pawL.pressUntil = 0;
      mouseState.btnL = false;
      mouseState.btnR = false;
      clearAllKeys();
    }
  }

  function markActivity() {
    lastActivity = Date.now();
    if (isSleeping) {
      setSleeping(false);
    }
  }

  function spawnFloater(label) {
    if (hideLetters || !label) return;
    while (floaters.length >= 12) {
      floaters.shift();
    }
    floaters.push({
      label,
      x: 225 + currentHeadX + (Math.random() - 0.5) * 85,
      y: 72 + currentHeadY,
      driftX: (Math.random() - 0.5) * 26,
      rot: (Math.random() - 0.5) * 0.45,
      age: 0,
      duration: 0.9,
    });
  }

  function handleKey({ code, label } = {}) {
    const now = Date.now();
    markActivity();

    keyTimes.push(now);
    keyTimes = keyTimes.filter((t) => now - t <= 2000);
    if (keyTimes.length >= 6) {
      belowThresholdSince = null;
      isExcited = true;
    }

    recentKeys.push(now);
    recentKeys = recentKeys.filter((t) => now - t <= 1000);
    if (rightMode === 'mouse' && recentKeys.length >= 3) {
      rightMode = 'keyboard';
    }

    const mapped = KEY_CODE_ALIASES[code] || code;
    const k = mapped ? keyMap[mapped] : null;

    let chosenHand = rightMode === 'mouse' ? 'L' : 'R';
    if (!k) {
      const p = chosenHand === 'R' ? pawR : pawL;
      const home = chosenHand === 'R' ? HOME_R : HOME_L;
      p.targetX = home.x;
      p.targetY = home.y;
    } else {
      if (k.hand === 'ANY') {
        chosenHand = rightMode === 'mouse' ? 'L' : lastKeyHand === 'R' ? 'L' : 'R';
      } else if (k.hand === 'R' && rightMode === 'mouse') {
        // 右爪在控鼠时，左爪跨区代打
        chosenHand = 'L';
      } else {
        chosenHand = k.hand;
      }

      const p = chosenHand === 'R' ? pawR : pawL;
      p.targetX = k.cx;
      p.targetY = k.cy - 6;

      k.pressed = true;
      k.glowUntil = now + 260;
      if (k.safetyTimer) clearTimeout(k.safetyTimer);
      k.safetyTimer = setTimeout(() => {
        k.pressed = false;
        k.safetyTimer = null;
      }, 3000);
    }

    lastKeyHand = chosenHand;
    const activePaw = chosenHand === 'R' ? pawR : pawL;
    activePaw.pressUntil = now + 120;
    activePaw.lastUse = now;

    earBounce = 1.0;
    wagFastUntil = now + 1000;
    spawnFloater(label);
  }

  function handleKeyUp({ code } = {}) {
    const mapped = KEY_CODE_ALIASES[code] || code;
    const k = mapped ? keyMap[mapped] : null;
    if (!k) return;
    k.pressed = false;
    k.glowUntil = Math.max(k.glowUntil || 0, Date.now() + 180);
    if (k.safetyTimer) {
      clearTimeout(k.safetyTimer);
      k.safetyTimer = null;
    }
  }

  function handleMouse({ down, button } = {}) {
    markActivity();
    rightMode = 'mouse';
    if (down) {
      if (button === 2) {
        mouseState.btnR = true;
      } else {
        mouseState.btnL = true;
      }
      pawR.pressUntil = Date.now() + 100000;
      mouseRipples.push({
        x: mouseState.x,
        y: mouseState.y,
        age: 0,
        duration: 0.42,
      });
    } else {
      mouseState.btnL = false;
      mouseState.btnR = false;
      pawR.pressUntil = 0;
    }
  }

  function handleWheel() {
    markActivity();
    rightMode = 'mouse';
    mouseState.wheelFlashUntil = performance.now() + 160;
  }

  function handleCursor({ dx = 0, dy = 0, nx, ny } = {}) {
    cursorDx = dx;
    cursorDy = dy;

    if (prevCursor === null) {
      prevCursor = { dx, dy };
    } else {
      const step = Math.hypot(dx - prevCursor.dx, dy - prevCursor.dy);
      if (step > 6) {
        rightMode = 'mouse';
      }
      prevCursor = { dx, dy };
    }

    if (lastWakeCursor === null) {
      lastWakeCursor = { dx, dy };
    } else {
      const moved = Math.hypot(dx - lastWakeCursor.dx, dy - lastWakeCursor.dy);
      if (moved > 30) {
        lastWakeCursor = { dx, dy };
        markActivity();
      }
    }

    if (typeof nx === 'number' && typeof ny === 'number') {
      const cx = Math.max(0, Math.min(1, nx));
      const cy = Math.max(0, Math.min(1, ny));
      mouseState.targetX = PAD_BOUNDS.minX + cx * (PAD_BOUNDS.maxX - PAD_BOUNDS.minX);
      mouseState.targetY = PAD_BOUNDS.minY + cy * (PAD_BOUNDS.maxY - PAD_BOUNDS.minY);
    }

    // 计算精细眼球视线偏移（480x356 头部贴图空间下最大水平偏移 ±11.5px，垂直 ±8px）
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const mag = Math.min(1, dist / 180);
    targetGazeX = Math.cos(angle) * mag * 11.5;
    targetGazeY = Math.sin(angle) * mag * 8.0;
  }

  // 随机自然眨眼
  function scheduleBlink() {
    const delay = 2800 + Math.random() * 3200;
    setTimeout(() => {
      if (!isSleeping) {
        blinkVal = 1.0;
      }
      scheduleBlink();
    }, delay);
  }
  scheduleBlink();

  // 睡觉与兴奋度衰减定时器
  setInterval(() => {
    const now = Date.now();
    keyTimes = keyTimes.filter((t) => now - t <= 2000);
    recentKeys = recentKeys.filter((t) => now - t <= 1000);

    if (isExcited && keyTimes.length < 6) {
      if (belowThresholdSince === null) {
        belowThresholdSince = now;
      } else if (now - belowThresholdSince >= 600) {
        isExcited = false;
        belowThresholdSince = null;
      }
    } else if (keyTimes.length >= 6) {
      belowThresholdSince = null;
    }

    if (!isSleeping && now - lastActivity > 30000) {
      setSleeping(true);
    }
  }, 200);

  // 辅助绘制圆角矩形
  function roundRectPath(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // 绘制左侧半透明鼠标垫 + 180° 第一人称 2D 鼠标（按键与滚轮朝下）
  function drawMousepadAndMouse(nowPerf) {
    ctx.save();

    // 1. 半透明圆角梯形磨砂鼠标垫（尽量不遮挡桌面视线）
    ctx.beginPath();
    ctx.moveTo(26, 240);
    ctx.lineTo(104, 240);
    ctx.quadraticCurveTo(111, 240, 109, 248);
    ctx.lineTo(101, 315);
    ctx.quadraticCurveTo(99, 323, 90, 323);
    ctx.lineTo(16, 323);
    ctx.quadraticCurveTo(7, 323, 9, 314);
    ctx.lineTo(18, 248);
    ctx.quadraticCurveTo(19, 240, 26, 240);
    ctx.closePath();

    ctx.fillStyle = 'rgba(205, 220, 236, 0.44)';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(43, 29, 20, 0.55)';
    ctx.stroke();

    // 2. 点击绿色漫画波纹弧线（朝鼠标前端下方扩散）
    mouseRipples.forEach((r) => {
      const t = Math.min(1, r.age / r.duration);
      const alpha = (1 - t) * 0.9;
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(0.18);
      ctx.strokeStyle = `rgba(142, 242, 48, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';

      const radX = 18 + t * 12;
      const radY = 23 + t * 12;
      ctx.beginPath();
      ctx.ellipse(0, 0, radX, radY, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, radX + 5, radY + 5, 0, 0.22 * Math.PI, 0.78 * Math.PI);
      ctx.stroke();
      ctx.restore();
    });

    // 3. 180° 第一人称 2D 鼠标本体（按键与橙色滚轮在下方 +Y 前端！）
    ctx.save();
    ctx.translate(mouseState.x, mouseState.y);
    ctx.rotate(0.18); // 顺应小狗右手人体工学微倾

    // 鼠标底部投影
    ctx.fillStyle = 'rgba(30, 20, 12, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 17, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 若左/右键按下，散发柔和荧光绿光晕
    if (mouseState.btnL || mouseState.btnR) {
      const grad = ctx.createRadialGradient(0, 6, 2, 0, 6, 28);
      grad.addColorStop(0, 'rgba(154, 245, 59, 0.55)');
      grad.addColorStop(1, 'rgba(154, 245, 59, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 6, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    // 鼠标主椭圆底色
    ctx.fillStyle = '#FAFAF7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    // 第一人称左键（小狗右手食指所在内侧 = 屏幕右侧 +X 下半象限）高亮
    if (mouseState.btnL) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -1, 20, 25);
      ctx.clip();
      ctx.fillStyle = '#9AF53B';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 第一人称右键（小狗右手中指所在外侧 = 屏幕左侧 -X 下半象限）高亮
    if (mouseState.btnR) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-20, -1, 20, 25);
      ctx.clip();
      ctx.fillStyle = '#9AF53B';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 鼠标侧边浅灰立体暗部
    ctx.strokeStyle = '#E2E4EA';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13.8, 18.5, 0, 0.7 * Math.PI, 1.3 * Math.PI);
    ctx.stroke();

    // 鼠标外轮廓粗描边
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = '#2B1A12';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 21, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 第一人称按键分界横线与中缝竖线（位于下半部 +Y 朝向屏幕下方！）
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2B1A12';
    ctx.beginPath();
    ctx.moveTo(-15.5, -1);
    ctx.quadraticCurveTo(0, 1.5, 15.5, -1);
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 20.5);
    ctx.stroke();

    // 橙色滚轮（位于下半部前端 y = +8.5）
    const wheelFlashing =
      mouseState.wheelFlashUntil && nowPerf < mouseState.wheelFlashUntil;
    ctx.fillStyle = wheelFlashing ? '#9AF53B' : '#F28C28';
    ctx.strokeStyle = '#2B1A12';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(0, 8.5, 2.8, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  // 绘制 180° 第一人称 60% 机械键盘（空格行在最上方紧贴小狗肚子，数字行在最下方）
  function drawFirstPersonKeyboard() {
    ctx.save();

    // 1. 键盘底座 3D 厚度与深色外壳（微梯形）
    ctx.fillStyle = '#18181D';
    ctx.strokeStyle = '#2B1A12';
    ctx.lineWidth = 3.8;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(124, 234);
    ctx.lineTo(376, 234);
    ctx.quadraticCurveTo(383, 234, 385, 241);
    ctx.lineTo(392, 315);
    ctx.quadraticCurveTo(393, 324, 383, 324);
    ctx.lineTo(117, 324);
    ctx.quadraticCurveTo(107, 324, 108, 315);
    ctx.lineTo(115, 241);
    ctx.quadraticCurveTo(117, 234, 124, 234);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 键盘上层内框面板
    ctx.fillStyle = '#2B2B33';
    ctx.beginPath();
    ctx.moveTo(126, 234);
    ctx.lineTo(374, 234);
    ctx.quadraticCurveTo(380, 234, 382, 240);
    ctx.lineTo(389, 309);
    ctx.quadraticCurveTo(390, 316, 381, 316);
    ctx.lineTo(119, 316);
    ctx.quadraticCurveTo(110, 316, 111, 309);
    ctx.lineTo(118, 240);
    ctx.quadraticCurveTo(120, 234, 126, 234);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. 先为所有处于激活高亮状态的键帽绘制柔和荧光绿背光光晕
    const nowMs = Date.now();
    keyList.forEach((k) => {
      const isLit = k.pressed || nowMs < k.glowUntil;
      if (!isLit) return;
      const grad = ctx.createRadialGradient(k.cx, k.cy, 2, k.cx, k.cy, Math.max(k.w, 24));
      grad.addColorStop(0, 'rgba(154, 245, 59, 0.72)');
      grad.addColorStop(1, 'rgba(154, 245, 59, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(k.cx, k.cy, Math.max(k.w, 24), 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. 逐颗绘制 60% 键帽（带 180° 倒置微距字符与按下下陷高亮）
    keyList.forEach((k) => {
      const isLit = k.pressed || nowMs < k.glowUntil;
      const pressOffset = isLit ? 1.6 : 0;
      const ky = k.y + pressOffset;

      roundRectPath(ctx, k.x, ky, k.w, k.h, 2.8);
      if (isLit) {
        ctx.fillStyle = '#9AF53B';
      } else if (k.accent) {
        ctx.fillStyle = k.accent;
      } else {
        ctx.fillStyle = '#FAFAF7';
      }
      ctx.fill();

      // 键帽下沿微立体阴影边
      if (!isLit) {
        ctx.fillStyle = k.accent ? '#D47119' : '#E2E3E8';
        ctx.fillRect(k.x + 1.5, ky + k.h - 2.6, k.w - 3, 1.8);
      }

      ctx.lineWidth = 1.9;
      ctx.strokeStyle = '#2B1A12';
      ctx.stroke();

      // F / J 定位键凸起小横线（180° 视角下位于键帽靠上方）
      if (k.name === 'F' || k.name === 'J') {
        ctx.strokeStyle = '#2B1A12';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(k.cx - 2.8, ky + 3.2);
        ctx.lineTo(k.cx + 2.8, ky + 3.2);
        ctx.stroke();
      }

      // 180° 倒置第一人称键位字符（清晰体现键盘朝向小狗）
      if (k.legend) {
        ctx.save();
        ctx.translate(k.cx, ky + k.h * 0.52);
        ctx.rotate(Math.PI);
        ctx.fillStyle = isLit
          ? '#1E4A06'
          : k.accent
            ? '#FFF9F0'
            : 'rgba(65, 55, 48, 0.72)';
        const fSize = k.legend.length >= 3 ? 4.8 : k.legend.length === 2 ? 5.6 : 6.6;
        ctx.font = `700 ${fSize}px "SF Pro Rounded", "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(k.legend, 0, 0);
        ctx.restore();
      }
    });

    ctx.restore();
  }

  // 绘制短圆饱满的一体化 2D 赛璐璐前臂与奶油色三趾小狗爪（无手腕折角，肩根藏在头部与胸毛后方）
  function drawChubbyArmAndPaw(shoulderX, shoulderY, pawState, sideSign, showMotionLines) {
    const lift = (1 - pawState.press) * 4.0;
    const px = pawState.x;
    const py = pawState.y - lift;

    ctx.save();

    // 爪子下方柔和接触阴影
    ctx.fillStyle = 'rgba(30, 20, 12, 0.2)';
    ctx.beginPath();
    ctx.ellipse(px, pawState.y + 4, 17, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const dx = px - shoulderX;
    const dy = py - shoulderY;
    const pawTilt = Math.max(-0.28, Math.min(0.28, dx * 0.0038));

    ctx.translate(px, py);
    ctx.rotate(pawTilt);

    const cosP = Math.cos(-pawTilt);
    const sinP = Math.sin(-pawTilt);
    const relSX = -dx * cosP - -dy * sinP;
    const relSY = -dx * sinP + -dy * cosP;

    const rPawX = 16.2 * (1 + 0.05 * pawState.press);
    const rPawY = 11.2 * (1 - 0.04 * pawState.press);
    const rShoulder = 19.5;

    // 肩部宽度沿垂直于手臂方向展开，确保任何伸展角度下手臂都一样圆润饱满、绝不变细
    const armLen = Math.hypot(relSX, relSY) || 1;
    const perpX = -relSY / armLen;
    const perpY = relSX / armLen;
    // 确保 leftPt 始终在左侧 (x 较小)，rightPt 始终在右侧 (x 较大)
    const signPerp = perpX >= 0 ? 1 : -1;
    const pX = perpX * signPerp;
    const pY = perpY * signPerp;

    const sLeftX = relSX - pX * rShoulder;
    const sLeftY = relSY - pY * rShoulder;
    const sRightX = relSX + pX * rShoulder;
    const sRightY = relSY + pY * rShoulder;

    const bowX = sideSign * 7;
    const ctrlLeftX = (sLeftX - rPawX) * 0.5 + bowX;
    const ctrlLeftY = sLeftY * 0.52;
    const ctrlRightX = (sRightX + rPawX) * 0.5 + bowX;
    const ctrlRightY = sRightY * 0.52;

    // 1. 一体化金毛前臂+爪垫底色轮廓
    ctx.beginPath();
    ctx.moveTo(sLeftX, sLeftY);
    ctx.quadraticCurveTo(ctrlLeftX, ctrlLeftY, -rPawX, 0);
    ctx.ellipse(0, 0, rPawX, rPawY, 0, Math.PI, 0, true);
    ctx.quadraticCurveTo(ctrlRightX, ctrlRightY, sRightX, sRightY);
    ctx.closePath();

    ctx.fillStyle = '#F2B649';
    ctx.fill();

    // 2. 在同一形状内裁剪绘制内侧暖色赛璐璐阴影与底部奶油色爪尖
    ctx.save();
    ctx.clip();

    ctx.fillStyle = '#DF982C';
    ctx.beginPath();
    if (sideSign < 0) {
      ctx.moveTo(relSX + pX * 3, relSY - 4);
      ctx.quadraticCurveTo(ctrlRightX - 5, ctrlRightY, rPawX - 5, 2);
      ctx.lineTo(rPawX + 14, 14);
      ctx.lineTo(sRightX + 14, sRightY);
    } else {
      ctx.moveTo(relSX - pX * 3, relSY - 4);
      ctx.quadraticCurveTo(ctrlLeftX + 5, ctrlLeftY, -rPawX + 5, 2);
      ctx.lineTo(-rPawX - 14, 14);
      ctx.lineTo(sLeftX - 14, sLeftY);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#EDD096';
    ctx.beginPath();
    ctx.ellipse(0, 2.5, rPawX * 1.05, rPawY * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FCE4B2';
    ctx.beginPath();
    ctx.ellipse(0, 3.8, rPawX * 1.02, rPawY * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3. 外圈一体化流畅深棕黑轮廓线
    ctx.strokeStyle = '#2B1A12';
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(sLeftX, sLeftY);
    ctx.quadraticCurveTo(ctrlLeftX, ctrlLeftY, -rPawX, 0);
    ctx.ellipse(0, 0, rPawX, rPawY, 0, Math.PI, 0, true);
    ctx.quadraticCurveTo(ctrlRightX, ctrlRightY, sRightX, sRightY);
    ctx.stroke();

    // 4. 三趾分界短弧线
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-5.6, rPawY - 0.5);
    ctx.quadraticCurveTo(-5.8, 4.2, -4.6, 1.2);
    ctx.moveTo(5.6, rPawY - 0.5);
    ctx.quadraticCurveTo(5.8, 4.2, 4.6, 1.2);
    ctx.stroke();

    if (showMotionLines && pawState.press > 0.35) {
      ctx.strokeStyle = '#2B1A12';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(sideSign * 21, -3, 7, -0.3 * Math.PI, 0.25 * Math.PI, sideSign < 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 在 480x356 离屏画布中绘制被眼眶遮罩裁剪的高精可动虹膜+双高光
  function renderClippedIrises(isHappy, gazeX, gazeY) {
    irisCtx.clearRect(0, 0, META.headWidth, META.headHeight);
    irisCtx.globalCompositeOperation = 'source-over';

    const eyes = [META.leftEye, META.rightEye];
    const pupilDilate = isHappy ? 1.05 : 1.0;

    eyes.forEach((st) => {
      const rIris = st.ry * 1.05 * pupilDilate;
      const icx = st.cx + gazeX;
      const icy = st.cy + gazeY;

      // 外圈深棕虹膜底色
      irisCtx.fillStyle = '#2A160C';
      irisCtx.beginPath();
      irisCtx.arc(icx, icy, rIris, 0, Math.PI * 2);
      irisCtx.fill();

      // 内层暖琥珀色虹膜光泽半月
      irisCtx.fillStyle = '#6B391B';
      irisCtx.beginPath();
      irisCtx.arc(icx, icy + 1.8, rIris * 0.82, 0, Math.PI * 2);
      irisCtx.fill();

      // 深黑棕瞳孔核心
      irisCtx.fillStyle = '#180B05';
      irisCtx.beginPath();
      irisCtx.arc(icx, icy, rIris * 0.56, 0, Math.PI * 2);
      irisCtx.fill();

      // 主白色高光圆点（带 0.82 视差系数，转动更灵动）
      const hx1 = st.cx + gazeX * 0.82 - rIris * 0.30;
      const hy1 = st.cy + gazeY * 0.82 - rIris * 0.30;
      irisCtx.fillStyle = '#FFFFFF';
      irisCtx.beginPath();
      irisCtx.arc(hx1, hy1, rIris * 0.27, 0, Math.PI * 2);
      irisCtx.fill();

      // 右下角副高光小点
      const hx2 = st.cx + gazeX * 0.82 + rIris * 0.34;
      const hy2 = st.cy + gazeY * 0.82 + rIris * 0.32;
      irisCtx.beginPath();
      irisCtx.arc(hx2, hy2, rIris * 0.12, 0, Math.PI * 2);
      irisCtx.fill();
    });

    // 用眼眶遮罩精确裁剪（虹膜绝不会超出眼框半像素）
    const maskImg = isHappy ? imgMaskHappy : imgMaskSmile;
    if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
      irisCtx.globalCompositeOperation = 'destination-in';
      irisCtx.drawImage(maskImg, 0, 0);
    }
    irisCtx.globalCompositeOperation = 'source-over';
  }

  // 绘制飘浮 2D 卡通键帽与睡觉 Zzz
  function drawFloatersAndZzz(elapsedSec) {
    // 1. 飘浮键帽
    floaters.forEach((f) => {
      const t = Math.min(1, f.age / f.duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const fx = f.x + f.driftX * ease;
      const fy = f.y - 54 * ease;
      const rot = f.rot * ease;
      const scale = t < 0.2 ? 0.82 + (t / 0.2) * 0.22 : 1.04 - ((t - 0.2) / 0.8) * 0.15;
      const alpha = t < 0.18 ? t / 0.18 : 1 - Math.pow((t - 0.18) / 0.82, 1.6);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(fx, fy);
      ctx.rotate(rot);
      ctx.scale(scale, scale);

      // 键帽微立体底边
      roundRectPath(ctx, -14, -12, 28, 28, 6);
      ctx.fillStyle = '#D8DAE0';
      ctx.fill();

      roundRectPath(ctx, -14, -14, 28, 27, 6);
      ctx.fillStyle = '#FAFAF7';
      ctx.fill();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#2B1A12';
      ctx.stroke();

      ctx.fillStyle = '#2B1A12';
      const fontSize = f.label.length >= 3 ? 9.5 : f.label.length === 2 ? 11 : 13.5;
      ctx.font = `800 ${fontSize}px "SF Pro Rounded", "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.label, 0, -0.5);

      ctx.restore();
    });

    // 2. 睡觉 Zzz 动画
    if (sleepAmount > 0.15) {
      [0, 1, 2].forEach((idx) => {
        const phase = (elapsedSec * 0.45 + idx / 3) % 1;
        const alpha =
          (phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8) * sleepAmount;
        const zx = 296 + idx * 14 + phase * 14;
        const zy = 104 - idx * 14 - phase * 24;
        const size = 20 - idx * 2.5;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(zx, zy);
        ctx.rotate(-0.12);
        ctx.font = `800 ${size}px "Arial Rounded MT Bold", "SF Pro Rounded", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeText('Z', 0, 0);
        ctx.fillStyle = '#2B1A12';
        ctx.fillText('Z', 0, 0);
        ctx.restore();
      });
    }
  }

  // 主渲染循环（Retina 2x 800x680 物理分辨率）
  let prevPerf = performance.now();
  function animate(nowPerf) {
    const dt = Math.min(0.05, Math.max(0.001, (nowPerf - prevPerf) / 1000));
    prevPerf = nowPerf;
    const nowMs = Date.now();
    const elapsedSec = nowPerf / 1000;

    // 1. 状态平滑插值
    sleepAmount += ((isSleeping ? 1 : 0) - sleepAmount) * Math.min(1, dt * 6);
    blinkVal = Math.max(0, blinkVal - dt * 8.2);
    earBounce = Math.max(0, earBounce - dt * 6.0);
    petRubScore = Math.max(0, petRubScore - dt * 52);
    const isPetting = !isSleeping && nowMs < pettingActiveUntil;
    pettingAmount += ((isPetting ? 1 : 0) - pettingAmount) * Math.min(1, dt * (isPetting ? 11 : 5));
    if (!isPetting) {
      petTiltTarget *= Math.max(0, 1 - dt * 8);
    }
    petTiltCurrent += (petTiltTarget - petTiltCurrent) * Math.min(1, dt * 12);
    const wagFast = !isSleeping && (nowMs < wagFastUntil || pettingAmount > 0.25);

    // 2. 视线平滑插值
    if (isSleeping) {
      targetGazeX = 0;
      targetGazeY = 2;
    }
    const gazeLerp = Math.min(1, dt * 14);
    currentGazeX += (targetGazeX - currentGazeX) * gazeLerp;
    currentGazeY += (targetGazeY - currentGazeY) * gazeLerp;

    // 3. 鼠标与左右爪位置插值
    mouseState.x += (mouseState.targetX - mouseState.x) * 0.35;
    mouseState.y += (mouseState.targetY - mouseState.y) * 0.35;

    if (isSleeping) {
      pawR.targetX = SLEEP_PAW_R.x;
      pawR.targetY = SLEEP_PAW_R.y;
      pawL.targetX = SLEEP_PAW_L.x;
      pawL.targetY = SLEEP_PAW_L.y;
    } else {
      if (rightMode === 'mouse') {
        // 小狗右爪搭在鼠标上半部掌托处，完整露出下方发光按键与橙色滚轮
        pawR.targetX = mouseState.x + 1;
        pawR.targetY = mouseState.y - 11;
      } else if (nowMs - pawR.lastUse > 600) {
        pawR.targetX = HOME_R.x;
        pawR.targetY = HOME_R.y;
      }

      if (nowMs - pawL.lastUse > 600) {
        if (rightMode === 'mouse') {
          // 控鼠身体左倾时，闲置的左爪自然收在左肩下方的键盘上沿（如预览图第 1 格），保持短圆不拉长
          pawL.targetX = 218;
          pawL.targetY = 246;
        } else {
          pawL.targetX = HOME_L.x;
          pawL.targetY = HOME_L.y;
        }
      }
    }

    const pawLerp = Math.min(1, dt * 18);
    pawR.x += (pawR.targetX - pawR.x) * pawLerp;
    pawR.y += (pawR.targetY - pawR.y) * pawLerp;
    pawL.x += (pawL.targetX - pawL.x) * pawLerp;
    pawL.y += (pawL.targetY - pawL.y) * pawLerp;

    const goalPressR = nowMs < pawR.pressUntil ? 1 : 0;
    const goalPressL = nowMs < pawL.pressUntil ? 1 : 0;
    pawR.press += (goalPressR - pawR.press) * (goalPressR ? 0.6 : 0.35);
    pawL.press += (goalPressL - pawL.press) * (goalPressL ? 0.6 : 0.35);

    // 4. 躯干与头部大幅自然跟随伸展联动（让身体真正靠近鼠标与目标键位，手臂保持短圆可爱）
    let goalTorsoX = 0;
    let goalTorsoY = 0;
    let goalTorsoRot = 0;
    let goalHeadX = 0;
    let goalHeadY = 0;
    let goalHeadRot = 0;

    if (isSleeping) {
      goalTorsoX = -6;
      goalTorsoY = 18;
      goalTorsoRot = -0.05;
      goalHeadX = -10;
      goalHeadY = 36;
      goalHeadRot = 0.06;
    } else {
      if (rightMode === 'mouse') {
        // 控鼠时整个身体与头大幅向左侧倾斜并平移靠近鼠标，缩短肩鼠距离，前爪短圆不拉长
        const mShift = (mouseState.x - 68) * 0.55;
        goalTorsoX = -52 + mShift;
        goalTorsoY = 11;
        goalTorsoRot = -0.17;

        goalHeadX = -68 + mShift + currentGazeX * 0.55;
        goalHeadY = 13 + currentGazeY * 0.45;
        goalHeadRot = -0.17 + currentGazeX * 0.005;
      } else {
        // 双手打字：躯干随双爪中心自然微移前倾
        const pawMidOffset = (pawR.x + pawL.x) * 0.5 - 232;
        goalTorsoX = Math.max(-28, Math.min(28, pawMidOffset * 0.52));
        goalTorsoY = 5;
        goalTorsoRot = goalTorsoX * 0.0038;

        goalHeadX = goalTorsoX * 1.18 + currentGazeX * 0.65;
        goalHeadY = 4 + currentGazeY * 0.5;
        goalHeadRot = goalTorsoRot + currentGazeX * 0.006;
      }

      // 单手跨区代打时（右爪在鼠标上，左爪跨到左侧按右半区键），躯干额外顺势扭转跟进
      if (pawL.x < 245) {
        const cross = Math.min(1, (245 - pawL.x) / 95);
        goalTorsoX -= cross * 12;
        goalTorsoY += cross * 5;
        goalTorsoRot -= cross * 0.04;
        goalHeadX -= cross * 14;
        goalHeadY += cross * 6;
      }

      // 呼吸与打字兴奋轻微律动
      const breath = Math.sin(elapsedSec * 2.5) * 1.2;
      const bounce =
        isExcited || pettingAmount > 0.3
          ? Math.sin(elapsedSec * 16) * 2.2
          : Math.sin(earBounce * Math.PI) * -1.8;
      goalTorsoY += breath + bounce * 0.5;
      goalHeadY += breath + bounce;

      // 摸头蹭手互动：头部与肩膀顺着鼠标揉搓方向微微歪斜贴合
      if (pettingAmount > 0.01) {
        const rubSway = petTiltCurrent * 10 + Math.sin(elapsedSec * 11) * 4.5;
        goalHeadX += rubSway * pettingAmount;
        goalHeadY += 4.5 * pettingAmount;
        goalHeadRot += (petTiltCurrent * 0.14 + Math.sin(elapsedSec * 11) * 0.05) * pettingAmount;
        goalTorsoX += rubSway * 0.35 * pettingAmount;
        goalTorsoRot += petTiltCurrent * 0.04 * pettingAmount;
      }
    }

    const bodyLerp = Math.min(1, dt * 10);
    currentTorsoX += (goalTorsoX - currentTorsoX) * bodyLerp;
    currentTorsoY += (goalTorsoY - currentTorsoY) * bodyLerp;
    currentTorsoRot += (goalTorsoRot - currentTorsoRot) * bodyLerp;
    currentHeadX += (goalHeadX - currentHeadX) * bodyLerp;
    currentHeadY += (goalHeadY - currentHeadY) * bodyLerp;
    currentHeadRot += (goalHeadRot - currentHeadRot) * bodyLerp;

    // 5. 更新飘浮键帽与波纹生命周期
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      floaters[i].age += dt;
      if (floaters[i].age >= floaters[i].duration) {
        floaters.splice(i, 1);
      }
    }
    for (let i = mouseRipples.length - 1; i >= 0; i -= 1) {
      mouseRipples[i].age += dt;
      if (mouseRipples[i].age >= mouseRipples[i].duration) {
        mouseRipples.splice(i, 1);
      }
    }

    // ================= 开始 Retina 自适应缩放分层绘制 =================
    const viewW = window.innerWidth || 400;
    const viewH = window.innerHeight || 340;
    const dpr = Math.max(2, window.devicePixelRatio || 2);
    const targetPixelW = Math.round(viewW * dpr);
    const targetPixelH = Math.round(viewH * dpr);
    if (canvas.width !== targetPixelW || canvas.height !== targetPixelH) {
      canvas.width = targetPixelW;
      canvas.height = targetPixelH;
    }
    const scaleX = (viewW / 400) * dpr;
    const scaleY = (viewH / 340) * dpr;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, 400, 340);

    const torsoAnchorX = 232 + currentTorsoX;
    const torsoAnchorY = 190 + currentTorsoY;
    const torsoW = 148;
    const torsoH = 157;

    // [Layer 1] 蓬松尾巴（锚定在躯干右后臀，打字时带残影与漫画摇摆线）
    if (imgTail && imgTail.complete && imgTail.naturalWidth > 0) {
      const tailRootX = torsoAnchorX + 46;
      const tailRootY = torsoAnchorY + 28;
      const tailW = 70;
      const tailH = 90;
      const wagFreq = wagFast ? 18 : 3.2;
      const wagAmp = isSleeping ? 0 : wagFast ? 0.24 : 0.09;
      const tailAngle = Math.sin(elapsedSec * wagFreq) * wagAmp + (isSleeping ? 0.25 : 0);

      // 快摇时的半透明残影与动作弧线
      if (wagFast) {
        [-0.22, 0.22].forEach((ghostOffset) => {
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.translate(tailRootX, tailRootY);
          ctx.rotate(currentTorsoRot + ghostOffset);
          ctx.drawImage(imgTail, -tailW * 0.16, -tailH * 0.86, tailW, tailH);
          ctx.restore();
        });

        ctx.save();
        ctx.translate(tailRootX + 38, tailRootY - 38);
        ctx.strokeStyle = '#2B1A12';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 28, -0.35 * Math.PI, 0.25 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(5, 2, 33, -0.28 * Math.PI, 0.2 * Math.PI);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(tailRootX, tailRootY);
      ctx.rotate(currentTorsoRot + tailAngle);
      ctx.drawImage(imgTail, -tailW * 0.16, -tailH * 0.86, tailW, tailH);
      ctx.restore();
    }

    // [Layer 2] 坐姿躯干底座 (torso.png)
    if (imgTorso && imgTorso.complete && imgTorso.naturalWidth > 0) {
      ctx.save();
      ctx.translate(torsoAnchorX, torsoAnchorY);
      ctx.rotate(currentTorsoRot);
      ctx.drawImage(imgTorso, -torsoW * 0.48, -torsoH * 0.52, torsoW, torsoH);
      ctx.restore();
    }

    // [Layer 3] 左侧半透明鼠标垫 + 180° 第一人称鼠标 + 180° 第一人称 60% 机械键盘
    drawMousepadAndMouse(nowPerf);
    drawFirstPersonKeyboard();

    // 计算跟随躯干倾斜后的左右肩膀连接点（位于头部下巴与胸毛后方）
    const cosT = Math.cos(currentTorsoRot);
    const sinT = Math.sin(currentTorsoRot);
    const rShoulderLocalX = -40;
    const rShoulderLocalY = -10;
    const lShoulderLocalX = 30;
    const lShoulderLocalY = -10;

    const rShoulderX = torsoAnchorX + rShoulderLocalX * cosT - rShoulderLocalY * sinT;
    const rShoulderY = torsoAnchorY + rShoulderLocalX * sinT + rShoulderLocalY * cosT;
    const lShoulderX = torsoAnchorX + lShoulderLocalX * cosT - lShoulderLocalY * sinT;
    const lShoulderY = torsoAnchorY + lShoulderLocalX * sinT + lShoulderLocalY * cosT;

    // [Layer 4] 短圆饱满的左右前臂与三趾小狗爪
    drawChubbyArmAndPaw(rShoulderX, rShoulderY, pawR, -1, wagFast);
    drawChubbyArmAndPaw(lShoulderX, lShoulderY, pawL, 1, wagFast);

    // [Layer 5] 胸前蓬松奶油色胸毛覆盖层 (chest_bib.png)，自然盖住两侧手臂内侧肩根，且裁剪在键盘上沿以上
    if (imgChestBib && imgChestBib.complete && imgChestBib.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 400, 234);
      ctx.clip();
      ctx.translate(torsoAnchorX, torsoAnchorY);
      ctx.rotate(currentTorsoRot);
      ctx.drawImage(imgChestBib, -torsoW * 0.48, -torsoH * 0.52, torsoW, torsoH);
      ctx.restore();
    }

    // [Layer 6] 独立头部表情层 + 实时裁剪眼球视线追踪 + 自然眨眼
    const headAnchorX = 226 + currentHeadX;
    const headAnchorY = 124 + currentHeadY;
    const headW = 192;
    const headH = Math.round((headW * META.headHeight) / META.headWidth); // ~142

    ctx.save();
    ctx.translate(headAnchorX, headAnchorY);
    ctx.rotate(currentHeadRot);

    // 打字或被摸头时双耳与头部轻微Q弹缩放抖动
    if (earBounce > 0.05 || pettingAmount > 0.05) {
      const eb =
        Math.sin(earBounce * Math.PI) * 0.022 +
        Math.sin(elapsedSec * 13) * 0.018 * pettingAmount;
      ctx.scale(1 + eb, 1 - eb * 0.65);
    }

    if (sleepAmount < 0.99) {
      const showHappyFace = isExcited || pettingAmount > 0.35;
      const baseHeadImg = showHappyFace ? imgHeadHappy : imgHeadSmile;
      if (baseHeadImg && baseHeadImg.complete && baseHeadImg.naturalWidth > 0) {
        ctx.drawImage(baseHeadImg, -headW / 2, -headH / 2, headW, headH);
        renderClippedIrises(showHappyFace, currentGazeX, currentGazeY);
        ctx.drawImage(irisCanvas, -headW / 2, -headH / 2, headW, headH);
      }

      const closeEyeAlpha = Math.max(
        blinkVal > 0.05 ? Math.sin(blinkVal * Math.PI) : 0,
        Math.min(1, pettingAmount * 1.15)
      );
      if (closeEyeAlpha > 0.02 && imgHeadBlink && imgHeadBlink.complete) {
        ctx.save();
        ctx.globalAlpha = closeEyeAlpha;
        ctx.drawImage(imgHeadBlink, -headW / 2, -headH / 2, headW, headH);
        ctx.restore();
      }
    }

    if (sleepAmount > 0.01 && imgHeadSleep && imgHeadSleep.complete) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, sleepAmount);
      ctx.drawImage(imgHeadSleep, -headW / 2, -headH / 2, headW, headH);
      ctx.restore();
    }

    ctx.restore();

    // [Layer 7] 飘浮键帽与睡觉 Zzz
    drawFloatersAndZzz(elapsedSec);

    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // 窗口拖动与右键菜单
  let isDragging = false;
  let dragRafPending = false;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    document.body.classList.add('dragging');
    window.pet?.dragStart();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) {
      const vw = window.innerWidth || 400;
      const vh = window.innerHeight || 340;
      const logicalX = (e.clientX / vw) * 400;
      const logicalY = (e.clientY / vh) * 340;
      handleHeadPetMove(logicalX, logicalY);
      return;
    }
    if (dragRafPending) return;
    dragRafPending = true;
    requestAnimationFrame(() => {
      dragRafPending = false;
      if (isDragging) {
        window.pet?.dragMove();
      }
    });
  });

  window.addEventListener('mouseleave', () => {
    lastPetPoint = null;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('dragging');
    window.pet?.dragEnd();
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.pet?.contextMenu();
  });

  // 订阅主进程事件
  if (window.pet) {
    window.pet.onKey(handleKey);
    window.pet.onKeyUp(handleKeyUp);
    window.pet.onMouse(handleMouse);
    window.pet.onWheel(handleWheel);
    window.pet.onCursor(handleCursor);
    window.pet.onHideLetters((hidden) => {
      hideLetters = Boolean(hidden);
    });
  }

  // 循环 Demo 模式（仅 ?demo=1 时开启，默认关闭）
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    const LABEL_OVERRIDE = { Space: '␣', Enter: '⏎' };

    function tapDemoKey(code, delayMs, holdMs = 95) {
      setTimeout(() => {
        handleKey({ code, label: LABEL_OVERRIDE[code] || code });
        setTimeout(() => handleKeyUp({ code }), holdMs);
      }, delayMs);
    }

    function runDemoCycle() {
      // 阶段 1 (0–2.1s)：光标绕圈，视线精准跟随，小狗右爪（屏幕左）控鼠、身体自然左倾，左右键点击
      for (let t = 0; t <= 2100; t += 50) {
        setTimeout(() => {
          const theta = (t / 2100) * Math.PI * 2;
          const nx = 0.5 + 0.38 * Math.cos(theta);
          const ny = 0.5 + 0.38 * Math.sin(theta);
          handleCursor({
            dx: (nx - 0.5) * 360,
            dy: (ny - 0.5) * 260,
            nx,
            ny,
          });
        }, t);
      }

      setTimeout(() => handleMouse({ down: true, button: 1 }), 1150);
      setTimeout(() => handleMouse({ down: false, button: 1 }), 1420);
      setTimeout(() => handleMouse({ down: true, button: 2 }), 1750);
      setTimeout(() => handleMouse({ down: false, button: 2 }), 2020);

      // 阶段 2 (2.35s–4.1s)：右爪留在鼠标上，按右半区键 J、K，左爪跨过去代打（躯干自然联动）
      tapDemoKey('J', 2350, 380);
      tapDemoKey('K', 3400, 360);

      // 阶段 3 (4.5s+)：连续快速输入，右爪回键盘双手分区打字、键位亮绿并开心张嘴吐舌头
      const phrase = ['H', 'E', 'L', 'L', 'O', 'Space', 'W', 'O', 'R', 'L', 'D', 'Enter'];
      phrase.forEach((code, idx) => {
        tapDemoKey(code, 4500 + idx * 140);
      });

      // 阶段 4 (7.0s–8.1s)：上排字母双手交替输入
      const topRow = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'];
      topRow.forEach((code, idx) => {
        tapDemoKey(code, 7000 + idx * 115);
      });

      // 阶段 5 (8.15s–9.35s)：鼠标在狗狗头顶来回揉搓抚摸（享受眯眼 + 吐舌笑 + 害羞腮红 + 歪头蹭手 + 飘小爱心）
      for (let t = 8150; t <= 9350; t += 40) {
        setTimeout(() => {
          const phase = ((t - 8150) / 1200) * Math.PI * 6;
          const lx = 226 + Math.sin(phase) * 44;
          const ly = 96 + Math.cos(phase * 0.5) * 8;
          handleHeadPetMove(lx, ly);
        }, t);
      }
    }

    runDemoCycle();
    setInterval(runDemoCycle, 9500);
  }
})();
