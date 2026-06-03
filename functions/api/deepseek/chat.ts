interface SimulationContext {
  experiment?: string
  mode?: string
  controls?: Record<string, string | number | boolean>
  metrics?: Record<string, string | number>
  status?: string[]
}

interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AttachmentPayload {
  name?: string
  kind?: string
  summary?: string
  excerpt?: string
  dataUrl?: string
}

interface ChatRequestPayload {
  prompt?: string
  context?: SimulationContext
  messages?: AssistantMessage[]
  attachments?: AttachmentPayload[]
}

interface Env {
  DEEPSEEK_API_KEY?: string
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function buildSystemPrompt() {
  return [
    '你是双棱镜干涉仿真实验中的 AI 助手。',
    '你需要结合用户上传的数据、图像、实验上下文和提问，给出结构化分析。',
    '默认按四部分回答：1. 结论摘要 2. 关键数据特征 3. 原因分析 4. 改进建议。',
    '如果数据异常、趋势不合理或图像现象不明显，要重点说明可能的实验误差来源、仪器因素和操作因素。',
    '如果信息不足，明确指出缺失了哪些数据，不要编造实验事实。',
    '除非用户特别要求，始终使用中文回答。',
  ].join('\n')
}

function toUserPrompt(payload: ChatRequestPayload) {
  const attachmentText = Array.isArray(payload.attachments) && payload.attachments.length
    ? payload.attachments.map((attachment) => [
      attachment.name ? `文件名：${attachment.name}` : '',
      attachment.kind ? `类型：${attachment.kind}` : '',
      attachment.summary ? `摘要：${attachment.summary}` : '',
      attachment.excerpt ? `文件片段：\n${attachment.excerpt}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')
    : ''

  return [
    payload.prompt?.trim() || '请分析我上传的实验数据，并解释出现这种结果的可能原因。',
    payload.context ? `实验上下文：\n${JSON.stringify(payload.context, null, 2)}` : '',
    attachmentText ? `附件信息：\n${attachmentText}` : '',
  ].filter(Boolean).join('\n\n')
}

function messageHasImage(attachment?: AttachmentPayload) {
  return attachment?.kind === 'image' && typeof attachment.dataUrl === 'string' && attachment.dataUrl.startsWith('data:image/')
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DEEPSEEK_API_KEY) {
    return json({ message: 'Cloudflare 环境变量 DEEPSEEK_API_KEY 未配置。' }, 500)
  }

  let payload: ChatRequestPayload
  try {
    payload = await request.json<ChatRequestPayload>()
  } catch {
    return json({ message: '请求体不是有效的 JSON。' }, 400)
  }

  const safeHistory = Array.isArray(payload.messages)
    ? payload.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }))
    : []

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : []
  const imageBlocks = attachments
    .filter(messageHasImage)
    .slice(0, 4)
    .map((attachment) => ({
      type: 'image_url',
      image_url: {
        url: attachment.dataUrl,
      },
    }))

  const userPrompt = toUserPrompt(payload)

  const requestBody = {
    model: 'deepseek-v4-pro',
    temperature: 0.35,
    max_tokens: 1800,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(),
      },
      ...safeHistory,
      imageBlocks.length
        ? {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            ...imageBlocks,
          ],
        }
        : {
          role: 'user',
          content: userPrompt,
        },
    ],
  }

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    })

    const rawText = await upstream.text()
    let upstreamPayload: unknown = null

    try {
      upstreamPayload = rawText ? JSON.parse(rawText) : null
    } catch {
      upstreamPayload = null
    }

    if (!upstream.ok) {
      const errorMessage =
        upstreamPayload && typeof upstreamPayload === 'object' && 'error' in upstreamPayload
          ? (upstreamPayload as { error?: { message?: string } }).error?.message
          : undefined

      return json({ message: errorMessage || rawText || 'DeepSeek 服务请求失败。' }, upstream.status)
    }

    const content =
      upstreamPayload && typeof upstreamPayload === 'object' && 'choices' in upstreamPayload
        ? (upstreamPayload as {
          choices?: Array<{ message?: { content?: string } }>
        }).choices?.[0]?.message?.content
        : undefined

    return json({
      content: typeof content === 'string' ? content : '分析服务没有返回有效内容。',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare 函数请求 DeepSeek 失败。'
    return json({ message }, 500)
  }
}
