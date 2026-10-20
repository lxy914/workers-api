// 数据层：对接 workers-api 后端接口
// 用户 / 笔记数据存于服务端 D1，token 存 localStorage

const TOKEN_KEY = "note-app.token";

// ---- API 请求封装：自动携带 token、处理 x-new-token 自动续期 ----
export async function api(method, url, data) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers["token"] = token;
  if (data !== undefined) headers["Content-Type"] = "application/json";
  const options = { method, headers };
  if (data !== undefined) options.body = JSON.stringify(data);
  const response = await fetch(url, options);
  // 自动续期：检查响应头中的新 token 并更新
  const newToken = response.headers.get("x-new-token");
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
  }
  return response.json();
}

// ---- 主题偏好（本地） ----
export const theme = $.stanz({
  dark: localStorage.getItem("note-app.theme") === "dark",
});
theme.watchTick(() => {
  localStorage.setItem("note-app.theme", theme.dark ? "dark" : "light");
}, 50);

// ==================== 用户 ====================

export function isLoggedIn() {
  return !!localStorage.getItem(TOKEN_KEY);
}

export async function register(username, password) {
  const res = await api("POST", "/api/user/register", { username, password });
  if (res.code !== 200) return { ok: false, message: res.msg };
  return { ok: true };
}

export async function login(username, password) {
  const res = await api("POST", "/api/user/login", { username, password });
  if (res.code !== 200) return { ok: false, message: res.msg };
  localStorage.setItem(TOKEN_KEY, res.token);
  return { ok: true };
}

// 获取当前用户信息；token 无效时返回 null
export async function fetchMe() {
  const res = await api("GET", "/api/user/me");
  if (res.code !== 200) return null;
  return res.data;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

// ==================== 笔记 ====================

// 分页大小（与后端默认一致，上限 50）
const PAGE_SIZE = 20;

// 后端字段映射：t_post.title/body/update_time/create_time -> 前端 title/content/updateTime/createTime
// 列表接口只返回 excerpt 摘要，content 全文由详情接口返回
function mapPost(p) {
  return {
    id: p.id,
    title: p.title || "",
    excerpt: p.excerpt || "",
    content: p.body || "",
    author: p.author,
    createTime: p.create_time,
    updateTime: p.update_time,
  };
}

// 获取笔记列表（分页），keyword 搜索标题+正文；返回 { list, hasMore }
export async function getMyNotes(keyword = "", page = 1) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
  });
  if (keyword) params.set("keyword", keyword);
  const res = await api("GET", `/api/post?${params.toString()}`);
  if (res.code !== 200) throw new Error(res.msg || "加载笔记失败");
  return { list: res.data.map(mapPost), hasMore: !!res.has_more };
}

// 获取笔记详情（含正文全文）
export async function getNote(id) {
  const res = await api("GET", `/api/post/${id}`);
  if (res.code !== 200) throw new Error(res.msg || "加载笔记失败");
  return mapPost(res.data);
}

// 创建笔记；后端返回新 id，无需重新拉列表
export async function createNote(title = "", content = "") {
  const res = await api("POST", "/api/post", { title, body: content });
  if (res.code !== 200) throw new Error(res.msg || "创建笔记失败");
  const info = res.data || {};
  if (!info.id) throw new Error("创建笔记失败");
  return {
    id: info.id,
    title,
    content,
    excerpt: content.slice(0, 120),
    createTime: info.create_time,
    updateTime: info.update_time,
  };
}

export async function updateNote(id, patch) {
  const body = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.content !== undefined) body.body = patch.content;
  const res = await api("PUT", `/api/post/${id}`, body);
  if (res.code !== 200) throw new Error(res.msg || "保存笔记失败");
  return true;
}

export async function deleteNote(id) {
  const res = await api("DELETE", `/api/post/${id}`);
  if (res.code !== 200) throw new Error(res.msg || "删除笔记失败");
  return true;
}

export function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
