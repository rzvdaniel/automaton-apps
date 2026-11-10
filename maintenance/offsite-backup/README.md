# Off-site backup

An Actions-only Automaton app that copies the newest encrypted server backup to S3-compatible storage. It requests only `backups:read`; it cannot read the server's private backup key or unencrypted backup folders.

## Install

Install the app from the store page in Studio (**Install on your server**). The install page asks for:

- settings: `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `API_BASE_URL` (this server's public API URL) and an optional `S3_PREFIX`;
- secrets: `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`;
- approval of the `backups:read` and `notify:email` permissions (a system administrator approves them);
- the nightly schedule (04:30 UTC; move it if your server's 03:00 backup time is not UTC), which you can skip.

| Provider | `S3_ENDPOINT` | `S3_REGION` |
|---|---|---|
| Hetzner Object Storage | `https://fsn1.your-objectstorage.com` | `fsn1` (or `nbg1`, `hel1`) |
| Backblaze B2 | `https://s3.eu-central-003.backblazeb2.com` | `eu-central-003` |
| AWS S3 | `https://s3.eu-central-1.amazonaws.com` | `eu-central-1` |
| MinIO | your MinIO URL | `us-east-1` |

Set `S3_REGION` for every provider except MinIO; a wrong region makes signing fail.

Each install keeps its copies under `automaton/<server host>/<app ID>/` (the app ID comes from `AUTOMATON_APP_ID`), so two installs with different destinations or the same bucket never delete each other's copies. A custom `S3_PREFIX` must stay inside the install's own folder, for example `automaton/<server host>/<app ID>/weekly`; other prefixes are refused. Changing the API host name starts a new folder. Copies written by earlier versions of this app directly under `automaton/<server host>/` are no longer listed or pruned; delete them in the bucket when you no longer need them.

If the server has no encrypted backup, the run fails and nothing in the bucket is deleted. Otherwise the Action keeps backups from the last 30 days and at least the 7 newest.

The Action skips an object whose `sha256` metadata already matches the newest local archive. New archives stream into a multipart upload; size and SHA-256 are checked before the upload is completed. Retention only removes timestamped Automaton backup archives under the configured prefix.

## Failure emails

When a run fails, the app emails the server's administrators through the server's own SMTP, using `POST /api/notify/email` with the `notify:email` permission (subject `Off-site backup failed`, which the server prefixes with the app's name; the platform allows 10 a hour). Set `NOTIFY_EMAIL_TO` to `owner` or `project` to send it elsewhere. Without the approval or SMTP settings the run still fails and logs that no email was sent. The app has no webhook of its own; use the platform's Action webhooks if you want one. Messages for wrong S3 settings name the setting to check (access key, secret, region, bucket or endpoint).

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
