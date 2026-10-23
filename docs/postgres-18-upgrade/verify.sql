select 'users' t, count(*) n, md5(coalesce(string_agg(x::text,'|' order by x::text),'')) h from users x
union all select 'notes', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from notes x
union all select 'invite_codes', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from invite_codes x
union all select 'sessions', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from sessions x
union all select 'auth_attempts', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from auth_attempts x
union all select 'alembic_version', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from alembic_version x
order by 1;
