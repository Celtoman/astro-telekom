#!/bin/sh

set -eu
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

BACKUP_PUT_URL=''
BACKUP_GET_URL=''
BACKUP_OBJECT_KEY=''
SOURCE_SHA=''
DEPLOYMENT_SHA='unknown'
REHEARSE='false'
arguments_supplied='false'

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup-put-url) arguments_supplied='true'; BACKUP_PUT_URL=$2; shift 2 ;;
    --backup-get-url) arguments_supplied='true'; BACKUP_GET_URL=$2; shift 2 ;;
    --object-key) arguments_supplied='true'; BACKUP_OBJECT_KEY=$2; shift 2 ;;
    --source-sha) arguments_supplied='true'; SOURCE_SHA=$2; shift 2 ;;
    --deployment-sha) arguments_supplied='true'; DEPLOYMENT_SHA=$2; shift 2 ;;
    --rehearse) arguments_supplied='true'; REHEARSE='true'; shift ;;
    *) fail 'UNKNOWN_ARGUMENT' ;;
  esac
done

lock_file='/tmp/astro-postgres-backup.lock'
exec 9>"$lock_file"
flock -n 9 || fail 'BACKUP_ALREADY_RUNNING'
work_dir=''
cluster_dir=''
socket_dir=''
cluster_started='false'
snapshot_exporter_pid=''
snapshot_release=''

cleanup() {
  if [ -n "$snapshot_exporter_pid" ]; then
    touch "$snapshot_release"
    kill "$snapshot_exporter_pid" >/dev/null 2>&1 || true
    wait "$snapshot_exporter_pid" >/dev/null 2>&1 || true
  fi
  if [ "$cluster_started" = 'true' ]; then
    gosu postgres pg_ctl -D "$cluster_dir" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [ -n "$work_dir" ]; then
    rm -rf "$work_dir"
  fi
}
trap cleanup EXIT HUP INT TERM

work_dir=$(mktemp -d /tmp/astro-postgres-backup.XXXXXX)
cluster_dir="$work_dir/restore-cluster"
socket_dir="$work_dir/restore-socket"
snapshot_release="$work_dir/snapshot.release"

