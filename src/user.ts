import { Hono } from "hono";
import { decode, sign, verify } from 'hono/jwt'
import { createMiddleware } from 'hono/factory'

export const user = new Hono<{ Bindings: CloudflareBindings }>();

export const jwt_verify = createMiddleware(async (c, next) => {
  const token = c.req.header('token')
  if (token == undefined) {
    return c.json({ code: 500, msg: '未登录' })
  }
  try {
    const payload = await verify(token, c.env.jwt_secret)
    c.set("role", payload.role)
    await next()
  } catch (error) {
    return c.json({ code: 500, 'msg': 'token已过期,请重新登陆' })
  }
})

user.post("/login", async (c) => {
  const body = await c.req.json();
  const username = body.username;
  const password = body.password;
  if (!username || !password) {
    return c.json({ code: 500, msg: "用户名或密码不能为空" })
  }

  const results = await c.env.DB.prepare("select * from t_user where username=?").bind(username).first()
  if (results == null || results.password != password) {
    return c.json({ code: 500, msg: "用户名或密码错误" })
  }
  await c.env.DB.prepare("update t_user set last_time=? where id=?").bind(Date.now(), results.id).run()
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // Token过期时间是一周
    role: results.role
  }
  const token = await sign(payload, c.env.jwt_secret)

  return c.json({ code: 200, msg: "登录成功", token, last_time: results.last_time });
});

user.post("/register", async (c) => {
  const body = await c.req.json();
  const username = body.username;
  const password = body.password;
  if (!username || !password) {
    return c.json({ code: 500, msg: "用户名或密码不能为空！" })
  }
  if (c.env.open_register == 0) {
    return c.json({ code: 500, msg: "注册功能未开启" })
  }
  try {
    await c.env.DB.exec(`insert into t_user(username,password,role) values ('${username}','${password}','user')`)
  } catch (e) {
    return c.json({ code: 500, msg: "用户名已存在" })
  }
  return c.json({ code: 200, msg: "注册成功" })

});