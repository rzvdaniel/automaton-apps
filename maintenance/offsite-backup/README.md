# Backup Warden

Copies your server's backups to another place, every night. An Automaton app (an Action plus a small page) that copies the newest encrypted server backup to S3-compatible storage. It requests `backups:read`, `backups:run` (start a server backup) and `notify:email`; it cannot read the server's private backup key or unencrypted backup folders.

**Needs an Automaton server.** Backup Warden manages this server's backups through the Automaton API and its `backups:*` permissions, so it only works as an app installed on Automaton; it does not run on its own.

## Install

Install the app from the store page in Studio (**Install on your server**). The install page asks for:

- settings: `STALE_HOURS` (default 26), `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `API_BASE_URL` (this server's public API URL) and the optional `S3_PREFIX`, `RETENTION_DAYS` and `MIN_BACKUPS`;
- secrets: `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, and optionally `WEBHOOK_URL`;
- approval of the `backups:read`, `backups:run` and `notify:email` permissions (a system administrator approves them);
- the schedules: the Action checks every 15 minutes and uploads any new copy, so the off-site copy follows the server's nightly backup within 15 minutes (you can skip the schedule and run it by hand). A second schedule, **Off-site freshness check**, runs hourly (see below).

## Back up now

The app's page shows the newest server backup. A system administrator presses **Back up now and send off-site**: the app asks the server for a backup (`POST /api/Install/backups/run`, with the administrator's viewer token; anyone else gets 403), the server makes and encrypts it, and the next 15-minute check uploads it. The app never sees the backup key or the database.

| Provider | `S3_ENDPOINT` | `S3_REGION` |
|---|---|---|
| Hetzner Object Storage | `https://fsn1.your-objectstorage.com` | `fsn1` (or `nbg1`, `hel1`) |
| Backblaze B2 | `https://s3.eu-central-003.backblazeb2.com` | `eu-central-003` |
| AWS S3 | `https://s3.eu-central-1.amazonaws.com` | `eu-central-1` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` (`https://<account-id>.eu.r2.cloudflarestorage.com` for an EU-jurisdiction bucket) | `auto` |
| MinIO | your MinIO URL | `us-east-1` |

Set `S3_REGION` for every provider except MinIO; a wrong region makes signing fail.

Each install keeps its copies under `automaton/<server host>/<app ID>/` (the app ID comes from `AUTOMATON_APP_ID`), so two installs with different destinations or the same bucket never delete each other's copies. A custom `S3_PREFIX` must stay inside the install's own folder, for example `automaton/<server host>/<app ID>/weekly`; other prefixes are refused. Changing the API host name starts a new folder. Copies written by earlier versions of this app directly under `automaton/<server host>/` are no longer listed or pruned; delete them in the bucket when you no longer need them.

If the server has no encrypted backup, the run fails and nothing in the bucket is deleted. Otherwise the Action keeps backups from the last `RETENTION_DAYS` days (default 30) and at least the `MIN_BACKUPS` newest (default 7). Both must be whole numbers of 1 or more; anything else fails the run with a message naming the setting, before anything is uploaded or deleted.

The Action skips an object whose `sha256` metadata already matches the newest local archive. New archives stream into a multipart upload; size and SHA-256 are checked before the upload is completed. Retention only removes timestamped Automaton backup archives under the configured prefix.

## Failure emails

When a run fails, the app emails the server's administrators through the server's own SMTP, using `POST /api/notify/email` with the `notify:email` permission (subject `Off-site backup failed`, which the server prefixes with the app's name; the platform allows 10 a hour). Set `NOTIFY_EMAIL_TO` to `owner` or `project` to send it elsewhere. Without the approval or SMTP settings the run still fails and logs that no email was sent. When the storage rejects the first request without an error code (a wrong `S3_REGION` does this), the message names `S3_REGION`, `S3_ENDPOINT` and the access keys. Messages for wrong S3 settings name the setting to check (access key, secret, region, bucket or endpoint).

## Webhook alerts

Set the `WEBHOOK_URL` secret to an `https://` address (a Slack or Discord incoming webhook, a Telegram `sendMessage` URL with `chat_id` in the query, or any URL that takes JSON) and every failure and stale alert is also posted there. It does not use the Automaton server, so it still arrives when the server's mail or the server itself is down. The body is `{"text": "...", "content": "..."}` (`text` for Slack and Telegram, `content` for Discord). Each run's log says "Webhook alert sent" or why it was not; the address itself is never logged. Redirects are not followed. The URL is a secret: treat it like a password, because anyone who has it can post to that channel.

## Stale copy alert

The **Off-site freshness check** schedule runs at minute 7 of every hour, independently of the upload schedule, so it still fires when the upload schedule is paused or the server did not make a backup. When the newest copy in the bucket is older than `STALE_HOURS` (default 26, a whole number of 1 or more) or there is none, the run fails and sends the email and webhook alert. It alerts at most once every 24 hours: it keeps an empty `.stale-alert` marker object next to the copies (retention ignores it) and removes it when a fresh copy is there again. Pause or delete this schedule if you do not want the check.

## Restore page

A system administrator sees an **Off-site copies** card on the page: every copy in the bucket (up to 200, newest first) with its date and size, and for each the exact commands. Copy the first to the machine with the AWS CLI configured for your storage; the second is the restore drill below:

```sh
aws s3 cp --endpoint-url 'https://...' 's3://<bucket>/automaton/<server host>/<app ID>/automaton-YYYYMMDDTHHMMSSZ.tar.age' ./automaton-YYYYMMDDTHHMMSSZ.tar.age
sudo bash /opt/automaton-server/restore.sh --archive ./automaton-YYYYMMDDTHHMMSSZ.tar.age --key /path/to/backup-key
```

The page never shows the backup key or any storage key, and nobody but an administrator can read the list (the app answers 403). The app does not restore anything itself. The page reads the bucket with the app's own storage secrets, so a storage error there names the setting to check.

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
python -m unittest discover -p 'test_*.py'
```
