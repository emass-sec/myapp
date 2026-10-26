# Production Postgres 17 -> 18 runbook (EXECUTED against prod on 2026-10-23; see "Cutover results" below)

The steps below are the plan as written before the run. The commands were run as written except where the results
section notes a difference. Step 8 cleanup has NOT been done yet.

Prod facts (from deploy/docker-compose.prod.yml, deploy/deploy.sh, CLAUDE.md):
- Compose project `notes-app` (from `name:`), dir `/opt/notes-app`, env `/opt/notes-app/.env`
- DB container `notes-app-db-1`, volume `notes-app_pgdata` mounted at `/var/lib/postgresql/data` (PG17 layout)
- Access only via SSM. Every push to `main` touching deploy/** or backend/** runs deploy.sh (`compose up -d`).
- Deploys are serialized by the `production-deploy` concurrency group.

## 0. DO NOT merge #28 as-is
#28 only changes the image tag. deploy.sh does `compose up -d --wait db`, which recreates the DB container
on postgres:18 with the OLD mount at /var/lib/postgresql/data. The 18 entrypoint refuses to start
(exit 1, "there appears to be PostgreSQL data in /var/lib/postgresql/data"). Result: deploy fails under
`set -e` AND the db container is left crash-looping (restart: unless-stopped) = production outage.
Close/supersede #28 with a hand-written PR (below). Same for #27 locally.

## 1. Prepare the replacement PR (do not merge yet)
deploy/docker-compose.prod.yml, db service + volumes:
    image: postgres:18-alpine
    volumes:
      - pgdata18:/var/lib/postgresql        # NOTE: parent dir, new volume name
    ...
    volumes:
      pgdata18:
Also: docker-compose.yml (local), docs/architecture.md ("PostgreSQL 17" -> 18), docs/deployment.md note.
The old volume `notes-app_pgdata` is intentionally left defined nowhere; it stays on disk as the rollback copy.

## 2. Preflight (read-only) - via SSM session as root
Run steps 2-5 and 7 in ONE interactive Session Manager session (`aws ssm start-session --target <instance-id>`, then
`sudo -i`). Separate `send-command` calls do not share shell variables such as $OLD, $NEW and $TS.
    cd /opt/notes-app
    docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
    docker volume ls | grep notes-app
    docker compose version                                                         # expect v5.5.1 (rehearsal version)
    cat "$(docker volume inspect -f '{{.Mountpoint}}' notes-app_pgdata)/PG_VERSION"   # expect 17 (host read; the `alpine` image is not on the instance, so don't `docker run` it)
    df -h /var/lib/docker /opt/notes-app                                           # need >= 3x DB size free
    docker compose --env-file .env -f docker-compose.prod.yml exec -T db psql -U notes -d notes -tAc \
      "select pg_size_pretty(pg_database_size('notes'))"
    gh run list --workflow Deploy --limit 3     # (from your laptop) nothing in_progress / queued
    # PRE-PULL the new image BEFORE the window (it is not on the instance; pulling inside the window adds downtime and
    # depends on Docker Hub availability / anonymous rate limits). Pulling does not touch the running stack:
    docker pull postgres:18-alpine
MERGE FREEZE (facts checked 2026-10-23): auto-merge is OFF for the repo (`allow_auto_merge=false`), no workflow
auto-merges, and no open PR has it enabled, so Dependabot cannot merge anything by itself; it only opens/rebases PR
branches (weekly schedule). Merges to `main` are therefore only human-initiated. `main` is protected by ruleset
`protect-main` (PR required, 0 approvals, status checks `backend` + `frontend`, no bypass actors, no force-push).
Any push to `main` touching backend/** or deploy/** runs deploy.sh with the OLD compose file, which would `up -d` a
PG17 container on the old volume plus the backend against it = split-brain with the restored 18 data.
Enforce the freeze TECHNICALLY by disabling the Deploy workflow (reversible, also blocks manual workflow_dispatch):
    gh workflow disable Deploy            # at the START of step 3
    gh workflow list | grep Deploy        # must say: Deploy  disabled_manually
    # ... steps 3-5 ...
    gh workflow enable Deploy             # immediately BEFORE merging the replacement PR in step 6
Pushes made while it is disabled never trigger a run later, so also keep the human rule: nothing else is merged during
the window, otherwise unreviewed commits ride along with the cutover deploy. Tell anyone with merge rights.
PREFLIGHT RESULTS (read-only SSM command 3cd0f769-2d18-4888-8cdc-848f0de0d625, 2026-10-23 13:27 UTC, status Success;
re-run this step on the day, these are a snapshot in time):
- Host: Amazon Linux 2023, root `/dev/xvda1` is **xfs** (so step 3c needs `-o ro,nouuid`, as written). Docker 25.0.14,
  **Docker Compose v5.5.1 = the version used in the rehearsal**.
- Containers: backend (image = `main` HEAD 3893649), cloudflared 2026.10.0, db `postgres:17-alpine` (healthy); /health 200.
- Volume: only `notes-app_pgdata`; PG_VERSION = 17; 47 MiB on disk, DB 7.9 MB; `notes-app_pgdata18` does not exist (good).
- Disk: 20 GiB root, 5.7 GiB used, 15 GiB free (plenty for dumps + the 18 image). Memory 1.9 GiB total, ~1.3 GiB available, 2 GiB swap.
- `data_checksums` = off on the live 17 DB (18 enables it by default; harmless, dump/restore re-creates the cluster).
- Row counts now: users 6, notes 9, invite_codes 1, sessions 1, auth_attempts 0, alembic_version 1 (revision 0006).
- `/opt/notes-app` holds only .env, deploy.sh, docker-compose.prod.yml; no `backups/` yet (step 3a creates it).
- Images on the instance: postgres:17-alpine, cloudflared. **`postgres:18-alpine` and `alpine` are NOT present** -> pre-pull 18
  (above); don't use `alpine` in commands.
- GitHub: no Deploy runs in progress (last: 3893649, success); only open PR is draft #52.

Off-box backup method - RESOLVED (read-only AWS queries, 2026-10-23, nothing sent to the instance):
- The production instance (t2.small; ID in the `EC2_INSTANCE_ID` repo variable) runs under an instance profile. Look up its role with:
  `aws ec2 describe-instances --region us-east-2 --instance-ids "$(gh variable get EC2_INSTANCE_ID)" --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text`
- That role has only `AmazonSSMManagedInstanceCore` + `AmazonEC2ContainerRegistryReadOnly`, no inline policies, no
  permissions boundary. `iam simulate-principal-policy` for s3:PutObject / s3:GetObject / s3:ListBucket = implicitDeny.
  => the instance has NO S3 access today. The only bucket in the account is the CloudTrail log bucket (not for this).
- The instance has a single volume, `<volume-id>` (20 GiB gp3, unencrypted, root `/dev/xvda`). Docker volumes live
  under /var/lib/docker on it, so a snapshot of it captures the live PG17 volume AND /opt/notes-app/backups.
- No existing snapshots, no DLM lifecycle policy, no AWS Backup plan in us-east-2.
DECISION: use an EBS snapshot (step 3b). It needs no IAM change and is run from your admin SSO session, not the instance.
S3 would first require a new bucket plus a narrow instance-role policy (Appendix A); not worth it for a one-off.

## 3. MANDATORY backup (database live, backend still up)
### 3a. Logical dump on the instance (SSM session as root)
    cd /opt/notes-app; mkdir -p backups; chmod 700 backups
    TS=$(date -u +%Y%m%dT%H%M%SZ); echo "$TS" > backups/.ts      # if the session drops: TS=$(cat backups/.ts)
    docker compose --env-file .env -f docker-compose.prod.yml exec -T db pg_dump -U notes -d notes -Fc > backups/notes-$TS.dump
    docker compose --env-file .env -f docker-compose.prod.yml exec -T db pg_dumpall -U notes --globals-only > backups/globals-$TS.sql
    docker run --rm -i postgres:17-alpine pg_restore -l < backups/notes-$TS.dump | wc -l      # must be > 0
    sha256sum backups/notes-$TS.dump | tee backups/notes-$TS.dump.sha256
    ls -la backups/                                                                            # dump must be non-trivial in size
    sync                                                                                       # flush to disk before the snapshot

### 3b. Off-box copy = EBS snapshot (run from YOUR laptop, admin SSO session; `aws sso login` first if expired)
Take it AFTER 3a so the snapshot also contains backups/*.dump. It is crash-consistent (taken while Postgres is running);
Postgres recovers such a copy from WAL, and it is a second line of defence behind the verified logical dump.
    REGION=us-east-2; IID=$(gh variable get EC2_INSTANCE_ID)
    VOL=$(aws ec2 describe-instances --region $REGION --instance-ids "$IID" --query 'Reservations[0].Instances[0].BlockDeviceMappings[?DeviceName==`/dev/xvda`].Ebs.VolumeId | [0]' --output text)
    aws sts get-caller-identity --query Account --output text            # expect <account-id>
    SNAP=$(aws ec2 create-snapshot --region $REGION --volume-id $VOL \
      --description "notes-app pre-pg18 upgrade $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=notes-app-pre-pg18},{Key=Purpose,Value=pg17-to-18-rollback},{Key=DeleteAfter,Value=step-8-cleanup}]' \
      --query SnapshotId --output text)
    echo "$SNAP"                                                         # write this ID down
    # the waiter gives up after ~10 min; the first snapshot of 20 GiB can take longer, so loop:
    until aws ec2 wait snapshot-completed --region $REGION --snapshot-ids $SNAP 2>/dev/null; do
      aws ec2 describe-snapshots --region $REGION --snapshot-ids $SNAP --query 'Snapshots[0].[State,Progress]' --output text
    done
    aws ec2 describe-snapshots --region $REGION --snapshot-ids $SNAP \
      --query 'Snapshots[0].{State:State,Progress:Progress,GiB:VolumeSize,Volume:VolumeId,Started:StartTime}' --output table
GATE: do not continue until BOTH are true: (1) 3a `pg_restore -l` printed a count > 0 and the dump has a sha256 file,
(2) the snapshot State is `completed` (Progress 100%). Record the snapshot ID in the change log.

### 3c. Recovering a file from the snapshot (only if needed; do not attach it to the live instance's root)
    IID=$(gh variable get EC2_INSTANCE_ID)
    AZ=$(aws ec2 describe-instances --region $REGION --instance-ids "$IID" --query 'Reservations[0].Instances[0].Placement.AvailabilityZone' --output text)
    NEWVOL=$(aws ec2 create-volume --region $REGION --availability-zone $AZ --snapshot-id $SNAP --volume-type gp3 \
      --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=pg18-rollback-restore}]' --query VolumeId --output text)
    aws ec2 wait volume-available --region $REGION --volume-ids $NEWVOL
    aws ec2 attach-volume --region $REGION --volume-id $NEWVOL --instance-id "$IID" --device /dev/sdf
    # on the instance: find the partition (lsblk), mount read-only. XFS (Amazon Linux default) needs nouuid because the
    # clone shares the root filesystem's UUID; ext4 does not accept that option.
    mkdir -p /mnt/snap && mount -o ro,nouuid /dev/<partition> /mnt/snap && ls /mnt/snap/opt/notes-app/backups/
    # when done: umount /mnt/snap; aws ec2 detach-volume --volume-id $NEWVOL; aws ec2 delete-volume --volume-id $NEWVOL

## 4. Maintenance window (API down for roughly the dump+restore time; locally ~seconds for 8 MB)
    cd /opt/notes-app
    TS=$(cat backups/.ts)
    OLD="docker compose --env-file .env -f docker-compose.prod.yml"
    # put verify.sql on the instance (identical to docs/postgres-18-upgrade/verify.sql); check its md5 matches the repo copy
    cat > verify.sql <<'SQL'
select 'users' t, count(*) n, md5(coalesce(string_agg(x::text,'|' order by x::text),'')) h from users x
union all select 'notes', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from notes x
union all select 'invite_codes', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from invite_codes x
union all select 'sessions', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from sessions x
union all select 'auth_attempts', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from auth_attempts x
union all select 'alembic_version', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from alembic_version x
order by 1;
SQL
    md5sum verify.sql
    docker compose --env-file .env -f docker-compose.prod.yml stop backend          # stop writers; cloudflared stays (502s)
    # fingerprint BEFORE (verify.sql = counts + md5 of every table's rows, same file as used locally)
    $OLD exec -T db psql -v ON_ERROR_STOP=1 -U notes -d notes -f - < verify.sql > before.txt
    $OLD exec -T db pg_dump -U notes -d notes -Fc > backups/notes-final-$TS.dump       # consistent, no writers
    docker run --rm -i postgres:17-alpine pg_restore -l < backups/notes-final-$TS.dump | wc -l   # must be > 0
    sha256sum backups/notes-final-$TS.dump | tee backups/notes-final-$TS.dump.sha256
    $OLD exec -T db pg_dump -U notes -d notes --schema-only > schema17.sql
    $OLD stop db && $OLD rm -f db                                                     # old volume kept

## 5. Bring up PG18 on a NEW volume, restore, verify
    curl -fsSL https://raw.githubusercontent.com/emass-sec/myapp/<PR-HEAD-SHA>/deploy/docker-compose.prod.yml -o docker-compose.pg18.yml
    NEW="docker compose --env-file .env -f docker-compose.pg18.yml"
    $NEW up -d --wait db            # new volume notes-app_pgdata18 inits with POSTGRES_PASSWORD from .env (same SSM value)
    $NEW exec -T db pg_restore -U notes -d notes --no-owner --single-transaction --exit-on-error < backups/notes-final-$TS.dump
    $NEW exec -T db vacuumdb -U notes -d notes --analyze-only
    $NEW exec -T db psql -v ON_ERROR_STOP=1 -U notes -d notes -f - < verify.sql > after.txt
    diff before.txt after.txt && echo DATA MATCH
    $NEW exec -T db pg_dump -U notes -d notes --schema-only > schema18.sql
    diff <(grep -vE '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog)' schema17.sql) \
         <(grep -vE '^(--|\\restrict|\\unrestrict|SET |SELECT pg_catalog)' schema18.sql) && echo SCHEMA MATCH
GATE: both DATA MATCH and SCHEMA MATCH, else go to Rollback.

## 6. Cutover = merge the replacement PR
`gh workflow enable Deploy`, mark the PR ready, then squash-merge with --match-head-commit. deploy.sh then: pulls images,
`up -d --wait db`, `alembic upgrade head` (no-op), `alembic current` (0006 (head)), starts backend, waits for /health.
Confirm: Deploy run green, `curl https://api.masnetsec.com/health`, re-run verify.sql against the live DB, log in on
https://app.masnetsec.com.
VERIFIED in the rehearsal (see "What is proven"): with the db container already running on postgres:18 + notes-app_pgdata18
(started from docker-compose.pg18.yml), overwriting docker-compose.prod.yml with the PR's file and running deploy.sh's
compose commands reports `Container ...-db-1 Running` - NOT recreated (same container id, StartedAt and restart count before
and after both `up -d` calls). The instance runs the same compose version as the rehearsal (v5.5.1, per the preflight). If the db container were recreated anyway, image and volume are identical, so the result would be the same.
Do NOT revert the PR later as a "rollback": that would point compose back at the stale pgdata volume.

## 7. Rollback
Before step 6 (no new writes in 18): 
    $NEW stop db && $NEW rm -f db
    $OLD up -d db backend        # docker-compose.prod.yml on disk is still the 17 file until the next deploy
After step 6 (18 has newer writes): take a plain-SQL dump from 18 (`pg_dump` from the 18 container), restore it
into a 17 container on notes-app_pgdata, and redeploy the old compose. Higher risk; the pre-upgrade dump/snapshot
is the fallback of last resort.

## 8. Cleanup (>= 1 week after cutover, after a fresh backup)
    docker volume rm notes-app_pgdata
    rm /opt/notes-app/docker-compose.pg18.yml
    aws ec2 delete-snapshot --region us-east-2 --snapshot-id <SNAP from step 3b>      # ~20 GiB, well under a few $/month while kept
Keep `backups/` until then. Consider adding a scheduled pg_dump (none exists today).

## Cutover results (2026-10-23, production, steps 2-6)
All gates passed. The run was authorized as one back-to-back window (downtime acceptable); live-traffic pacing was skipped.
- Step 2 preflight: PG_VERSION 17, `notes-app_pgdata18` absent, 15 GiB free, Compose v5.5.1, Docker 25.0.14, AL2023 (xfs).
  `postgres:18-alpine` pre-pulled. No Deploy runs in progress.
- Freeze: `gh workflow disable Deploy` (showed `disabled_manually`), re-enabled just before the merge.
- 3a dump: `backups/notes-20261023T133150Z.dump`, 58 TOC lines, sha256 `0df3235e...5607`. Globals SQL saved.
- 3b off-box copy: EBS snapshot **`<snapshot-id>`** of `<volume-id>`, completed (100%), tags
  Name=notes-app-pre-pg18, DeleteAfter=step-8-cleanup. S3 was not used (the instance role has no S3 access).
- Step 4: backend stopped; `before.txt` fingerprint users 6, notes 9, invite_codes 1, sessions 1, auth_attempts 0,
  alembic_version 1. Final dump `notes-final-20261023T133150Z.dump` (58 TOC lines, sha256 `508699c6...f368`),
  `schema17.sql`, old db container removed (volume `notes-app_pgdata` kept).
- Step 5: compose file fetched at PR head `4d9d2212...` (sha256 matched the PR file). PG 18.6 started on
  `notes-app_pgdata18`; `pg_restore --single-transaction --exit-on-error` succeeded; `vacuumdb --analyze-only` ran.
  **DATA MATCH** and **SCHEMA MATCH**. Sequences preserved (auth_attempts_id_seq 43, invite_codes 1, notes 13, users 6).
- Step 6: PR #52 marked ready and squash-merged as `90cba1a` with `--match-head-commit 4d9d2212...`. Deploy run
  39962874712 succeeded. "Deploy output" showed the Alembic context lines and `0006 (head)`, then "Backend healthy".
  No `Running upgrade` line, as no migration was pending.
- Post-cutover checks: the db container was NOT recreated by the deploy (id `4f291774b19c`, restarts 0, same start time as
  before the deploy), live fingerprint == `before.txt`, PG 18.6 with `data_checksums` on, backend on image `90cba1a`,
  `/health` 200, `https://app.masnetsec.com` 200, unauthenticated `/auth/me` 401, real client requests returned 200.
- Downtime: roughly 6-8 minutes (backend stopped in step 4 until the deploy restarted it); estimated from timestamps.
- Left on the instance for step 8: volume `notes-app_pgdata`, `docker-compose.pg18.yml`, `/opt/notes-app/backups/`
  (dumps, `before.txt`, `schema17.sql`, `verify.sql`), and the snapshot above.
- Nothing differed from the plan. Pre-cutover rollback (step 7) was never needed. After the cutover, rollback is the higher
  risk path; do not revert #52 or redeploy a SHA from before `90cba1a` (both point compose at the stale `pgdata` volume).

## What is proven vs not
Proven locally (twice, from a clean state, plus rollback): steps 4-5 core (dump, 18 on new volume, restore, analyze,
verify counts + row hashes + schema + sequences), `alembic current/check`, full migration chain on 18, 108 tests,
Postgres concurrency test on 18.
Rehearsed end to end (2026-10-23, isolated docker project `rehearsal`, 17 volume seeded from a backup of real local data,
backend image built from `main`, OLD prod compose from `main` and NEW prod compose from the PR): live 17 stack up ->
step 3a dump -> step 4 (stop backend, fingerprint, final dump, stop db) -> step 5 (18 on new volume, restore, DATA MATCH,
SCHEMA MATCH) -> step 6 (overwrite docker-compose.prod.yml with the PR file, run deploy.sh's compose commands in order):
db not recreated, `alembic upgrade head` + `alembic current` output visible (0006 (head)), backend healthy,
live data == pre-upgrade fingerprint.
Rehearsal differences from production: cloudflared not started, `compose pull` skipped for the locally built backend
image, backend port remapped to avoid a clash, compose v5.5.1 (same as the instance), `-p rehearsal` instead of the
`name: notes-app` in the file. Not covered by the rehearsal (all confirmed by the production run above): SSM execution, the
EBS snapshot commands, instance free disk space, and the GitHub Actions deploy job itself.

## 9. Local developers with an existing PG17 volume (#27 equivalent)
Pulling the new docker-compose.yml (postgres:18-alpine + pgdata18:/var/lib/postgresql) onto an existing local setup
will leave the old data behind in the `pgdata` volume and start an EMPTY database on `pgdata18`. To carry data over,
BEFORE switching to the new compose file (volume names assume the default project name `myapp`):
    docs/postgres-18-upgrade/upgrade_pg17_to_18.sh myapp .env \
        docs/postgres-18-upgrade/local-test/docker-compose.pg17.yml \
        docs/postgres-18-upgrade/local-test/docker-compose.pg18.yml  <workdir-containing-verify.sql>
It dumps from 17, restores into a fresh 18 volume, and exits non-zero (stderr says MISMATCH) unless counts, row hashes
and schema match. CAUTION: the script stops and removes the project's `db` container, and its compose files contain only
the db service. Stop your full local stack first (`docker compose stop`), and afterwards run `docker compose up -d`
from the repo root. Never run `docker compose down` with the db-only files against a project whose backend/frontend
you are using: it stops them and removes the network they are attached to. To rehearse without touching a live stack,
use a throwaway project name and port (e.g. `-p pgtest`, POSTGRES_PORT=55432 in a copy of .env) on a volume seeded
from a tarball.
Fresh checkouts with no local data need nothing: `docker compose up` initializes 18 normally.

## Appendix A - S3 instead of EBS snapshot (NOT used for this run)
Would need, first: a new private bucket (block public access, default encryption) and this inline policy on
the instance's role (`<instance-role>`, from the lookup above; scope to one prefix, write-only so a compromised instance cannot read or delete old backups):
    {"Version":"2012-10-17","Statement":[{"Sid":"PgBackupWriteOnly","Effect":"Allow",
      "Action":"s3:PutObject","Resource":"arn:aws:s3:::<bucket>/pg-upgrade/*"}]}
Then on the instance: `aws s3 cp backups/notes-$TS.dump s3://<bucket>/pg-upgrade/ --sse AES256 --region us-east-2`.
This changes IAM on the production role, which is a separate change that should be reviewed on its own.
