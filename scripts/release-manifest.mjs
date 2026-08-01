import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SCHEMA_PATTERN = /^[1-9][0-9]*$/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredString(value, label, pattern) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function portablePath(value) {
  return value.split(sep).join("/");
}

function pathContains(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === ""
    || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent));
}

async function inventoryDirectory(directory, label) {
  const absolute = resolve(requiredString(directory, `${label} directory`));
  const stats = await lstat(absolute).catch(() => null);
  if (!stats?.isDirectory()) throw new Error(`${label} directory does not exist: ${absolute}`);
  const root = await realpath(absolute);
  const files = [];

  async function walk(current, prefix = "") {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absoluteEntry = resolve(current, entry.name);
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`${label} contains a symbolic link: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        await walk(absoluteEntry, entryPath);
        continue;
      }
      if (!entry.isFile()) throw new Error(`${label} contains a non-regular file: ${entryPath}`);
      const content = await readFile(absoluteEntry);
      files.push({
        path: portablePath(entryPath),
        bytes: content.byteLength,
        sha256: sha256(content),
      });
    }
  }

  await walk(root);
  const inventoryText = files
    .map((file) => `${file.sha256} ${file.bytes} ${file.path}\n`)
    .join("");
  return {
    root,
    summary: {
      fileCount: files.length,
      totalBytes: files.reduce((total, file) => total + file.bytes, 0),
      sha256: sha256(inventoryText),
      files,
    },
  };
}

function manifestPayload({
  sourceCommit,
  expectedSchema,
  pagesName,
  pages,
  workerName,
  worker,
  migrations,
}) {
  return {
    formatVersion: 1,
    sourceCommit,
    expectedSchema,
    artifacts: {
      pages: { name: pagesName, ...pages },
      worker: { name: workerName, ...worker },
    },
    database: {
      migrations: migrations.files.map((file) => ({
        name: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
      manifestSha256: migrations.sha256,
    },
  };
}

export async function buildReleaseManifest(options) {
  const sourceCommit = requiredString(
    options?.sourceCommit,
    "source commit",
    SOURCE_COMMIT_PATTERN,
  );
  const expectedSchema = requiredString(
    options?.expectedSchema,
    "expected schema",
    SCHEMA_PATTERN,
  );
  const pagesName = requiredString(
    options?.pagesName,
    "Pages artifact name",
    ARTIFACT_NAME_PATTERN,
  );
  const workerName = requiredString(
    options?.workerName,
    "Worker artifact name",
    ARTIFACT_NAME_PATTERN,
  );
  if (pagesName === workerName) throw new Error("Pages and Worker artifact names must differ");

  const [pagesInventory, workerInventory, migrationInventory] = await Promise.all([
    inventoryDirectory(options?.pagesDir, "Pages artifact"),
    inventoryDirectory(options?.workerDir, "Worker artifact"),
    inventoryDirectory(options?.migrationsDir, "migration"),
  ]);
  if (
    pathContains(pagesInventory.root, workerInventory.root)
    || pathContains(workerInventory.root, pagesInventory.root)
  ) {
    throw new Error("Pages and Worker artifact directories must not overlap");
  }
  const migrationFiles = migrationInventory.summary.files;
  if (migrationFiles.length === 0 || migrationFiles.some(({ path }) => !/^\d+_[a-z0-9_]+\.sql$/u.test(path))) {
    throw new Error("migration directory must contain only numbered SQL migration files");
  }

  const payload = manifestPayload({
    sourceCommit,
    expectedSchema,
    pagesName,
    pages: pagesInventory.summary,
    workerName,
    worker: workerInventory.summary,
    migrations: migrationInventory.summary,
  });
  return {
    ...payload,
    releaseSha256: sha256(`${JSON.stringify(payload)}\n`),
  };
}

export async function verifyReleaseManifest(manifest, options) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("release manifest must be a JSON object");
  }
  const expected = await buildReleaseManifest(options);
  if (!isDeepStrictEqual(manifest, expected)) {
    throw new Error(
      `release manifest does not match the supplied artifacts (expected ${expected.releaseSha256}, received ${manifest.releaseSha256 || "missing"})`,
    );
  }
  return expected;
}

function parseCli(argv) {
  const [command, ...args] = argv;
  if (!new Set(["create", "verify"]).has(command)) {
    throw new Error("usage: release-manifest.mjs <create|verify> [options]");
  }
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid option near ${option || "end of arguments"}`);
    }
    if (values.has(option)) throw new Error(`duplicate option ${option}`);
    values.set(option, value);
  }
  const allowed = new Set([
    "--source-commit",
    "--expected-schema",
    "--pages-name",
    "--pages-dir",
    "--worker-name",
    "--worker-dir",
    "--migrations-dir",
    "--output",
    "--manifest",
  ]);
  for (const option of values.keys()) {
    if (!allowed.has(option)) throw new Error(`unknown option ${option}`);
  }
  const options = {
    sourceCommit: values.get("--source-commit"),
    expectedSchema: values.get("--expected-schema"),
    pagesName: values.get("--pages-name"),
    pagesDir: values.get("--pages-dir"),
    workerName: values.get("--worker-name"),
    workerDir: values.get("--worker-dir"),
    migrationsDir: values.get("--migrations-dir"),
  };
  return {
    command,
    options,
    output: values.get("--output"),
    manifestPath: values.get("--manifest"),
  };
}

async function main(argv) {
  const cli = parseCli(argv);
  if (cli.command === "create") {
    if (!cli.output) throw new Error("--output is required for create");
    const output = resolve(cli.output);
    for (const [label, directory] of [
      ["Pages artifact", cli.options.pagesDir],
      ["Worker artifact", cli.options.workerDir],
      ["migration", cli.options.migrationsDir],
    ]) {
      const root = await realpath(resolve(requiredString(directory, `${label} directory`)));
      if (pathContains(root, output)) throw new Error(`output must not be inside the ${label} directory`);
    }
    const manifest = await buildReleaseManifest(cli.options);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(`Release manifest created: ${output} (${manifest.releaseSha256})`);
    return;
  }

  if (!cli.manifestPath) throw new Error("--manifest is required for verify");
  if (cli.output) throw new Error("--output is not valid for verify");
  const manifest = JSON.parse(await readFile(resolve(cli.manifestPath), "utf8"));
  const verified = await verifyReleaseManifest(manifest, cli.options);
  console.log(`Release manifest verified: ${verified.releaseSha256}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
