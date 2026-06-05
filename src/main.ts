import './style.css'
import { mountAIAssistant } from './ai-assistant'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type Mode = 'scene' | 'fringes' | 'imaging'
type Key = 'table' | 'ruler' | 'power' | 'lamp' | 'condenser' | 'slit' | 'biprism' | 'aux_lens' | 'eyepiece'

type Spec = {
  key: Key
  url?: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  draggable?: boolean
  xRange?: [number, number]
  baseOffset?: number
}

type Runtime = {
  spec: Spec
  group: THREE.Group
  root: THREE.Object3D
  highlight?: THREE.Mesh
  carriage?: THREE.Group
}

const LAMBDA_NM = 589.3
const BENCH_Y = 0.18
const BENCH_Z = -0.18
const POWER_Z = -0.38
const BENCH_LENGTH = 3.05
const BENCH_DEPTH = 0.28
const BENCH_CENTER_Z = BENCH_Z - 0.08
const TRACK_WIDTH = 0.19
const TRACK_HEIGHT = 0.04
const LOWER_BODY_HEIGHT = 0.14
const LOWER_BODY_WIDTH = 0.26
const SCALE_CHANNEL_WIDTH = 0.072
const RAIL_OFFSET_Z = 0.052
const RAIL_STRIP_WIDTH = 0.022
const END_BLOCK_WIDTH = 0.11
const LIGHT_AXIS_OFFSET = 0.165
const TARGET_X = {
  lamp: -0.24,
  condenser: 0.18,
  slit: 0.48,
  biprism: 0.78,
  aux_lens: 1.08,
  eyepiece: 1.38,
} satisfies Record<Exclude<Key, 'table' | 'ruler' | 'power'>, number>
const MISALIGNED_X = {
  lamp: -0.4,
  condenser: 0.3,
  slit: 0.36,
  biprism: 0.92,
  aux_lens: 1.0,
  eyepiece: 1.54,
} satisfies Record<Exclude<Key, 'table' | 'ruler' | 'power'>, number>
const ORDER: Exclude<Key, 'table' | 'ruler' | 'power'>[] = ['lamp', 'condenser', 'slit', 'biprism', 'aux_lens', 'eyepiece']
const NAMES: Record<Key, string> = {
  table: '实验台',
  ruler: '刻度尺',
  power: '钠光灯电源',
  lamp: '钠光灯',
  condenser: '聚光镜',
  slit: '可调狭缝',
  biprism: '双棱镜',
  aux_lens: '辅助透镜',
  eyepiece: '测微目镜',
}

const state = {
  lampOn: false,
  aligned: 72,
  focus: 68,
  slitWidth: 0.18,
  lensInserted: true,
  mode: 'scene' as Mode,
}

let benchTopY = BENCH_Y
let benchMinZ = -0.64
let benchMaxZ = 0.18
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -benchTopY)

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <section class="brand">
        <p class="eyebrow">Biprism Interference Lab</p>
        <h1>双棱镜干涉测光波波长仿真实验</h1>
        <p class="summary">按真实实验顺序引导操作：开灯、共轴、观察条纹、插入辅助透镜、计算波长。</p>
      </section>

      <section class="card">
        <h2>当前任务</h2>
        <div class="guide-panel">
          <div>
            <span id="guideStepBadge">Step 1</span>
            <strong id="guideTitle">开启钠光灯</strong>
            <p id="guideText">先打开钠光灯，建立稳定单色光源。</p>
          </div>
          <button id="guideAction" class="guide-action" type="button">开启钠光灯</button>
        </div>
        <ol class="steps" id="stepsList">
          <li data-step="lamp">开启钠光灯并稳定光源</li>
          <li data-step="align">调节聚光镜、狭缝、双棱镜共轴</li>
          <li data-step="fringes">在测微目镜中找到清晰干涉条纹</li>
          <li data-step="imaging">插入辅助透镜并读取 d1、d2</li>
          <li data-step="result">计算波长并比较理论值</li>
        </ol>
      </section>

      <section class="card">
        <h2>实验控制</h2>
        <label class="control switch-row"><span>钠光灯</span><button id="lampToggle" class="switch" type="button">关闭</button></label>
        <label class="control"><span>共轴调整</span><input id="alignRange" type="range" min="0" max="100" value="${state.aligned}" /></label>
        <label class="control"><span>焦点清晰度</span><input id="focusRange" type="range" min="0" max="100" value="${state.focus}" /></label>
        <label class="control"><span>狭缝宽度（mm）</span><input id="slitWidthRange" type="range" min="0.05" max="0.60" step="0.01" value="${state.slitWidth}" /></label>
        <label class="control switch-row"><span>辅助透镜</span><button id="lensToggle" class="switch on" type="button">已插入</button></label>
      </section>

      <section class="card">
        <h2>观察窗口</h2>
        <div class="view-modes">
          <button class="view-btn active" data-mode="scene" type="button">实验台</button>
          <button class="view-btn" data-mode="fringes" type="button">干涉条纹</button>
          <button class="view-btn" data-mode="imaging" type="button">成像测量</button>
        </div>
        <div class="observation" id="observationBox"></div>
      </section>

      <section class="card">
        <h2>光具座位置</h2>
        <div class="bench-readout" id="benchReadout"></div>
      </section>
    </aside>

    <main class="stage-area">
      <section class="stage-card">
        <div class="stage-header">
          <div>
            <p class="eyebrow">Interactive Stage</p>
            <h2 id="stageTitle">实验台三维视图</h2>
          </div>
          <div class="stage-meta">
            <span>单击器件看介绍</span>
            <span>拖动器件自动吸附</span>
            <span>滚轮可缩放</span>
            <button class="meta-btn" id="zoomInBtn" type="button">放大</button>
            <button class="meta-btn" id="zoomOutBtn" type="button">缩小</button>
            <button class="meta-btn" id="focusBenchBtn" type="button">对准实验台</button>
          </div>
        </div>
        <div class="viewport-stack">
          <div id="sceneHost" class="scene-host"></div>
          <div class="overlay-panel"><div class="dock-readout" id="dockReadout">拖动器件时显示位置与吸附状态。</div></div>
          <section id="labPanel" class="lab-panel hidden">
            <div class="lab-grid">
              <div class="lab-card">
                <div class="lab-card-head"><h3 id="labPrimaryTitle">干涉条纹观测</h3><span id="labPrimaryMeta">Micrometer field</span></div>
                <canvas id="primaryCanvas" width="1600" height="900"></canvas>
              </div>
              <div class="lab-side">
                <div class="lab-card compact"><div class="lab-card-head"><h3>实时读数</h3><span>Readout</span></div><div class="readout-list" id="readoutList"></div></div>
                <div class="lab-card compact"><div class="lab-card-head"><h3>实验提示</h3><span>Guide</span></div><div class="hint-copy" id="labHintCopy"></div></div>
              </div>
            </div>
          </section>
          <div id="infoModal" class="modal hidden">
            <div class="modal-backdrop" id="modalBackdrop"></div>
            <div class="modal-card">
              <button id="modalClose" class="modal-close" type="button">x</button>
              <p class="modal-kicker">器材介绍</p>
              <h3 id="modalTitle">器材名称</h3>
              <p id="modalRole" class="modal-role"></p>
              <p id="modalDetail" class="modal-detail"></p>
            </div>
          </div>
        </div>
      </section>

      <section class="bottom-grid">
        <div class="card result-card"><h2>测量数据</h2><div class="metric-list" id="metricList"></div></div>
        <div class="card result-card"><h2>实验状态</h2><ul class="status-list" id="statusList"></ul></div>
      </section>
    </main>
  </div>
