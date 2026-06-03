import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const deepseekApiKey = 'sk-b9da9416d9c24a01a059e63a26775887'

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api/deepseek/chat': {
        target: 'http://127.0.0.1:5000',
        bypass: async (req, res) => {
          if (!req.url?.startsWith('/api/deepseek/chat')) return req.url
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ message: 'Method Not Allowed' }))
            return true
          }

          try {
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }

            const bodyText = Buffer.concat(chunks).toString('utf-8') || '{}'
            const payload = JSON.parse(bodyText)

            const upstream = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${deepseekApiKey}`,
              },
              body: JSON.stringify({
                model: 'deepseek-v4-pro',
                temperature: 0.35,
                max_tokens: 1800,
                messages: [
                  {
                    role: 'system',
                    content: [
                      '你是双棱镜干涉仿真实验中的 AI 助手。',
                      '你需要结合用户上传的数据、图像、实验上下文和提问，给出结构化的分析。',
                      '默认按四部分回答：1. 结论摘要 2. 关键数据特征 3. 原因分析 4. 改进建议。',
                      '如果用户给出的是实验图像，也要解释现象和可能的误差来源。',
                      '如信息不足，明确指出缺失的数据，不要编造实验事实。',
                      '除非用户特别要求，始终使用中文回答。',
                    ].join('\n'),
                  },
                  ...(Array.isArray(payload.messages) ? payload.messages.map((message: { role: string; content: string }) => ({
                    role: message.role,
                    content: message.content,
                  })) : []),
                  {
                    role: 'user',
                    content: [
                      payload.prompt?.trim() || '请分析我上传的实验数据，并解释出现这种结果的可能原因。',
                      payload.context ? `实验上下文：\n${JSON.stringify(payload.context, null, 2)}` : '',
                      Array.isArray(payload.attachments) && payload.attachments.length
                        ? `附件信息：\n${payload.attachments.map((attachment: {
                          name?: string
                          summary?: string
                          excerpt?: string
                        }) => [
                          attachment.name ? `文件名：${attachment.name}` : '',
                          attachment.summary ? `摘要：${attachment.summary}` : '',
                          attachment.excerpt ? `文件片段：\n${attachment.excerpt}` : '',
                        ].filter(Boolean).join('\n')).join('\n\n')}`
                        : '',
                    ].filter(Boolean).join('\n\n'),
                  },
                ],
              }),
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

              res.statusCode = upstream.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ message: errorMessage || rawText || 'DeepSeek 服务请求失败' }))
              return true
            }

            const content =
              upstreamPayload && typeof upstreamPayload === 'object' && 'choices' in upstreamPayload
                ? (upstreamPayload as {
                  choices?: Array<{ message?: { content?: string } }>
                }).choices?.[0]?.message?.content
                : undefined

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({
              content: typeof content === 'string' ? content : '分析服务没有返回有效内容。',
            }))
            return true
          } catch (error) {
            const message = error instanceof Error ? error.message : '服务端转发失败'
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ message }))
            return true
          }
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dataProcessing: resolve(__dirname, 'data-processing.html'),
      },
    },
  },
})
