# Administrator authenticator protection

Privileged API access requires an authenticator in addition to the account password. A password-only session can use normal account features and enroll an authenticator, but cannot open administration, delete a privileged account, or change an enrolled privileged account's password/recovery code until the factor is verified. Normal users retain their existing account flows.

## Deployment and owner setup

1. Run the protected API deployment workflow in `compatibility` mode for the exact approved commit SHA. Deploy its compatibility Worker while production D1 remains on schema 9; verify the deployment receipt and unchanged database. This phase does not apply migrations. Core account routes remain compatible, while administration fails closed with `MFA_UNAVAILABLE` until migration 10 exists.
2. Run `migrate-final` for that same commit SHA. The workflow must prove that the exact compatibility Worker is active, export and encrypt the pre-migration database backup, and restore and verify that backup in ephemeral local D1 before applying `0010_admin_mfa.sql`. Complete its final Worker deployment and receipt checks. Verify health reports schema 10, target schema 10 and `features.adminMfa:true`. Do not bypass the backup/restore or compatibility proofs with a direct migration command.
3. Publish the matching static frontend only after the final API receipt passes, so the authenticator setup/verification dialog and its API are available together.
4. The owner signs in personally and changes the previously shared weak password to a unique passphrase of at least 15 characters. The API enforces this policy on new/changed credentials and requires the current password to meet it before authenticator setup. Do not rotate credentials for the owner or transmit a new password in chat.
5. From Profile or the administration gate, choose authenticator setup, confirm the current password, enter the manual key into a trusted authenticator application, and confirm its six-digit time-based code.
6. Save the ten one-time recovery codes in a password manager or safe offline location. The codes are displayed once. Test the next administration sign-in with the owner's authenticator; do not retain or log the setup key or recovery codes in audit artifacts.

No account is enrolled by deploying code or applying the migration. Password-only administration is intentionally blocked until its account completes setup. Ordinary sign-in and password change for an unenrolled account remain available, providing a safe path into setup.

## Behavior and recovery

- A code uses RFC 6238 SHA1 with a 30-second period, six digits, and a ±1-step clock allowance. Each accepted step is atomically consumed; replay is rejected, including the setup-confirmation code.
- Verification is bound to the opaque server session and current authenticator credential. Existing privileged session limits remain 15 minutes idle and 8 hours total. Sign-out, password change/reset, role change or session revocation remove session verification through database foreign-key cascades.
- A recovery code is a random 128-bit token, stored only as a SHA256 digest bound to its user. It can verify one session once. From that verified session, the owner can replace the authenticator after entering the current password. The old authenticator remains active until the new code is confirmed. Confirmation replaces all recovery codes and clears verification from other sessions.
- Existing account-password recovery codes reset the password and revoke sessions; they do **not** delete or bypass an enrolled authenticator. This deliberately prevents password-recovery possession alone from granting administrator access.
- If the authenticator and every MFA recovery code are lost, recovery requires the verified account owner and an authorized infrastructure operator. Verify ownership through an existing trusted channel, take a database backup, revoke all sessions for that exact owner record, remove its pending/authenticator/session-verification records and record the intervention in the admin audit log. Then have the owner sign in and enroll again. There is no public MFA-disable endpoint or email-only bypass. Never run this reset based solely on a submitted username or password.

## Storage, limits and maintenance

Secrets use randomized AES-256-GCM encryption with the user ID as authenticated associated data. A domain-separated HKDF key derives from the existing server password pepper; encrypted database backups therefore require that pepper to restore authenticators. Pepper rotation requires a planned re-encryption/password migration; do not simply replace it.

Pending setup expires after 10 minutes and is bound to the setup session. Hourly maintenance and subsequent setup requests delete expired pending ciphertext in bounded batches. Setup attempts are limited to 5 per account per 15 minutes; verification/confirmation to 10 per account per 15 minutes. Login uses both IP and account limits; username/email aliases share the account bucket. Account identifiers in limit keys are hashed. A short local predictable-password screen covers service/account-derived values, common bases and repeated/sequential values; it is not a complete breached-password database.

Authenticator enrollment, replacement, successful verification and recovery-code use create audit events without secret material. The dialog does not persist secrets or recovery codes. Existing page cache/CORS protections apply to all routes.

## Validation sources

The implementation is checked against all SHA1 test vectors in [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238). Password length and screening follow the relevant approach in [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/). Recovery and factor replacement follow [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Automated tests use real SQLite migrations to verify session binding, expired setup, digest-only recovery codes, replay rejection, concurrent confirmation, transactional rollback, replacement, privileged account-mutation gates, cleanup, policy enforcement and alias throttling. Production owner enrollment remains a user-performed rollout step.
