import './data-processing.css'

type FringeRow = {
  index: number
  fringeOrder: number
  positionMm: number
}

type ImageRow = {
  index: number
  d1Mm: number
  d2Mm: number
}

type FitPoint = {
  x: number
  y: number
}

type FitResult = {
  slope: number
  intercept: number
  r2: number
  predicted: number[]
  spacingMm: number
}

type SampleStats = {
  mean: number
  aUncertainty: number
  bUncertainty: number
  combined: number
}

const THEORETICAL_LAMBDA_NM = 589.3
const DEFAULT_D_INSTRUMENT_MM = 0.01
const DEFAULT_D_DISTANCE_INSTRUMENT_MM = 0.01
const DEFAULT_D_READINGS_M = [0.671, 0.673, 0.672]
const DEFAULT_FRINGE_ROWS: FringeRow[] = Array.from({ length: 10 }, (_, index) => ({
  index: index + 1,
  fringeOrder: index * 2,
  positionMm: Number((12.116 + index * 0.6244 + [0, 0.006, -0.004, 0.005, -0.003, 0.004, -0.005, 0.003, -0.004, 0.002][index]).toFixed(3)),
}))
const DEFAULT_IMAGE_ROWS: ImageRow[] = [
  { index: 1, d1Mm: 2.486, d2Mm: 0.651 },
  { index: 2, d1Mm: 2.481, d2Mm: 0.649 },
  { index: 3, d1Mm: 2.484, d2Mm: 0.650 },
]

const app = document.querySelector<HTMLDivElement>('#app')!

const state = {
  dRows: structuredClone(DEFAULT_D_READINGS_M),
  fringeRows: structuredClone(DEFAULT_FRINGE_ROWS),
  imageRows: structuredClone(DEFAULT_IMAGE_ROWS),
  dInstrumentMm: DEFAULT_D_INSTRUMENT_MM,
  dDistanceInstrumentMm: DEFAULT_D_DISTANCE_INSTRUMENT_MM,
}

app.innerHTML = `
  <div class="page-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Learning by Doing</p>
        <h1>双棱镜干涉数据处理小程序</h1>
        <p class="hero-copy">
          按“每隔一个条纹测一组”的方式录入 10 组数据，页面内直接做线性拟合，
          自动计算条纹间距、虚光源间距、波长与不确定度，适合放到学习通中直接使用。
        </p>
      </div>
      <div class="hero-card">
        <div><span>理论波长</span><strong>${THEORETICAL_LAMBDA_NM.toFixed(1)} nm</strong></div>
        <div><span>条纹测量</span><strong>10 组</strong></div>
        <div><span>拟合方式</span><strong>x-k 线性拟合</strong></div>
      </div>
    </header>

    <main class="layout">
      <section class="panel panel-form">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Input</p>
            <h2>实验数据录入</h2>
          </div>
          <div class="action-row">
            <button id="fillExampleBtn" type="button" class="ghost-btn">填入示例</button>
            <button id="clearBtn" type="button" class="ghost-btn">清空数据</button>
          </div>
        </div>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>1. 观测距离 D（m）</h3>
            <p>可录入多次读数，自动取平均值参与计算。</p>
          </div>
          <div class="mini-grid" id="dTable"></div>
        </section>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>2. 条纹位置数据</h3>
            <p>按每隔一个条纹测一组，输入条纹序号 k 与对应位置 x（mm）。</p>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>组次</th>
                  <th>条纹序号 k</th>
                  <th>位置 x / mm</th>
                  <th>相邻两组求得 2Δx / mm</th>
                </tr>
              </thead>
              <tbody id="fringeTable"></tbody>
            </table>
          </div>
        </section>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>3. 辅助透镜读数</h3>
            <p>输入放大像间距 d1 与缩小像间距 d2，程序自动计算 d = √(d1·d2)。</p>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>组次</th>
                  <th>d1 / mm</th>
                  <th>d2 / mm</th>
                  <th>d / mm</th>
                </tr>
              </thead>
              <tbody id="imageTable"></tbody>
            </table>
          </div>
        </section>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>4. 仪器分度值</h3>
            <p>默认按文档中的 B 类处理方式：uB = Δ仪 / √3。</p>
          </div>
          <div class="instrument-grid">
            <label>
              <span>d、Δx 仪器分度值 / mm</span>
              <input id="dInstrumentInput" type="number" step="0.001" min="0" />
            </label>
            <label>
              <span>D 仪器分度值 / mm</span>
              <input id="distanceInstrumentInput" type="number" step="0.001" min="0" />
            </label>
          </div>
        </section>
      </section>

      <section class="panel panel-result">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Output</p>
            <h2>拟合与计算结果</h2>
          </div>
          <span class="status-pill" id="fitBadge">等待数据</span>
        </div>

        <section class="result-hero" id="coreResult"></section>

        <section class="subpanel dark">
          <div class="subpanel-head">
            <h3>线性拟合图</h3>
            <p>横轴为条纹序号 k，纵轴为位置 x（mm），斜率即每跨 1 个条纹序号对应的位置变化。</p>
          </div>
          <div class="chart-shell">
            <svg id="fitChart" viewBox="0 0 700 420" role="img" aria-label="线性拟合图"></svg>
          </div>
          <div class="equation-box" id="fitEquation"></div>
        </section>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>不确定度分析</h3>
            <p>按公式.doc 中的 A 类、B 类与合成相对不确定度方式自动计算。</p>
          </div>
          <div class="stats-grid" id="uncertaintyGrid"></div>
        </section>

        <section class="subpanel">
          <div class="subpanel-head">
            <h3>计算过程摘要</h3>
            <p>方便学生截图提交，也方便老师核对过程。</p>
          </div>
          <div class="summary-list" id="summaryList"></div>
        </section>
      </section>
    </main>
  </div>
`

