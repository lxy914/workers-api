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
    // 校验载荷结构，避免缺失字段导致后续异常
    if (typeof payload.uid !== 'number' || typeof payload.role !== 'string') {
      return c.json({ code: 500, msg: 'token无效,请重新登陆' })
    }
    c.set("role", payload.role)
    c.set("uid", payload.uid)

    // 校验用户是否存在：已删除用户的旧 token 直接拒绝
    const user = await c.env.DB.prepare("select last_time from t_user where id=?").bind(payload.uid).first()
    if (!user) {
      return c.json({ code: 500, msg: 'token已过期,请重新登陆' })
    }
    // 自动续期：如果用户30天内有登录行为，签发新token
    const lastTime = user.last_time as number
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    if (lastTime > 0 && Date.now() - lastTime < thirtyDays) {
      const newPayload = {
        exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 30,
        role: payload.role,
        uid: payload.uid
      }
      const newToken = await sign(newPayload, c.env.jwt_secret)
      c.header('x-new-token', newToken)
    }

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

  // 登录失败限流：同一 IP 15 分钟内失败 10 次则拒绝（防暴力破解）
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  const windowStart = Date.now() - 15 * 60 * 1000
  const failCount = await c.env.DB.prepare("select count(*) as cnt from t_login_fail where ip=? and fail_time>?").bind(ip, windowStart).first<{ cnt: number }>()
  if ((failCount?.cnt ?? 0) >= 10) {
    return c.json({ code: 500, msg: "登录失败次数过多，请15分钟后再试" })
  }

  const results = await c.env.DB.prepare("select * from t_user where username=?").bind(username).first()
  if (results == null) {
    await c.env.DB.prepare("insert into t_login_fail(ip, fail_time) values (?,?)").bind(ip, Date.now()).run()
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
    await c.env.DB.prepare("insert into t_login_fail(ip, fail_time) values (?,?)").bind(ip, Date.now()).run()
    return c.json({ code: 500, msg: "用户名或密码错误" })
  }

  // 登录成功：清除该 IP 的失败记录
  await c.env.DB.prepare("delete from t_login_fail where ip=?").bind(ip).run()
  await c.env.DB.prepare("update t_user set last_time=? where id=?").bind(Date.now(), results.id).run()
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 30, // Token过期时间是30天
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
  // 仅当显式配置 open_register=1 时才开放注册，未配置默认关闭
  if (String(c.env.open_register) !== '1') {
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
