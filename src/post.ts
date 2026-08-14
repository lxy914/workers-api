import { Hono } from "hono";
import { createMiddleware } from 'hono/factory'

type Variables = { role: string; uid: number }

export const post = new Hono<{ Bindings: CloudflareBindings; Variables: Variables }>();

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
    const keyword = c.req.query('keyword') || ''
    const isAdmin = c.get('role') === 'admin'
    let statement, params: (string | number)[]
    if (keyword) {
        statement = "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id where p.title like ? order by p.id desc"
        params = ["%" + keyword + "%"]
    } else {
        statement = "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id order by p.id desc"
        params = []
    }
    if (!isAdmin) {
        // 非管理员只能看到自己创建的文章
        if (keyword) {
            statement = "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id where p.title like ? and p.user_id = ? order by p.id desc"
            params = ["%" + keyword + "%", c.get('uid')]
        } else {
            statement = "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id where p.user_id = ? order by p.id desc"
            params = [c.get('uid')]
        }
    }
    const { results } = await c.env.DB.prepare(statement).bind(...params).all()
    return c.json({ code: 200, msg: "操作成功", data: results })
})
post.get('/:id', owner_or_admin, async (c) => {
    const id = c.req.param('id')
    const post = await c.env.DB.prepare(
        "select p.*, u.username as author from t_post p left join t_user u on p.user_id = u.id where p.id=?"
    ).bind(id).first()
    if (!post) {
        return c.json({ code: 500, msg: "Not Found" })
    }
    return c.json({ code: 200, msg: "操作成功", data: post })
})
post.post('/', async (c) => {
    const param = await c.req.json()
    if (!param.title || !param.body) {
        return c.json({ code: 500, msg: 'title或body参数不能为空' })
    }
    try{
        await c.env.DB.prepare(`insert into t_post (title, body, update_time, user_id) values (?,?,?,?)`).bind(param.title,param.body,Date.now(),c.get('uid')).run()
        return c.json({ code: 200, msg: "操作成功" })
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
    await c.env.DB.prepare(`update t_post set title = ?,body = ? where id = ?`).bind(param.title,param.body,id).run()
    return c.json({ code: 200, msg: "操作成功" })
})
post.delete('/:id', owner_or_admin, async (c) => {
    const id = c.req.param('id')
    await c.env.DB.prepare(`delete from t_post where id = ?`).bind(id).run()
    return c.json({ code: 200, msg: "操作成功" })
})
