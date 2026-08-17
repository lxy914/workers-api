drop table if exists t_user;
create table t_user (
  id integer primary key,
  username text unique,
  password text,
  role text,
  last_time integer
);
insert into t_user values(1,'admin','pbkdf2$100000$4ad94a57194b972844d3562d0e47a229$c4572e45a3930dcec94122d00c4bb4fd385e4484ebb50ce97f7bf3336b90be23','admin',0);

drop table if exists t_post;
create table if not exists t_post (
  id integer primary key,
  title text,
  body text,
  update_time integer,
  user_id integer
);

INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(1,'hello-world','这是我的第一篇博客！',1715157081033,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(2,'blog-更新日志-0501','后端数据库由KV替换成了D1(sql数据库)',1715158086368,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(3,'blog-更新日志-0504','后端服务由workers替换成pages。',1715158102400,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(4,'blog-更新日志-0508','数据库添加更新日期一列',1715158135148,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(5,'my-app-更新日志-0610','cdn.jsdelivr.net打不开了，更换了bootstrap的cdn链接',1718022407229,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(6,'hehe','哈哈哈，今天怕了崛围山',1731843181886,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(7,'最新消息','卧槽，可以访问了',1732263634252,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(8,'日常记录','你是魔鬼吧，这还能访问！！！',1758179685477,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(9,'日常记录','今天下午3点左右检查，是否有漏报的分红方式。',1758247018550,1);
INSERT INTO t_post(id,title,body,update_time,user_id) VALUES(10,'呵呵','111',1758354167062,1);