/* ============================================================
   全局配置：颜色、半径、粒子数、速度、开关默认值、文案
   所有可调参数集中于此，便于教师按设备/喜好微调
   ============================================================ */
var CONFIG = {

  /* ---------- 颜色 ---------- */
  colors: {
    proton: 0xe74c3c,            /* 质子：红 */
    neutron: 0x9aa7b1,           /* 中子：灰 */
    layers: [0x2f80ed, 0x27ae60, 0xf2994a, 0x9b51e0], /* K L M N 四层颜色 */
    layerCss: ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0'],
    background: 0xffffff,
    dalton: 0x7f97a8,            /* 道尔顿实心球 */
    thomsonPositive: 0xf5b7b1,   /* 汤姆孙正电荷球 */
    thomsonElectron: 0x1c2833,   /* 汤姆孙模型中的电子 */
    alphaParticle: '#f5b301'     /* α 粒子（2D 动画） */
  },

  /* ---------- 几何（示意比例，界面有"示意比例"标注） ---------- */
  nucleusRadius: 1.0,
  shellRadii: [2.2, 3.4, 4.6, 5.8],
  electronRadius: 0.16,
  nucleonDisplayScale: 1.5,

  /* ---------- 球壳外观 ---------- */
  shellOpacityDefault: 0.25,
  shellOpacityMin: 0,
  shellOpacityMax: 0.6,

  /* ---------- 粒子数量 ---------- */
  electronCloudPoints: 3000,
  reduceMotionCloudPoints: 800,
  compareCloudPoints: 1600,
  compareReduceCloudPoints: 500,

  /* ---------- 动画 ---------- */
  speedOptions: [0.5, 1, 2],
  animation: {
    baseAngularSpeed: 0.9,
    cloudTwinkleAmp: 0.18,
    cloudTwinkleSpeed: 2.0
  },

  /* ---------- 相机 ---------- */
  camera: {
    fov: 45,
    radius: 11,
    minRadius: 2.0,
    maxRadius: 26,
    zoomNucleusRadius: 2.4,
    lerpFactor: 6
  },

  /* ---------- 开关默认值 ---------- */
  defaults: {
    z: 11,                       /* 默认 Na 原子 */
    representation: 'orbit',
    mode: 'auto',
    ion: false,
    compare: false,
    reduceMotion: false,
    modelEvaluationVisible: false,
    shellVisible: true,
    playing: true,
    speed: 1,
    cloudTwinkle: false
  },

  /* ---------- 数值边界 ---------- */
  limits: {
    Z_MIN: 1,
    Z_MAX: 20,
    ION_DELTA_MAX: 3,
    N_MAX: 40
  },

  /* ---------- 帧率监控 ---------- */
  fps: {
    minFps: 24,
    lowSeconds: 3
  },

  /* ---------- 文案（科学性风控与界面提示集中于此） ---------- */
  texts: {
    orbitNote: '教学示意，非真实轨道',
    cloudNote: '电子云示意：点越密，电子出现的概率越大',
    scaleNote: '示意比例（非真实大小比例）',
    nucleusMassNote: '原子的质量主要集中在原子核上（质子、中子的质量远大于电子）',
    manualIntro: '手动模式已清空电子：请点击 K / L / M / N 按钮逐个添加电子。',

    /* R1~R7 科学性风控文案 */
    R1: '轨道动画为玻尔式教学示意：电子并非真的沿固定圆轨道运动，请勿理解为真实轨道。',
    R2: '本页所有图形均为示意比例。真实情况：原子核直径约 10⁻¹⁵ ~ 10⁻¹⁴ m，原子直径约 10⁻¹⁰ m，二者相差约 10⁵ 倍。',
    R3: '电子层是按电子能量高低划分的区域（离核越近能量越低），不是真实存在的"壳"。',
    R4: '若第 19 个电子排入 M 层，则 M 层成为最外层且有 9 个，超过最外层≤8，故先排入 N 层。',
    R5: '页面默认采用该元素在自然界中最常见的同位素；改变中子数即得到该元素的其他同位素（质子数不变）。',
    R6: '电子云中的小点表示电子在核外某处出现的可能性，点越密表示概率越大；小点不是电子本身。',
    R7: 'α 粒子散射为 2D 示意动画，仅示意"大多数直穿、少数偏转、极少数被弹回"的统计结果，非真实比例与轨迹。',

    /* 降级提示 */
    degradeTitle: '3D 画面不可用（2D 示意图与数值面板不受影响）',
    degradeThree: '未找到 3D 引擎文件 vendor/three.min.js',
    degradeWebGL: '当前浏览器或设备无法创建 WebGL 3D 画面',
    degradeSteps: '<li>联网下载一次 Three.js（r128 版本 three.min.js），下载地址见项目内 vendor/README.md；</li><li>将下载的文件放入本项目的 vendor 文件夹，文件名保持 three.min.js 不变；</li><li>刷新本页面。若仍不可用，建议更换 Edge / Chrome 浏览器或更换设备。</li>',

    /* 真实比例弹层 */
    realScale: '<p>原子核的直径约为 <b>10⁻¹⁵ ~ 10⁻¹⁴ m</b>，而原子的直径约为 <b>10⁻¹⁰ m</b>，二者相差约 <b>10⁵ 倍</b>（十万倍）。</p><p>打个比方：若把原子核放大成一颗豌豆（约 5 mm），整个原子将有约 500 m——相当于一座大型体育场那么大。</p><p>因此，本页的 3D 与 2D 图形均采用<b>示意比例</b>：为便于观察，原子核被明显放大、电子层间距被压缩，<b>不代表真实大小比例</b>。</p>',

    /* 手动排布规则 */
    rules: [
      '① 每层最多 2n² 个电子',
      '② 最外层不超过 8 个（K 层为最外层时不超过 2 个）',
      '③ 次外层不超过 18 个',
      '④ 先排内层，再排外层'
    ]
  }
};
