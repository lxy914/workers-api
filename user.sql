DROP TABLE t_user;
create table t_user (
  id integer primary key,
  username text unique,
  password text,
  role text,
  last_time integer
);
INSERT INTO t_user VALUES(1,'admin','qwertyuiop','admin',0);