const dTable = document.querySelector<HTMLDivElement>('#dTable')!
const fringeTable = document.querySelector<HTMLTableSectionElement>('#fringeTable')!
const imageTable = document.querySelector<HTMLTableSectionElement>('#imageTable')!
const coreResult = document.querySelector<HTMLDivElement>('#coreResult')!
const fitEquation = document.querySelector<HTMLDivElement>('#fitEquation')!
const uncertaintyGrid = document.querySelector<HTMLDivElement>('#uncertaintyGrid')!
const summaryList = document.querySelector<HTMLDivElement>('#summaryList')!
const fitBadge = document.querySelector<HTMLSpanElement>('#fitBadge')!
const fitChart = document.querySelector<SVGSVGElement>('#fitChart')!
const dInstrumentInput = document.querySelector<HTMLInputElement>('#dInstrumentInput')!
const distanceInstrumentInput = document.querySelector<HTMLInputElement>('#distanceInstrumentInput')!

function round(value: number, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleAUncertainty(values: number[]) {
  const n = values.length
  if (n < 2) return 0
  const avg = mean(values)
  const sum = values.reduce((total, value) => total + (value - avg) ** 2, 0)
  return Math.sqrt(sum / (n * (n - 1)))
}

function bUncertaintyFromResolution(resolution: number) {
  return resolution > 0 ? resolution / Math.sqrt(3) : 0
}

function combineUncertainty(aValue: number, bValue: number) {
  return Math.sqrt(aValue ** 2 + bValue ** 2)
}

function stats(values: number[], resolution: number): SampleStats {
  const avg = mean(values)
  const aUncertainty = sampleAUncertainty(values)
  const bUncertainty = bUncertaintyFromResolution(resolution)
  const combined = combineUncertainty(aUncertainty, bUncertainty)
  return { mean: avg, aUncertainty, bUncertainty, combined }
}

function linearFit(points: FitPoint[]): FitResult | null {
  if (points.length < 2) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const xAvg = mean(xs)
  const yAvg = mean(ys)
  const sxx = xs.reduce((sum, value) => sum + (value - xAvg) ** 2, 0)
  if (sxx === 0) return null
  const sxy = points.reduce((sum, point) => sum + (point.x - xAvg) * (point.y - yAvg), 0)
  const slope = sxy / sxx
  const intercept = yAvg - slope * xAvg
  const predicted = xs.map((x) => slope * x + intercept)
  const ssTot = ys.reduce((sum, value) => sum + (value - yAvg) ** 2, 0)
  const ssRes = ys.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0)
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return {
    slope,
    intercept,
    r2,
    predicted,
    spacingMm: Math.abs(slope),
  }
}

