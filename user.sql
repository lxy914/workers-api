drop table if exists t_user;
create table t_user (
  id integer primary key,
  username text unique,
  password text,
  role text,
  last_time integer
);
insert into t_user values(1,'admin','pbkdf2$100000$4ad94a57194b972844d3562d0e47a229$c4572e45a3930dcec94122d00c4bb4fd385e4484ebb50ce97f7bf3336b90be23','admin',0);