import { Hono } from "hono";
import { except } from "hono/combine";

export const post = new Hono<{ Bindings: CloudflareBindings }>();

post.get("/", async (c) => {
    const { results } = await c.env.DB.prepare("select * from t_post order by id desc").all()
    return c.json({ code: 200, msg: "操作成功", data: results })
})
post.get('/search', async (c) => {
    const keyword = c.req.query('keyword') || ''
    const { results } = await c.env.DB.prepare("select * from t_post where title like ? order by id desc").bind('%' + keyword + '%').all()
    return c.json({ code: 200, msg: "操作成功", data: results })
})
post.get('/:id', async (c) => {
    const id = c.req.param('id')
    const post = await c.env.DB.prepare("select * from t_post where id=?").bind(id).first()
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
        await c.env.DB.prepare(`insert into t_post (title, body, update_time) values (?,?,?)`).bind(param.title,param.body,Date.now()).run()
        return c.json({ code: 200, msg: "操作成功" })
    }catch(e){
        return c.json({ code: 500, msg: e })
    }
    
})
post.put('/:id', async (c) => {
    const id = c.req.param('id')
    const param = await c.req.json()
    if (!param.title || !param.body) {
        return c.json({ code: 500, msg: 'title或body参数不能为空' })
    }
    await c.env.DB.prepare(`update t_post set title = ?,body = ? where id = ?`).bind(param.title,param.body,id).run()
    return c.json({ code: 200, msg: "操作成功" })
})