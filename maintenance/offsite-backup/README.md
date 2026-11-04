# Off-site backup

An Actions-only Automaton app that copies the newest encrypted server backup to S3-compatible storage. It requests only `backups:read`; it cannot read the server's private backup key or unencrypted backup folders.

## Setup

1. Deploy this app to the server and approve its `backups:read` permission.
2. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` with `automaton secrets set`.
3. In Studio, schedule the `upload` Action daily at 04:30 server time, after the 03:00 local backup.
4. Set the schedule input `apiBaseUrl` to the Automaton server's base URL. Optional `region` and `prefix` inputs override the S3 region (`us-east-1`) and default prefix (`automaton/<server host>/`).
5. The Action keeps backups from the last 30 days and at least the 7 newest; schedule input can override `retentionDays` and `minimumBackups`.

The Action skips an object whose `sha256` metadata already matches the newest local archive. New archives stream into a multipart upload; size and SHA-256 are checked before the upload is completed. Retention only removes timestamped Automaton backup archives under the configured prefix.

## Restore drill

Download the `.tar.age` object from the bucket and retrieve the backup key separately from the password manager. Copy both files to the replacement server, then run:

```sh
sudo bash /opt/automaton-server/restore.sh --archive /path/to/automaton-YYYYMMDDTHHMMSSZ.tar.age --key /path/to/backup-key
```

The archive contains the database and API/Worker Data Protection keys. It does not contain `/etc/automaton`; restore the server configuration and secrets from the separate protected copy as well.

## Tests

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r actions/upload/requirements-test.txt
python -m unittest discover -s actions/upload -p 'test_*.py'
```
