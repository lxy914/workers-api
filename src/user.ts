import { Hono } from "hono";
import { sign, verify } from 'hono/jwt'
import { createMiddleware } from 'hono/factory'
import { hashPassword, isHashedPassword, verifyPassword } from "./auth";

export const user = new Hono<{ Bindings: CloudflareBindings; Variables: { role: string; uid: number } }>();

export const jwt_verify = createMiddleware<{ Bindings: CloudflareBindings; Variables: { role: string; uid: number } }>(async (c, next) => {
  const token = c.req.header('token')
  if (token == undefined) {
    return c.json({ code: 500, msg: '未登录' })
  }
  try {
    const payload = await verify(token, c.env.jwt_secret)
    c.set("role", payload.role as string)
    c.set("uid", payload.uid as number)
    await next()
  } catch (error) {
    return c.json({ code: 500, 'msg': 'token已过期,请重新登陆' })
  }
})

user.get("/me", async (c) => {
  const uid = c.get('uid')
  const results = await c.env.DB.prepare("select id, username, role, last_time from t_user where id=?").bind(uid).first()
  if (results == null) {
    return c.json({ code: 500, msg: "用户不存在" })
  }
  return c.json({ code: 200, msg: "操作成功", data: results })
});

user.post("/login", async (c) => {
  const body = await c.req.json();
  const username = body.username;
  const password = body.password;
  if (!username || !password) {
    return c.json({ code: 500, msg: "用户名或密码不能为空" })
  }

  const results = await c.env.DB.prepare("select * from t_user where username=?").bind(username).first()
  if (results == null) {
    return c.json({ code: 500, msg: "用户名或密码错误" })
  }

  const storedPassword = results.password as string;
  let passwordOk: boolean;
  if (isHashedPassword(storedPassword)) {
    passwordOk = await verifyPassword(password, storedPassword)
  } else {
    // 兼容旧明文数据：匹配后自动升级为哈希存储
    passwordOk = storedPassword === password
    if (passwordOk) {
      const hashed = await hashPassword(password)
      await c.env.DB.prepare("update t_user set password=? where id=?").bind(hashed, results.id).run()
    }
  }
  if (!passwordOk) {
    return c.json({ code: 500, msg: "用户名或密码错误" })
  }

  await c.env.DB.prepare("update t_user set last_time=? where id=?").bind(Date.now(), results.id).run()
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // Token过期时间是一周
    role: results.role,
    uid: results.id
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
  const existing = await c.env.DB.prepare("select id from t_user where username=?").bind(username).first()
  if (existing) {
    return c.json({ code: 500, msg: "用户名已存在" })
  }
  const hashedPassword = await hashPassword(password)
  await c.env.DB.prepare("insert into t_user(username,password,role) values (?,?,?)").bind(username, hashedPassword, 'user').run()
  return c.json({ code: 200, msg: "注册成功" })

});
