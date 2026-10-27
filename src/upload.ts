import { Hono } from "hono";

type Variables = { role: string; uid: number }

export const upload = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// 前端上传前已压缩（通常 < 1MB），这里仅作兜底，避免异常大文件长时间占用 Worker
const MAX_SIZE = 8 * 1024 * 1024
// 上游图床处理耗时不确定，超时后直接失败，避免前端一直等待
const TIMEOUT = 30_000

// 代理上传到 CloudFlare ImgBed（https://cfbed.sanyue.de/api/upload.html）
// 认证码只保存在服务端 secret，浏览器拿不到，防止被他人盗用图床额度
upload.post('/', async (c) => {
    const endpoint = (c.env.imgbed_url || '').replace(/\/+$/, '')
    // 图床凭据：API Token 走 Authorization: Bearer（推荐），上传认证码走 authCode 查询参数
    const token = c.env.imgbed_token || ''
    const authCode = c.env.imgbed_auth_code || ''
    if (!endpoint || (!token && !authCode)) {
        return c.json({ code: 500, msg: '图片上传服务未配置' })
    }

    // 先看 Content-Length，避免超大请求被完整读进内存后才拒绝（预留 multipart 边界与头部的开销）
    const contentLength = Number(c.req.header('content-length') || 0)
    if (contentLength > MAX_SIZE + 64 * 1024) {
        return c.json({ code: 500, msg: '图片不能超过 8MB' })
    }

    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') {
        return c.json({ code: 500, msg: '缺少上传文件' })
    }
    if (!file.type.startsWith('image/')) {
        return c.json({ code: 500, msg: '仅支持图片文件' })
    }
    if (file.size > MAX_SIZE) {
        return c.json({ code: 500, msg: '图片不能超过 8MB' })
    }

    // 重新命名：保留扩展名，前缀加时间戳与随机串，避免中文名和重名冲突
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg').toLowerCase()
    const name = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    const body = new FormData()
    body.append('file', file, name)

    // returnFormat=full 让图床直接返回完整访问链接；origin 命名保留上面生成的文件名
    const query = new URLSearchParams({
        returnFormat: 'full',
        uploadNameType: 'origin',
    })
    const headers: Record<string, string> = {}
    if (token) {
        headers.authorization = `Bearer ${token}`
    } else {
        query.set('authCode', authCode)
    }
    // uploadChannel 是渠道类型（telegram/cfr2/s3/discord/huggingface/webdav），
    // channelName 是多渠道场景下的具体渠道名（如 hf）；只传 channelName 也能定位到渠道
    if (c.env.imgbed_channel) query.set('uploadChannel', c.env.imgbed_channel)
    if (c.env.imgbed_channel_name) query.set('channelName', c.env.imgbed_channel_name)

    let res: Response
    try {
        res = await fetch(`${endpoint}/upload?${query.toString()}`, {
            method: 'POST',
            body,
            headers,
            signal: AbortSignal.timeout(TIMEOUT),
        })
    } catch (e) {
        console.error('imgbed request error:', e)
        return c.json({ code: 500, msg: '图片上传超时，请重试' })
    }

    const text = await res.text()
    let data: any = null
    try {
        data = JSON.parse(text)
    } catch {
        // 上游返回非 JSON（网关错误页等），走统一失败分支
    }
    // 成功响应是数组：[{ src, publicUrl }]；失败时可能是 { success: false, message }
    const item = Array.isArray(data) ? data[0] : (Array.isArray(data?.data) ? data.data[0] : null)
    let url = item?.publicUrl || item?.src || ''
    // publicUrl 依赖图床配置了默认 URL 前缀，未配置时 src 是相对路径，需补站点域名
    if (url.startsWith('/')) url = endpoint + url
    if (!res.ok || !url) {
        console.error('imgbed upload failed:', res.status, text.slice(0, 500))
        // 上游错误体可能是 text/plain（如 401 Unauthorized），此时拿不到 message，按状态码给出可操作的提示
        let msg = typeof data?.message === 'string' ? data.message : ''
        if (!msg) {
            if (res.status === 401 || res.status === 403) {
                msg = '图床认证失败，请检查 imgbed_token 是否正确'
            } else if (res.status === 413) {
                msg = '图片体积超过图床限制'
            } else {
                msg = `图片上传失败（图床返回 ${res.status}）`
            }
        }
        return c.json({ code: 500, msg })
    }

    return c.json({ code: 200, msg: '上传成功', data: { url } })
})
