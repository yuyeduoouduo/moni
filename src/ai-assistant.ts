import './ai-assistant.css'

type AssistantRole = 'user' | 'assistant'
type AttachmentKind = 'image' | 'table' | 'json' | 'text' | 'binary'

type SimulationContext = {
  experiment?: string
  mode?: string
  controls?: Record<string, string | number | boolean>
  metrics?: Record<string, string | number>
  status?: string[]
}

type AssistantMessage = {
  role: AssistantRole
  content: string
  meta?: string
}

type PreparedAttachment = {
  id: string
  name: string
  kind: AttachmentKind
  mime: string
  size: number
  excerpt: string
  summary: string
  dataUrl?: string
  previewUrl?: string
  dimensions?: { width: number; height: number }
}

type AssistantOptions = {
  getContext?: () => SimulationContext
}

type AssistantResponse = {
  content: string
  imageFallback?: boolean
}

const MAX_HISTORY_MESSAGES = 10

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

function detectDelimiter(line: string) {
  const delimiters = [',', '\t', ';', '|']
  const scored = delimiters.map((delimiter) => ({
    delimiter,
    count: line.split(delimiter).length,
  }))
  scored.sort((a, b) => b.count - a.count)
  return scored[0].count > 1 ? scored[0].delimiter : ','
}

function summarizeNumbers(content: string) {
  const numbers = Array.from(content.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi), (match) => Number(match[0]))
    .filter((value) => Number.isFinite(value))

  if (!numbers.length) return '未检测到可用于统计的数值列。'

  const sum = numbers.reduce((total, value) => total + value, 0)
  const mean = sum / numbers.length
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const variance = numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / numbers.length
  const std = Math.sqrt(variance)

  return [
    `检测到 ${numbers.length} 个数值`,
    `最小值 ${min.toFixed(4)}`,
    `最大值 ${max.toFixed(4)}`,
    `均值 ${mean.toFixed(4)}`,
    `标准差 ${std.toFixed(4)}`,
  ].join('，')
}

function summarizeCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return 'CSV 文件为空。'

  const delimiter = detectDelimiter(lines[0])
  const rows = lines.slice(0, 8).map((line) => line.split(delimiter).map((cell) => cell.trim()))
  const columnCount = Math.max(...rows.map((row) => row.length), 0)
  const header = rows[0] ?? []
  const headerText = header.length ? `字段：${header.join(' | ')}` : '未识别到表头'

  return [
    `表格约 ${lines.length} 行，${columnCount} 列`,
    headerText,
    summarizeNumbers(text),
  ].join('；')
}

function summarizeJson(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      const sample = parsed[0]
      const keys = sample && typeof sample === 'object' ? Object.keys(sample as Record<string, unknown>) : []
      return `JSON 数组，共 ${parsed.length} 项${keys.length ? `；首项字段：${keys.join(', ')}` : ''}；${summarizeNumbers(text)}`
    }
    if (parsed && typeof parsed === 'object') {
      return `JSON 对象，顶层字段：${Object.keys(parsed as Record<string, unknown>).join(', ') || '无'}；${summarizeNumbers(text)}`
    }
    return `JSON 标量值；${summarizeNumbers(text)}`
  } catch {
    return `JSON 解析失败，已按普通文本处理；${summarizeNumbers(text)}`
  }
}

function summarizeText(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  return `文本约 ${text.length} 个字符、${lines.length} 行；${summarizeNumbers(text)}`
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('图片尺寸读取失败'))
    image.src = dataUrl
  })
}

async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const base = {
    id: crypto.randomUUID(),
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
  }

  if (file.type.startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file)
    const dimensions = await readImageDimensions(dataUrl).catch(() => undefined)
    const dimensionText = dimensions ? `${dimensions.width} x ${dimensions.height}` : '尺寸未知'

    return {
      ...base,
      kind: 'image',
      dataUrl,
      previewUrl: dataUrl,
      dimensions,
      excerpt: '',
      summary: `图片文件 ${file.name}，${dimensionText}，${formatFileSize(file.size)}。`,
    }
  }

  const text = await file.text()
  const excerpt = text.slice(0, 6000)
  const lower = file.name.toLowerCase()
  const kind: AttachmentKind =
    lower.endsWith('.csv') || lower.endsWith('.tsv') ? 'table'
      : lower.endsWith('.json') ? 'json'
        : file.type.startsWith('text/') ? 'text'
          : 'binary'

  const summary = kind === 'table'
    ? summarizeCsv(text)
    : kind === 'json'
      ? summarizeJson(text)
      : summarizeText(text)

  return {
    ...base,
    kind,
    excerpt,
    summary: `${file.name}：${summary}`,
  }
}

