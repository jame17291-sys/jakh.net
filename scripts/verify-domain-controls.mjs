import { createPublicKey } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DNS_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const SELECTOR_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/u;
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeDomain(value) {
  const domain = String(value || "").trim().toLowerCase().replace(/\.$/u, "");
  if (!DOMAIN_PATTERN.test(domain)) throw new Error("domain is invalid");
  return domain;
}

function decodeTxt(data) {
  const chunks = String(data || "").match(/"(?:\\.|[^"\\])*"/gu);
  if (!chunks?.length) return String(data || "").trim();
  try {
    return chunks.map((chunk) => JSON.parse(chunk)).join("");
  } catch {
    return String(data || "").trim();
  }
}

function tagMap(record) {
  const tags = new Map();
  for (const token of String(record || "").split(";")) {
    const separator = token.indexOf("=");
    if (separator < 1) continue;
    const key = token.slice(0, separator).trim().toLowerCase();
    const value = token.slice(separator + 1).trim();
    if (tags.has(key)) throw new Error(`duplicate ${key} tag`);
    tags.set(key, value);
  }
  return tags;
}

function validateDkimPublicKey(tags, selector) {
  if (String(tags.get("v") || "").toUpperCase() !== "DKIM1") {
    return { valid: false, detail: `selector=${selector}; invalid DKIM version` };
  }
  if (!tags.has("p")) {
    return { valid: false, detail: `selector=${selector}; public key tag is missing` };
  }
  const encoded = String(tags.get("p") || "").replace(/[\t\n\r ]+/gu, "");
  if (!encoded) {
    return { valid: false, detail: `selector=${selector}; public key is revoked (empty p tag)` };
  }

  const declaredType = String(tags.get("k") || "rsa").toLowerCase();
  if (!new Set(["rsa", "ed25519"]).has(declaredType)) {
    return { valid: false, detail: `selector=${selector}; unsupported key type=${declaredType}` };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) || encoded.length % 4 === 1) {
    return { valid: false, detail: `selector=${selector}; public key is not valid base64` };
  }

  const unpadded = encoded.replace(/=+$/u, "");
  const padded = `${unpadded}${"=".repeat((4 - (unpadded.length % 4)) % 4)}`;
  let der;
  try {
    der = Buffer.from(padded, "base64");
  } catch {
    return { valid: false, detail: `selector=${selector}; public key is not valid base64` };
  }
  if (!der.length || der.toString("base64").replace(/=+$/u, "") !== unpadded) {
    return { valid: false, detail: `selector=${selector}; public key is not canonical base64` };
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return { valid: false, detail: `selector=${selector}; public key is not DER SubjectPublicKeyInfo` };
  }
  const canonicalDer = publicKey.export({ format: "der", type: "spki" });
  if (!Buffer.isBuffer(canonicalDer) || !canonicalDer.equals(der)) {
    return { valid: false, detail: `selector=${selector}; public key is not canonical DER SubjectPublicKeyInfo` };
  }
  if (publicKey.asymmetricKeyType !== declaredType) {
    return {
      valid: false,
      detail: `selector=${selector}; declared keyType=${declaredType}; actual keyType=${publicKey.asymmetricKeyType || "unknown"}`,
    };
  }
  if (declaredType === "rsa") {
    const modulusBits = publicKey.asymmetricKeyDetails?.modulusLength;
    if (!Number.isSafeInteger(modulusBits) || modulusBits < 2_048) {
      return {
        valid: false,
        detail: `selector=${selector}; keyType=rsa; modulusBits=${modulusBits || 0}; minimum=2048`,
      };
    }
    return {
      valid: true,
      detail: `selector=${selector}; keyType=rsa; modulusBits=${modulusBits}; validSpki=true`,
    };
  }
  return {
    valid: true,
    detail: `selector=${selector}; keyType=ed25519; validSpki=true`,
  };
}

function policyLines(text) {
  const values = new Map();
  for (const rawLine of String(text || "").split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    const current = values.get(key) || [];
    current.push(value);
    values.set(key, current);
  }
  return values;
}

function mxHost(record) {
  const match = /^\d+\s+([^\s]+)\.?$/u.exec(String(record).trim());
  return match?.[1]?.toLowerCase().replace(/\.$/u, "") || null;
}

function policyMatchesMx(pattern, host) {
  const normalized = String(pattern || "").trim().toLowerCase().replace(/\.$/u, "");
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return normalized === host;
}

