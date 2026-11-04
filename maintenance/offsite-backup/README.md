# Off-site backup

An Actions-only Automaton app that copies the newest encrypted server backup to S3-compatible storage. It requests only `backups:read`; it cannot read the server's private backup key or unencrypted backup folders.

## Setup

1. Deploy this app to the server and approve its `backups:read` permission.
2. Set `API_BASE_URL` to this server's API base URL and set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` with `automaton secrets set`. Keep `API_BASE_URL` owner-managed; it is not a schedule input. Optional `S3_REGION` and `S3_PREFIX` settings default to `us-east-1` and `automaton/<server host>/`.
   These settings are stored as app secrets because apps have no plain settings yet; only the access keys are really secret. Examples:

   | Provider | `S3_ENDPOINT` | `S3_REGION` |
   |---|---|---|
   | Hetzner Object Storage | `https://fsn1.your-objectstorage.com` | `fsn1` (or `nbg1`, `hel1`) |
   | Backblaze B2 | `https://s3.eu-central-003.backblazeb2.com` | `eu-central-003` |
   | AWS S3 | `https://s3.eu-central-1.amazonaws.com` | `eu-central-1` |
   | MinIO | your MinIO URL | `us-east-1` |

   Set `S3_REGION` for every provider except MinIO; a wrong region makes signing fail. Use the server's public API URL for `API_BASE_URL` and keep it stable: the default prefix is built from its host, so a new host name starts a new folder in the bucket.
3. In Studio, schedule the `upload` Action daily at 04:30 server time, after the 03:00 local backup. App manifests cannot declare schedules yet, so this step is needed after every fresh deploy.
4. If the server has no encrypted backup, the run fails and nothing in the bucket is deleted. Otherwise the Action keeps backups from the last 30 days and at least the 7 newest.

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
