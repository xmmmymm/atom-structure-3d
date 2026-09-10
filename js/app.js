/* ============================================================
   原子结构 3D 示意模型 —— 主程序
   结构：工具 / 降级检测 / 排布算法 / 状态与文本 / 2D 绘制 /
        Scene3D（场景管理＋自实现相机控制）/ α 散射动画 /
        UI 构建与事件 / 导出 / 帧率监控 / 初始化
   ============================================================ */
(function () {
  'use strict';

  /* ================= 工具函数 ================= */
  var $ = function (id) { return document.getElementById(id); };
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad4(a) { return [a[0] || 0, a[1] || 0, a[2] || 0, a[3] || 0]; }
  function sumArr(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function supNum(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }
  function chargeSup(q) {
    if (q === 0) return '';
    var s = q > 0 ? '⁺' : '⁻';
    return Math.abs(q) === 1 ? s : supNum(Math.abs(q)) + s;
  }
  function chargePlain(q) {
    if (q === 0) return '';
    var s = q > 0 ? '+' : '−';
    return Math.abs(q) === 1 ? s : Math.abs(q) + s;
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }
  function triggerDownload(url, filename) {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  var LAYERS = LAYER_NAMES;

  /* ================= 降级检测 ================= */
  var THREE_OK = (typeof window.THREE !== 'undefined');
  function degrade(container, reason) {
    if (!container || container.querySelector('.degrade-layer')) return;
    container.classList.add('degraded');
    var d = document.createElement('div');
    d.className = 'degrade-layer';
    d.innerHTML =
      '<div class="degrade-title">⚠ ' + CONFIG.texts.degradeTitle + '</div>' +
      '<div class="degrade-reason">原因：' + reason + '</div>' +
      '<ol class="degrade-steps">' + CONFIG.texts.degradeSteps + '</ol>' +
      '<div class="degrade-note">2D 结构示意图、数值面板与排布探究不受影响，可继续使用。</div>';
    container.appendChild(d);
  }

  /* ================= 电子排布算法（1~20 号教学口径） ================= */
  function computeShells(total) {
    var shells = [];
    var rem = Math.max(0, Math.floor(total));
    for (var n = 1; n <= 4 && rem > 0; n++) {
      var cap = 2 * n * n;
      var q = Math.min(rem, cap);
      if (n >= 3 && q === rem && q > 8) q = 8; /* 该层将成为最外层时不超过 8 个 */
      shells.push(q);
      rem -= q;
    }
    if (rem > 0 && shells.length) shells[shells.length - 1] += rem; /* 教学范围外兜底 */
    return shells;
  }

  function outermostIdx(a) {
    var p = pad4(a);
    for (var i = 3; i >= 0; i--) if (p[i] > 0) return i;
    return -1;
  }

  /* 按统一算法判断"下一个电子应排入哪一层" */
  function greedyTargetLayer(shells) {
    var p = pad4(shells);
    var sum = sumArr(p);
    var expected = pad4(computeShells(sum + 1));
    for (var j = 0; j < 4; j++) {
      if (expected[j] > p[j]) return j;
      if (p[j] > expected[j]) return -1;
    }
    return -1;
  }

  /* 手动添加电子的规则校验 */
  function validateManualAdd(shells, idx) {
    var p = pad4(shells);
    var cap = 2 * (idx + 1) * (idx + 1);
    var name = LAYERS[idx] + ' 层';
    if (p[idx] + 1 > cap) {
      return { ok: false, msg: '① 违反"每层最多 2n² 个电子"：' + name + '最多容纳 ' + cap + ' 个电子，不能再添加。' };
    }
    var outer = outermostIdx(p);
    if (idx === outer) {
      var lim = idx === 0 ? 2 : 8;
      if (p[idx] + 1 > lim) {
        return { ok: false, msg: '② 违反"最外层不超过 8 个电子（K 层为最外层时不超过 2 个）"：' + name + '现在是最外层，已有 ' + p[idx] + ' 个，不能再添加。' };
      }
    } else if (outer !== -1 && idx < outer && p[idx] + 1 > 18) {
      return { ok: false, msg: '③ 违反"次外层不超过 18 个电子"：' + name + '是次外层，已有 ' + p[idx] + ' 个，不能再添加。' };
    }
    var target = greedyTargetLayer(p);
    if (target !== -1 && target !== idx) {
      var msg;
      if (target < idx) {
        msg = '④ 违反"先内后外"：电子应先排入能量更低的 ' + LAYERS[target] + ' 层。';
      } else {
        msg = '④ 违反排布顺序：按 1~20 号元素的排布规律，这个电子应排入 ' + LAYERS[target] + ' 层。';
        if (target === 3 && idx === 2 && p[2] === 8) msg += '（' + CONFIG.texts.R4 + '）';
      }
      return { ok: false, msg: msg };
    }
    return { ok: true };
  }

  /* ================= 状态与文本 ================= */
  function elByZ(z) { return ELEMENTS[z - 1]; }
  function defaultN(z) { return elByZ(z).defaultA - z; }
  function ionRange(z) {
    return [Math.max(1, z - CONFIG.limits.ION_DELTA_MAX), Math.min(20, z + CONFIG.limits.ION_DELTA_MAX)];
  }
  function makeCmpState(z, electrons) { return { z: z, n: defaultN(z), electrons: electrons }; }
  function stableMatch(shells) {
    var key = shells.filter(function (x) { return x > 0; }).join(',');
    for (var i = 0; i < RARE_GAS_TABLE.length; i++) {
      if (RARE_GAS_TABLE[i].shells.join(',') === key) return RARE_GAS_TABLE[i];
    }
    return null;
  }
  function tendencyText(shells) {
    if (!shells.length) return '';
    var outer = shells[shells.length - 1];
    if (shells.length === 1 && outer === 2) return '最外层为 2 个电子（K 层已满），是相对稳定结构。';
    if (outer === 8) return '最外层为 8 个电子，是相对稳定结构（稀有气体结构）。';
    if (outer <= 3) return '最外层只有 ' + outer + ' 个电子，在化学反应中容易失去电子，形成阳离子。';
    if (outer === 4) return '最外层为 4 个电子，一般不易得失电子。';
    return '最外层有 ' + outer + ' 个电子，在化学反应中容易得到电子，形成阴离子。';
  }
  function shellsOf(st) {
    if (st.mode === 'manual') return pad4(st.manualShells);
    return computeShells(st.electrons);
  }

  function buildPanel(root) {
    root.innerHTML =
      '<div class="prow"><span>元素</span><b class="p-el"></b></div>' +
      '<div class="prow"><span>质子数 Z</span><b class="p-z"></b></div>' +
      '<div class="prow"><span>中子数 N</span><b class="p-n"></b></div>' +
      '<div class="prow"><span>质量数 A</span><b class="p-a"></b></div>' +
      '<div class="prow"><span>核外电子数</span><b class="p-e"></b></div>' +
      '<div class="prow"><span>电荷</span><b class="p-q"></b></div>' +
      '<div class="prow"><span>各层电子数</span><b class="p-shells"></b></div>';
  }

  function updatePanel(root, st, shells) {
    var e = elByZ(st.z), q = st.z - st.electrons;
    root.querySelector('.p-el').textContent = e.name + '（' + e.symbol + (q !== 0 ? chargeSup(q) : '') + '）';
    root.querySelector('.p-z').textContent = st.z;
    root.querySelector('.p-n').textContent = st.n;
    root.querySelector('.p-a').textContent = st.z + st.n;
    root.querySelector('.p-e').textContent = st.electrons;
    root.querySelector('.p-q').textContent = q === 0 ? '0（电中性）' : chargePlain(q) + '（' + (q > 0 ? '阳' : '阴') + '离子）';
    var sh = '';
    for (var i = 0; i < 4; i++) {
      if (shells[i]) sh += '<i class="sh-dot" style="background:' + CONFIG.colors.layerCss[i] + '"></i>' + LAYERS[i] + '：' + shells[i] + ' ';
    }
    root.querySelector('.p-shells').innerHTML = sh || '—';
  }

  function updateBadges(root, st) {
    var q = st.z - st.electrons, b = [];
    if (q === 0) b.push('<span class="badge badge-atom">✓ 原子</span>');
    else b.push('<span class="badge badge-ion">⚡ 离子（' + (q > 0 ? '阳离子' : '阴离子') + '）</span>');
    if (st.n !== defaultN(st.z)) b.push('<span class="badge badge-iso">◇ 同位素</span>');
    var sg = stableMatch(computeShells(st.electrons));
    if (sg) b.push('<span class="badge badge-stable">✓ 相对稳定结构（同 ' + sg.symbol + '）</span>');
    root.innerHTML = b.join('');
  }

  function buildExplanation(st, shells) {
    var e = elByZ(st.z), q = st.z - st.electrons, paras = [];
    var sym = e.symbol + chargeSup(q);
    paras.push('<p>' + e.name + '元素' + (q === 0 ? '原子' : (q > 0 ? '阳离子' : '阴离子')) +
      ' <b>' + sym + '</b>：质子数 Z = ' + st.z + '，中子数 N = ' + st.n +
      '，质量数 A = Z + N = ' + st.z + ' + ' + st.n + ' = <b>' + (st.z + st.n) + '</b>。</p>');
    if (st.n !== defaultN(st.z)) {
      paras.push('<p>当前中子数与该元素最常见的同位素（N = ' + defaultN(st.z) + '）不同：这是' + e.name + '元素的一种<b>同位素</b>（质子数相同、中子数不同的核素互称同位素）。</p>');
    }
    if (q !== 0) {
      paras.push('<p>' + sym + ' 的核外电子数为 ' + st.electrons + ' 个，带 ' + Math.abs(q) + ' 个单位' +
        (q > 0 ? '正' : '负') + '电荷（质子数 ' + st.z + ' − 电子数 ' + st.electrons + ' = ' + (q > 0 ? '+' : '−') + Math.abs(q) + '）。</p>');
    }
    if (sumArr(shells) > 0) {
      var desc = '';
      for (var i = 0; i < 4; i++) if (shells[i]) desc += (desc ? '、' : '') + LAYERS[i] + ' 层 ' + shells[i] + ' 个';
      paras.push('<p>核外 ' + st.electrons + ' 个电子按能量由低到高排布：' + desc + '。</p>');
    }
    var sg = stableMatch(shells.filter(function (x) { return x > 0; }));
    if (sg) paras.push('<p>该电子层结构（' + shells.filter(function (x) { return x > 0; }).join('、') + '）与稀有气体 <b>' + sg.name + '（' + sg.symbol + '）</b>的原子相同，是相对稳定结构。</p>');
    if (st.z === 19 && st.electrons === 19) {
      paras.push('<p>' + CONFIG.texts.R4 + '</p>');
    } else if (q === 0 && sumArr(shells) > 0 && !(shells.length === 1 && shells[0] === 2)) {
      paras.push('<p>' + tendencyText(shells.filter(function (x) { return x > 0; })) + '</p>');
    }
    return paras.join('');
  }

  /* ================= 2D 结构示意图（Canvas 自绘） ================= */
  /* 让画布位图分辨率跟随显示尺寸与设备像素比：画布内文字始终按真实 CSS 像素绘制，缩放后依旧清晰 */
  function fitCanvasBox(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 10 && h > 10) {
      var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: w, h: h };
    }
    /* 画布处于隐藏状态时按原位图尺寸绘制 */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { w: canvas.width, h: canvas.height };
  }

  function drawDiagram(canvas, st) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var size = fitCanvasBox(canvas);
    var W = size.w, H = size.h;
    ctx.clearRect(0, 0, W, H);
    var e = elByZ(st.z), q = st.z - st.electrons;
    var shells = pad4(shellsOf(st));
    var last = outermostIdx(shells);
    var cx = W / 2, cy = H / 2 - 12; // 中心稍微上移
    var r0 = Math.min(W, H) * 0.10;
    var maxR = Math.min(W, H) / 2 - 28; // 给底部文字留出更多空间
    var i, j;
    for (i = 0; i <= last; i++) {
      var r = r0 + (i + 1) * (maxR - r0) / (last + 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#8aa4c6';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      var c = shells[i], col = CONFIG.colors.layerCss[i];
      for (j = 0; j < c; j++) {
        var a = -Math.PI / 2 + j * Math.PI * 2 / c;
        var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, Math.PI * 2);
    ctx.fillStyle = '#fdf1f0';
    ctx.fill();
    ctx.strokeStyle = '#d98880';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#1c2b3a';
    ctx.font = 'bold ' + Math.round(r0 * 0.95) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.symbol, cx, cy + 1);
    if (q !== 0) {
      ctx.font = 'bold ' + Math.round(r0 * 0.5) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = q > 0 ? '#c0392b' : '#1f618d';
      ctx.textAlign = 'left';
      ctx.fillText(chargePlain(q), cx + r0 * 0.5, cy - r0 * 0.55);
    }
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#5c6b7a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('（质子 ' + st.z + ' 个 · 中子 ' + st.n + ' 个）', cx, H - 8);
  }

  function updateLayerLegend(shells) {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html += '<div class="lg-row"><span class="lg-dot" style="background:' + CONFIG.colors.layerCss[i] + '"></span>' +
        '<span>' + LAYERS[i] + ' 层（第 ' + (i + 1) + ' 层）</span>' +
        '<span class="lg-cap">≤ ' + (2 * (i + 1) * (i + 1)) + '</span>' +
        '<b>' + (shells[i] || 0) + ' 个</b></div>';
    }
    html += '<div class="mini-note">' + CONFIG.texts.R3 + '</div>';
    $('layerLegend').innerHTML = html;
  }

  /* ================= 3D 场景（含自实现相机控制） ================= */
  var shared = null;
  var _tmpQ = null, _tmpV = null, _YAXIS = null;

  function makePlusTexture() {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(22, 32); ctx.lineTo(42, 32);
    ctx.moveTo(32, 22); ctx.lineTo(32, 42);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  function getShared() {
    if (shared) return shared;
    var cc = CONFIG.colors;
    shared = {
      protonMat: new THREE.MeshLambertMaterial({ color: cc.proton }),
      neutronMat: new THREE.MeshLambertMaterial({ color: cc.neutron }),
      electronMats: cc.layers.map(function (col) { return new THREE.MeshLambertMaterial({ color: col }); }),
      shellMats: cc.layers.map(function (col) {
        return new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: CONFIG.shellOpacityDefault, depthWrite: false, side: THREE.DoubleSide });
      }),
      nucleonGeo: new THREE.SphereGeometry(1, 14, 12),
      electronGeo: new THREE.SphereGeometry(CONFIG.electronRadius, 10, 8),
      shellGeos: CONFIG.shellRadii.map(function (r) { return new THREE.SphereGeometry(r, 36, 24); }),
      plusMat: new THREE.SpriteMaterial({ map: makePlusTexture(), transparent: true, depthTest: true })
    };
    _tmpQ = new THREE.Quaternion();
    _tmpV = new THREE.Vector3();
    _YAXIS = new THREE.Vector3(0, 1, 0);
    return shared;
  }

  function fibonacciSphere(count, radius) {
    var pts = [];
    if (count === 1) { pts.push(new THREE.Vector3(radius, 0, 0)); return pts; }
    var offset = 2 / count, inc = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < count; i++) {
      var y = i * offset - 1 + offset / 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var phi = i * inc;
      pts.push(new THREE.Vector3(Math.cos(phi) * r * radius, y * radius, Math.sin(phi) * r * radius));
    }
    return pts;
  }

  function protonNeutronMix(z, n) {
    var arr = [], i;
    for (i = 0; i < z; i++) arr.push(0);
    for (i = 0; i < n; i++) arr.push(1);
    var seed = 12345 + z * 97 + n * 13;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function circleLine(radius, color) {
    var pts = [];
    for (var i = 0; i <= 72; i++) {
      var a = i / 72 * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.75 });
    return new THREE.Line(geo, mat);
  }

  function Scene3D(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.ok = false;
    this.zoomed = false;
    this.theta = 0.9;
    this.phi = 1.12;
    this.radius = CONFIG.camera.radius;
    this.targetRadius = this.radius;
    this.baseRadius = CONFIG.camera.radius;   /* 按模型尺寸自动取景后的默认距离 */
    this.playing = true;
    this.speed = 1;
    this.reduceMotion = false;
    this.twinkle = false;
    this.cloudCount = CONFIG.electronCloudPoints;
    this.time = 0;
    this.kind = 'atom';
    this.rep = 'orbit';
    this.shellVisible = true;
    this.atomInfo = null;
    this.rotators = [];
    this.protonSprites = [];
    this.disposables = [];
    this.cloud = null;
    this.cloudMat = null;
    this.thomsonSpin = false;
    this.zoomEl = null;

    if (!THREE_OK) { degrade(container, CONFIG.texts.degradeThree); return; }
    var renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (err) { renderer = null; }
    if (!renderer) { degrade(container, CONFIG.texts.degradeWebGL); return; }
    this.ok = true;
    this.renderer = renderer;
    renderer.setPixelRatio(this.opts.lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(CONFIG.colors.background, 1);
    var dom = renderer.domElement;
    dom.style.width = '100%';
    dom.style.height = '100%';
    container.appendChild(dom);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 120);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var dl = new THREE.DirectionalLight(0xffffff, 0.7);
    dl.position.set(6, 9, 7);
    this.scene.add(dl);

    this.root = new THREE.Group();
    this.groupNucleus = new THREE.Group();
    this.groupShells = new THREE.Group();
    this.root.add(this.groupNucleus);
    this.root.add(this.groupShells);
    this.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this.buildZoomOverlay();
    this.bindControls();
    this.resize();
  }

  Scene3D.prototype.resize = function () {
    if (!this.ok) return;
    var w = this.container.clientWidth || 600;
    var h = this.container.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Scene3D.prototype.buildZoomOverlay = function () {
    var self = this;
    var d = document.createElement('div');
    d.className = 'zoom-overlay hidden';
    d.innerHTML =
      '<div class="zoom-title">原子核（局部放大）</div>' +
      '<div class="zoom-legend"><span class="dot p"></span>质子 <b class="zoom-p"></b> 个（红色，带正电荷）<br>' +
      '<span class="dot n"></span>中子 <b class="zoom-n"></b> 个（灰色，不带电）</div>' +
      '<button class="btn btn-small">↩ 返回</button>';
    d.querySelector('button').addEventListener('click', function () { self.exitZoom(); });
    this.container.appendChild(d);
    this.zoomEl = d;
  };

  Scene3D.prototype.bindControls = function () {
    var self = this, dom = this.renderer.domElement;
    dom.style.touchAction = 'none';
    var pointers = {};
    var pointerCount = 0;
    var drag = null;
    var pinchDist = 0;

    function pList() {
      var a = [];
      for (var k in pointers) a.push(pointers[k]);
      return a;
    }

    dom.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      pointerCount++;
      try { dom.setPointerCapture(e.pointerId); } catch (err) {}
      if (pointerCount === 1) drag = { moved: 0, x: e.clientX, y: e.clientY };
      else if (pointerCount === 2) {
        var pts = pList();
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        drag = null;
      }
    });

    dom.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      if (pointerCount === 2) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var pts = pList();
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDist > 0 && d > 0) {
          self.targetRadius = clamp(self.targetRadius * pinchDist / d, CONFIG.camera.minRadius, CONFIG.camera.maxRadius);
        }
        pinchDist = d;
      } else if (drag) {
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        self.theta -= dx * 0.008;
        self.phi = clamp(self.phi - dy * 0.008, 0.12, Math.PI - 0.12);
      }
    });

    function up(e) {
      if (!pointers[e.pointerId]) return;
      var wasClick = drag && drag.moved < 6;
      delete pointers[e.pointerId];
      pointerCount--;
      if (pointerCount < 2) pinchDist = 0;
      if (pointerCount === 0) {
        if (wasClick) self.handleClick(e);
        drag = null;
      }
    }
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);

    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.targetRadius = clamp(self.targetRadius * Math.exp(e.deltaY * 0.0012), CONFIG.camera.minRadius, CONFIG.camera.maxRadius);
    }, { passive: false });
  };

  Scene3D.prototype.handleClick = function (e) {
    if (!this.ok || this.zoomed) return;
    if (this.kind !== 'atom' && this.kind !== 'bohr' && this.kind !== 'rutherford' && this.kind !== 'cloud') return;
    if (!this.atomInfo || this.atomInfo.z + this.atomInfo.n <= 0) return;
    var rect = this.renderer.domElement.getBoundingClientRect();
    var ndc = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
    this.raycaster.setFromCamera(ndc, this.camera);
    var hits = this.raycaster.intersectObjects(this.groupNucleus.children, false);
    if (hits.length) this.enterZoom();
  };

  Scene3D.prototype.setAtom = function (st, o) {
    o = o || {};
    var newRep = o.representation || 'orbit';
    var newReduce = !!o.reduceMotion;
    var newShells = pad4(shellsOf(st));
    
    var needsRebuild = !this.atomInfo || this.kind !== 'atom' || this.rep !== newRep || this.reduceMotion !== newReduce || this.atomInfo.z !== st.z || this.atomInfo.n !== st.n;
    if (!needsRebuild) {
        for (var i = 0; i < 4; i++) { if (this.atomInfo.shells[i] !== newShells[i]) { needsRebuild = true; break; } }
    }

    this.kind = 'atom'; this.rep = newRep; this.shellVisible = o.shellVisible !== false;
    this.playing = !!o.playing; this.speed = o.speed || 1; this.reduceMotion = newReduce; this.twinkle = !!o.twinkle;
    
    var targetCloudCount = this.reduceMotion ? (o.compare ? CONFIG.compareReduceCloudPoints : CONFIG.reduceMotionCloudPoints) : (o.compare ? CONFIG.compareCloudPoints : CONFIG.electronCloudPoints);
    if (this.cloudCount !== targetCloudCount) { this.cloudCount = targetCloudCount; needsRebuild = true; }

    this.atomInfo = { z: st.z, n: st.n, shells: newShells };
    
    if (shared) { for (var m = 0; m < 4; m++) { if (shared.shellMats[m]) shared.shellMats[m].opacity = st.shellOpacity !== undefined ? st.shellOpacity : CONFIG.shellOpacityDefault; } }
    if (this.groupShells && !needsRebuild) {
        for (var k = 0; k < this.groupShells.children.length; k++) {
            var child = this.groupShells.children[k];
            if (child.isMesh && child.material && child.material.transparent && child.geometry && child.geometry.type === 'SphereGeometry') child.visible = this.shellVisible;
        }
    }
    if (needsRebuild) this.rebuild();
};

  Scene3D.prototype.setModel = function (modelId, shells, o) {
    o = o || {};
    this.kind = modelId;
    this.playing = !!o.playing;
    this.speed = o.speed || 1;
    this.reduceMotion = !!o.reduceMotion;
    this.cloudCount = this.reduceMotion ? CONFIG.reduceMotionCloudPoints : CONFIG.electronCloudPoints;
    this.atomInfo = { z: o.z || 0, n: o.n || 0, shells: pad4(shells) };
    this.rebuild();
  };

  Scene3D.prototype.rebuild = function () {
    if (!this.ok) return;
    var wasZoomed = this.zoomed;
    this.zoomed = false;
    if (this.zoomEl) this.zoomEl.classList.add('hidden');
    this.clearGroup(this.groupNucleus);
    this.clearGroup(this.groupShells);
    this.disposeTemp();
    this.rotators = [];
    this.protonSprites = [];
    this.thomsonSpin = false;

    if (this.kind === 'atom') {
      this.buildNucleus(this.atomInfo.z, this.atomInfo.n);
      if (this.rep === 'orbit') this.buildOrbitShells(this.atomInfo.shells);
      else this.buildCloud(this.atomInfo.shells, this.cloudCount);
    } else if (this.kind === 'dalton') {
      this.buildDalton();
    } else if (this.kind === 'thomson') {
      this.buildThomson();
    } else if (this.kind === 'rutherford') {
      this.buildRutherford();
    } else if (this.kind === 'bohr') {
      this.buildBohr(this.atomInfo.shells, this.atomInfo.z, this.atomInfo.n);
    } else if (this.kind === 'cloud') {
      this.buildNucleus(this.atomInfo.z, this.atomInfo.n);
      this.buildCloud(this.atomInfo.shells, this.cloudCount);
    }

    /* 按模型实际尺寸自动取景：3D 区变大后保证模型完整可见、留边和谐 */
    var needR = 0, si;
    if (this.kind === 'atom' || this.kind === 'bohr' || this.kind === 'cloud') {
      for (si = 0; si < 4; si++) {
        if (this.atomInfo.shells[si]) {
          needR = Math.max(needR, CONFIG.shellRadii[si] * (this.kind === 'cloud' ? 1.3 : 1));
        }
      }
    } else if (this.kind === 'rutherford') needR = 4.2;
    else if (this.kind === 'dalton') needR = 2.2;
    else if (this.kind === 'thomson') needR = 2.5;
    if (needR > 0) {
      var halfFov = Math.tan(CONFIG.camera.fov * 0.5 * Math.PI / 180);
      this.baseRadius = clamp(needR / halfFov * 1.12, CONFIG.camera.minRadius, CONFIG.camera.maxRadius);
      this.targetRadius = this.baseRadius;
    }

    this.groupShells.visible = true;
    this.groupNucleus.visible = true;
    this.groupNucleus.scale.setScalar((this.kind === 'rutherford' || this.kind === 'bohr') ? 0.5 : 1);

    if (wasZoomed && (this.kind === 'atom') && this.atomInfo.z + this.atomInfo.n > 0) {
      this.enterZoom();
    }
  };

  Scene3D.prototype.clearGroup = function (g) {
    while (g.children.length) g.remove(g.children[0]);
  };

  Scene3D.prototype.disposeTemp = function () {
    for (var i = 0; i < this.disposables.length; i++) {
      if (this.disposables[i] && this.disposables[i].dispose) this.disposables[i].dispose();
    }
    this.disposables = [];
    this.cloud = null;
  };

  Scene3D.prototype.buildNucleus = function (z, n) {
    var count = z + n;
    if (count <= 0) return;
    var S = getShared();
    var radius = count === 1 ? 0 : CONFIG.nucleusRadius * (count <= 4 ? 0.42 : 0.6);
    var pts = fibonacciSphere(count, radius);
    var size = count === 1 ? 0.5 : clamp(1.45 / Math.sqrt(count), 0.13, 0.4);
    this.nucleonSize = size;
    var types = protonNeutronMix(z, n);
    for (var i = 0; i < count; i++) {
      var m = new THREE.Mesh(S.nucleonGeo, types[i] ? S.neutronMat : S.protonMat);
      m.scale.setScalar(size);
      m.position.copy(pts[i]);
      this.groupNucleus.add(m);
      if (!types[i]) {
        var sp = new THREE.Sprite(S.plusMat);
        sp.scale.setScalar(size * 1.15);
        sp.userData.base = pts[i];
        sp.visible = false;
        this.groupNucleus.add(sp);
        this.protonSprites.push(sp);
      }
    }
  };

  Scene3D.prototype.buildOrbitShells = function (shells) {
    var S = getShared();
    var AXES = [
      new THREE.Vector3(0.25, 1, 0.4),
      new THREE.Vector3(-0.45, 1, 0.25),
      new THREE.Vector3(0.55, 1, -0.35),
      new THREE.Vector3(-0.25, 1, -0.55)
    ];
    for (var i = 0; i < 4; i++) {
      var c = shells[i];
      if (!c) continue;
      var sph = new THREE.Mesh(S.shellGeos[i], S.shellMats[i]);
      sph.visible = this.shellVisible;
      this.groupShells.add(sph);
      var grp = new THREE.Group();
      var pts = fibonacciSphere(c, CONFIG.shellRadii[i]);
      for (var j = 0; j < pts.length; j++) {
        var el = new THREE.Mesh(S.electronGeo, S.electronMats[i]);
        el.position.copy(pts[j]);
        grp.add(el);
      }
      this.groupShells.add(grp);
      this.rotators.push({
        grp: grp,
        axis: AXES[i].clone().normalize(),
        w: (i % 2 ? -1 : 1) * CONFIG.animation.baseAngularSpeed * (1.7 / (i + 1))
      });
    }
  };

  Scene3D.prototype.buildCloud = function (shells, count) {
    var total = sumArr(shells);
    if (total <= 0 || !count) return;
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var c = new THREE.Color();
    for (var i = 0; i < count; i++) {
      var r = Math.random() * total, layer = 3, acc = 0;
      for (var l = 0; l < 4; l++) {
        acc += shells[l];
        if (r < acc) { layer = l; break; }
      }
      var g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      var rad = CONFIG.shellRadii[layer] * (1 + 0.26 * g);
      var u = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
      var s = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = s * Math.cos(ph) * rad;
      pos[i * 3 + 1] = u * rad;
      pos[i * 3 + 2] = s * Math.sin(ph) * rad;
      c.set(CONFIG.colors.layers[layer]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.cloudMat) {
      this.cloudMat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true });
    }
    this.cloudMat.opacity = 0.9;
    this.cloud = new THREE.Points(geo, this.cloudMat);
    this.groupShells.add(this.cloud);
    this.disposables.push(geo);
  };

  Scene3D.prototype.buildDalton = function () {
    var geo = new THREE.SphereGeometry(2.2, 40, 28);
    var mat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.dalton });
    this.groupShells.add(new THREE.Mesh(geo, mat));
    this.disposables.push(geo, mat);
  };

  Scene3D.prototype.buildThomson = function () {
    var geo = new THREE.SphereGeometry(2.5, 40, 28);
    var mat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.thomsonPositive, transparent: true, opacity: 0.5 });
    this.groupShells.add(new THREE.Mesh(geo, mat));
    this.disposables.push(geo, mat);
    var S = getShared();
    var eGeo = new THREE.SphereGeometry(0.22, 10, 8);
    var eMat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.thomsonElectron });
    this.disposables.push(eGeo, eMat);
    var seed = 777;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 10; i++) {
      var u = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, rr = 0.6 + rnd() * 1.1;
      var s = Math.sqrt(Math.max(0, 1 - u * u));
      var e = new THREE.Mesh(eGeo, eMat);
      e.position.set(s * Math.cos(ph) * rr, u * rr, s * Math.sin(ph) * rr);
      this.groupShells.add(e);
    }
    this.thomsonSpin = true;
  };

  Scene3D.prototype.buildRutherford = function () {
    this.buildNucleus(3, 4);
    var S = getShared();
    var seed = 4242;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 3; i++) {
      var R = 3.0 + i * 0.6;
      var grp = new THREE.Group();
      var line = circleLine(R, 0x8aa4c6);
      grp.add(line);
      this.disposables.push(line.geometry, line.material);
      var e = new THREE.Mesh(S.electronGeo, S.electronMats[i % 4]);
      e.position.set(R, 0, 0);
      grp.add(e);
      grp.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      this.groupShells.add(grp);
      this.rotators.push({ grp: grp, localY: true, w: (i % 2 ? -1 : 1) * (0.8 + 0.3 * i) });
    }
  };

  Scene3D.prototype.buildBohr = function (shells, z, n) {
    this.buildNucleus(z, n);
    var S = getShared();
    for (var i = 0; i < 4; i++) {
      var c = shells[i];
      if (!c) continue;
      var R = CONFIG.shellRadii[i];
      var grp = new THREE.Group();
      var line = circleLine(R, CONFIG.colors.layers[i]);
      grp.add(line);
      this.disposables.push(line.geometry, line.material);
      for (var j = 0; j < c; j++) {
        var e = new THREE.Mesh(S.electronGeo, S.electronMats[i]);
        var a = j * Math.PI * 2 / c;
        e.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
        grp.add(e);
      }
      this.groupShells.add(grp);
      this.rotators.push({ grp: grp, localY: true, w: (i % 2 ? -1 : 1) * CONFIG.animation.baseAngularSpeed * (1.5 / (i + 1)) });
    }
  };

  Scene3D.prototype.enterZoom = function () {
    if (this.zoomed || !this.ok) return;
    this.zoomed = true;
    this.targetRadius = CONFIG.camera.zoomNucleusRadius;
    this.groupShells.visible = false;
    this.groupNucleus.scale.setScalar(CONFIG.nucleonDisplayScale);
    if (this.zoomEl && this.atomInfo) {
      this.zoomEl.querySelector('.zoom-p').textContent = this.atomInfo.z;
      this.zoomEl.querySelector('.zoom-n').textContent = this.atomInfo.n;
      this.zoomEl.classList.remove('hidden');
    }
  };

  Scene3D.prototype.exitZoom = function () {
    if (!this.ok) return;
    this.zoomed = false;
    this.targetRadius = this.baseRadius || CONFIG.camera.radius;
    this.groupShells.visible = true;
    if (this.kind === 'rutherford' || this.kind === 'bohr') this.groupNucleus.scale.setScalar(0.5);
    else this.groupNucleus.scale.setScalar(1);
    if (this.zoomEl) this.zoomEl.classList.add('hidden');
    for (var i = 0; i < this.protonSprites.length; i++) this.protonSprites[i].visible = false;
  };

  Scene3D.prototype.resetView = function () {
    this.theta = 0.9;
    this.phi = 1.12;
    this.targetRadius = this.baseRadius || CONFIG.camera.radius;
    if (this.zoomed) this.exitZoom();
  };

  Scene3D.prototype.tick = function (dt) {
    if (!this.ok) return;
    this.time += dt;
    this.radius += (this.targetRadius - this.radius) * Math.min(1, dt * CONFIG.camera.lerpFactor);
    var sp = Math.sin(this.phi);
    this.camera.position.set(
      this.radius * sp * Math.cos(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * sp * Math.sin(this.theta)
    );
    this.camera.lookAt(0, 0, 0);

    var animate = this.playing && !this.reduceMotion;
    if (animate && this.rotators.length) {
      getShared();
      for (var i = 0; i < this.rotators.length; i++) {
        var r = this.rotators[i];
        var ang = r.w * dt * this.speed;
        if (r.localY) r.grp.rotateOnAxis(_YAXIS, ang);
        else {
          _tmpQ.setFromAxisAngle(r.axis, ang);
          r.grp.quaternion.premultiply(_tmpQ);
        }
      }
    }
    if (animate && this.thomsonSpin) this.groupShells.rotation.y += 0.25 * dt * this.speed;
    if (this.kind === 'atom' && this.rep === 'cloud' && this.cloud) {
      if (this.twinkle && animate) {
        var val = 0.45 + CONFIG.animation.cloudTwinkleAmp * Math.sin(this.time * CONFIG.animation.cloudTwinkleSpeed);
        this.cloudMat.opacity = val;
        this.cloudMat.size = 0.07 + 0.04 * Math.sin(this.time * CONFIG.animation.cloudTwinkleSpeed); // 增加大小呼吸效果
      } else if (this.cloudMat.opacity !== 0.9) {
        this.cloudMat.opacity = 0.9;
        this.cloudMat.size = 0.07;
      }
    }
    if (this.zoomed && this.protonSprites.length) {
      getShared();
      var dir = _tmpV.copy(this.camera.position).normalize();
      for (var k = 0; k < this.protonSprites.length; k++) {
        var ps = this.protonSprites[k];
        ps.visible = true;
        ps.position.copy(ps.userData.base).addScaledVector(dir, (this.nucleonSize || 0.3) * 1.2);
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  Scene3D.prototype.exportPNG = function (filename) {
    if (!this.ok) return false;
    this.renderer.render(this.scene, this.camera);
    triggerDownload(this.renderer.domElement.toDataURL('image/png'), filename);
    return true;
  };

  /* ================= α 粒子散射 2D 示意动画 ================= */
  function AlphaAnim(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.foilX = this.W * 0.58;
    this.particles = [];
    this.running = false;
    this.done = false;
  }

  /* 让 α 动画画布按显示尺寸与设备像素比重建位图：展开后仍清晰、标注字号为真实像素 */
  AlphaAnim.prototype.fit = function () {
    var c = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = c.clientWidth, h = c.clientHeight;
    if (!(w > 10) || !(h > 10)) return;
    var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    this.foilX = w * 0.58;
  };

  AlphaAnim.prototype.reset = function () {
    this.fit();
    var seed = 20260901;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    this.particles = [];
    for (var i = 0; i < 54; i++) {
      var r = rnd(), ang;
      if (r < 0.7) {
        ang = (rnd() - 0.5) * 6 * Math.PI / 180;
      } else if (r < 0.93) {
        ang = (rnd() > 0.5 ? 1 : -1) * (18 + rnd() * 26) * Math.PI / 180;
      } else {
        ang = (rnd() > 0.5 ? 1 : -1) * (150 + rnd() * 28) * Math.PI / 180;
      }
      this.particles.push({
        x: -30 - rnd() * 170,
        y: 40 + rnd() * (this.H - 80),
        v: 210 + rnd() * 60,
        ang: ang,
        passed: false,
        trail: []
      });
    }
    this.running = false;
    this.done = false;
    this.draw();
  };

  AlphaAnim.prototype.step = function (dt) {
    var alive = false;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var vx = p.v, vy = 0;
      if (p.passed) {
        vx = Math.cos(p.ang) * p.v;
        vy = Math.sin(p.ang) * p.v;
      }
      p.x += vx * dt;
      p.y += vy * dt;
      if (!p.passed && p.x >= this.foilX) p.passed = true;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 30) p.trail.shift();
      if (p.x > -80 && p.x < this.W + 80 && p.y > -40 && p.y < this.H + 40) alive = true;
    }
    if (!alive) {
      this.running = false;
      this.done = true;
    }
    this.draw();
  };

  AlphaAnim.prototype.drawScene = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    /* 放射源 */
    ctx.fillStyle = '#7f8c99';
    ctx.fillRect(18, H * 0.5 - 46, 34, 92);
    ctx.strokeStyle = '#5c6b7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, H * 0.5 - 46, 34, 92);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('α 粒子', 35, H * 0.5 - 54);
    ctx.fillText('放射源', 35, H * 0.5 + 66);
    /* 准直细缝 */
    ctx.fillStyle = '#7f8c99';
    ctx.fillRect(56, H * 0.5 - 26, 10, 14);
    ctx.fillRect(56, H * 0.5 + 12, 10, 14);
    /* 金箔 */
    var fx = this.foilX;
    ctx.fillStyle = '#f7d774';
    ctx.fillRect(fx - 6, 26, 12, H - 52);
    ctx.strokeStyle = '#c9a227';
    ctx.strokeRect(fx - 6, 26, 12, H - 52);
    ctx.fillStyle = '#b8860b';
    for (var r = 0; r < 9; r++) {
      ctx.beginPath();
      ctx.arc(fx, 52 + r * ((H - 104) / 8), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7a5c00';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText('金箔', fx, 18);
    /* 结果注释 */
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5c6b7a';
    ctx.fillText('大多数：几乎不偏转', fx + 28, 74);
    ctx.fillStyle = '#e67e22';
    ctx.fillText('少数：发生较大角度偏转', fx + 28, 116);
    ctx.fillStyle = '#c0392b';
    ctx.fillText('极少数：几乎被弹回', fx + 28, 158);
    /* 示意标注 */
    ctx.fillStyle = '#8a5a00';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('示意动画', W - 12, H - 12);
  };

  AlphaAnim.prototype.draw = function () {
    this.drawScene();
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.trail.length > 1) {
        for (var j = 1; j < p.trail.length; j++) {
          var a = j / p.trail.length;
          ctx.strokeStyle = 'rgba(245, 179, 1, ' + (0.15 + 0.5 * a).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
          ctx.lineTo(p.trail[j].x, p.trail[j].y);
          ctx.stroke();
        }
      }
      if (p.x > -20 && p.x < this.W + 20 && p.y > -20 && p.y < this.H + 20) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.colors.alphaParticle;
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };

  /* ================= 全局状态 ================= */
  var App = {
    tab: 2,
    state: null,
    cmp: { L: makeCmpState(11, 11), R: makeCmpState(11, 10) },
    modelIndex: 0,
    evalVisible: false
  };
  var scene1 = null, scene2 = null, scene3 = null, cmpL = null, cmpR = null, alphaAnim = null;

  function initState() {
    var d = CONFIG.defaults;
    App.state = {
      z: d.z,
      n: defaultN(d.z),
      electrons: d.z,
      mode: d.mode,
      manualShells: [0, 0, 0, 0],
      representation: d.representation,
      playing: d.playing,
      speed: d.speed,
      reduceMotion: d.reduceMotion,
      cloudTwinkle: d.cloudTwinkle,
      shellVisible: d.shellVisible,
      shellOpacity: CONFIG.shellOpacityDefault,
      compare: d.compare
    };
  }

  function setElement(z) {
    z = clamp(z, CONFIG.limits.Z_MIN, CONFIG.limits.Z_MAX);
    var st = App.state;
    st.z = z;
    st.n = defaultN(z);
    st.electrons = z;
    if (st.mode === 'manual') st.manualShells = [0, 0, 0, 0];
    refreshAll();
  }

  /* ================= UI 构建 ================= */
  function buildSelects() {
    var html = '';
    for (var i = 0; i < ELEMENTS.length; i++) {
      var e = ELEMENTS[i];
      html += '<option value="' + e.z + '">' + e.z + ' · ' + e.name + '（' + e.symbol + '）</option>';
    }
    $('selElement').innerHTML = html;
    $('cmpSelL').innerHTML = html;
    $('cmpSelR').innerHTML = html;
  }

  function buildPresets() {
    var html = '';
    for (var i = 0; i < PRESETS_ELEMENTS.length; i++) {
      var sym = PRESETS_ELEMENTS[i];
      var e = null;
      for (var j = 0; j < ELEMENTS.length; j++) if (ELEMENTS[j].symbol === sym) e = ELEMENTS[j];
      if (e) html += '<button class="btn" data-z="' + e.z + '">' + e.symbol + ' ' + e.name + '</button>';
    }
    $('elementPresets').innerHTML = html;
    var btns = $('elementPresets').querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () { setElement(parseInt(btn.getAttribute('data-z'), 10)); });
      })(btns[b]);
    }
  }

  function buildDataTable() {
    var html = '<table class="data-table"><thead><tr><th>元素</th><th>符号</th><th>质子数 Z</th><th>中子数 N*</th><th>质量数 A</th><th>相对原子质量</th><th>各层电子数</th></tr></thead><tbody>';
    for (var i = 0; i < ELEMENTS.length; i++) {
      var e = ELEMENTS[i];
      html += '<tr><td>' + e.name + '</td><td>' + e.symbol + '</td><td>' + e.z + '</td><td>' + (e.defaultA - e.z) +
        '</td><td>' + e.defaultA + '</td><td>' + e.relMass + '</td><td>' + computeShells(e.z).join('、') + '</td></tr>';
    }
    html += '</tbody></table><div class="mini-note">* 中子数按该元素最常见同位素计算（近似处理）。表中"各层电子数"为中性原子的排布。</div>';
    $('dataTableWrap').innerHTML = html;
  }

  function buildDiscussion() {
    var html = '<p class="mini-note">' + DISCUSSION.intro + '</p>';
    html += '<div class="rg-table-wrap"><table class="data-table"><thead><tr><th>稀有气体</th><th>符号</th><th>各层电子数</th><th>最外层</th></tr></thead><tbody>';
    for (var i = 0; i < RARE_GAS_TABLE.length; i++) {
      var g = RARE_GAS_TABLE[i];
      html += '<tr><td>' + g.name + '</td><td>' + g.symbol + '</td><td>' + g.shells.join('、') + '</td><td>' + g.shells[g.shells.length - 1] + '</td></tr>';
    }
    html += '</tbody></table></div>';
    for (var q = 0; q < DISCUSSION.questions.length; q++) {
      var d = DISCUSSION.questions[q];
      html += '<div class="disc-q">' +
        '<div class="disc-title">问题 ' + (q + 1) + '：' + d.q + '</div>' +
        '<div class="disc-btns">' +
        '<button class="btn btn-small" data-disc="hint" data-i="' + q + '">显示提示</button>' +
        '<button class="btn btn-small" data-disc="concl" data-i="' + q + '">显示结论</button></div>' +
        '<div class="disc-a hidden" id="discHint' + q + '">提示：' + d.hint + '</div>' +
        '<div class="disc-a hidden" id="discConcl' + q + '">结论：' + d.conclusion + '</div></div>';
    }
    $('discussion').innerHTML = html;
    var btns = $('discussion').querySelectorAll('[data-disc]');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var i = parseInt(btn.getAttribute('data-i'), 10);
          var isHint = btn.getAttribute('data-disc') === 'hint';
          var box = $(isHint ? 'discHint' + i : 'discConcl' + i);
          var nowHidden = box.classList.toggle('hidden');
          btn.textContent = nowHidden ? (isHint ? '显示提示' : '显示结论') : (isHint ? '隐藏提示' : '隐藏结论');
        });
      })(btns[b]);
    }
  }

  function buildTimeline() {
    var html = '';
    for (var i = 0; i < MODELS.length; i++) {
      var m = MODELS[i];
      html += '<button class="tl-btn" data-i="' + i + '">' +
        '<span class="tl-year">' + m.year + '</span>' +
        '<span class="tl-name">' + m.name + '</span>' +
        '<span class="tl-sci">' + m.scientist + '</span></button>';
    }
    $('modelTimeline').innerHTML = html;
    var btns = $('modelTimeline').querySelectorAll('.tl-btn');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () { selectModel(parseInt(btn.getAttribute('data-i'), 10)); });
      })(btns[b]);
    }
  }

  function buildRules() {
    var html = '';
    for (var i = 0; i < CONFIG.texts.rules.length; i++) html += '<li>' + CONFIG.texts.rules[i] + '</li>';
    $('ruleList').innerHTML = html;
  }

  /* ================= 模型页签 ================= */
  function selectModel(i, skipScene) {
    App.modelIndex = i;
    var btns = document.querySelectorAll('#modelTimeline .tl-btn');
    for (var b = 0; b < btns.length; b++) btns[b].classList.toggle('active', b === i);
    var m = MODELS[i];
    $('modelInfo').innerHTML =
      '<div class="mi-row"><b>年代：</b>' + m.year + '</div>' +
      '<div class="mi-row"><b>科学家：</b>' + m.scientist + '</div>' +
      '<div class="mi-row"><b>模型名称：</b>' + m.name + '</div>' +
      '<div class="mi-row"><b>核心观点：</b>' + m.coreIdea + '</div>';
    $('modelEval').innerHTML =
      '<div class="ev-block good"><b>✓ 能解释</b>' + m.canExplain + '</div>' +
      '<div class="ev-block bad"><b>⚠ 局限</b>' + m.limitation + '</div>';
    $('modelEval').classList.toggle('hidden', !App.evalVisible);
    $('btnEval').textContent = App.evalVisible ? '▼ 收起模型评价' : '▶ 模型评价（能解释 / 局限）';
    var badgeMap = {
      dalton: '',
      thomson: '正电荷球与电子分布为教学示意',
      rutherford: '电子轨道为教学示意，非真实轨道',
      bohr: '分层轨道为教学示意，非真实轨道',
      cloud: CONFIG.texts.cloudNote
    };
    var badge = badgeMap[m.id] || '';
    $('modelBadge').textContent = badge;
    $('modelBadge').classList.toggle('hidden', !badge);

    /* 示意图旁的"这是什么原子"标签 */
    var curEl = elByZ(App.state.z);
    var curQ = App.state.z - App.state.electrons;
    var curSym = curEl.symbol + chargeSup(curQ);
    var atomTags = {
      dalton: '示意：原子是不可再分的实心小球（无内部结构）',
      thomson: '示意：带正电的球体，电子像葡萄干一样镶嵌其中',
      rutherford: '示意图原子：锂（Li）· 原子核含 3 个质子、4 个中子',
      bohr: '示意图原子：' + curEl.name + '（' + curSym + '）· 各层电子数 ' + computeShells(App.state.electrons).join('、'),
      cloud: '示意图原子：' + curEl.name + '（' + curSym + '）· 中心小球为原子核，点击核可放大观察'
    };
    var atomTag = atomTags[m.id] || '';
    $('modelAtomTag').textContent = atomTag;
    $('modelAtomTag').classList.toggle('hidden', !atomTag);
    if (!skipScene && scene3 && scene3.ok) {
      scene3.setModel(m.id, computeShells(App.state.electrons), {
        playing: App.state.playing,
        speed: App.state.speed,
        reduceMotion: App.state.reduceMotion,
        z: App.state.z,
        n: App.state.n
      });
    }
  }

  function switchTab(n) {
    App.tab = n;
    var btns = document.querySelectorAll('#mainTabs .tab-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', parseInt(btns[i].getAttribute('data-tab'), 10) === n);
    }
    for (var p = 1; p <= 3; p++) $('page' + p).classList.toggle('hidden', p !== n);
    requestAnimationFrame(function () {
      if (n === 1 && scene1 && scene1.ok) scene1.resize();
      if (n === 2) {
        if (App.state.compare) {
          if (cmpL && cmpL.ok) cmpL.resize();
          if (cmpR && cmpR.ok) cmpR.resize();
        } else if (scene2 && scene2.ok) {
          scene2.resize();
        }
        drawDiagram($('canvas2d'), App.state);
      }
      if (n === 3) {
        if (scene3 && scene3.ok) scene3.resize();
        selectModel(App.modelIndex);
        if (alphaAnim && !$('alphaWrap').classList.contains('hidden')) alphaAnim.draw();
      }
    });
  }

  /* ================= 刷新管线 ================= */
  function showManualMsg(html, cls) {
    var box = $('manualMsg');
    box.innerHTML = html;
    box.className = 'manual-msg' + (cls ? ' ' + cls : '');
  }

  function updateManualMsg() {
    var st = App.state;
    if (st.mode !== 'manual') { showManualMsg('', ''); return; }
    var placed = sumArr(st.manualShells);
    var expected = computeShells(st.electrons);
    var cur = pad4(st.manualShells);
    var same = true;
    for (var i = 0; i < 4; i++) if (cur[i] !== (expected[i] || 0)) same = false;
    if (placed === st.electrons && same) {
      showManualMsg('✓ 排布完成且正确' + (st.electrons === st.z ? '（原子）' : '（离子）') + '：' + expected.join('、'), 'ok');
    } else if (placed === st.electrons) {
      showManualMsg('已排完全部 ' + placed + ' 个电子，但与排布规律不符，可点击"一键纠正"。', '');
    } else {
      showManualMsg('已排 ' + placed + ' / ' + st.electrons + ' 个电子。', '');
    }
  }

  function updateCompareVisibility() {
    var on = App.state.compare;
    $('singleWrap').classList.toggle('hidden', on);
    $('diagramRow').classList.toggle('hidden', on);
    $('compareWrap').classList.toggle('hidden', !on);
    $('modeCard').classList.toggle('hidden', on);
    $('ionCard').classList.toggle('hidden', on);
  }

  function updateCompare() {
    var base = {
      representation: App.state.representation,
      shellVisible: App.state.shellVisible,
      playing: App.state.playing,
      speed: App.state.speed,
      reduceMotion: App.state.reduceMotion,
      twinkle: false,
      compare: true
    };
    for (var s = 0; s < 2; s++) {
      var k = s === 0 ? 'L' : 'R';
      var cst = App.cmp[k];
      var shells = pad4(computeShells(cst.electrons));
      var el = elByZ(cst.z);
      var q = cst.z - cst.electrons;
      var sel = $('cmpSel' + k);
      if (sel.value !== String(cst.z)) sel.value = String(cst.z);
      $('cmpValE' + k).textContent = cst.electrons;
      var rg = ionRange(cst.z);
      $('cmpEm' + k + 'Minus').disabled = cst.electrons <= rg[0];
      $('cmpEm' + k + 'Plus').disabled = cst.electrons >= rg[1];
      $('cmpSym' + k).innerHTML = '<b>' + el.symbol + chargeSup(q) + '</b>（' + el.name +
        (q === 0 ? ' 原子' : (q > 0 ? ' 阳离子' : ' 阴离子')) + '）';
      updatePanel($('cmpPanel' + k), cst, shells);
      updateBadges($('cmpBadges' + k), cst);
      drawDiagram($('cmp2d' + k), cst);
      var sc = k === 'L' ? cmpL : cmpR;
      if (sc && sc.ok) sc.setAtom(cst, base);
    }
  }

  function refreshAll() {
    var st = App.state;
    var shells = pad4(shellsOf(st));
    var el = elByZ(st.z);
    var q = st.z - st.electrons;
    var rg = ionRange(st.z);

    if ($('selElement').value !== String(st.z)) $('selElement').value = String(st.z);
    $('valZ').textContent = st.z;
    $('btnZMinus').disabled = st.z <= CONFIG.limits.Z_MIN;
    $('btnZPlus').disabled = st.z >= CONFIG.limits.Z_MAX;
    $('valN').textContent = st.n;
    $('btnNMinus').disabled = st.n <= 0;
    $('btnNPlus').disabled = st.n >= CONFIG.limits.N_MAX;
    $('valE').textContent = st.electrons;
    $('btnEMinus').disabled = st.electrons <= rg[0];
    $('btnEPlus').disabled = st.electrons >= rg[1];
    $('ionNote').textContent = q === 0
      ? '当前为电中性的原子（质子数 = 电子数）。'
      : '当前为' + (q > 0 ? '阳' : '阴') + '离子 ' + el.symbol + chargeSup(q) +
        '（' + (q > 0 ? '失去' : '得到') + ' ' + Math.abs(q) + ' 个电子）。';

    $('modeAuto').classList.toggle('active', st.mode === 'auto');
    $('modeManual').classList.toggle('active', st.mode === 'manual');
    $('manualBox').classList.toggle('hidden', st.mode !== 'manual');

    $('repOrbit').classList.toggle('active', st.representation === 'orbit');
    $('repCloud').classList.toggle('active', st.representation === 'cloud');
    $('repBadge').textContent = st.representation === 'orbit' ? CONFIG.texts.orbitNote : CONFIG.texts.cloudNote;
    $('repNote').textContent = st.representation === 'orbit' ? CONFIG.texts.R1 : CONFIG.texts.R6;

    $('btnPlay').textContent = st.playing ? '⏸ 暂停' : '▶ 播放';
    var spds = $('speedSeg').querySelectorAll('.seg-btn');
    for (var s = 0; s < spds.length; s++) {
      spds[s].classList.toggle('active', parseFloat(spds[s].getAttribute('data-speed')) === st.speed);
    }
    $('chkReduce').checked = st.reduceMotion;
    $('chkTwinkle').checked = st.cloudTwinkle;
    $('chkShell').checked = st.shellVisible;
    $('chkCompare').checked = st.compare;

    var cntIds = ['cntK', 'cntL', 'cntM', 'cntN'];
    for (var c = 0; c < 4; c++) $(cntIds[c]).textContent = st.manualShells[c];

    updatePanel($('panel1'), st, shells);
    updatePanel($('panel2'), st, shells);
    updateBadges($('badges1'), st);
    updateBadges($('badges2'), st);
    $('formulaAN').innerHTML = 'A = Z + N = ' + st.z + ' + ' + st.n + ' = ' + (st.z + st.n);
    $('explain1').innerHTML = buildExplanation(st, shells);
    $('explain2').innerHTML = buildExplanation(st, shells);
    updateManualMsg();
    drawDiagram($('canvas2d'), st);
    updateLayerLegend(shells);

    if (shared) {
      for (var m = 0; m < 4; m++) shared.shellMats[m].opacity = st.shellOpacity;
    }

    var opts = {
      representation: st.representation,
      shellVisible: st.shellVisible,
      playing: st.playing,
      speed: st.speed,
      reduceMotion: st.reduceMotion,
      twinkle: st.cloudTwinkle
    };
    if (scene1 && scene1.ok) scene1.setAtom(st, opts);
    if (scene2 && scene2.ok) scene2.setAtom(st, opts);
    if (st.compare) updateCompare();
  }

  function manualAdd(idx) {
    var st = App.state;
    var placed = sumArr(st.manualShells);
    if (placed >= st.electrons) {
      showManualMsg('✕ 电子已全部排完（共 ' + st.electrons + ' 个）。如需继续排布，请先增加"核外电子数"。', 'err');
      return;
    }
    var v = validateManualAdd(st.manualShells, idx);
    if (!v.ok) {
      showManualMsg('✕ ' + v.msg, 'err');
      return;
    }
    st.manualShells[idx]++;
    refreshAll();
  }

  /* ================= 帮助与模态 ================= */
  var helpState = { role: 'student', sec: 'ops' };
  function renderHelp() {
    $('helpBody').innerHTML = HELP[helpState.role][helpState.sec];
  }

  /* ================= 导出 ================= */
  function fileBase(st) {
    var e = elByZ(st.z), q = st.z - st.electrons;
    if (q === 0) return e.symbol + '原子';
    return e.symbol + '离子(' + (q > 0 ? '+' : '-') + Math.abs(q) + ')';
  }

  /* ================= 事件绑定 ================= */
  function wireEvents() {
    var i;

    var tabBtns = document.querySelectorAll('#mainTabs .tab-btn');
    for (i = 0; i < tabBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { switchTab(parseInt(btn.getAttribute('data-tab'), 10)); });
      })(tabBtns[i]);
    }

    $('selElement').addEventListener('change', function () { setElement(parseInt(this.value, 10)); });
    $('btnZMinus').addEventListener('click', function () { setElement(App.state.z - 1); });
    $('btnZPlus').addEventListener('click', function () { setElement(App.state.z + 1); });
    $('btnNMinus').addEventListener('click', function () {
      if (App.state.n > 0) { App.state.n--; refreshAll(); }
    });
    $('btnNPlus').addEventListener('click', function () {
      if (App.state.n < CONFIG.limits.N_MAX) { App.state.n++; refreshAll(); }
    });
    $('btnEMinus').addEventListener('click', function () {
      var st = App.state, rg = ionRange(st.z);
      if (st.electrons > rg[0]) { st.electrons--; refreshAll(); }
    });
    $('btnEPlus').addEventListener('click', function () {
      var st = App.state, rg = ionRange(st.z);
      if (st.electrons < rg[1]) { st.electrons++; refreshAll(); }
    });

    $('repOrbit').addEventListener('click', function () { App.state.representation = 'orbit'; refreshAll(); });
    $('repCloud').addEventListener('click', function () { App.state.representation = 'cloud'; refreshAll(); });

    $('modeAuto').addEventListener('click', function () { App.state.mode = 'auto'; refreshAll(); });
    $('modeManual').addEventListener('click', function () {
      App.state.mode = 'manual';
      App.state.manualShells = [0, 0, 0, 0];
      refreshAll();
    });

    var layerBtns = document.querySelectorAll('.layer-btn');
    for (i = 0; i < layerBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { manualAdd(parseInt(btn.getAttribute('data-layer'), 10)); });
      })(layerBtns[i]);
    }
    $('btnFixAll').addEventListener('click', function () {
      App.state.manualShells = pad4(computeShells(App.state.electrons));
      refreshAll();
      toast('已按排布规律一键纠正');
    });
    $('btnClearShells').addEventListener('click', function () {
      App.state.manualShells = [0, 0, 0, 0];
      refreshAll();
    });

    $('btnPlay').addEventListener('click', function () {
      App.state.playing = !App.state.playing;
      refreshAll();
    });
    var spds = $('speedSeg').querySelectorAll('.seg-btn');
    for (i = 0; i < spds.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          App.state.speed = parseFloat(btn.getAttribute('data-speed'));
          refreshAll();
        });
      })(spds[i]);
    }
    $('chkReduce').addEventListener('change', function () {
      App.state.reduceMotion = this.checked;
      if (this.checked) $('fpsBanner').classList.add('hidden');
      refreshAll();
    });
    $('chkTwinkle').addEventListener('change', function () {
      App.state.cloudTwinkle = this.checked;
      refreshAll();
    });
    $('chkShell').addEventListener('change', function () {
      App.state.shellVisible = this.checked;
      refreshAll();
    });
    $('rngOpacity').addEventListener('input', function () {
      App.state.shellOpacity = clamp(parseFloat(this.value), CONFIG.shellOpacityMin, CONFIG.shellOpacityMax);
      refreshAll();
    });

    $('chkCompare').addEventListener('change', function () {
      App.state.compare = this.checked;
      if (App.state.compare && THREE_OK && !cmpL) {
        cmpL = new Scene3D($('cmpViewL'), { lowQuality: true });
        cmpR = new Scene3D($('cmpViewR'), { lowQuality: true });
      }
      updateCompareVisibility();
      refreshAll();
      requestAnimationFrame(function () {
        if (cmpL && cmpL.ok) cmpL.resize();
        if (cmpR && cmpR.ok) cmpR.resize();
        refreshAll();
      });
      if (App.state.compare) toast('对比模式已开启：左右视图可独立选择元素与电子数');
    });

    var cmpSels = { L: $('cmpSelL'), R: $('cmpSelR') };
    for (var k in cmpSels) {
      (function (key, sel) {
        sel.addEventListener('change', function () {
          var z = parseInt(sel.value, 10);
          App.cmp[key] = makeCmpState(z, z);
          refreshAll();
        });
      })(k, cmpSels[k]);
    }
    $('cmpEmLMinus').addEventListener('click', function () { cmpElectron('L', -1); });
    $('cmpEmLPlus').addEventListener('click', function () { cmpElectron('L', 1); });
    $('cmpEmRMinus').addEventListener('click', function () { cmpElectron('R', -1); });
    $('cmpEmRPlus').addEventListener('click', function () { cmpElectron('R', 1); });
    var presetBtns = document.querySelectorAll('.cmp-preset');
    for (i = 0; i < presetBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var p = PRESETS_COMPARE[parseInt(btn.getAttribute('data-preset'), 10)];
          App.cmp.L = makeCmpState(p.left.z, p.left.electrons);
          App.cmp.R = makeCmpState(p.right.z, p.right.electrons);
          refreshAll();
          toast('已载入对比预设：' + p.name);
        });
      })(presetBtns[i]);
    }

    $('btnView1Reset').addEventListener('click', function () { if (scene1) scene1.resetView(); });
    $('btnView2Reset').addEventListener('click', function () { if (scene2) scene2.resetView(); });
    $('btnView3Reset').addEventListener('click', function () { if (scene3) scene3.resetView(); });

    $('btnExport1').addEventListener('click', function () {
      if (!scene1 || !scene1.ok) { toast('3D 画面不可用，无法导出 3D 截图'); return; }
      scene1.exportPNG(fileBase(App.state) + '-3D场景.png');
      toast('已导出 3D 截图（PNG）');
    });
    $('btnExport3D').addEventListener('click', function () {
      var sc = App.state.compare ? cmpL : scene2;
      if (!sc || !sc.ok) { toast('3D 画面不可用，无法导出 3D 截图'); return; }
      sc.exportPNG(fileBase(App.state) + '-3D场景.png');
      toast('已导出 3D 截图（PNG）');
    });
    $('btnExport2D').addEventListener('click', function () {
      triggerDownload($('canvas2d').toDataURL('image/png'), fileBase(App.state) + '-2D结构示意图.png');
      toast('已导出 2D 结构示意图（PNG）');
    });

    $('btnRealScale').addEventListener('click', function () { $('modalScale').classList.remove('hidden'); });
    $('btnHelp').addEventListener('click', function () { $('modalHelp').classList.remove('hidden'); });
    var modals = document.querySelectorAll('.modal');
    for (i = 0; i < modals.length; i++) {
      (function (m) {
        m.addEventListener('click', function (e) { if (e.target === m) m.classList.add('hidden'); });
        var closes = m.querySelectorAll('.modal-close');
        for (var c = 0; c < closes.length; c++) {
          closes[c].addEventListener('click', function () { m.classList.add('hidden'); });
        }
      })(modals[i]);
    }
    var roleBtns = $('helpRoleSeg').querySelectorAll('.seg-btn');
    for (i = 0; i < roleBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          helpState.role = btn.getAttribute('data-role');
          var all = $('helpRoleSeg').querySelectorAll('.seg-btn');
          for (var a = 0; a < all.length; a++) all[a].classList.toggle('active', all[a] === btn);
          renderHelp();
        });
      })(roleBtns[i]);
    }
    var secBtns = $('helpTabs').querySelectorAll('.seg-btn');
    for (i = 0; i < secBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          helpState.sec = btn.getAttribute('data-sec');
          var all = $('helpTabs').querySelectorAll('.seg-btn');
          for (var a = 0; a < all.length; a++) all[a].classList.toggle('active', all[a] === btn);
          renderHelp();
        });
      })(secBtns[i]);
    }

    $('btnToggleTable').addEventListener('click', function () {
      var w = $('dataTableWrap');
      var hidden = w.classList.toggle('hidden');
      this.textContent = hidden ? '▶ 展开数据表' : '▼ 收起数据表';
    });

    var alphaInited = false;
    $('btnToggleAlpha').addEventListener('click', function () {
      var w = $('alphaWrap');
      var hidden = w.classList.toggle('hidden');
      this.textContent = hidden ? '▶ 展开：α 粒子散射实验（示意动画）' : '▼ 收起：α 粒子散射实验（示意动画）';
      if (!hidden) {
        if (!alphaInited) {
          alphaAnim = new AlphaAnim($('alphaCanvas'));
          alphaInited = true;
        }
        alphaAnim.reset();
      } else if (alphaAnim) {
        alphaAnim.running = false;
      }
      /* α 卡片展开/收起会改变 3D 舞台高度，需同步重算渲染尺寸 */
      requestAnimationFrame(function () { if (scene3 && scene3.ok) scene3.resize(); });
    });
    $('btnAlphaPlay').addEventListener('click', function () {
      if (!alphaAnim) return;
      alphaAnim.reset();
      alphaAnim.running = true;
    });

    $('btnEval').addEventListener('click', function () {
      App.evalVisible = !App.evalVisible;
      selectModel(App.modelIndex, true);
    });

    $('btnFpsReduce').addEventListener('click', function () {
      App.state.reduceMotion = true;
      $('fpsBanner').classList.add('hidden');
      refreshAll();
      toast('已开启减少动画模式');
    });
    $('btnFpsClose').addEventListener('click', function () { $('fpsBanner').classList.add('hidden'); });

    $('btnSideToggle').addEventListener('click', function () {
      var side = document.querySelector('.page:not(.hidden) .side');
      if (!side) return;
      side.classList.toggle('open');
      this.textContent = side.classList.contains('open') ? '✕ 收起面板' : '⚙ 控制面板';
    });

    $('btnReset').addEventListener('click', resetAll);
  }

  function cmpElectron(key, d) {
    var st = App.cmp[key];
    var rg = ionRange(st.z);
    var v = st.electrons + d;
    if (v < rg[0] || v > rg[1]) return;
    st.electrons = v;
    refreshAll();
  }

  /* ================= 重置 ================= */
  function resetAll() {
    initState();
    App.cmp = { L: makeCmpState(11, 11), R: makeCmpState(11, 10) };
    App.modelIndex = 0;
    App.evalVisible = CONFIG.defaults.modelEvaluationVisible;
    $('rngOpacity').value = String(CONFIG.shellOpacityDefault);
    if (alphaAnim) alphaAnim.reset();
    updateCompareVisibility();
    refreshAll();
    selectModel(0);
    toast('已重置为默认状态（Na 原子 · 轨道示意 · 自动排布）');
  }

  /* ================= 主循环与帧率监控 ================= */
  var lastTime = performance.now();
  var fpsAcc = 0, fpsFrames = 0, fpsLowSec = 0, fpsWarned = false;

  function activeScenes() {
    if (App.tab === 1) return [scene1];
    if (App.tab === 2) return App.state.compare ? [cmpL, cmpR] : [scene2];
    if (App.tab === 3) return [scene3];
    return [];
  }

  function loop(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    var scenes = activeScenes();
    var any = false;
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i] && scenes[i].ok) {
        scenes[i].tick(dt);
        any = true;
      }
    }
    if (App.tab === 3 && alphaAnim && alphaAnim.running) alphaAnim.step(dt);
    if (any) {
      fpsAcc += dt;
      fpsFrames++;
      if (fpsAcc >= 1) {
        var f = fpsFrames / fpsAcc;
        fpsAcc = 0;
        fpsFrames = 0;
        if (f < CONFIG.fps.minFps) fpsLowSec++;
        else fpsLowSec = 0;
        if (fpsLowSec >= CONFIG.fps.lowSeconds && !fpsWarned && !App.state.reduceMotion) {
          fpsWarned = true;
          $('fpsBanner').classList.remove('hidden');
        }
      }
    }
    requestAnimationFrame(loop);
  }

  /* ================= 初始化 ================= */
  function init() {
    initState();
    buildSelects();
    buildPresets();
    buildPanel($('panel1'));
    buildPanel($('panel2'));
    buildPanel($('cmpPanelL'));
    buildPanel($('cmpPanelR'));
    buildDataTable();
    buildDiscussion();
    buildTimeline();
    buildRules();
    $('manualIntroText').textContent = CONFIG.texts.manualIntro;
    $('modalScaleBody').innerHTML = CONFIG.texts.realScale;
    renderHelp();
    if (THREE_OK) {
      scene1 = new Scene3D($('view1'));
      scene2 = new Scene3D($('view2'));
      scene3 = new Scene3D($('view3'));
    } else {
      degrade($('view1'), CONFIG.texts.degradeThree);
      degrade($('view2'), CONFIG.texts.degradeThree);
      degrade($('view3'), CONFIG.texts.degradeThree);
    }
    wireEvents();
    updateCompareVisibility();
    refreshAll();
    selectModel(0, true);
    switchTab(2);
    requestAnimationFrame(loop);
    window.addEventListener('resize', function () {
      var list = [scene1, scene2, scene3, cmpL, cmpR];
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].ok) list[i].resize();
      if (alphaAnim && !$('alphaWrap').classList.contains('hidden')) {
        alphaAnim.fit();
        alphaAnim.draw();
      }
      drawDiagram($('canvas2d'), App.state);
    });
  }

  init();
})();