`

const sceneHost = document.querySelector<HTMLDivElement>('#sceneHost')!
const labPanel = document.querySelector<HTMLElement>('#labPanel')!
const observationBox = document.querySelector<HTMLDivElement>('#observationBox')!
const metricList = document.querySelector<HTMLDivElement>('#metricList')!
const statusList = document.querySelector<HTMLUListElement>('#statusList')!
const benchReadout = document.querySelector<HTMLDivElement>('#benchReadout')!
const dockReadout = document.querySelector<HTMLDivElement>('#dockReadout')!
const stepsList = document.querySelector<HTMLOListElement>('#stepsList')!
const stageTitle = document.querySelector<HTMLHeadingElement>('#stageTitle')!
const primaryCanvas = document.querySelector<HTMLCanvasElement>('#primaryCanvas')!
const ctx = primaryCanvas.getContext('2d')!
const guideStepBadge = document.querySelector<HTMLSpanElement>('#guideStepBadge')!
const guideTitle = document.querySelector<HTMLElement>('#guideTitle')!
const guideText = document.querySelector<HTMLParagraphElement>('#guideText')!
const guideAction = document.querySelector<HTMLButtonElement>('#guideAction')!
const labPrimaryTitle = document.querySelector<HTMLHeadingElement>('#labPrimaryTitle')!
const labPrimaryMeta = document.querySelector<HTMLSpanElement>('#labPrimaryMeta')!
const labHintCopy = document.querySelector<HTMLDivElement>('#labHintCopy')!
const readoutList = document.querySelector<HTMLDivElement>('#readoutList')!
const infoModal = document.querySelector<HTMLDivElement>('#infoModal')!
const modalTitle = document.querySelector<HTMLHeadingElement>('#modalTitle')!
const modalRole = document.querySelector<HTMLParagraphElement>('#modalRole')!
const modalDetail = document.querySelector<HTMLParagraphElement>('#modalDetail')!

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 2.5))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
sceneHost.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#e5edf2')
scene.fog = new THREE.Fog('#e5edf2', 4, 11)

const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 40)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.52
controls.minDistance = 0.28
controls.maxDistance = 3.4

scene.add(new THREE.HemisphereLight('#ffffff', '#66727c', 1.25))
const keyLight = new THREE.DirectionalLight('#ffffff', 2.2)
keyLight.position.set(2.8, 3.4, 2.4)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
scene.add(keyLight)

const stageRoot = new THREE.Group()
const sceneHint = new THREE.Group()
scene.add(stageRoot, sceneHint)

const loader = new GLTFLoader()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const clickPointer = new THREE.Vector2()
const runtimes = new Map<Key, Runtime>()
const basePositions = new Map<Key, THREE.Vector3>()
const baseScales = new Map<Key, THREE.Vector3>()
const missing: string[] = []
let activeDrag: { key: Key; offsetX: number; moved: boolean; sx: number; sy: number } | null = null

const specs: Spec[] = [
  { key: 'table', position: [0.45, 0, BENCH_CENTER_Z], baseOffset: 0 },
  { key: 'ruler', url: '/models/ruler.glb', position: [0.64, BENCH_Y, BENCH_Z - 0.04], rotation: [0.02, 0.02, 0], baseOffset: 0.002 },
  { key: 'power', url: '/models/power_and_lamp.glb', position: [-0.82, BENCH_Y, POWER_Z], rotation: [0, 0, 0], baseOffset: 0.002 },
  { key: 'lamp', url: '/models/sodium_lamp.glb', position: [TARGET_X.lamp, BENCH_Y, BENCH_Z], rotation: [0, 0, 0], draggable: true, xRange: [-0.44, -0.02], baseOffset: 0.002 },
  { key: 'condenser', url: '/models/condenser.glb', position: [TARGET_X.condenser, BENCH_Y, BENCH_Z], rotation: [0, Math.PI / 2, 0], scale: [0.96, 0.96, 0.96], draggable: true, xRange: [0.02, 0.34], baseOffset: 0.002 },
  { key: 'slit', url: '/models/slit.glb', position: [TARGET_X.slit, BENCH_Y, BENCH_Z], rotation: [0, Math.PI / 2, 0], draggable: true, xRange: [0.34, 0.64], baseOffset: 0.002 },
  { key: 'biprism', url: '/models/biprism.glb', position: [TARGET_X.biprism, BENCH_Y, BENCH_Z], rotation: [0, Math.PI / 2, 0], draggable: true, xRange: [0.66, 0.96], baseOffset: 0.002 },
  { key: 'aux_lens', url: '/models/aux_lens.glb', position: [TARGET_X.aux_lens, BENCH_Y, BENCH_Z], rotation: [0, Math.PI / 2, 0], scale: [0.92, 0.92, 0.92], draggable: true, xRange: [0.98, 1.26], baseOffset: 0.002 },
  { key: 'eyepiece', url: '/models/eyepiece.glb', position: [TARGET_X.eyepiece, BENCH_Y, BENCH_Z], rotation: [0, Math.PI / 2, 0], draggable: true, xRange: [1.28, 1.6], baseOffset: 0.002 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getX(key: Key) {
  return runtimes.get(key)?.group.position.x ?? 0
}

function setX(key: Key, x: number) {
  const runtime = runtimes.get(key)
  if (runtime) runtime.group.position.x = x
}

const lampToggle = document.querySelector<HTMLButtonElement>('#lampToggle')!
const lensToggle = document.querySelector<HTMLButtonElement>('#lensToggle')!
const alignRange = document.querySelector<HTMLInputElement>('#alignRange')!
const focusRange = document.querySelector<HTMLInputElement>('#focusRange')!
const slitWidthRange = document.querySelector<HTMLInputElement>('#slitWidthRange')!

function syncControls() {
  lampToggle.textContent = state.lampOn ? '开启' : '关闭'
  lampToggle.classList.toggle('on', state.lampOn)
  lensToggle.textContent = state.lensInserted ? '已插入' : '已移出'
  lensToggle.classList.toggle('on', state.lensInserted)
  alignRange.value = String(state.aligned)
  focusRange.value = String(state.focus)
  slitWidthRange.value = String(state.slitWidth)
}

function applyAlignmentToScene() {
  const t = clamp(state.aligned / 100, 0, 1)
  ORDER.forEach((key) => {
    const runtime = runtimes.get(key)
    if (!runtime?.spec.draggable) return
    const [min, max] = runtime.spec.xRange ?? [TARGET_X[key], TARGET_X[key]]
    const x = THREE.MathUtils.lerp(MISALIGNED_X[key], TARGET_X[key], t)
    runtime.group.position.x = clamp(Math.round(x / 0.02) * 0.02, min, max)
  })
}

function applyFocusToScene() {
  const runtime = runtimes.get('eyepiece')
  const base = basePositions.get('eyepiece')
  if (!(runtime && base)) return
  runtime.group.position.z = base.z + THREE.MathUtils.lerp(-0.06, 0.06, state.focus / 100)
}

function applySlitWidthToScene() {
  const runtime = runtimes.get('slit')
  const base = baseScales.get('slit')
  if (!(runtime && base)) return
  const ratio = THREE.MathUtils.mapLinear(state.slitWidth, 0.05, 0.6, 0.72, 1.34)
  runtime.root.scale.set(base.x, base.y, base.z * ratio)
}

function applyLensToScene() {
  const runtime = runtimes.get('aux_lens')
  if (runtime) runtime.root.visible = state.lensInserted
}

function setLampOn(next: boolean) {
  state.lampOn = next
  syncControls()
  buildLightPath()
  refresh()
}

function setLensInserted(next: boolean) {
  state.lensInserted = next
  applyLensToScene()
  syncControls()
  buildLightPath()
  refresh()
}

function createProceduralBench(spec: Spec) {
  const group = new THREE.Group()
  group.name = 'optical_bench_group'
  group.position.set(...spec.position)

  const root = new THREE.Group()
  root.name = 'ProceduralOpticalBench_Root'

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#3a4047', roughness: 0.72, metalness: 0.22 })
  const trackMaterial = new THREE.MeshStandardMaterial({ color: '#11171c', roughness: 0.54, metalness: 0.28 })
  const trimMaterial = new THREE.MeshStandardMaterial({ color: '#272c32', roughness: 0.48, metalness: 0.34 })
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#4f5964', roughness: 0.46, metalness: 0.4 })
  const scaleMaterial = new THREE.MeshStandardMaterial({ color: '#1d242a', roughness: 0.62, metalness: 0.18 })
  const markMaterial = new THREE.MeshStandardMaterial({ color: '#d6dde3', roughness: 0.48, metalness: 0.18 })

  const lowerBody = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH_LENGTH, LOWER_BODY_HEIGHT, LOWER_BODY_WIDTH),
    bodyMaterial,
  )
  lowerBody.name = 'OpticalBenchLowerBody'
  lowerBody.position.y = BENCH_Y - TRACK_HEIGHT - LOWER_BODY_HEIGHT * 0.5 + 0.008
  lowerBody.castShadow = true
  lowerBody.receiveShadow = true
  root.add(lowerBody)

  const topTrack = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH_LENGTH - 0.03, TRACK_HEIGHT, TRACK_WIDTH),
    trackMaterial,
  )
  topTrack.name = 'OpticalBenchTrack'
  topTrack.position.y = BENCH_Y - TRACK_HEIGHT * 0.5
  topTrack.castShadow = true
  topTrack.receiveShadow = true
  root.add(topTrack)

  const centerChannel = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH_LENGTH - 0.16, 0.014, SCALE_CHANNEL_WIDTH),
    scaleMaterial,
  )
  centerChannel.name = 'BenchScaleChannel'
  centerChannel.position.set(0, BENCH_Y + 0.001, 0)
  centerChannel.receiveShadow = true
  root.add(centerChannel)

  ;[-1, 1].forEach((sign) => {
    const railStrip = new THREE.Mesh(
      new THREE.BoxGeometry(BENCH_LENGTH - 0.12, 0.01, RAIL_STRIP_WIDTH),
      railMaterial,
    )
    railStrip.name = 'BenchRailStrip'
    railStrip.position.set(0, BENCH_Y + 0.004, sign * RAIL_OFFSET_Z)
    railStrip.castShadow = true
    railStrip.receiveShadow = true
    root.add(railStrip)
  })

  const scaleBed = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH_LENGTH - 0.2, 0.004, SCALE_CHANNEL_WIDTH - 0.016),
    new THREE.MeshStandardMaterial({ color: '#0f1317', roughness: 0.68, metalness: 0.12 }),
  )
  scaleBed.name = 'BenchScaleBed'
  scaleBed.position.set(0, BENCH_Y + 0.008, 0)
  root.add(scaleBed)

  const stopHeight = 0.08
  ;[-1, 1].forEach((sign) => {
    const endBlock = new THREE.Mesh(new THREE.BoxGeometry(END_BLOCK_WIDTH, stopHeight, BENCH_DEPTH), trimMaterial)
    endBlock.name = 'BenchEndBlock'
    endBlock.position.set(sign * (BENCH_LENGTH * 0.5 - END_BLOCK_WIDTH * 0.5), BENCH_Y - 0.006, 0)
    endBlock.castShadow = true
    endBlock.receiveShadow = true
    root.add(endBlock)
  })

  const markStart = -BENCH_LENGTH * 0.5 + 0.12
  const markStep = 0.03
  const markCount = Math.floor((BENCH_LENGTH - 0.24) / markStep)
  for (let i = 0; i <= markCount; i += 1) {
    const x = markStart + i * markStep
    const isMajor = i % 10 === 0
    const isMedium = !isMajor && i % 5 === 0
    const tickHeight = isMajor ? 0.022 : isMedium ? 0.016 : 0.011
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, tickHeight, 0.003),
      markMaterial,
    )
    tick.name = 'BenchScaleTick'
    tick.position.set(x, BENCH_Y + 0.01 + tickHeight * 0.5, 0)
    root.add(tick)
  }

  const sideLipDepth = 0.022
  ;[-1, 1].forEach((sign) => {
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(BENCH_LENGTH - 0.06, 0.022, sideLipDepth),
      trimMaterial,
    )
    lip.name = 'BenchSideLip'
    lip.position.set(0, BENCH_Y - 0.01, sign * (TRACK_WIDTH * 0.5 - sideLipDepth * 0.5))
    lip.castShadow = true
    lip.receiveShadow = true
    root.add(lip)
  })

  group.add(root)
  stageRoot.add(group)
  runtimes.set(spec.key, { spec, group, root })
}

function computeSnapshot() {
  const coherence = clamp((state.aligned / 100) * 0.5 + (state.focus / 100) * 0.3 + (1 - Math.abs(state.slitWidth - 0.18) / 0.42) * 0.2, 0, 1)
  const clarity = clamp((state.focus / 100) * 0.65 + coherence * 0.35, 0, 1)
  const D = 0.22 + (getX('eyepiece') - getX('biprism')) * 0.66
  const dMm = 0.9 + (getX('biprism') - getX('slit')) * 0.42 + (getX('eyepiece') - getX('biprism')) * 0.18
  const fringeSpacingMm = 0.17 + coherence * 0.17
  const measuredLambdaNm = state.lampOn ? LAMBDA_NM + (1 - coherence) * 8 : 0
  const percentError = state.lampOn ? Math.abs((measuredLambdaNm - LAMBDA_NM) / LAMBDA_NM) * 100 : 0
  return { D, dMm, d1Mm: dMm * 1.42, d2Mm: dMm * 0.74, fringeSpacingMm, measuredLambdaNm, percentError, coherence, clarity }
}

function alignmentQuality() {
  return clamp(1 - ORDER.reduce((sum, key) => sum + Math.abs(getX(key) - TARGET_X[key]) * 1.15, 0), 0, 1)
}

function progress(snapshot = computeSnapshot()) {
  const lamp = state.lampOn
  const align = lamp && alignmentQuality() > 0.74 && state.aligned >= 74
  const fringes = align && state.focus >= 62 && state.slitWidth >= 0.08 && state.slitWidth <= 0.28 && snapshot.coherence >= 0.6
  const imaging = fringes && state.lensInserted
  return { lamp, align, fringes, imaging, result: imaging && state.mode === 'imaging' }
}

function modeLabel(mode: Mode) {
  if (mode === 'scene') return '三维实验台'
  if (mode === 'fringes') return '干涉条纹观察'
  return '辅助透镜成像测量'
}

function getAssistantContext() {
  const snapshot = computeSnapshot()
  const currentProgress = progress(snapshot)

  return {
    experiment: '双棱镜干涉测光波波长仿真实验',
    mode: modeLabel(state.mode),
    controls: {
      lampOn: state.lampOn,
      aligned: state.aligned,
      focus: state.focus,
      slitWidthUm: state.slitWidth,
      lensInserted: state.lensInserted,
    },
    metrics: {
      theoreticalLambdaNm: Number(LAMBDA_NM.toFixed(1)),
      measuredLambdaNm: state.lampOn ? Number(snapshot.measuredLambdaNm.toFixed(1)) : '--',
      Dm: Number(snapshot.D.toFixed(3)),
      fringeSpacingMm: Number(snapshot.fringeSpacingMm.toFixed(5)),
      d1Mm: Number(snapshot.d1Mm.toFixed(3)),
      d2Mm: Number(snapshot.d2Mm.toFixed(3)),
      dMm: Number(snapshot.dMm.toFixed(3)),
      coherencePercent: Number((snapshot.coherence * 100).toFixed(0)),
      clarityPercent: Number((snapshot.clarity * 100).toFixed(0)),
      percentError: state.lampOn ? Number(snapshot.percentError.toFixed(2)) : '--',
    },
    status: [
      `实验进度：${Object.entries(currentProgress)
        .filter(([, value]) => value)
        .map(([key]) => key)
        .join(', ') || '未开始'}`,
      missing.length ? `缺失模型：${missing.join(', ')}` : '模型资源已加载',
      `观测模式：${modeLabel(state.mode)}`,
    ],
  }
}

function namedMeshBox(root: THREE.Object3D, matcher: RegExp, reject?: RegExp) {
  const box = new THREE.Box3()
  let found = false
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const name = mesh.name.toLowerCase()
    if (!matcher.test(name) || reject?.test(name)) return
    box.union(new THREE.Box3().setFromObject(mesh))
    found = true
  })
  return found ? box : undefined
}

function opticalMatcher(key: Key) {
  if (key === 'lamp') return /lampcore|window|output/i
  if (key === 'condenser') return /condenser_lens|condenserlens|lens/i
  if (key === 'slit') return /opticalslit|slit_plate|slit_housing/i
  if (key === 'biprism') return /biprism_glass|frontaperturering|aperture/i
  if (key === 'aux_lens') return /auxiliarylens|lensouterring|lensfrontretainer|lensrearretainer/i
  if (key === 'eyepiece') return /frontobjectivelens|reareyepiecelens|eyepiece/i
  return /$a/
}

function opticalPoint(key: Key) {
  const runtime = runtimes.get(key)
  const axisY = benchTopY + LIGHT_AXIS_OFFSET
  if (!runtime) return new THREE.Vector3(getX(key), axisY, BENCH_Z)

  if (key === 'lamp') {
    const bodyBox = namedMeshBox(runtime.root, /rightaccessmodule_body|lampcore/i)
    if (bodyBox && !bodyBox.isEmpty()) {
      const point = bodyBox.getCenter(new THREE.Vector3())
      point.x = bodyBox.max.x + 0.012
      point.y = axisY
      point.z = runtime.group.position.z
      return point
    }
  }

  const box = namedMeshBox(runtime.root, opticalMatcher(key), /base|foot|cable|wire|knob|screw|rod|post|collar/i)
  if (box && !box.isEmpty()) return new THREE.Vector3(runtime.group.position.x, axisY, BENCH_Z)

  runtime.group.updateWorldMatrix(true, true)
  const fallback = new THREE.Box3().setFromObject(runtime.group)
  const center = fallback.getCenter(new THREE.Vector3())
  center.x = runtime.group.position.x
  center.y = axisY
  center.z = BENCH_Z
  return center
}

function getBaseContactY(runtime: Runtime) {
  const baseBox = namedMeshBox(runtime.root, /base|foot/i, /cable|wire|knob|screw|tick|handle/i)
  if (baseBox && !baseBox.isEmpty()) return baseBox.min.y

  runtime.group.updateWorldMatrix(true, true)
  const fallback = new THREE.Box3().setFromObject(runtime.group)
  return fallback.min.y
}

function fitToBench(runtime: Runtime) {
  if (runtime.spec.key === 'table') return
  const contactY = getBaseContactY(runtime)
  if (!Number.isFinite(contactY)) return
  const targetY = benchTopY + (runtime.spec.baseOffset ?? 0.002)
  runtime.group.position.y += targetY - contactY
}

function resolveBench() {
  benchTopY = BENCH_Y
  benchMinZ = BENCH_CENTER_Z - BENCH_DEPTH / 2 + 0.02
  benchMaxZ = BENCH_CENTER_Z + BENCH_DEPTH / 2 - 0.02
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -benchTopY)
}

function updateAlignedFromScene() {
  state.aligned = Math.round(58 + alignmentQuality() * 40)
}

function clampToTable(runtime: Runtime) {
  if (runtime.spec.key === 'table') return
  if (runtime.spec.key === 'power') {
    runtime.group.position.z = clamp(POWER_Z, benchMinZ + 0.06, benchMaxZ - 0.06)
    return
  }
  runtime.group.position.z = clamp(BENCH_Z, benchMinZ + 0.04, benchMaxZ - 0.04)
}

function highlight(group: THREE.Group) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.008, 40),
    new THREE.MeshBasicMaterial({ color: '#f3c85a', transparent: true, opacity: 0 }),
  )
  mesh.rotation.x = Math.PI / 2
  group.add(mesh)
  return mesh
}

async function load(spec: Spec) {
  try {
    if (!spec.url) {
      createProceduralBench(spec)
      return
    }
    const gltf = await loader.loadAsync(spec.url)
    const group = new THREE.Group()
    group.name = `${spec.key}_group`
    group.position.set(...spec.position)
    if (spec.rotation) group.rotation.set(...spec.rotation)
    stageRoot.add(group)
    const root = gltf.scene
    if (spec.scale) root.scale.set(...spec.scale)
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    group.add(root)
    runtimes.set(spec.key, { spec, group, root, highlight: spec.draggable ? highlight(group) : undefined })
  } catch {
    missing.push(NAMES[spec.key])
  }
}

function layoutLoadedModels() {
  resolveBench()
  for (const runtime of runtimes.values()) {
    clampToTable(runtime)
    fitToBench(runtime)
    basePositions.set(runtime.spec.key, runtime.group.position.clone())
    baseScales.set(runtime.spec.key, runtime.root.scale.clone())
  }
  applyAlignmentToScene()
  applyFocusToScene()
  applySlitWidthToScene()
  applyLensToScene()
  syncControls()
  buildLightPath()
}

function buildLightPath() {
  sceneHint.clear()
  const opticalOrder = state.lensInserted ? ORDER : ORDER.filter((key) => key !== 'aux_lens')
  const points = opticalOrder.map((key) => opticalPoint(key))
  const beamStart = new THREE.Vector3(getX('lamp') + 0.045, benchTopY + LIGHT_AXIS_OFFSET, BENCH_Z)
  const beamEnd = new THREE.Vector3(getX('eyepiece') + 0.035, benchTopY + LIGHT_AXIS_OFFSET, BENCH_Z)
  const axisPoints = [beamStart, ...points.slice(1, -1), beamEnd]
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(axisPoints),
    new THREE.LineDashedMaterial({ color: state.lampOn ? '#f0c64a' : '#7d8893', dashSize: 0.045, gapSize: 0.03, transparent: true, opacity: state.lampOn ? 0.9 : 0.3 }),
  )
  line.computeLineDistances()
  sceneHint.add(line)
  if (!state.lampOn) return

  const material = new THREE.MeshBasicMaterial({ color: '#ffd45a', transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending })
  const axis = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < axisPoints.length - 1; i += 1) {
    const from = axisPoints[i]
    const to = axisPoints[i + 1]
    const direction = to.clone().sub(from)
    const length = direction.length()
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, length, 24, 1, true), material)
    beam.quaternion.setFromUnitVectors(axis, direction.normalize())
    beam.position.copy(from).add(to).multiplyScalar(0.5)
    sceneHint.add(beam)
  }
  axisPoints.forEach((point, index) => {
    if (index === 0 || index === axisPoints.length - 1) return
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffe08c', transparent: true, opacity: 0.62 }))
    dot.position.copy(point)
    sceneHint.add(dot)
  })
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 24), new THREE.MeshBasicMaterial({ color: '#ffe08c' }))
  glow.position.copy(beamStart)
  sceneHint.add(glow)
}

function setMode(mode: Mode) {
  state.mode = mode
  document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode))
  refresh()
}

function updateGuide(snapshot = computeSnapshot()) {
  const p = progress(snapshot)
  const guide = !p.lamp
    ? ['Step 1', '开启钠光灯', '点击按钮打开钠光灯，光源会发出一束黄色光。', '开启钠光灯', false]
    : !p.align
      ? ['Step 2', '调节共轴', '拖动器件或使用自动对准，让光束穿过每一个镜片和狭缝中心。', '自动对准', false]
      : !p.fringes
        ? ['Step 3', '找到清晰干涉条纹', '调窄狭缝并调焦，测微目镜中才会出现稳定条纹。', '查看条纹', false]
        : !p.imaging
          ? ['Step 4', '辅助透镜成像', '插入辅助透镜并进入成像测量视图。', '进入成像', false]
          : ['Step 5', '计算波长', `当前测得波长约 ${snapshot.measuredLambdaNm.toFixed(1)} nm。`, '已完成', true]
  guideStepBadge.textContent = guide[0] as string
  guideTitle.textContent = guide[1] as string
  guideText.textContent = guide[2] as string
  guideAction.textContent = guide[3] as string
  guideAction.disabled = guide[4] as boolean
}

function updatePanels(snapshot = computeSnapshot()) {
  const p = progress(snapshot)
  stepsList.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
    const key = li.dataset.step as keyof ReturnType<typeof progress>
    li.classList.toggle('active', Boolean(p[key]))
  })
  benchReadout.innerHTML = ORDER.map((key) => `<div class="bench-row"><span>${NAMES[key]}</span><strong>${getX(key).toFixed(3)} m</strong></div>`).join('')
  observationBox.textContent = p.fringes
    ? `条纹已经可观察。相干度 ${(snapshot.coherence * 100).toFixed(0)}%，清晰度 ${(snapshot.clarity * 100).toFixed(0)}%。`
    : state.lampOn
      ? '光源已开启。继续让黄色光束穿过聚光镜、狭缝、双棱镜和测微目镜中心。'
      : '请先点击“开启钠光灯”。'
  metricList.innerHTML = `
    <div><span>理论波长</span><strong>${LAMBDA_NM.toFixed(1)} nm</strong></div>
    <div><span>测量波长</span><strong>${state.lampOn ? `${snapshot.measuredLambdaNm.toFixed(1)} nm` : '--'}</strong></div>
    <div><span>D</span><strong>${snapshot.D.toFixed(3)} m</strong></div>
    <div><span>Δx</span><strong>${snapshot.fringeSpacingMm.toFixed(5)} mm</strong></div>
    <div><span>d1</span><strong>${snapshot.d1Mm.toFixed(3)} mm</strong></div>
    <div><span>d2</span><strong>${snapshot.d2Mm.toFixed(3)} mm</strong></div>
    <div><span>d</span><strong>${snapshot.dMm.toFixed(3)} mm</strong></div>
  `
  statusList.innerHTML = [
    state.lampOn ? '黄色光束已经从钠光灯发出。' : '等待开启钠光灯。',
    missing.length ? `未加载：${missing.join('、')}` : '器材模型已加载。',
    '光学面已旋到面对光轴，光束从镜片/孔径中心穿过。',
  ].map((item) => `<li>${item}</li>`).join('')
  updateGuide(snapshot)
}

function drawCrosshair() {
  const w = primaryCanvas.width
  const h = primaryCanvas.height
  ctx.strokeStyle = 'rgba(236,239,243,0.95)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.5 - 250, h * 0.5)
  ctx.lineTo(w * 0.5 + 250, h * 0.5)
  ctx.moveTo(w * 0.5, h * 0.5 - 180)
  ctx.lineTo(w * 0.5, h * 0.5 + 180)
  ctx.stroke()
}

function drawFringes(snapshot = computeSnapshot(), time = performance.now()) {
  const w = primaryCanvas.width
  const h = primaryCanvas.height
  const p = progress(snapshot)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#101a25'
  ctx.fillRect(0, 0, w, h)
  const visibility = p.fringes ? snapshot.coherence : state.lampOn ? 0.12 : 0.02
  const blur = p.fringes ? (1 - snapshot.clarity) * 10 : 18
  ctx.save()
  ctx.translate(w * 0.5, h * 0.5)
  ctx.filter = `blur(${blur}px)`
  for (let x = -w; x < w; x += 2) {
    const phase = (x / (70 + snapshot.fringeSpacingMm * 120)) * Math.PI + time * 0.0006
    const intensity = 0.14 + visibility * (0.5 + 0.5 * Math.cos(phase)) * Math.exp(-Math.pow(x / 520, 2))
    ctx.fillStyle = `rgba(255, 218, 118, ${0.18 + intensity * 0.62})`
    ctx.fillRect(x, -h, 2, h * 2)
  }
  ctx.restore()
  drawCrosshair()
  if (!p.fringes) {
    ctx.fillStyle = 'rgba(255,232,170,0.9)'
    ctx.font = '600 34px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.lampOn ? '光路或焦面未调好：条纹模糊不稳' : '钠光灯未开启', w * 0.5, h * 0.76)
  }
}

function drawImaging(snapshot = computeSnapshot()) {
  const w = primaryCanvas.width
  const h = primaryCanvas.height
  const p = progress(snapshot)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#111d2a'
  ctx.fillRect(0, 0, w, h)
  drawCrosshair()
  if (!p.fringes) {
    ctx.fillStyle = 'rgba(255,232,170,0.9)'
    ctx.font = '600 34px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('先得到清晰干涉条纹，辅助透镜才可读数', w * 0.5, h * 0.5)
    return
  }
  const gap = snapshot.dMm * 70
  ;[w * 0.5 - gap / 2, w * 0.5 + gap / 2].forEach((x) => {
    const grad = ctx.createRadialGradient(x, h * 0.5, 2, x, h * 0.5, 38)
    grad.addColorStop(0, 'rgba(255,231,160,0.95)')
    grad.addColorStop(1, 'rgba(255,231,160,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, h * 0.5, 40, 0, Math.PI * 2)
    ctx.fill()
  })
}

function updateLab(time = performance.now()) {
  const snapshot = computeSnapshot()
  if (state.mode === 'fringes') {
    labPrimaryTitle.textContent = '干涉条纹观测'
    labPrimaryMeta.textContent = 'Micrometer field'
    labHintCopy.textContent = progress(snapshot).fringes ? '条纹清晰，可读取条纹间距。' : '先让光束穿过镜片和狭缝中心，并调窄狭缝。'
    drawFringes(snapshot, time)
  } else if (state.mode === 'imaging') {
    labPrimaryTitle.textContent = '双虚光源成像'
    labPrimaryMeta.textContent = 'Auxiliary lens'
    labHintCopy.textContent = '用辅助透镜读取 d1、d2，再计算虚光源间距 d。'
    drawImaging(snapshot)
  }
  readoutList.innerHTML = `
    <div><span>D</span><strong>${snapshot.D.toFixed(3)} m</strong></div>
    <div><span>Δx</span><strong>${snapshot.fringeSpacingMm.toFixed(5)} mm</strong></div>
    <div><span>d1</span><strong>${snapshot.d1Mm.toFixed(3)} mm</strong></div>
    <div><span>d2</span><strong>${snapshot.d2Mm.toFixed(3)} mm</strong></div>
    <div><span>d</span><strong>${snapshot.dMm.toFixed(3)} mm</strong></div>
  `
}

function refresh(time = performance.now()) {
  const snapshot = computeSnapshot()
  const showScene = state.mode === 'scene'
  sceneHost.classList.toggle('hidden', !showScene)
  labPanel.classList.toggle('hidden', showScene)
  stageTitle.textContent = showScene ? '实验台三维视图' : state.mode === 'fringes' ? '测微目镜干涉条纹视图' : '辅助透镜成像测量'
  updatePanels(snapshot)
  if (!showScene) updateLab(time)
}

function updateLamp() {
  const button = document.querySelector<HTMLButtonElement>('#lampToggle')!
  button.textContent = state.lampOn ? '开启' : '关闭'
  button.classList.toggle('on', state.lampOn)
  buildLightPath()
  refresh()
}

function autoAlign() {
  ORDER.forEach((key) => setX(key, TARGET_X[key]))
  state.aligned = 88
  state.focus = 82
  state.slitWidth = 0.18
  ;(document.querySelector<HTMLInputElement>('#alignRange')!).value = String(state.aligned)
  ;(document.querySelector<HTMLInputElement>('#focusRange')!).value = String(state.focus)
  ;(document.querySelector<HTMLInputElement>('#slitWidthRange')!).value = String(state.slitWidth)
  buildLightPath()
  refresh()
}

function resetCamera() {
  controls.target.set(0.38, benchTopY + 0.13, BENCH_Z)
  camera.position.set(0.42, benchTopY + 0.62, 2.55)
  camera.lookAt(controls.target)
}

function pointerRay(clientX: number, clientY: number, target = pointer) {
  const rect = renderer.domElement.getBoundingClientRect()
  target.x = ((clientX - rect.left) / rect.width) * 2 - 1
  target.y = -((clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(target, camera)
}

function pick(clientX: number, clientY: number) {
  pointerRay(clientX, clientY, clickPointer)
  const hits = raycaster.intersectObjects(Array.from(runtimes.values()).map((r) => r.group), true)
  if (!hits.length) return null
  for (const [key, runtime] of runtimes) {
    let node: THREE.Object3D | null = hits[0].object
    while (node) {
      if (node === runtime.group) return key
      node = node.parent
    }
  }
  return null
}

function planeX(clientX: number, clientY: number) {
  pointerRay(clientX, clientY)
  const hit = new THREE.Vector3()
  return raycaster.ray.intersectPlane(dragPlane, hit) ? hit.x : null
}

function wireControls() {
  document.querySelector<HTMLButtonElement>('#lampToggle')!.addEventListener('click', () => {
    state.lampOn = !state.lampOn
    updateLamp()
  })
  document.querySelector<HTMLButtonElement>('#lensToggle')!.addEventListener('click', (event) => {
    state.lensInserted = !state.lensInserted
    ;(event.currentTarget as HTMLButtonElement).textContent = state.lensInserted ? '已插入' : '已移出'
    ;(event.currentTarget as HTMLButtonElement).classList.toggle('on', state.lensInserted)
    const lens = runtimes.get('aux_lens')
    if (lens) lens.root.visible = state.lensInserted
    refresh()
  })
  document.querySelector<HTMLInputElement>('#alignRange')!.addEventListener('input', (event) => {
    state.aligned = Number((event.target as HTMLInputElement).value)
    refresh()
  })
  document.querySelector<HTMLInputElement>('#focusRange')!.addEventListener('input', (event) => {
    state.focus = Number((event.target as HTMLInputElement).value)
    refresh()
  })
  document.querySelector<HTMLInputElement>('#slitWidthRange')!.addEventListener('input', (event) => {
    state.slitWidth = Number((event.target as HTMLInputElement).value)
    refresh()
  })
  document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode as Mode)))
  document.querySelector<HTMLButtonElement>('#zoomInBtn')!.addEventListener('click', () => camera.position.lerp(controls.target, 0.16))
  document.querySelector<HTMLButtonElement>('#zoomOutBtn')!.addEventListener('click', () => camera.position.sub(controls.target).multiplyScalar(1.16).add(controls.target))
  document.querySelector<HTMLButtonElement>('#focusBenchBtn')!.addEventListener('click', resetCamera)
  document.querySelector<HTMLDivElement>('#modalBackdrop')!.addEventListener('click', () => infoModal.classList.add('hidden'))
  document.querySelector<HTMLButtonElement>('#modalClose')!.addEventListener('click', () => infoModal.classList.add('hidden'))
  guideAction.addEventListener('click', () => {
    const p = progress()
    if (!p.lamp) {
      state.lampOn = true
      updateLamp()
    } else if (!p.align) {
      autoAlign()
    } else if (!p.fringes) {
      state.focus = 82
      state.slitWidth = 0.18
      ;(document.querySelector<HTMLInputElement>('#focusRange')!).value = '82'
      ;(document.querySelector<HTMLInputElement>('#slitWidthRange')!).value = '0.18'
      setMode('fringes')
    } else if (!p.imaging) {
      state.lensInserted = true
      setMode('imaging')
    }
  })
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'scene') return
    const key = pick(event.clientX, event.clientY)
    if (!key) return
    const runtime = runtimes.get(key)!
    if (!runtime.spec.draggable) return
    const x = planeX(event.clientX, event.clientY)
    if (x === null) return
    activeDrag = { key, offsetX: runtime.group.position.x - x, moved: false, sx: event.clientX, sy: event.clientY }
    controls.enabled = false
    if (runtime.highlight) (runtime.highlight.material as THREE.MeshBasicMaterial).opacity = 0.28
  })
  window.addEventListener('pointermove', (event) => {
    if (!activeDrag) return
    const runtime = runtimes.get(activeDrag.key)!
    const x = planeX(event.clientX, event.clientY)
    if (x === null) return
    activeDrag.moved = activeDrag.moved || Math.abs(event.clientX - activeDrag.sx) > 3 || Math.abs(event.clientY - activeDrag.sy) > 3
    const [min, max] = runtime.spec.xRange ?? [runtime.group.position.x, runtime.group.position.x]
    runtime.group.position.x = clamp(Math.round((x + activeDrag.offsetX) / 0.02) * 0.02, min, max)
    dockReadout.textContent = `${NAMES[activeDrag.key]} 当前位置 ${runtime.group.position.x.toFixed(3)} m`
    state.aligned = Math.round(58 + alignmentQuality() * 40)
    buildLightPath()
    refresh()
  })
  window.addEventListener('pointerup', (event) => {
    if (activeDrag) {
      const key = activeDrag.key
      const moved = activeDrag.moved
      const runtime = runtimes.get(key)!
      if (runtime.highlight) (runtime.highlight.material as THREE.MeshBasicMaterial).opacity = 0
      activeDrag = null
      dockReadout.textContent = '拖动器件时显示位置与吸附状态。'
      controls.enabled = true
      if (!moved) showInfo(key)
      refresh()
      return
    }
    const key = pick(event.clientX, event.clientY)
    if (key) showInfo(key)
  })
}

void wireControls

function autoAlignSynced() {
  state.aligned = 88
  state.focus = 82
  state.slitWidth = 0.18
  applyAlignmentToScene()
  applyFocusToScene()
  applySlitWidthToScene()
  syncControls()
  buildLightPath()
  refresh()
}

function wireControlsSynced() {
  lampToggle.addEventListener('click', () => {
    setLampOn(!state.lampOn)
  })
  lensToggle.addEventListener('click', () => {
    setLensInserted(!state.lensInserted)
  })
  alignRange.addEventListener('input', (event) => {
    state.aligned = Number((event.target as HTMLInputElement).value)
    applyAlignmentToScene()
    syncControls()
    buildLightPath()
    refresh()
  })
  focusRange.addEventListener('input', (event) => {
    state.focus = Number((event.target as HTMLInputElement).value)
    applyFocusToScene()
    syncControls()
    refresh()
  })
  slitWidthRange.addEventListener('input', (event) => {
    state.slitWidth = Number((event.target as HTMLInputElement).value)
    applySlitWidthToScene()
    syncControls()
    refresh()
  })
  document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode as Mode)))
  document.querySelector<HTMLButtonElement>('#zoomInBtn')!.addEventListener('click', () => camera.position.lerp(controls.target, 0.16))
  document.querySelector<HTMLButtonElement>('#zoomOutBtn')!.addEventListener('click', () => camera.position.sub(controls.target).multiplyScalar(1.16).add(controls.target))
  document.querySelector<HTMLButtonElement>('#focusBenchBtn')!.addEventListener('click', resetCamera)
  document.querySelector<HTMLDivElement>('#modalBackdrop')!.addEventListener('click', () => infoModal.classList.add('hidden'))
  document.querySelector<HTMLButtonElement>('#modalClose')!.addEventListener('click', () => infoModal.classList.add('hidden'))
  guideAction.addEventListener('click', () => {
    const p = progress()
    if (!p.lamp) {
      setLampOn(true)
    } else if (!p.align) {
      autoAlignSynced()
    } else if (!p.fringes) {
      state.focus = 82
      state.slitWidth = 0.18
      applyFocusToScene()
      applySlitWidthToScene()
      syncControls()
      setMode('fringes')
    } else if (!p.imaging) {
      setLensInserted(true)
      setMode('imaging')
    }
  })
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'scene') return
    const key = pick(event.clientX, event.clientY)
    if (!key) return
    const runtime = runtimes.get(key)!
    if (!runtime.spec.draggable) return
    const x = planeX(event.clientX, event.clientY)
    if (x === null) return
    activeDrag = { key, offsetX: runtime.group.position.x - x, moved: false, sx: event.clientX, sy: event.clientY }
    controls.enabled = false
    if (runtime.highlight) (runtime.highlight.material as THREE.MeshBasicMaterial).opacity = 0.28
  })
  window.addEventListener('pointermove', (event) => {
    if (!activeDrag) return
    const runtime = runtimes.get(activeDrag.key)!
    const x = planeX(event.clientX, event.clientY)
    if (x === null) return
    activeDrag.moved = activeDrag.moved || Math.abs(event.clientX - activeDrag.sx) > 3 || Math.abs(event.clientY - activeDrag.sy) > 3
    const [min, max] = runtime.spec.xRange ?? [runtime.group.position.x, runtime.group.position.x]
    runtime.group.position.x = clamp(Math.round((x + activeDrag.offsetX) / 0.02) * 0.02, min, max)
    dockReadout.textContent = `${NAMES[activeDrag.key]} 褰撳墠浣嶇疆 ${runtime.group.position.x.toFixed(3)} m`
    updateAlignedFromScene()
    syncControls()
    buildLightPath()
    refresh()
  })
  window.addEventListener('pointerup', (event) => {
    if (activeDrag) {
      const key = activeDrag.key
      const moved = activeDrag.moved
      const runtime = runtimes.get(key)!
      if (runtime.highlight) (runtime.highlight.material as THREE.MeshBasicMaterial).opacity = 0
      activeDrag = null
      dockReadout.textContent = 'Drag components to preview position changes.'
      controls.enabled = true
      if (!moved) {
        if (key === 'lamp') setLampOn(!state.lampOn)
        else if (key === 'aux_lens') setLensInserted(!state.lensInserted)
        else showInfo(key)
      }
      refresh()
      return
    }
    const key = pick(event.clientX, event.clientY)
    if (!key) return
    if (key === 'lamp') {
      setLampOn(!state.lampOn)
      return
    }
    if (key === 'aux_lens') {
      setLensInserted(!state.lensInserted)
      return
    }
    showInfo(key)
  })
  renderer.domElement.addEventListener(
    'wheel',
    (event) => {
      if (state.mode !== 'scene') return
      const key = pick(event.clientX, event.clientY)
      if (key === 'slit') {
        const delta = event.deltaY < 0 ? 0.01 : -0.01
        state.slitWidth = clamp(Number((state.slitWidth + delta).toFixed(2)), 0.05, 0.6)
        applySlitWidthToScene()
        syncControls()
        refresh()
        event.preventDefault()
      } else if (key === 'eyepiece') {
        const delta = event.deltaY < 0 ? 2 : -2
        state.focus = clamp(state.focus + delta, 0, 100)
        applyFocusToScene()
        syncControls()
        refresh()
        event.preventDefault()
      }
    },
    { passive: false },
  )
}

function showInfo(key: Key) {
  const copy: Record<Key, [string, string]> = {
    table: ['承载平台', '支撑整套光学实验器材。'],
    ruler: ['位置读数', '读取各器件在光具座上的相对位置。'],
    power: ['供电模块', '为钠光灯提供稳定电源。'],
    lamp: ['单色光源', '发出近似 589.3 nm 的钠黄光。'],
    condenser: ['聚光整形', '把光汇聚到狭缝位置。'],
    slit: ['线光源', '调节宽度以建立相干条件。'],
    biprism: ['双虚光源', '使狭缝光形成两束相干光。'],
    aux_lens: ['成像测量', '用于读取 d1、d2。'],
    eyepiece: ['条纹观察', '观察条纹并读取间距。'],
  }
  modalTitle.textContent = NAMES[key]
  modalRole.textContent = copy[key][0]
  modalDetail.textContent = copy[key][1]
  infoModal.classList.remove('hidden')
}

function resize() {
  const width = sceneHost.clientWidth
  const height = sceneHost.clientHeight
  renderer.setSize(width, height)
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
  primaryCanvas.width = Math.max(960, Math.floor(labPanel.clientWidth * 1.35))
  primaryCanvas.height = Math.max(540, Math.floor(labPanel.clientHeight * 1.1))
}

window.addEventListener('resize', resize)

function animate(time: number) {
  requestAnimationFrame(animate)
  controls.update()
  if (state.mode === 'scene') renderer.render(scene, camera)
  else refresh(time)
}

async function init() {
  await Promise.all(specs.map(load))
  layoutLoadedModels()
  wireControlsSynced()
  mountAIAssistant({ getContext: getAssistantContext })
  resetCamera()
  updateLamp()
  resize()
  animate(performance.now())
}

void init()