export function createDohQuery({ fetchImpl = globalThis.fetch, endpoint = DNS_ENDPOINT } = {}) {
  return async function dnsQuery(name, type) {
    const url = new URL(endpoint);
    url.searchParams.set("name", name);
    url.searchParams.set("type", type);
    url.searchParams.set("do", "true");
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/dns-json",
        "user-agent": "jakh-domain-controls/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`DNS-over-HTTPS returned HTTP ${response.status}`);
    const payload = await response.json();
    if (![0, 3].includes(payload.Status)) throw new Error(`DNS response status ${payload.Status}`);
    return {
      authenticated: payload.AD === true,
      answers: Array.isArray(payload.Answer)
        ? payload.Answer.map(({ data, TTL, type: answerType }) => ({ data, ttl: TTL, type: answerType }))
        : [],
    };
  };
}

function answerData(result, type) {
  const typeNumbers = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, DS: 43, DNSKEY: 48, CAA: 257 };
  return result.answers
    .filter((answer) => answer.type === undefined || answer.type === typeNumbers[type])
    .map(({ data }) => String(data));
}

export async function verifyDomainControls(options = {}) {
  const domain = normalizeDomain(options.domain || "jakh.net");
  const strict = options.strict === true;
  const selectors = [...new Set((options.dkimSelectors || []).map((selector) => {
    const normalized = String(selector).trim().toLowerCase();
    if (!SELECTOR_PATTERN.test(normalized)) throw new Error(`invalid DKIM selector: ${selector}`);
    return normalized;
  }))];
  const dnsQuery = options.dnsQuery || createDohQuery({ fetchImpl: options.fetchImpl });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const checks = [];

  function add(name, ok, detail, { baselineFailure = false } = {}) {
    checks.push({
      name,
      status: ok ? "pass" : (baselineFailure || strict ? "fail" : "warning"),
      detail,
    });
  }

  async function query(name, type) {
    try {
      return await dnsQuery(name, type);
    } catch (error) {
      checks.push({
        name: `DNS query ${type} ${name}`,
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
      return { authenticated: false, answers: [], failed: true };
    }
  }

  const [ds, dnskey, caa, mx, apexTxt, dmarcTxt, mtaStsTxt, tlsRptTxt] = await Promise.all([
    query(domain, "DS"),
    query(domain, "DNSKEY"),
    query(domain, "CAA"),
    query(domain, "MX"),
    query(domain, "TXT"),
    query(`_dmarc.${domain}`, "TXT"),
    query(`_mta-sts.${domain}`, "TXT"),
    query(`_smtp._tls.${domain}`, "TXT"),
  ]);

  const dsRecords = answerData(ds, "DS");
  const dnskeys = answerData(dnskey, "DNSKEY");
  add(
    "DNSSEC delegation and validation",
    dsRecords.length > 0 && dnskeys.length > 0 && ds.authenticated && dnskey.authenticated,
    `DS=${dsRecords.length}; DNSKEY=${dnskeys.length}; authenticated=${ds.authenticated && dnskey.authenticated}`,
  );

  const caaRecords = answerData(caa, "CAA");
  const validCaa = caaRecords.filter((record) => /^\d+\s+(?:issue|issuewild)\s+"[^"]+"$/iu.test(record));
  add(
    "CAA issuance policy",
    validCaa.length > 0
      && validCaa.length === caaRecords.filter((record) => /\s(?:issue|issuewild)\s/iu.test(record)).length,
    caaRecords.length ? caaRecords.join(" | ") : "no CAA records",
  );

  const apexTextRecords = answerData(apexTxt, "TXT").map(decodeTxt);
  const spfRecords = apexTextRecords.filter((record) => /^v=spf1\b/iu.test(record));
  const spf = spfRecords[0] || "";
  add(
    "single syntactically bounded SPF policy",
    spfRecords.length === 1 && /\s-all\s*$/iu.test(spf),
    spfRecords.length === 1 ? spf : `SPF record count=${spfRecords.length}`,
    { baselineFailure: spfRecords.length > 1 || /\s[+?]all\s*$/iu.test(spf) },
  );

  const misplacedDkim = apexTextRecords.filter((record) => /^v=DKIM1\b/iu.test(record));
  add(
    "DKIM is not published at the zone apex",
    misplacedDkim.length === 0,
    misplacedDkim.length ? `${misplacedDkim.length} apex DKIM record(s)` : "no apex DKIM record",
    { baselineFailure: misplacedDkim.length > 0 },
  );
  add(
    "explicit DKIM selector evidence",
    selectors.length > 0,
    selectors.length ? selectors.join(",") : "no selector supplied; none was guessed",
  );
  for (const selector of selectors) {
    const name = `${selector}._domainkey.${domain}`;
    const response = await query(name, "TXT");
    const records = answerData(response, "TXT").map(decodeTxt)
      .filter((record) => /^v=DKIM1\b/iu.test(record));
    let valid = records.length === 1;
    let detail = records.length === 1 ? records[0] : `DKIM record count=${records.length}`;
    if (valid) {
      try {
        const tags = tagMap(records[0]);
        ({ valid, detail } = validateDkimPublicKey(tags, selector));
      } catch (error) {
        valid = false;
        detail = error instanceof Error ? error.message : String(error);
      }
    }
    add(`DKIM selector ${selector}`, valid, detail, { baselineFailure: true });
  }

  const dmarcRecords = answerData(dmarcTxt, "TXT").map(decodeTxt)
    .filter((record) => /^v=DMARC1\b/iu.test(record));
  let dmarcValid = dmarcRecords.length === 1;
  let dmarcStrict = false;
  let dmarcDetail = `DMARC record count=${dmarcRecords.length}`;
  if (dmarcValid) {
    try {
      const tags = tagMap(dmarcRecords[0]);
      dmarcValid = tags.get("v") === "DMARC1" && new Set(["none", "quarantine", "reject"]).has(tags.get("p"));
      dmarcStrict = tags.get("p") === "reject" && tags.get("adkim") === "s" && tags.get("aspf") === "s";
      dmarcDetail = `p=${tags.get("p") || "missing"}; adkim=${tags.get("adkim") || "r-default"}; aspf=${tags.get("aspf") || "r-default"}; aggregateReports=${Boolean(tags.get("rua"))}`;
    } catch (error) {
      dmarcValid = false;
      dmarcDetail = error instanceof Error ? error.message : String(error);
    }
  }
  add("valid DMARC record", dmarcValid, dmarcDetail, { baselineFailure: true });
  if (dmarcValid) add("DMARC reject with strict alignment", dmarcStrict, dmarcDetail);

  const mtaRecords = answerData(mtaStsTxt, "TXT").map(decodeTxt)
    .filter((record) => /^v=STSv1\s*;/iu.test(record));
  add(
    "MTA-STS DNS policy identifier",
    mtaRecords.length === 1 && /;\s*id=[A-Za-z0-9._-]+\s*;?$/u.test(mtaRecords[0]),
    mtaRecords.length === 1 ? mtaRecords[0] : `MTA-STS record count=${mtaRecords.length}`,
    { baselineFailure: mtaRecords.length > 1 },
  );
  if (mtaRecords.length === 1) {
    try {
      const response = await fetchImpl(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, {
        headers: { accept: "text/plain", "user-agent": "jakh-domain-controls/1.0" },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      const policy = policyLines(text);
      const maxAge = Number(policy.get("max_age")?.[0]);
      const dnsMxHosts = answerData(mx, "MX").map(mxHost).filter(Boolean);
      const policyMx = policy.get("mx") || [];
      const coveredMx = dnsMxHosts.filter((host) => policyMx.some((pattern) => policyMatchesMx(pattern, host)));
      const valid = response.status === 200
        && policy.get("version")?.[0] === "STSv1"
        && ["testing", "enforce"].includes(policy.get("mode")?.[0])
        && policyMx.length > 0
        && dnsMxHosts.length > 0
        && coveredMx.length === dnsMxHosts.length
        && Number.isSafeInteger(maxAge)
        && maxAge > 0;
      const target = valid && policy.get("mode")?.[0] === "enforce" && maxAge >= 604_800;
      add("valid MTA-STS HTTPS policy", valid, `HTTP ${response.status}; mode=${policy.get("mode")?.[0] || "missing"}; policyMx=${policyMx.length}; coveredDnsMx=${coveredMx.length}/${dnsMxHosts.length}; max_age=${maxAge || 0}`, { baselineFailure: true });
      if (valid) add("MTA-STS enforce target", target, `mode=${policy.get("mode")?.[0]}; max_age=${maxAge}`);
    } catch (error) {
      add("valid MTA-STS HTTPS policy", false, error instanceof Error ? error.message : String(error), { baselineFailure: true });
    }
  }

  const tlsRptRecords = answerData(tlsRptTxt, "TXT").map(decodeTxt)
    .filter((record) => /^v=TLSRPTv1\b/iu.test(record));
  let tlsRptValid = tlsRptRecords.length === 1;
  let tlsRptDetail = `TLS-RPT record count=${tlsRptRecords.length}`;
  if (tlsRptValid) {
    try {
      const tags = tagMap(tlsRptRecords[0]);
      tlsRptValid = tags.get("v") === "TLSRPTv1" && Boolean(tags.get("rua"));
      tlsRptDetail = `aggregateReportDestination=${Boolean(tags.get("rua"))}`;
    } catch (error) {
      tlsRptValid = false;
      tlsRptDetail = error instanceof Error ? error.message : String(error);
    }
  }
  add("TLS-RPT policy", tlsRptValid, tlsRptDetail, { baselineFailure: tlsRptRecords.length > 1 });

  const hosts = [domain, `www.${domain}`, `api.${domain}`];
  for (const host of hosts) {
    const [a, aaaa, cname] = await Promise.all([
      query(host, "A"),
      query(host, "AAAA"),
      query(host, "CNAME"),
    ]);
    const aRecords = answerData(a, "A");
    const aaaaRecords = answerData(aaaa, "AAAA");
    const aliases = answerData(cname, "CNAME");
    add(
      `${host} resolves`,
      aRecords.length > 0 || aaaaRecords.length > 0 || aliases.length > 0,
      `A=${aRecords.length}; AAAA=${aaaaRecords.length}; CNAME=${aliases.length}`,
      { baselineFailure: true },
    );
    add(`${host} has IPv6 routing`, aaaaRecords.length > 0, `AAAA=${aaaaRecords.length}`);
  }

  try {
    const apex = await fetchImpl(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    add("apex HTTPS route", apex.status === 200, `HTTP ${apex.status}`, { baselineFailure: true });
  } catch (error) {
    add("apex HTTPS route", false, error instanceof Error ? error.message : String(error), { baselineFailure: true });
  }
  try {
    const www = await fetchImpl(`https://www.${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const location = www.headers.get("location") || "";
    add(
      "www canonical redirect",
      new Set([301, 308]).has(www.status) && location === `https://${domain}/`,
      `HTTP ${www.status}; location=${location || "missing"}`,
      { baselineFailure: true },
    );
  } catch (error) {
    add("www canonical redirect", false, error instanceof Error ? error.message : String(error), { baselineFailure: true });
  }
  try {
    const api = await fetchImpl(`https://api.${domain}/api/health`, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await api.json();
    add(
      "API HTTPS health route",
      api.status === 200 && payload?.ok === true && payload?.service === "jakh-api",
      `HTTP ${api.status}; service=${payload?.service || "missing"}; ok=${payload?.ok === true}`,
      { baselineFailure: true },
    );
  } catch (error) {
    add("API HTTPS health route", false, error instanceof Error ? error.message : String(error), { baselineFailure: true });
  }

  const failedChecks = checks.filter(({ status }) => status === "fail").map(({ name }) => name);
  const warnings = checks.filter(({ status }) => status === "warning").map(({ name }) => name);
  return {
    formatVersion: 1,
    domain,
    strict,
    passed: failedChecks.length === 0,
    failedChecks,
    warnings,
    checks,
  };
}

function parseCli(argv) {
  const options = { domain: "jakh.net", strict: false, dkimSelectors: [], output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--strict") {
      options.strict = true;
      continue;
    }
    if (!new Set(["--domain", "--dkim-selector", "--output"]).has(option)) {
      throw new Error(`unknown option ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    index += 1;
    if (option === "--domain") options.domain = value;
    if (option === "--dkim-selector") options.dkimSelectors.push(value);
    if (option === "--output") options.output = resolve(value);
  }
  return options;
}

async function main(argv) {
  const options = parseCli(argv);
  const result = await verifyDomainControls(options);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, { mode: 0o600 });
    console.log(`Domain-control report written to ${options.output}`);
  } else {
    process.stdout.write(serialized);
  }
  if (!result.passed) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
