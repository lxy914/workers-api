-- ============================================================
-- workers-api 数据库初始化 / 迁移脚本（幂等，可重复执行）
--
-- 用途：
--   1. 本地首次初始化：npx wrangler d1 execute workers-api --local --file=init.sql
--   2. 生产环境迁移建表：npx wrangler d1 execute workers-api --remote --file=init.sql
--
-- 说明：
--   - 建表使用 IF NOT EXISTS，种子数据使用 INSERT OR IGNORE，
--     重复执行不会删除或覆盖已有数据，生产环境可安全执行
--   - 如需本地重置数据库（清空全部数据），先手动执行：
--     drop table if exists t_login_fail;
--     drop table if exists t_post;
--     drop table if exists t_user;
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
  update_time integer,
  user_id integer
);

-- 种子文章（仅首次执行时插入）
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(1,'hello-world','这是我的第一篇博客！',1715157081033,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(2,'blog-更新日志-0501','后端数据库由KV替换成了D1(sql数据库)',1715158086368,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(3,'blog-更新日志-0504','后端服务由workers替换成pages。',1715158102400,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(4,'blog-更新日志-0508','数据库添加更新日期一列',1715158135148,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(5,'my-app-更新日志-0610','cdn.jsdelivr.net打不开了，更换了bootstrap的cdn链接',1718022407229,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(6,'hehe','哈哈哈，今天怕了崛围山',1731843181886,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(7,'最新消息','卧槽，可以访问了',1732263634252,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(8,'日常记录','你是魔鬼吧，这还能访问！！！',1758179685477,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(9,'日常记录','今天下午3点左右检查，是否有漏报的分红方式。',1758247018550,1);
INSERT OR IGNORE INTO t_post(id,title,body,update_time,user_id) VALUES(10,'呵呵','111',1758354167062,1);

-- 登录失败记录表：用于登录接口限流（防暴力破解）
create table if not exists t_login_fail (
  id integer primary key,
  ip text,
  fail_time integer
);
create index if not exists idx_login_fail_ip_time on t_login_fail(ip, fail_time);

-- ============================================================
-- 文章全文索引（FTS5）
--
-- 用途：/api/post?keyword= 搜索接口，支持标题+正文全文搜索
-- 说明：
--   - 使用 external content 表（content='t_post'），不冗余存储原文
--   - trigram 分词：按 3 字符子串切 token，支持中英文任意子串匹配
--     （1-2 字关键词由接口层 LIKE 兜底，trigram 无法匹配短词）
--   - 触发器自动同步增删改，已有数据通过 rebuild 回填
--   - 幂等：重复执行仅重建索引，不产生副作用
-- ============================================================
create virtual table if not exists t_post_fts using fts5(
  title, body,
  content='t_post',
  content_rowid='id',
  tokenize='trigram'
);

-- 新增文章时同步索引
create trigger if not exists t_post_fts_ai after insert on t_post begin
  insert into t_post_fts(rowid, title, body) values (new.id, new.title, new.body);
end;
-- 删除文章时同步索引
create trigger if not exists t_post_fts_ad after delete on t_post begin
  insert into t_post_fts(t_post_fts, rowid, title, body) values('delete', old.id, old.title, old.body);
end;
-- 更新文章时同步索引（先删旧索引再插新索引）
create trigger if not exists t_post_fts_au after update on t_post begin
  insert into t_post_fts(t_post_fts, rowid, title, body) values('delete', old.id, old.title, old.body);
  insert into t_post_fts(rowid, title, body) values (new.id, new.title, new.body);
end;

-- 回填已有数据（rebuild 清空并重建整个索引；不能在事务内执行，wrangler 逐条提交无影响）
insert into t_post_fts(t_post_fts) values('rebuild');
