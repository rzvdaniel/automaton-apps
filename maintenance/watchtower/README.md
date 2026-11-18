# Watchtower (retired)

Watchtower is no longer in the catalog. Use [Server Keeper](../server-console/) instead: it watches the same two backups (the server's nightly backup, and the Off-site Backup app), warns by email and webhook like its other warnings, and also shows them on Studio Home and in the notification feed.

An installed Watchtower keeps running until you remove it. To switch, install Server Keeper, approve its permissions (`server:read`, `notify:email`, `backups:read`, `apps:read-status`) and uninstall Watchtower.
