import { Hono } from "hono";
import { cors } from 'hono/cors'
import { user, jwt_verify } from "./user";
import { post } from "./post"
import { obj } from "./durable-object"
export { ChatRoom } from "./durable-object"



const app = new Hono();


app.use('/api/*', cors())
app.use("/api/post/*", jwt_verify)
app.use("/api/user/me", jwt_verify)

app.route("/api/user", user);
app.route("/api/post", post);
app.route("/durable", obj)

// 统一 404 / 500 错误返回 JSON 格式，避免前端解析失败
app.notFound((c) => c.json({ code: 404, msg: '接口不存在' }))
app.onError((err, c) => {
  console.error('unhandled error:', err)
  return c.json({ code: 500, msg: '服务器内部错误' })
})

export default app;