function geometricMean(d1Mm: number, d2Mm: number) {
  if (d1Mm <= 0 || d2Mm <= 0) return 0
  return Math.sqrt(d1Mm * d2Mm)
}

function relativePart(uncertainty: number, value: number) {
  return value === 0 ? 0 : uncertainty / Math.abs(value)
}

function createInput(value: number, step: string, dataset: Record<string, string>) {
  const input = document.createElement('input')
  input.type = 'number'
  input.value = Number.isFinite(value) ? String(value) : ''
  input.step = step
  input.min = '0'
  Object.entries(dataset).forEach(([key, dataValue]) => {
    input.dataset[key] = dataValue
  })
  return input
}

function renderDTable() {
  dTable.innerHTML = ''
  state.dRows.forEach((value, index) => {
    const card = document.createElement('label')
    card.className = 'mini-card'
    const title = document.createElement('span')
    title.textContent = `D${index + 1} / m`
    const input = createInput(value, '0.001', { section: 'd', index: String(index) })
    card.append(title, input)
    dTable.append(card)
  })
}

function renderFringeTable() {
  fringeTable.innerHTML = ''
  state.fringeRows.forEach((row, index) => {
    const tr = document.createElement('tr')
    const spacing = index === 0
      ? '--'
      : round((row.positionMm - state.fringeRows[index - 1].positionMm) / Math.max(row.fringeOrder - state.fringeRows[index - 1].fringeOrder, 1), 5)

    tr.innerHTML = `
      <td>${row.index}</td>
      <td></td>
      <td></td>
      <td><span class="derived-chip">${typeof spacing === 'number' ? spacing.toFixed(5) : spacing}</span></td>
    `

    const orderCell = tr.children[1]
    const positionCell = tr.children[2]
    orderCell.append(createInput(row.fringeOrder, '1', { section: 'fringe-order', index: String(index) }))
    positionCell.append(createInput(row.positionMm, '0.001', { section: 'fringe-position', index: String(index) }))
    fringeTable.append(tr)
  })
}

function renderImageTable() {
  imageTable.innerHTML = ''
  state.imageRows.forEach((row, index) => {
    const tr = document.createElement('tr')
    const dMm = geometricMean(row.d1Mm, row.d2Mm)
    tr.innerHTML = `
      <td>${row.index}</td>
      <td></td>
      <td></td>
      <td><span class="derived-chip">${dMm ? dMm.toFixed(5) : '--'}</span></td>
    `
    tr.children[1].append(createInput(row.d1Mm, '0.001', { section: 'image-d1', index: String(index) }))
    tr.children[2].append(createInput(row.d2Mm, '0.001', { section: 'image-d2', index: String(index) }))
    imageTable.append(tr)
  })
}

function formatLambda(lambdaNm: number, uLambdaNm: number) {
  if (!Number.isFinite(lambdaNm) || lambdaNm <= 0) return '--'
  if (!Number.isFinite(uLambdaNm) || uLambdaNm <= 0) return `${lambdaNm.toFixed(2)} nm`
  return `${lambdaNm.toFixed(2)} ± ${uLambdaNm.toFixed(2)} nm`
}

