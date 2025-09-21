import { Hono } from "hono";

export const post = new Hono<{ Bindings: CloudflareBindings }>();

post.get("/", async (c) => {
    const { results } = await c.env.DB.prepare("select * from t_post order by id desc").all()
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
    const count = await (await c.env.DB.exec(`insert into t_post (title, body, update_time) values ('${param.title}','${param.body}',${Date.now()})`)).count
    if (count != 1) {
        return c.json({ code: 500, msg: 'Can not create new post' })
    }
    return c.json({ code: 200, msg: "操作成功" })
})
post.put('/:id', async (c) => {
    const id = c.req.param('id')
    const param = await c.req.json()
    if (!param.title || !param.body) {
        return c.json({ code: 500, msg: 'title或body参数不能为空' })
    }
    await c.env.DB.exec(`update t_post set title = '${param.title}', body = '${param.body}',update_time = ${Date.now()} where id=${id}`)
    return c.json({ code: 200, msg: "操作成功" })
})