#!/usr/bin/env bash
# Logical upgrade of the notes DB from postgres:17 -> 18 (dump/restore into a NEW volume).
# Old volume is never modified, so rollback = start the old compose file again.
#   upgrade_pg17_to_18.sh <project> <env-file> <old-compose> <new-compose> <workdir>
set -euo pipefail
PROJECT=$1 ENVF=$2 OLD=$3 NEW=$4 WORK=$5
oldc() { docker compose -p "$PROJECT" --env-file "$ENVF" -f "$OLD" "$@"; }
newc() { docker compose -p "$PROJECT" --env-file "$ENVF" -f "$NEW" "$@"; }
PSQL='psql -v ON_ERROR_STOP=1 -U notes -d notes'
mkdir -p "$WORK"

echo "==> 1. Start OLD (17) db and take dump + pre-upgrade fingerprint"
oldc up -d --wait db
oldc exec -T db sh -c 'pg_dump -U notes -d notes -Fc' > "$WORK/notes.dump"
oldc exec -T db sh -c 'pg_dump -U notes -d notes --schema-only' > "$WORK/schema17.sql"
oldc exec -T db $PSQL -f - < "$WORK/verify.sql" > "$WORK/before.txt"
test -s "$WORK/notes.dump"
docker run --rm -i postgres:17-alpine pg_restore -l < "$WORK/notes.dump" > "$WORK/dump.toc"   # proves dump is readable
echo "dump: $(wc -c < "$WORK/notes.dump") bytes, $(grep -c . "$WORK/dump.toc") TOC lines"

echo "==> 2. Stop OLD db (volume kept)"
oldc stop db
oldc rm -f db >/dev/null

echo "==> 3. Start NEW (18) db on a fresh volume and restore"
newc up -d --wait db
newc exec -T db pg_restore -U notes -d notes --no-owner --single-transaction --exit-on-error < "$WORK/notes.dump"
newc exec -T db vacuumdb -U notes -d notes --analyze-only >/dev/null

echo "==> 4. Verify: row counts + content hashes, schema diff"
newc exec -T db $PSQL -f - < "$WORK/verify.sql" > "$WORK/after.txt"
newc exec -T db sh -c 'pg_dump -U notes -d notes --schema-only' > "$WORK/schema18.sql"
diff "$WORK/before.txt" "$WORK/after.txt" || { echo "DATA MISMATCH - do not proceed; old volume is untouched" >&2; exit 1; }
echo "DATA MATCH: counts and content hashes identical"
diff <(grep -vE '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog)' "$WORK/schema17.sql") \
     <(grep -vE '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog)' "$WORK/schema18.sql") \
  || { echo "SCHEMA MISMATCH - do not proceed; old volume is untouched" >&2; exit 1; }
echo "SCHEMA MATCH"
newc exec -T db $PSQL -tAc "select version()"
