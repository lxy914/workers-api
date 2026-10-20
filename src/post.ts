import { Hono } from "hono";
import { createMiddleware } from 'hono/factory'

type Variables = { role: string; uid: number }

export const post = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

// 列表查询字段：正文只返回摘要（列表预览单行展示）；全文由详情接口 GET /:id 返回
const list_columns = "p.id, p.title, substr(p.body, 1, 120) as excerpt, p.create_time, p.update_time, p.user_id, u.username as author"

const owner_or_admin = createMiddleware<{ Bindings: CloudflareBindings; Variables: Variables }>(async (c, next) => {
  const id = c.req.param('id')
  const target = await c.env.DB.prepare("select user_id from t_post where id=?").bind(id).first()
  if (!target) {
    return c.json({ code: 500, msg: "文章不存在" })
  }
  const isOwner = target.user_id === c.get('uid')
  const isAdmin = c.get('role') === 'admin'
  if (!isOwner && !isAdmin) {
    return c.json({ code: 403, msg: "无权限操作该文章" })
  }
  await next()
})

post.get("/", async (c) => {
    const keyword = (c.req.query('keyword') || '').trim()
    const uid = c.get('uid')
    // 分页参数：page 从 1 开始，page_size 默认 20、上限 50
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('page_size') || '20', 10) || 20))
    const offset = (page - 1) * pageSize
    let statement, params: (string | number)[]
    if (keyword) {
        if ([...keyword].length >= 3) {
            // FTS5 trigram 全文搜索：整体包成短语查询保持子串语义，内嵌双引号转义防止 MATCH 语法报错
            const phrase = '"' + keyword.replace(/"/g, '""') + '"'
            statement = `select ${list_columns} from t_post_fts f join t_post p on p.id = f.rowid left join t_user u on p.user_id = u.id where t_post_fts match ? and p.user_id = ? order by bm25(t_post_fts) limit ? offset ?`
            params = [phrase, uid, pageSize + 1, offset]
        } else {
            // 1-2 字关键词 trigram 无法匹配（token 至少 3 字符），LIKE 兜底保持子串语义
            const like = "%" + keyword + "%"
            statement = `select ${list_columns} from t_post p left join t_user u on p.user_id = u.id where (p.title like ? or p.body like ?) and p.user_id = ? order by p.update_time desc limit ? offset ?`
            params = [like, like, uid, pageSize + 1, offset]
        }
    } else {
        statement = `select ${list_columns} from t_post p left join t_user u on p.user_id = u.id where p.user_id = ? order by p.update_time desc limit ? offset ?`
        params = [uid, pageSize + 1, offset]
    }
    const { results } = await c.env.DB.prepare(statement).bind(...params).all()
    // 多取一条判断是否还有下一页，避免额外的 count 查询
    const hasMore = results.length > pageSize
    return c.json({ code: 200, msg: "操作成功", data: hasMore ? results.slice(0, pageSize) : results, has_more: hasMore })
})
post.get('/:id', async (c) => {
    const id = c.req.param('id')
    // 只能查看自己的文章：查询直接按 user_id 过滤，非本人返回"文章不存在"（不暴露存在性）
    const post = await c.env.DB.prepare(
        "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id where p.id=? and p.user_id=?"
    ).bind(id, c.get('uid')).first()
    if (!post) {
        return c.json({ code: 500, msg: "文章不存在" })
    }
    return c.json({ code: 200, msg: "操作成功", data: post })
})
post.post('/', async (c) => {
    const param = await c.req.json()
    if (!param.title || !param.body) {
        return c.json({ code: 500, msg: 'title或body参数不能为空' })
    }
    try{
        const now = Date.now()
        // 文章与全文索引在同一事务内写入（batch）；索引维护方式见 migrations/0001_init.sql 说明
        const results = await c.env.DB.batch([
            c.env.DB.prepare(`insert into t_post (title, body, create_time, update_time, user_id) values (?,?,?,?,?)`).bind(param.title,param.body,now,now,c.get('uid')),
            c.env.DB.prepare(`insert into t_post_fts (rowid, title, body) values (last_insert_rowid(),?,?)`).bind(param.title,param.body),
        ])
        // 返回新 id：前端据此定位新笔记，无需重新拉列表
        return c.json({ code: 200, msg: "操作成功", data: { id: results[0].meta.last_row_id, create_time: now, update_time: now } })
    }catch(e){
        console.error('insert post error:', e)
        return c.json({ code: 500, msg: "操作失败，请稍后重试" })
    }
    
})
post.put('/:id', owner_or_admin, async (c) => {
    const id = c.req.param('id')
    const param = await c.req.json()
    if (!param.title || !param.body) {
        return c.json({ code: 500, msg: 'title或body参数不能为空' })
    }
    // 正文与索引在同一事务内更新；contentless-delete 表 UPDATE 必须覆盖全部列
    const results = await c.env.DB.batch([
        c.env.DB.prepare(`update t_post set title = ?,body = ?,update_time = ? where id = ?`).bind(param.title,param.body,Date.now(),id),
        c.env.DB.prepare(`update t_post_fts set title = ?, body = ? where rowid = ?`).bind(param.title,param.body,id),
    ])
    if (results[0].meta.changes === 0) {
        return c.json({ code: 500, msg: "文章不存在" })
    }
    return c.json({ code: 200, msg: "操作成功" })
})
post.delete('/:id', owner_or_admin, async (c) => {
    const id = c.req.param('id')
    const results = await c.env.DB.batch([
        c.env.DB.prepare(`delete from t_post where id = ?`).bind(id),
        c.env.DB.prepare(`delete from t_post_fts where rowid = ?`).bind(id),
    ])
    if (results[0].meta.changes === 0) {
        return c.json({ code: 500, msg: "文章不存在" })
    }
    return c.json({ code: 200, msg: "操作成功" })
})