function drawFitChart(points: FitPoint[], fit: FitResult | null) {
  const width = 700
  const height = 420
  const padding = { left: 72, right: 28, top: 28, bottom: 56 }
  fitChart.innerHTML = ''

  const valid = fit && points.length >= 2
  if (!valid) {
    fitChart.innerHTML = `
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#0c1721" />
      <text x="${width / 2}" y="${height / 2}" fill="#dfe8ef" text-anchor="middle" font-size="26">录入有效数据后显示拟合图</text>
    `
    return
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const xSpan = maxX - minX || 1
  const ySpan = maxY - minY || 1

  const toX = (value: number) => padding.left + ((value - minX) / xSpan) * (width - padding.left - padding.right)
  const toY = (value: number) => height - padding.bottom - ((value - minY) / ySpan) * (height - padding.top - padding.bottom)

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const y = padding.top + ((height - padding.top - padding.bottom) / 4) * index
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(187,208,224,0.12)" stroke-width="1" />`
  }).join('')

  const xTicks = xs.map((value) => `<text x="${toX(value)}" y="${height - 18}" fill="#8ea4b4" font-size="15" text-anchor="middle">${value}</text>`).join('')
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = maxY - (ySpan / 4) * index
    return `<text x="${padding.left - 14}" y="${padding.top + ((height - padding.top - padding.bottom) / 4) * index + 5}" fill="#8ea4b4" font-size="15" text-anchor="end">${value.toFixed(3)}</text>`
  }).join('')

  const pathPoints = [minX, maxX]
    .map((x, index) => `${index === 0 ? 'M' : 'L'} ${toX(x)} ${toY(fit.slope * x + fit.intercept)}`)
    .join(' ')

  const dots = points.map((point) => `
    <circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="6" fill="#ffd777" />
    <circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="13" fill="rgba(255,215,119,0.14)" />
  `).join('')

  fitChart.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#0c1721" />
    ${gridLines}
    <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#91a8b9" stroke-width="2" />
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#91a8b9" stroke-width="2" />
    <path d="${pathPoints}" fill="none" stroke="#78d0ff" stroke-width="4" stroke-linecap="round" />
    ${dots}
    ${xTicks}
    ${yTicks}
    <text x="${width / 2}" y="${height - 10}" fill="#d6e2eb" font-size="16" text-anchor="middle">条纹序号 k</text>
    <text x="26" y="${height / 2}" fill="#d6e2eb" font-size="16" text-anchor="middle" transform="rotate(-90 26 ${height / 2})">位置 x / mm</text>
  `
}

function compute() {
  const fringePoints = state.fringeRows
    .filter((row) => Number.isFinite(row.fringeOrder) && Number.isFinite(row.positionMm))
    .map((row) => ({ x: row.fringeOrder, y: row.positionMm }))
  const fit = linearFit(fringePoints)
  const deltaX = fit ? fit.spacingMm / 2 : 0

  const dStats = stats(state.dRows.filter((value) => value > 0), state.dDistanceInstrumentMm / 1000)
  const dValuesMm = state.imageRows
    .map((row) => geometricMean(row.d1Mm, row.d2Mm))
    .filter((value) => value > 0)
  const spacingStats = stats(deltaX > 0 ? state.fringeRows.slice(1).map((row, index) => {
    const previous = state.fringeRows[index]
    const step = row.fringeOrder - previous.fringeOrder
    return step === 0 ? 0 : (row.positionMm - previous.positionMm) / step / 2
  }).filter((value) => value > 0) : [], state.dInstrumentMm)
  const virtualSourceStats = stats(dValuesMm, state.dInstrumentMm)

  const lambdaNm = dStats.mean > 0 && deltaX > 0 && virtualSourceStats.mean > 0
    ? (deltaX * virtualSourceStats.mean / (dStats.mean * 1000)) * 1e6
    : 0
  const relativeUncertainty = Math.sqrt(
    relativePart(spacingStats.combined, spacingStats.mean || deltaX) ** 2 +
    relativePart(dStats.combined, dStats.mean) ** 2 +
    relativePart(virtualSourceStats.combined, virtualSourceStats.mean) ** 2,
  )
  const uLambdaNm = lambdaNm * relativeUncertainty
  const percentError = lambdaNm ? Math.abs(lambdaNm - THEORETICAL_LAMBDA_NM) / THEORETICAL_LAMBDA_NM * 100 : 0

  return {
    fringePoints,
    fit,
    deltaX,
    dStats,
    spacingStats: {
      ...spacingStats,
      mean: spacingStats.mean || deltaX,
    },
    virtualSourceStats,
    lambdaNm,
    uLambdaNm,
    relativeUncertainty,
    percentError,
  }
}

function renderResults() {
  const result = compute()
  const { fit, fringePoints, deltaX, lambdaNm, uLambdaNm, relativeUncertainty, percentError, dStats, spacingStats, virtualSourceStats } = result

  const fitReady = Boolean(fit && fringePoints.length >= 2 && lambdaNm > 0)
  fitBadge.textContent = fitReady ? '拟合完成' : '等待有效数据'
  fitBadge.classList.toggle('ready', fitReady)

  coreResult.innerHTML = `
    <article class="metric-card accent">
      <span>条纹间距 Δx</span>
      <strong>${deltaX ? deltaX.toFixed(5) : '--'} mm</strong>
      <em>由线性拟合斜率 ÷ 2 得到</em>
    </article>
    <article class="metric-card">
      <span>虚光源间距 d</span>
      <strong>${virtualSourceStats.mean ? virtualSourceStats.mean.toFixed(5) : '--'} mm</strong>
      <em>d = √(d1·d2) 后再取平均</em>
    </article>
    <article class="metric-card">
      <span>平均 D</span>
      <strong>${dStats.mean ? dStats.mean.toFixed(5) : '--'} m</strong>
      <em>多次读数平均值</em>
    </article>
    <article class="metric-card accent-soft">
      <span>测得波长 λ</span>
      <strong>${formatLambda(lambdaNm, uLambdaNm)}</strong>
      <em>理论值 ${THEORETICAL_LAMBDA_NM.toFixed(1)} nm，误差 ${percentError ? percentError.toFixed(2) : '--'}%</em>
    </article>
  `

  fitEquation.innerHTML = fit
    ? `
      <div class="equation-line">拟合方程：<strong>x = ${fit.slope.toFixed(5)}k + ${fit.intercept.toFixed(5)}</strong></div>
      <div class="equation-line">决定系数：<strong>R² = ${fit.r2.toFixed(6)}</strong></div>
      <div class="equation-line">因为相邻组跨 2 个条纹，所以 <strong>Δx = 斜率 / 2 = ${deltaX.toFixed(5)} mm</strong></div>
    `
    : '<div class="equation-line">请至少输入 2 组有效条纹数据。</div>'

  uncertaintyGrid.innerHTML = `
    <article class="stat-card">
      <h4>D 的不确定度</h4>
      <div><span>uA(D)</span><strong>${dStats.aUncertainty.toFixed(6)} m</strong></div>
      <div><span>uB(D)</span><strong>${dStats.bUncertainty.toFixed(6)} m</strong></div>
      <div><span>u(D)</span><strong>${dStats.combined.toFixed(6)} m</strong></div>
    </article>
    <article class="stat-card">
      <h4>Δx 的不确定度</h4>
      <div><span>uA(Δx)</span><strong>${spacingStats.aUncertainty.toFixed(6)} mm</strong></div>
      <div><span>uB(Δx)</span><strong>${spacingStats.bUncertainty.toFixed(6)} mm</strong></div>
      <div><span>u(Δx)</span><strong>${spacingStats.combined.toFixed(6)} mm</strong></div>
    </article>
    <article class="stat-card">
      <h4>d 的不确定度</h4>
      <div><span>uA(d)</span><strong>${virtualSourceStats.aUncertainty.toFixed(6)} mm</strong></div>
      <div><span>uB(d)</span><strong>${virtualSourceStats.bUncertainty.toFixed(6)} mm</strong></div>
      <div><span>u(d)</span><strong>${virtualSourceStats.combined.toFixed(6)} mm</strong></div>
    </article>
    <article class="stat-card emphasis">
      <h4>波长结果</h4>
      <div><span>ur</span><strong>${(relativeUncertainty * 100).toFixed(2)}%</strong></div>
      <div><span>uλ</span><strong>${uLambdaNm.toFixed(4)} nm</strong></div>
      <div><span>λ</span><strong>${formatLambda(lambdaNm, uLambdaNm)}</strong></div>
    </article>
  `

  summaryList.innerHTML = [
    `条纹线性拟合使用 10 组数据：条纹序号 k 与位置 x 建立直线关系。`,
    fit ? `拟合斜率为 ${fit.slope.toFixed(5)} mm/级，因每隔一个条纹测一组，所以 Δx = ${fit.slope.toFixed(5)} / 2 = ${deltaX.toFixed(5)} mm。` : '等待条纹拟合结果。',
    virtualSourceStats.mean ? `虚光源间距按 d = √(d1·d2) 逐组计算，平均 d = ${virtualSourceStats.mean.toFixed(5)} mm。` : '等待 d1、d2 数据。',
    dStats.mean ? `观测距离平均值 D = ${dStats.mean.toFixed(5)} m。` : '等待 D 数据。',
    lambdaNm ? `代入 λ = Δx·d / D，得到 λ = ${lambdaNm.toFixed(2)} nm。` : '等待波长计算结果。',
    lambdaNm ? `合成相对不确定度 ur = ${(relativeUncertainty * 100).toFixed(2)}%，结果可写为 λ = (${lambdaNm.toFixed(2)} ± ${uLambdaNm.toFixed(2)}) nm。` : '等待不确定度结果。',
  ].map((text) => `<div class="summary-item">${text}</div>`).join('')

  drawFitChart(fringePoints, fit)
}

function syncInputs() {
  dInstrumentInput.value = String(state.dInstrumentMm)
  distanceInstrumentInput.value = String(state.dDistanceInstrumentMm)
}

function renderAll() {
  renderDTable()
  renderFringeTable()
  renderImageTable()
  syncInputs()
  renderResults()
}

function resetToExample() {
  state.dRows = structuredClone(DEFAULT_D_READINGS_M)
  state.fringeRows = structuredClone(DEFAULT_FRINGE_ROWS)
  state.imageRows = structuredClone(DEFAULT_IMAGE_ROWS)
  state.dInstrumentMm = DEFAULT_D_INSTRUMENT_MM
  state.dDistanceInstrumentMm = DEFAULT_D_DISTANCE_INSTRUMENT_MM
  renderAll()
}

function clearData() {
  state.dRows = [0, 0, 0]
  state.fringeRows = Array.from({ length: 10 }, (_, index) => ({
    index: index + 1,
    fringeOrder: index * 2,
    positionMm: 0,
  }))
  state.imageRows = Array.from({ length: 3 }, (_, index) => ({
    index: index + 1,
    d1Mm: 0,
    d2Mm: 0,
  }))
  renderAll()
}

document.addEventListener('input', (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const value = Number(target.value)
  const index = Number(target.dataset.index ?? -1)

  switch (target.dataset.section) {
    case 'd':
      if (index >= 0) state.dRows[index] = value
      break
    case 'fringe-order':
      if (index >= 0) state.fringeRows[index].fringeOrder = value
      break
    case 'fringe-position':
      if (index >= 0) state.fringeRows[index].positionMm = value
      break
    case 'image-d1':
      if (index >= 0) state.imageRows[index].d1Mm = value
      break
    case 'image-d2':
      if (index >= 0) state.imageRows[index].d2Mm = value
      break
    default:
      return
  }

  renderResults()
})

dInstrumentInput.addEventListener('input', () => {
  state.dInstrumentMm = Number(dInstrumentInput.value)
  renderResults()
})

distanceInstrumentInput.addEventListener('input', () => {
  state.dDistanceInstrumentMm = Number(distanceInstrumentInput.value)
  renderResults()
})

document.addEventListener('change', (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  if (!target.dataset.section) return
  renderAll()
})

document.querySelector<HTMLButtonElement>('#fillExampleBtn')!.addEventListener('click', resetToExample)
document.querySelector<HTMLButtonElement>('#clearBtn')!.addEventListener('click', clearData)

renderAll()
