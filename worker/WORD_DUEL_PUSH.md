# Word Duel background reminders

Reminders use standards-based Web Push, the existing `/sw.js`, and alarms on the existing isolated `word-duel:<code>` BattleRoom objects. No new binding, namespace, migration, account or third-party messaging SDK is required. Rooms and games work while push configuration is absent; the UI says reminders are unavailable and never asks permission on page load.

## Configuration before enabling production reminders

Configure these three GitHub **production environment secrets** together. The existing protected API release workflow passes them to the pinned Wrangler deploy as an additive secrets file, so they enter the same receipted Worker version as the code:

- `VAPID_PUBLIC_KEY`: base64url uncompressed 65-byte P-256 public key (87 characters, no padding).
- `VAPID_PRIVATE_KEY`: corresponding base64url 32-byte private scalar (43 characters, no padding). Keep this secret stable; rotating the pair requires browsers to renew subscriptions.
- `VAPID_SUBJECT`: a monitored `mailto:` contact or public HTTPS contact URL controlled by the site owner. Do not invent a contact address.

The repository helper can generate a key pair into an explicitly chosen private file; it prints only the destination path, never the key material:

```sh
node worker/scripts/generate-duel-push-keys.mjs /private/tmp/word-duel-vapid.json
```

The helper refuses to overwrite an existing file and writes mode 0600. Store its public/private values as the corresponding GitHub production environment secrets (`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`), and set `VAPID_SUBJECT` in that same environment. Do not run standalone `wrangler secret put` as part of this rollout: it would create a separate Worker version outside the release receipt. `worker/scripts/prepare-duel-push-secrets.mjs` validates and prepares the temporary deploy file; the protected workflow handles its cleanup. Do not paste the private key into issue comments, logs, chat or a committed file. Remove the temporary file after storing the pair in the owner's secret manager. Do not generate or change production secrets automatically during build or deployment.

Confirm `GET /api/word-duel/push-config` returns `enabled:true` and the expected public key. It never returns the private key or contact. Missing or invalid key configuration leaves reminders unavailable. This endpoint is public read-only; CORS remains the same as the rest of the API.

## Device verification

On iPhone/iPad, add Riddle Arabia to the Home Screen, open that installed web app, then join/create the room **there** before enabling reminders. The seat is browser-local; an installed app may have separate storage from the Safari tab. Use iOS/iPadOS 16.4 or later. Tap **Enable on this device** and grant notification permission. There is no automatic permission prompt. Browser support, OS Focus and notification settings, connectivity and push-service delivery can affect timing.

Play from the other device, close/background the installed app, and confirm a turn notification arrives. Tap it, confirm it opens the same room and resumes the saved seat, then disable reminders and verify the next turn sends no notification. Also test a rematch invitation. A real push-service/device acceptance test is required after the secrets are configured; local encryption and mocked delivery tests cannot prove hardware notification delivery.

The server stores at most one subscription per seat (two per room), only until room expiry or opt-out. Authenticated opt-out deletes the server subscription and pending reminder; the browser endpoint remains subscribed because another room on the same origin may still use it. Browser notification settings can revoke permission for the entire site. A 404/410 or other permanent delivery failure removes that room’s subscription. Transient network/429/5xx failures retry at most twice, after 30 seconds and 120 seconds. Every send checks that the turn/invitation is still current. One stable provider Topic and notification tag per room replace duplicates; Web Push is not an exactly-once transport. A notification contains the public room code, language and generic prompt, never rack letters, private seat tokens, player names or scores.

## Security and compatibility

Only HTTPS endpoints on the allowlisted browser push-service domains are accepted; local addresses, arbitrary hosts, userinfo, nonstandard ports, fragments and redirects are rejected. Browser P-256 keys are validated before storing. Payloads are encrypted with a fresh ephemeral key and salt (RFC 8291), and requests carry a short-lived ES256 VAPID token (RFC 8292). Subscription endpoints/auth secrets never appear in room snapshots. Existing global and per-room rate limits protect subscription and rematch routes.

Old room records remain readable. Rematches preserve player IDs and token hashes, require explicit consent from the other player, retain monotonic revisions, rotate the starting player and archive the completed result before replacing the board. Finished rooms expire after one hour; requests and declines do not extend that lifetime. The server keeps the latest ten public results for reconnect recovery; the browser keeps up to thirty completed matches, explicitly labeled as device-only history. There is no account sync claim.

Legacy Arabic rooms retain vocabulary version 1. New rooms and accepted rematches use the shared reviewed version 2; it preserves ء/ؤ/ئ/ة/ى distinctions and folds only alef variants. The generated worker lexicon is checked against `puzzle-arabic-words.js` by the test suite. Regenerate it with `node worker/scripts/sync-duel-arabic.mjs` after editorial changes.

Rollback does not cross a Durable Object migration. Old Worker versions ignore the new optional room fields and cannot send reminders or process rematches. A prior Worker can leave an expired duel record physically retained after its alarm; the upgraded helper still enforces `expiresAt` before access and cleans it up. Do not promise old frontends can accept rematches: both participants need the current interface.

## Primary references

- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Apple: Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [RFC 8291: Message Encryption for Web Push](https://www.rfc-editor.org/rfc/rfc8291)
- [RFC 8292: VAPID for Web Push](https://www.rfc-editor.org/rfc/rfc8292)

### Local QA with the pinned Wrangler

Wrangler 4.131 filters `.dev.vars` to the names in `secrets.required` or existing configured vars when a `secrets` declaration exists. Merely appending optional VAPID entries to this repository's `.dev.vars` does not enable them. For a phone preview, use a temporary local-only configuration that copies the existing Worker config, adds the three VAPID names to `secrets.required`, resolves `main` and migration paths to the source tree, and reads a mode-0600 `.dev.vars` containing a **separate test-only key pair**. Run local development with that temporary `--config` and an explicit local `--persist-to` directory. Keep the repository's production configuration and production key material unchanged. Verify `/api/word-duel/push-config` before offering the device test. Destroy the temporary test credentials/configuration after the preview is finished.
