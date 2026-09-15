\set ON_ERROR_STOP on
\getenv backup_user BACKUP_POSTGRES_USER
\getenv backup_password BACKUP_POSTGRES_PASSWORD

SELECT (
  :'backup_user' ~ '^[a-z_][a-z0-9_]{0,62}$'
  AND :'backup_user' <> current_user
  AND length(:'backup_password') >= 32
) AS backup_inputs_safe
\gset

\if :backup_inputs_safe
\else
  \echo 'Backup role inputs are invalid' stderr
  SELECT 1 / 0;
\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_roles AS role
  WHERE role.rolname = :'backup_user'
    AND (
      role.rolsuper
      OR role.rolcreatedb
      OR role.rolcreaterole
      OR role.rolreplication
      OR role.rolbypassrls
      OR role.oid = (SELECT datdba FROM pg_database WHERE datname = current_database())
      OR EXISTS (
        SELECT 1
        FROM pg_auth_members AS membership
        JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
        WHERE membership.member = role.oid
          AND granted_role.rolname <> 'pg_read_all_data'
      )
    )
) AS existing_role_safe
\gset

\if :existing_role_safe
\else
  \echo 'Existing backup role has unsafe ownership, attributes or memberships' stderr
  SELECT 1 / 0;
\endif

SELECT format('CREATE ROLE %I LOGIN', :'backup_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'backup_user')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'backup_user',
  :'backup_password'
)
\gexec

SELECT format('GRANT pg_read_all_data TO %I', :'backup_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'backup_user')
\gexec

SELECT (
  role.rolcanlogin
  AND NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND pg_has_role(role.oid, 'pg_read_all_data', 'MEMBER')
  AND NOT pg_has_role(role.oid, 'pg_write_all_data', 'MEMBER')
  AND role.oid <> (SELECT datdba FROM pg_database WHERE datname = current_database())
) AS provisioned_role_safe
FROM pg_roles AS role
WHERE role.rolname = :'backup_user'
\gset

\if :provisioned_role_safe
  \echo 'Backup role provisioned safely'
\else
  \echo 'Provisioned backup role failed the safety check' stderr
  SELECT 1 / 0;
\endif