function renderMessage(message: AssistantMessage) {
  return `
    <article class="ai-message ${message.role === 'assistant' ? 'assistant' : 'user'}">
      <div class="ai-message-bubble">
        <p>${escapeHtml(message.content).replace(/\n/g, '<br />')}</p>
        ${message.meta ? `<span>${escapeHtml(message.meta)}</span>` : ''}
      </div>
    </article>
  `
}

async function requestDeepSeek(args: {
  messages: AssistantMessage[]
  prompt: string
  attachments: PreparedAttachment[]
  context?: SimulationContext
}) {
  const response = await fetch('/api/deepseek/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: args.prompt,
      context: args.context,
      messages: args.messages.slice(-MAX_HISTORY_MESSAGES),
      attachments: args.attachments,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message)
      || '实验分析服务请求失败'
    throw new Error(message)
  }

  const result = payload as AssistantResponse | null
  if (!result?.content?.trim()) {
    throw new Error('实验分析服务返回了空结果')
  }

  return result
}

export function mountAIAssistant(options: AssistantOptions = {}) {
  const root = document.createElement('section')
  root.className = 'ai-assistant'
  root.innerHTML = `
    <button class="ai-assistant-fab" id="aiAssistantFab" type="button" aria-label="打开 AI 助手">
      <span class="ai-assistant-pulse"></span>
      <img src="/ai-assistant-avatar.svg" alt="AI 助手头像" />
      <span class="ai-assistant-fab-label">AI 助手</span>
    </button>

    <div class="ai-assistant-panel hidden" id="aiAssistantPanel">
      <header class="ai-assistant-header">
        <div class="ai-assistant-title">
          <img src="/ai-assistant-avatar.svg" alt="AI 助手" />
          <div>
            <p>DeepSeek Lab Copilot</p>
            <strong>实验分析助手</strong>
          </div>
        </div>
        <button class="ai-assistant-close" id="aiAssistantClose" type="button" aria-label="关闭">×</button>
      </header>

      <div class="ai-assistant-service-bar">
        <span class="ai-service-dot"></span>
        <strong>已连接后端分析接口</strong>
        <p>前端不再显示或存储 API Key，分析请求统一走服务端。</p>
      </div>

      <div class="ai-assistant-actions">
        <button class="ai-chip-btn" data-prompt="请结合当前仿真状态，分析实验是否已经调到较佳条件。">分析当前实验状态</button>
        <button class="ai-chip-btn" data-prompt="请分析我上传的数据，并解释这些数据出现的可能原因。">分析上传数据</button>
        <button class="ai-chip-btn" data-prompt="请检查这些结果里可能的误差来源，并给出改进建议。">解释误差来源</button>
      </div>

      <div class="ai-upload-bar">
        <label class="ai-upload-btn" for="aiAssistantFileInput">上传数据/图片</label>
        <input id="aiAssistantFileInput" type="file" multiple accept=".csv,.tsv,.txt,.json,image/png,image/jpeg,image/webp,image/svg+xml" />
        <button class="ai-ghost-btn" id="aiAssistantClear" type="button">清空对话</button>
      </div>

      <div class="ai-attachments" id="aiAssistantAttachments"></div>

      <div class="ai-assistant-messages" id="aiAssistantMessages"></div>

      <form class="ai-assistant-composer" id="aiAssistantComposer">
        <textarea id="aiAssistantInput" rows="5" placeholder="输入你的问题，或上传实验数据 / 图像后让助手分析原因。"></textarea>
        <div class="ai-assistant-compose-row">
          <span>支持 CSV / JSON / TXT / PNG / JPG / WEBP</span>
          <button id="aiAssistantSend" type="submit">发送分析</button>
        </div>
      </form>
    </div>
  `

  document.body.append(root)

  const fab = root.querySelector<HTMLButtonElement>('#aiAssistantFab')!
  const panel = root.querySelector<HTMLDivElement>('#aiAssistantPanel')!
  const close = root.querySelector<HTMLButtonElement>('#aiAssistantClose')!
  const fileInput = root.querySelector<HTMLInputElement>('#aiAssistantFileInput')!
  const attachmentsEl = root.querySelector<HTMLDivElement>('#aiAssistantAttachments')!
  const messagesEl = root.querySelector<HTMLDivElement>('#aiAssistantMessages')!
  const composer = root.querySelector<HTMLFormElement>('#aiAssistantComposer')!
  const input = root.querySelector<HTMLTextAreaElement>('#aiAssistantInput')!
  const clearButton = root.querySelector<HTMLButtonElement>('#aiAssistantClear')!
  const sendButton = root.querySelector<HTMLButtonElement>('#aiAssistantSend')!

  const messages: AssistantMessage[] = [
    {
      role: 'assistant',
      content: '我已经接入仿真页面了。你可以直接提问实验现象、上传 CSV/JSON/TXT 数据，或者上传实验截图让我辅助分析。',
      meta: '分析请求会发送到后端接口，由服务端统一调用 DeepSeek。',
    },
  ]

  let attachments: PreparedAttachment[] = []

  function renderMessages() {
    messagesEl.innerHTML = messages.map(renderMessage).join('')
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function renderAttachments() {
    if (!attachments.length) {
      attachmentsEl.innerHTML = ''
      return
    }

    attachmentsEl.innerHTML = attachments.map((attachment) => `
      <article class="ai-attachment-card">
        ${attachment.previewUrl ? `<img src="${attachment.previewUrl}" alt="${escapeHtml(attachment.name)}" />` : '<div class="ai-attachment-icon">DATA</div>'}
        <div class="ai-attachment-copy">
          <strong>${escapeHtml(attachment.name)}</strong>
          <p>${escapeHtml(attachment.summary)}</p>
          <span>${formatFileSize(attachment.size)}</span>
        </div>
        <button type="button" data-remove-id="${attachment.id}" aria-label="移除附件">×</button>
      </article>
    `).join('')
  }

  function setPanelOpen(open: boolean) {
    panel.classList.toggle('hidden', !open)
    fab.classList.toggle('hidden', open)
    if (open) input.focus()
  }

  function addAssistantMessage(content: string, meta?: string) {
    messages.push({ role: 'assistant', content, meta })
    renderMessages()
  }

  function addUserMessage(content: string, extraMeta?: string) {
    messages.push({ role: 'user', content, meta: extraMeta })
    renderMessages()
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return

    const prepared = await Promise.all(Array.from(fileList).map((file) => prepareAttachment(file)))
    attachments = [...attachments, ...prepared]
    renderAttachments()
    fileInput.value = ''
  }

  async function handleSend(promptOverride?: string) {
    const prompt = promptOverride ?? input.value.trim()

    if (!prompt && !attachments.length) {
      addAssistantMessage('请先输入问题，或者先上传数据/图片。')
      return
    }

    const userSummary = [
      prompt || '请分析我上传的附件。',
      attachments.length ? `已附带 ${attachments.length} 个文件` : '',
    ].filter(Boolean).join('；')

    addUserMessage(userSummary)
    input.value = ''

    const sentAttachments = attachments
    attachments = []
    renderAttachments()

    sendButton.disabled = true
    sendButton.textContent = '分析中...'

    try {
      const result = await requestDeepSeek({
        prompt,
        attachments: sentAttachments,
        messages,
        context: options.getContext?.(),
      })

      addAssistantMessage(
        result.content,
        result.imageFallback ? '当前服务端已自动切换到文本模式，图片以附件说明形式参与分析。' : undefined,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败'
      addAssistantMessage(`分析失败：${message}`)
    } finally {
      sendButton.disabled = false
      sendButton.textContent = '发送分析'
    }
  }

  fab.addEventListener('click', () => setPanelOpen(true))
  close.addEventListener('click', () => setPanelOpen(false))
  fileInput.addEventListener('change', () => {
    void handleFiles(fileInput.files)
  })

  composer.addEventListener('submit', (event) => {
    event.preventDefault()
    void handleSend()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void handleSend()
    }
  })

  clearButton.addEventListener('click', () => {
    attachments = []
    messages.splice(1)
    renderAttachments()
    renderMessages()
  })

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const prompt = target.getAttribute('data-prompt')
    const removeId = target.getAttribute('data-remove-id')

    if (prompt) {
      void handleSend(prompt)
      return
    }

    if (removeId) {
      attachments = attachments.filter((attachment) => attachment.id !== removeId)
      renderAttachments()
    }
  })

  renderMessages()
  renderAttachments()
}
