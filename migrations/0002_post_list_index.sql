-- 0002_post_list_index.sql
-- 列表分页优化：按用户 + 更新时间覆盖过滤与排序
--（列表查询：where user_id = ? order by update_time desc limit ? offset ?）

create index if not exists idx_post_user_update on t_post(user_id, update_time);
