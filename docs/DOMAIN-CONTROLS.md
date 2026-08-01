# Read-only domain-control verification

`scripts/verify-domain-controls.mjs` audits public DNS and HTTPS evidence without
using a registrar, DNS-provider, or mail-provider API. It cannot change a
record. DNS queries use DNS-over-HTTPS with DNSSEC metadata; HTTP checks use
`HEAD` for the apex and `www`, plus the public API health `GET` and the MTA-STS
policy document.

The report covers:

- parent DS, zone DNSKEY, and authenticated DNSSEC answers;
- CAA issuance restrictions;
- a single SPF record and its terminal policy;
- accidental apex `v=DKIM1` placement and only the selectors explicitly passed
  by the operator; each selector's `p=` value must be nonempty, valid base64
  containing canonical DER SubjectPublicKeyInfo for the declared RSA or Ed25519
  type, and RSA keys must be at least 2,048 bits;
- DMARC syntax, enforcement policy, and DKIM/SPF alignment mode;
- MTA-STS DNS and HTTPS policy, including coverage of every published MX host;
- TLS-RPT syntax without inventing a report recipient;
- A/AAAA/CNAME evidence for apex, `www`, and `api`;
- apex availability, exact `www` canonical redirect, and API health routing.

Normal mode distinguishes hard syntax/routing failures from hardening warnings.
`--strict` promotes target-policy gaps to failures: DNSSEC, CAA, SPF `-all`, an
explicit valid DKIM selector, DMARC `p=reject` with `adkim=s; aspf=s`, MTA-STS
`mode: enforce` with at least seven days' max age, TLS-RPT, and IPv6 on every
public host.

No DKIM selector, SPF sender, DMARC aggregate address, or TLS-RPT recipient is
guessed. An empty DKIM `p=` tag is reported as a revoked key, not as a usable
selector. Pass each real active DKIM selector explicitly:

```sh
node scripts/verify-domain-controls.mjs \
  --domain jakh.net \
  --dkim-selector REAL_PROVIDER_SELECTOR \
  --strict \
  --output /tmp/jakh-domain-controls.json
```

Repeat `--dkim-selector` when more than one selector is active. A missing
selector in strict mode is a failed evidence gate, not permission to try common
provider names. Review mail-provider reports before tightening SPF or DMARC;
this verifier intentionally does not decide which systems are authorized to
send mail.

Run the deterministic simulated-DNS contract with:

```sh
node --test scripts/verify-domain-controls.test.mjs
```
