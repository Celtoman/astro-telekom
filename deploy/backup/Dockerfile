FROM postgres:18.6-alpine

RUN apk add --no-cache curl openssl util-linux

COPY scripts/postgres-backup-rehearsal.sh /usr/local/bin/postgres-backup-rehearsal
COPY scripts/release-one-database-audit.sql /opt/astro-backup/release-one-database-audit.sql
COPY deploy/backup/recipient-certificate.pem /opt/astro-backup/recipient-certificate.pem

RUN chmod 0555 /usr/local/bin/postgres-backup-rehearsal \
    && chmod 0444 /opt/astro-backup/release-one-database-audit.sql \
        /opt/astro-backup/recipient-certificate.pem
