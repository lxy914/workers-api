-- ============================================================
-- 0001_init —— workers-api 数据库基线迁移
--
-- 说明：
--   - 本文件是接入 wrangler d1 migrations 时的基线（全幂等，可安全重跑）
--   - 本地应用：npm run db:local    生产应用：npm run db:remote
--   - 已应用的迁移文件不可修改（账本有记录不会重跑）；
--     后续结构变更请执行：npx wrangler d1 migrations create workers-api <变更名>
--   - ⚠️ 远程执行限制：D1 服务端按分号拆分多语句，触发器必需的
--     BEGIN...END 会被拆断报 incomplete input —— 迁移文件中禁止写触发器
-- ============================================================

-- 用户表
create table if not exists t_user (
  id integer primary key,
  username text unique,
  password text,
  role text,
  last_time integer
);
-- 默认管理员账号（密码为 pbkdf2 哈希，公开于仓库仅供开发；生产上线后请立即修改密码）
insert or ignore into t_user(id, username, password, role, last_time) values(1,'admin','pbkdf2$100000$4ad94a57194b972844d3562d0e47a229$c4572e45a3930dcec94122d00c4bb4fd385e4484ebb50ce97f7bf3336b90be23','admin',0);

-- 文章表
create table if not exists t_post (
  id integer primary key,
  title text,
  body text,
  create_time integer,
  update_time integer,
  user_id integer
);

-- 种子文章（仅首次执行时插入）
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(1,'hello-world','这是我的第一篇博客！',1715157081033,1715157081033,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(2,'blog-更新日志-0501','后端数据库由KV替换成了D1(sql数据库)',1715158086368,1715158086368,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(3,'blog-更新日志-0504','后端服务由workers替换成pages。',1715158102400,1715158102400,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(4,'blog-更新日志-0508','数据库添加更新日期一列',1715158135148,1715158135148,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(5,'my-app-更新日志-0610','cdn.jsdelivr.net打不开了，更换了bootstrap的cdn链接',1718022407229,1718022407229,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(6,'hehe','哈哈哈，今天怕了崛围山',1731843181886,1731843181886,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(7,'最新消息','卧槽，可以访问了',1732263634252,1732263634252,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(8,'日常记录','你是魔鬼吧，这还能访问！！！',1758179685477,1758179685477,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(9,'日常记录','今天下午3点左右检查，是否有漏报的分红方式。',1758247018550,1758247018550,1);
INSERT OR IGNORE INTO t_post(id,title,body,create_time,update_time,user_id) VALUES(10,'呵呵','111',1758354167062,1758354167062,1);

-- 登录失败记录表：用于登录接口限流（防暴力破解）
create table if not exists t_login_fail (
  id integer primary key,
  ip text,
  fail_time integer
);
create index if not exists idx_login_fail_ip_time on t_login_fail(ip, fail_time);

-- ============================================================
-- 文章全文索引（FTS5，contentless-delete 模式，应用层维护）
--
-- 用途：/api/post?keyword= 搜索接口，支持标题+正文全文搜索
-- 说明：
--   - content='' + contentless_delete=1：索引不存原文（正文由 t_post join
--     获取），支持单语句 INSERT / UPDATE / DELETE 直接维护索引
--   - ⚠️ 索引由应用层维护：src/post.ts 的增删改接口用 D1 batch 与正文同事务
--     更新索引。不使用数据库触发器 —— D1 远程按分号拆分多语句，触发器必需
--     的 BEGIN...END 会被拆断（incomplete input），无法经由迁移执行；
--     而应用层维护 + contentless-delete 恰好全部是单语句，可正常迁移
--   - trigram 分词：按 3 字符子串切 token，支持中英文任意子串匹配
--     （1-2 字关键词由接口层 LIKE 兜底，trigram 无法匹配短词）
--   - 幂等：先删旧触发器与旧表再重建（兼容 external content 旧模式），
--     回填全量数据；搜索查询按 rowid join t_post、bm25 排序不受影响
-- ============================================================
drop trigger if exists t_post_fts_ai;
drop trigger if exists t_post_fts_ad;
drop trigger if exists t_post_fts_au;
drop table if exists t_post_fts;

create virtual table if not exists t_post_fts using fts5(
  title, body,
  content='',
  contentless_delete=1,
  tokenize='trigram'
);

-- 回填已有数据（空库插入 0 行，存量库全量重建索引）
insert into t_post_fts(rowid, title, body) select id, title, body from t_post;
