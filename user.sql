drop table if exists t_user;
create table t_user (
  id integer primary key,
  username text unique,
  password text,
  role text,
  last_time integer
);
insert into t_user values(1,'admin','qwertyuiop','admin',0);