if [ -n "${BACKUP_CONFIG_URL:-}" ]; then
  [ "$arguments_supplied" = 'false' ] || fail 'TASK_CONFIGURATION_AMBIGUOUS'
  task_configuration="$work_dir/task.conf"
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --output "$task_configuration" \
    "$BACKUP_CONFIG_URL" >/dev/null 2>&1 || fail 'TASK_CONFIGURATION_DOWNLOAD_FAILED'
  seen_backup_put='false'
  seen_backup_get='false'
  seen_backup_object='false'
  seen_source_sha='false'
  seen_deployment_sha='false'
  seen_rehearse='false'
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      BACKUP_PUT_URL=*) [ "$seen_backup_put" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_backup_put='true'; BACKUP_PUT_URL=${line#*=} ;;
      BACKUP_GET_URL=*) [ "$seen_backup_get" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_backup_get='true'; BACKUP_GET_URL=${line#*=} ;;
      BACKUP_OBJECT_KEY=*) [ "$seen_backup_object" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_backup_object='true'; BACKUP_OBJECT_KEY=${line#*=} ;;
      SOURCE_SHA=*) [ "$seen_source_sha" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_source_sha='true'; SOURCE_SHA=${line#*=} ;;
      DEPLOYMENT_SHA=*) [ "$seen_deployment_sha" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_deployment_sha='true'; DEPLOYMENT_SHA=${line#*=} ;;
      REHEARSE=*) [ "$seen_rehearse" = 'false' ] || fail 'TASK_CONFIGURATION_DUPLICATE'; seen_rehearse='true'; REHEARSE=${line#*=} ;;
      *) fail 'TASK_CONFIGURATION_INVALID' ;;
    esac
  done < "$task_configuration"
fi

[ -n "$BACKUP_PUT_URL" ] || fail 'BACKUP_PUT_URL_MISSING'
[ -n "$BACKUP_GET_URL" ] || fail 'BACKUP_GET_URL_MISSING'
[ -n "$BACKUP_OBJECT_KEY" ] || fail 'BACKUP_OBJECT_KEY_MISSING'
printf '%s' "$SOURCE_SHA" | grep -Eq '^[0-9a-fA-F]{40}$' || fail 'SOURCE_SHA_INVALID'
printf '%s' "$DEPLOYMENT_SHA" | grep -Eq '^[0-9a-fA-F]{40}$' || fail 'DEPLOYMENT_SHA_INVALID'
case "$REHEARSE" in true|false) ;; *) fail 'REHEARSE_INVALID' ;; esac
[ -n "${POSTGRES_DB:-}" ] || fail 'POSTGRES_DB_MISSING'
[ -n "${POSTGRES_USER:-}" ] || fail 'POSTGRES_USER_MISSING'
[ -n "${PGPASSWORD:-}" ] || fail 'PGPASSWORD_MISSING'

download() {
  destination=$1
  url=$2
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --output "$destination" "$url" >/dev/null 2>&1 \
    || fail 'S3_DOWNLOAD_FAILED'
}

audit_value() {
  name=$1
  file=$2
  awk -F, -v expected="$name" 'NR > 1 && $1 == expected { print $2; exit }' "$file"
}

require_integer() {
  value=$1
  label=$2
  printf '%s' "$value" | grep -Eq '^[0-9]+$' || fail "${label}_INVALID"
}

audit_sql='/opt/astro-backup/release-one-database-audit.sql'
recipient_certificate='/opt/astro-backup/recipient-certificate.pem'
source_dump="$work_dir/source.dump"
encrypted_dump="$work_dir/backup.dump.cms"
roundtrip_dump="$work_dir/roundtrip.dump.cms"
restored_dump="$work_dir/restored.dump"
pre_audit="$work_dir/pre-audit.csv"
restore_audit="$work_dir/restore-audit.csv"
snapshot_file="$work_dir/snapshot.id"
snapshot_sql="$work_dir/export-snapshot.sql"

[ -r "$audit_sql" ] || fail 'AUDIT_SCRIPT_MISSING'
[ -r "$recipient_certificate" ] || fail 'RECIPIENT_CERTIFICATE_MISSING'
grep -q 'BEGIN TRANSACTION READ ONLY' "$audit_sql" || fail 'AUDIT_SCRIPT_INVALID'
grep -q "'relation_integrity_violations'" "$audit_sql" || fail 'AUDIT_SCRIPT_INVALID'
openssl x509 -in "$recipient_certificate" -noout >/dev/null 2>&1 || fail 'RECIPIENT_CERTIFICATE_INVALID'

postgres_client_version=$(pg_dump --version | awk '{ print $NF }')
case "$postgres_client_version" in
  18.*) ;;
  *) fail 'POSTGRES_MAJOR_NOT_18' ;;
esac
postgres_server_version_num=$(psql --no-psqlrc --tuples-only --no-align \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command 'SHOW server_version_num' 2>/dev/null) \
  || fail 'POSTGRES_SERVER_VERSION_READ_FAILED'
postgres_server_version=$(psql --no-psqlrc --tuples-only --no-align \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command 'SHOW server_version' 2>/dev/null) \
  || fail 'POSTGRES_SERVER_VERSION_READ_FAILED'
require_integer "$postgres_server_version_num" 'POSTGRES_SERVER_VERSION_NUM'
[ "$postgres_server_version_num" -ge 180000 ] && [ "$postgres_server_version_num" -lt 190000 ] \
  || fail 'POSTGRES_SERVER_MAJOR_NOT_18'

backup_role_safe=$(psql --no-psqlrc --tuples-only --no-align \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command "
WITH backup_identity AS (
  SELECT * FROM pg_roles WHERE rolname = current_user
), current_database_owner AS (
  SELECT datdba FROM pg_database WHERE datname = current_database()
)
SELECT (
  EXISTS (
    SELECT 1 FROM backup_identity
    WHERE rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  )
  AND pg_has_role(current_user, 'pg_read_all_data', 'MEMBER')
  AND NOT pg_has_role(current_user, 'pg_write_all_data', 'MEMBER')
  AND NOT pg_has_role(current_user, (SELECT datdba FROM current_database_owner), 'MEMBER')
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles AS inherited_role
    WHERE inherited_role.rolname <> current_user
      AND pg_has_role(current_user, inherited_role.oid, 'MEMBER')
      AND (
        inherited_role.rolsuper OR inherited_role.rolcreatedb OR inherited_role.rolcreaterole
        OR inherited_role.rolreplication OR inherited_role.rolbypassrls
      )
  )
  AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
  AND NOT EXISTS (
    SELECT 1 FROM pg_namespace AS namespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND has_schema_privilege(current_user, namespace.oid, 'CREATE')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND has_table_privilege(
        current_user,
        relation.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS sequence
    JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname <> 'information_schema'
      AND namespace.nspname !~ '^pg_'
      AND sequence.relkind = 'S'
      AND has_sequence_privilege(current_user, sequence.oid, 'USAGE,UPDATE')
  )
)::text;") || fail 'BACKUP_ROLE_AUDIT_FAILED'
[ "$backup_role_safe" = 'true' ] || fail 'BACKUP_ROLE_NOT_READ_ONLY'

cat > "$snapshot_sql" <<EOF
\\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
\\pset tuples_only on
\\pset format unaligned
\\o $snapshot_file
SELECT pg_export_snapshot();
\\o
\\! while [ ! -f "$snapshot_release" ]; do sleep 1; done
ROLLBACK;
EOF

psql --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --file "$snapshot_sql" 9>&- >/dev/null 2>&1 &
snapshot_exporter_pid=$!
snapshot_wait=0
while [ ! -s "$snapshot_file" ] && kill -0 "$snapshot_exporter_pid" >/dev/null 2>&1; do
  snapshot_wait=$((snapshot_wait + 1))
  [ "$snapshot_wait" -le 100 ] || fail 'SNAPSHOT_EXPORT_TIMEOUT'
  sleep 0.1
done
[ -s "$snapshot_file" ] || fail 'SNAPSHOT_EXPORT_FAILED'
snapshot_id=$(tr -d '[:space:]' < "$snapshot_file")
printf '%s' "$snapshot_id" | grep -Eq '^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$' || fail 'SNAPSHOT_ID_INVALID'

psql --no-psqlrc --set ON_ERROR_STOP=1 --set snapshot_id="$snapshot_id" --csv \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --file "$audit_sql" \
  > "$pre_audit" 2>/dev/null || fail 'PRODUCTION_AUDIT_FAILED'

pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom \
  --snapshot="$snapshot_id" --compress=zstd:9 --no-owner --no-acl \
  --file "$source_dump" 2>/dev/null || fail 'PG_DUMP_FAILED'
touch "$snapshot_release"
wait "$snapshot_exporter_pid" || fail 'SNAPSHOT_EXPORTER_FAILED'
snapshot_exporter_pid=''
[ -s "$source_dump" ] || fail 'PG_DUMP_EMPTY'
pg_restore --list "$source_dump" >/dev/null 2>&1 || fail 'PG_DUMP_CATALOG_INVALID'

if [ "$REHEARSE" = 'true' ]; then
  rehearsal_key="$work_dir/rehearsal-key.pem"
  rehearsal_certificate="$work_dir/rehearsal-certificate.pem"
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 1 \
    -subj '/CN=astro-telekom-restore-rehearsal' \
    -keyout "$rehearsal_key" -out "$rehearsal_certificate" >/dev/null 2>&1 \
    || fail 'REHEARSAL_RECIPIENT_FAILED'
  openssl cms -encrypt -binary -aes-256-cbc -outform DER \
    -in "$source_dump" -out "$encrypted_dump" \
    "$recipient_certificate" "$rehearsal_certificate" >/dev/null 2>&1 \
    || fail 'BACKUP_ENCRYPTION_FAILED'
else
  openssl cms -encrypt -binary -aes-256-cbc -outform DER \
    -in "$source_dump" -out "$encrypted_dump" "$recipient_certificate" >/dev/null 2>&1 \
    || fail 'BACKUP_ENCRYPTION_FAILED'
fi

[ -s "$encrypted_dump" ] || fail 'ENCRYPTED_BACKUP_EMPTY'
backup_bytes=$(wc -c < "$encrypted_dump" | tr -d ' ')
backup_sha256=$(sha256sum "$encrypted_dump" | awk '{ print $1 }')
backup_plaintext_sha256=$(sha256sum "$source_dump" | awk '{ print $1 }')
require_integer "$backup_bytes" 'BACKUP_BYTES'
printf '%s' "$backup_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail 'BACKUP_SHA256_INVALID'
printf '%s' "$backup_plaintext_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail 'BACKUP_PLAINTEXT_SHA256_INVALID'

curl --fail --silent --proto '=https' --proto-redir '=https' \
  --upload-file "$encrypted_dump" "$BACKUP_PUT_URL" >/dev/null 2>&1 \
  || fail 'S3_UPLOAD_FAILED'
download "$roundtrip_dump" "$BACKUP_GET_URL"
roundtrip_bytes=$(wc -c < "$roundtrip_dump" | tr -d ' ')
roundtrip_sha256=$(sha256sum "$roundtrip_dump" | awk '{ print $1 }')
[ "$roundtrip_bytes" = "$backup_bytes" ] || fail 'S3_READBACK_SIZE_MISMATCH'
[ "$roundtrip_sha256" = "$backup_sha256" ] || fail 'S3_READBACK_CHECKSUM_MISMATCH'

migration_history="$work_dir/migration-history.canonical"
awk -F, '$1 == "applied_migrations" {
  name = $2
  gsub(/^"|"$/, "", name)
  printf "%s\tfinished\tactive\n", name
}' "$pre_audit" > "$migration_history"
migrations_applied=$(wc -l < "$migration_history" | tr -d ' ')
latest_migration=$(awk -F '\t' '{ latest = $1 } END { print latest }' "$migration_history")
migration_history_sha256=$(sha256sum "$migration_history" | awk '{ print $1 }')
migration_integrity_violations=$(audit_value 'migration_integrity_violations' "$pre_audit")
sites_total=$(audit_value 'sites_total' "$pre_audit")
cities_total=$(audit_value 'cities_total' "$pre_audit")
pages_total=$(audit_value 'pages_total' "$pre_audit")
page_blocks_total=$(audit_value 'page_blocks_total' "$pre_audit")
tariffs_total=$(audit_value 'tariffs_total' "$pre_audit")
leads_total=$(audit_value 'leads_total' "$pre_audit")
for pair in \
  "$migrations_applied MIGRATIONS_APPLIED" \
  "$migration_integrity_violations MIGRATION_INTEGRITY_VIOLATIONS" \
  "$sites_total SITES_TOTAL" \
  "$cities_total CITIES_TOTAL" \
  "$pages_total PAGES_TOTAL" \
  "$page_blocks_total PAGE_BLOCKS_TOTAL" \
  "$tariffs_total TARIFFS_TOTAL" \
  "$leads_total LEADS_TOTAL"
do
  require_integer ${pair}
done
[ -n "$latest_migration" ] || fail 'LATEST_MIGRATION_MISSING'
printf '%s' "$latest_migration" | grep -Eq '^[0-9A-Za-z_-]+$' || fail 'LATEST_MIGRATION_INVALID'
printf '%s' "$migration_history_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail 'MIGRATION_HISTORY_SHA256_INVALID'
[ "$migration_integrity_violations" -eq 0 ] || fail 'MIGRATION_INTEGRITY_VIOLATIONS_FOUND'

invalid_homes=$(audit_value 'invalid_published_city_home_templates' "$pre_audit")
city_collisions=$(audit_value 'city_global_slug_collisions' "$pre_audit")
redirect_collisions=$(audit_value 'redirect_source_route_collisions' "$pre_audit")
outside_targets=$(audit_value 'redirect_targets_outside_release_one' "$pre_audit")
relation_violations=$(audit_value 'relation_integrity_violations' "$pre_audit")
for pair in \
  "$invalid_homes INVALID_PUBLISHED_CITY_HOME_TEMPLATES" \
  "$city_collisions CITY_GLOBAL_SLUG_COLLISIONS" \
  "$redirect_collisions REDIRECT_SOURCE_ROUTE_COLLISIONS" \
  "$outside_targets REDIRECT_TARGETS_OUTSIDE_RELEASE_ONE" \
  "$relation_violations RELATION_INTEGRITY_VIOLATIONS"
do
  require_integer ${pair}
done
route_collisions=$((invalid_homes + city_collisions + redirect_collisions + outside_targets))
[ "$route_collisions" -eq 0 ] || fail 'ROUTE_COLLISIONS_FOUND'
[ "$relation_violations" -eq 0 ] || fail 'RELATION_INTEGRITY_VIOLATIONS_FOUND'

audit_match='not-run'
restore_status='skipped'
if [ "$REHEARSE" = 'true' ]; then
  openssl cms -decrypt -binary -inform DER -in "$roundtrip_dump" \
    -recip "$rehearsal_certificate" -inkey "$rehearsal_key" -out "$restored_dump" >/dev/null 2>&1 \
    || fail 'BACKUP_DECRYPTION_FAILED'
  [ "$(sha256sum "$restored_dump" | awk '{ print $1 }')" = "$backup_plaintext_sha256" ] \
    || fail 'DECRYPTED_DUMP_CHECKSUM_MISMATCH'
  pg_restore --list "$restored_dump" >/dev/null 2>&1 || fail 'RESTORED_DUMP_CATALOG_INVALID'

  unset PGHOST PGPASSWORD POSTGRES_USER POSTGRES_DB

  mkdir -p "$cluster_dir" "$socket_dir"
  chown -R postgres:postgres "$cluster_dir" "$socket_dir"
  chmod 711 "$work_dir"
  gosu postgres initdb --pgdata "$cluster_dir" --auth-local=trust --auth-host=reject \
    --no-locale --encoding=UTF8 >/dev/null 2>&1 || fail 'ISOLATED_INITDB_FAILED'
  restore_port=$((55000 + $$ % 1000))
  gosu postgres pg_ctl -D "$cluster_dir" \
    -o "-F -p $restore_port -k $socket_dir -h ''" -w start 9>&- >/dev/null 2>&1 \
    || fail 'ISOLATED_POSTGRES_START_FAILED'
  cluster_started='true'
  createuser --host "$socket_dir" --port "$restore_port" --username postgres \
    --no-superuser --no-createdb --no-createrole restore_owner 2>/dev/null \
    || fail 'ISOLATED_RESTORE_ROLE_CREATE_FAILED'
  createdb --host "$socket_dir" --port "$restore_port" --username postgres \
    --owner restore_owner --template template0 restore_rehearsal 2>/dev/null \
    || fail 'ISOLATED_DATABASE_CREATE_FAILED'
  pg_restore --exit-on-error --no-owner --no-acl --host "$socket_dir" --port "$restore_port" \
    --username restore_owner --dbname restore_rehearsal "$restored_dump" >/dev/null 2>&1 \
    || fail 'PG_RESTORE_FAILED'
  vacuumdb --analyze-in-stages --host "$socket_dir" --port "$restore_port" \
    --username restore_owner --dbname restore_rehearsal >/dev/null 2>&1 \
    || fail 'RESTORED_DATABASE_ANALYZE_FAILED'
  restore_server_version_num=$(psql --no-psqlrc --tuples-only --no-align --host "$socket_dir" \
    --port "$restore_port" --username restore_owner --dbname restore_rehearsal \
    --command 'SHOW server_version_num' 2>/dev/null) || fail 'RESTORE_SERVER_VERSION_READ_FAILED'
  restore_server_version=$(psql --no-psqlrc --tuples-only --no-align --host "$socket_dir" \
    --port "$restore_port" --username restore_owner --dbname restore_rehearsal \
    --command 'SHOW server_version' 2>/dev/null) || fail 'RESTORE_SERVER_VERSION_READ_FAILED'
  require_integer "$restore_server_version_num" 'RESTORE_SERVER_VERSION_NUM'
  [ "$restore_server_version_num" -ge 180000 ] && [ "$restore_server_version_num" -lt 190000 ] \
    || fail 'RESTORE_SERVER_MAJOR_NOT_18'
  psql --no-psqlrc --set ON_ERROR_STOP=1 --csv --host "$socket_dir" --port "$restore_port" \
    --username restore_owner --dbname restore_rehearsal --file "$audit_sql" > "$restore_audit" 2>/dev/null \
    || fail 'RESTORED_DATABASE_AUDIT_FAILED'
  cmp -s "$pre_audit" "$restore_audit" || fail 'RESTORED_DATABASE_AUDIT_MISMATCH'
  audit_match='true'
  restore_status='success'
fi

printf 'BACKUP_OBJECT=%s\n' "$BACKUP_OBJECT_KEY"
printf 'BACKUP_BYTES=%s\n' "$backup_bytes"
printf 'BACKUP_SHA256=%s\n' "$backup_sha256"
printf 'BACKUP_PLAINTEXT_SHA256=%s\n' "$backup_plaintext_sha256"
printf 'SOURCE_SHA=%s\n' "$SOURCE_SHA"
printf 'DEPLOYMENT_SHA=%s\n' "$DEPLOYMENT_SHA"
printf 'BACKUP_ROLE_SAFE=%s\n' "$backup_role_safe"
printf 'POSTGRES_VERSION=%s\n' "$postgres_server_version"
printf 'POSTGRES_CLIENT_VERSION=%s\n' "$postgres_client_version"
printf 'RESTORE_SERVER_VERSION=%s\n' "${restore_server_version:-not-run}"
printf 'MIGRATIONS_APPLIED=%s\n' "$migrations_applied"
printf 'MIGRATION_INTEGRITY_VIOLATIONS=%s\n' "$migration_integrity_violations"
printf 'LATEST_MIGRATION=%s\n' "$latest_migration"
printf 'MIGRATION_HISTORY_SHA256=%s\n' "$migration_history_sha256"
printf 'SITES_TOTAL=%s\n' "$sites_total"
printf 'CITIES_TOTAL=%s\n' "$cities_total"
printf 'PAGES_TOTAL=%s\n' "$pages_total"
printf 'PAGE_BLOCKS_TOTAL=%s\n' "$page_blocks_total"
printf 'TARIFFS_TOTAL=%s\n' "$tariffs_total"
printf 'LEADS_TOTAL=%s\n' "$leads_total"
printf 'ROUTE_COLLISIONS=%s\n' "$route_collisions"
printf 'RELATION_INTEGRITY_VIOLATIONS=%s\n' "$relation_violations"
printf 'AUDIT_MATCH=%s\n' "$audit_match"
printf 'S3_READBACK=true\n'
printf 'RESTORE_REHEARSAL=%s\n' "$restore_status"
