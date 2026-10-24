import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/static-site.yml"), "utf8");

function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `${name} job exists`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/u);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

function stepNames(source) {
  return [...source.matchAll(/\n {6}- name: ([^\n]+)/gu)].map((match) => match[1]);
}

function runBlock(source, name) {
  const start = source.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `${name} step exists`);
  const end = source.indexOf("\n      - ", start + 1);
  const lines = (end < 0 ? source.slice(start) : source.slice(start, end)).split("\n");
  const runIndex = lines.findIndex((line) => line === "        run: |");
  assert.ok(runIndex >= 0, `${name} has a run block`);
  // The literal block ends at the first line indented less than its content.
  const block = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line !== "" && !line.startsWith("          ")) break;
    block.push(line.slice(10));
  }
  return block.join("\n");
}

// Steps that held deployment credentials before the split, in their original
// order. They must all still run, unchanged in order, in the deployment job.
const DEPLOYMENT_STEPS = [
  "Require configured production credentials",
  "Verify Cloudflare static-route authority",
  "Capture exact rollback target and baseline",
  "Prove exact static predecessor before authorizing deployment",
  "Prove live API exact source before static deployment",
  "Recheck automatic release permission immediately before deployment",
  "Deploy exact candidate",
  "Capture exact candidate Worker identity before smoke",
  "Smoke exact candidate",
  "Verify active Worker version and release identity",
  "Re-prove live API after static deployment",
  "Verify complete live quarantine contract",
  "Bind live static quarantine proof to the exact candidate Worker",
  "Roll back any unverified release",
  "Verify exact rollback version and build",
  "Finalize release receipt",
  "Retain release and rollback evidence",
];

const VALIDATION_STEPS = [
  "Bind checkout to the authorized commit",
  "Install pinned validation and Worker dependencies",
  "Audit production release tooling",
  "Validate source contracts",
  "Build exact static candidate once",
  "Install Playwright browser matrix",
  "Validate browser matrix",
  "Print browser matrix diagnostics",
  "Validate WCAG browser contracts",
  "Verify static candidate and inventory API dry-run",
];

test("packages are installed and the candidate is validated in a job with no deployment credential", () => {
  const build = job("build");
  assert.match(build, /\n    needs: authorize\n/u);
  assert.match(build, /\n    permissions:\n      contents: read\n    outputs:\n/u, "the build job holds only a read-only token");
  assert.doesNotMatch(build, /environment:|secrets\.|id-token|CLOUDFLARE_[A-Z_]*TOKEN|CLOUDFLARE_ACCOUNT_ID/u);
  const names = stepNames(build);
  assert.deepEqual(names.filter((name) => VALIDATION_STEPS.includes(name)), VALIDATION_STEPS);
  for (const command of ["npm ci --no-audit --no-fund", "npm ci --prefix site-worker --no-audit --no-fund", "npm ci --prefix worker --no-audit --no-fund",
    "npm run test:contracts", "npm run build:site", "playwright install --with-deps chromium firefox webkit", "npm run test:browser:matrix",
    "npm run test:a11y", "wrangler deploy --dry-run", "release-manifest.mjs create", "release-manifest.mjs verify"]) {
    assert.ok(build.includes(command), `build job runs ${command}`);
  }
  for (const output of ["candidate-artifact", "candidate-sha256", "candidate-build-id", "candidate-inventory-sha", "candidate-run-attempt"]) {
    assert.match(build, new RegExp(`\\n      ${output}: \\$\\{\\{ steps\\.`, "u"), output);
  }
  assert.match(build, /uses: actions\/upload-artifact@[a-f0-9]{40} # v[\d.]+\n\s+with:\n\s+name: \$\{\{ steps\.candidate\.outputs\.artifact \}\}/u);
  assert.match(build, /name: Retain validation evidence\n\s+if: \$\{\{ failure\(\) \}\}[\s\S]*name: static-site-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]*retention-days: 90/u);
});

test("the single production job installs only the deployment lockfile and verifies the exact candidate first", () => {
  const release = job("release");
  assert.equal((workflow.match(/\n    environment:/gu) || []).length, 1, "one production approval per manual release");
  assert.match(release, /\n    needs: \[authorize, build\]\n/u);
  assert.match(release, /environment:\n      name: \$\{\{ inputs\.autopilot_run_id != '' && 'autopilot-production' \|\| 'production' \}\}/u);
  assert.deepEqual([...release.matchAll(/npm ci[^\n]*/gu)].map((match) => match[0]), ["npm ci --prefix site-worker --no-audit --no-fund"]);
  assert.doesNotMatch(release, /playwright|test:browser|test:a11y|build:site|npm audit|npm run test|npx /u);
  assert.match(release, /cache-dependency-path: site-worker\/package-lock\.json\n/u);
  assert.doesNotMatch(release, /cd worker\n\s+\.\/node_modules\/\.bin\/wrangler/u, "the API status read uses the static lockfile's Wrangler");
  assert.equal((release.match(/cd worker\n\s+\.\.\/site-worker\/node_modules\/\.bin\/wrangler deployments status --json/gu) || []).length, 2);

  const names = stepNames(release);
  assert.deepEqual(names.filter((name) => DEPLOYMENT_STEPS.includes(name)), DEPLOYMENT_STEPS);
  assert.deepEqual(names.slice(0, names.indexOf(DEPLOYMENT_STEPS[0])), [
    "Bind checkout to the authorized commit",
    "Install pinned static deployment dependencies",
    "Receive the exact validated candidate",
    "Verify the candidate hash, build ID and inventory",
  ]);
  const firstSecret = release.indexOf("secrets.");
  assert.ok(firstSecret > release.indexOf("name: Verify the candidate hash, build ID and inventory"), "no credential before the candidate is proven");
  assert.ok(release.indexOf("npm ci --prefix site-worker") < release.indexOf("name: Verify the candidate hash, build ID and inventory"),
    "install-time scripts run before the candidate is verified");
  assert.match(release, /uses: actions\/download-artifact@[a-f0-9]{40} # v[\d.]+\n\s+with:\n\s+name: \$\{\{ needs\.build\.outputs\.candidate-artifact \}\}/u);
  assert.doesNotMatch(release, /digest-mismatch: (?:ignore|info|warn)/u);
  for (const binding of ["EXPECTED_SHA256: ${{ needs.build.outputs.candidate-sha256 }}", "EXPECTED_BUILD_ID: ${{ needs.build.outputs.candidate-build-id }}",
    "EXPECTED_INVENTORY_SHA: ${{ needs.build.outputs.candidate-inventory-sha }}", "BUILD_RUN_ATTEMPT: ${{ needs.build.outputs.candidate-run-attempt }}"]) {
    assert.ok(release.includes(binding), binding);
  }
  assert.match(release, /name: Retain release and rollback evidence\n\s+if: \$\{\{ always\(\) \}\}[\s\S]*name: static-site-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]*site-worker\/dist\n\s+worker\/migrations\n[\s\S]*retention-days: 90/u);
  assert.match(release, /Candidate inventory SHA: \\`\$\{\{ needs\.build\.outputs\.candidate-inventory-sha \}\}\\`/u);
});

test("the deployment job's reused Wrangler is the exact version the API pins", async () => {
  const lockedWrangler = async (directory) => JSON.parse(await readFile(resolve(repositoryRoot, directory, "package-lock.json"), "utf8"))
    .packages?.["node_modules/wrangler"]?.version;
  const [site, api] = await Promise.all([lockedWrangler("site-worker"), lockedWrangler("worker")]);
  assert.match(site || "", /^\d+\.\d+\.\d+$/u);
  assert.equal(site, api);
});

const hasGnuTar = spawnSync("tar", ["--version"], { encoding: "utf8" }).stdout?.includes("GNU tar")
  && spawnSync("sha256sum", ["--version"]).status === 0;

async function handoffFixture() {
  const root = await mkdtemp(join(tmpdir(), "jakh-static-handoff-"));
  const build = join(root, "build");
  const runner = join(root, "runner");
  await mkdir(join(build, "site-worker/dist/assets"), { recursive: true });
  await mkdir(join(build, "site-worker/generated"), { recursive: true });
  await mkdir(join(runner, "jakh-site-release"), { recursive: true });
  await mkdir(join(runner, "jakh-api-artifact"), { recursive: true });
  await writeFile(join(build, "site-worker/dist/index.html"), "<title>Riddle Arabia</title>\n");
  await writeFile(join(build, "site-worker/dist/assets/app.js"), "console.log('fixture');\n");
  await cp(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), join(build, "site-worker/generated/site-manifest.json"));
  await writeFile(join(build, "site-worker/generated/site-manifest.js"), "export default {};\n");
  await cp(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), join(runner, "jakh-site-release/candidate-manifest.json"));
  await writeFile(join(runner, "jakh-site-release/browser-matrix-diagnostics.json"), "{}\n");
  await writeFile(join(runner, "jakh-api-artifact/index.js"), "export default {};\n");
  await cp(resolve(repositoryRoot, "worker/migrations"), join(build, "worker/migrations"), { recursive: true });
  return { root, build, runner };
}

function bash(script, { cwd, env }) {
  return spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, encoding: "utf8" });
}

test("the hand-off accepts only the byte-identical validated candidate", { skip: !hasGnuTar && "requires GNU tar and sha256sum" }, async () => {
  const { root, build, runner } = await handoffFixture();
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    execFileSync(process.execPath, [resolve(repositoryRoot, "scripts/release-manifest.mjs"), "create", "--source-commit", sha, "--expected-schema", "10",
      "--pages-name", "jakh-static-55-1", "--pages-dir", join(build, "site-worker/dist"), "--worker-name", "jakh-api-55-1",
      "--worker-dir", join(runner, "jakh-api-artifact"), "--migrations-dir", join(build, "worker/migrations"),
      "--output", join(runner, "jakh-site-release/candidate-artifact-inventory.json")], { stdio: "pipe" });
    const inventory = JSON.parse(await readFile(join(runner, "jakh-site-release/candidate-artifact-inventory.json"), "utf8")).releaseSha256;
    const outputs = join(root, "outputs");
    const packaged = bash(runBlock(job("build"), "Package the exact validated candidate"), { cwd: build, env: {
      GITHUB_WORKSPACE: build, RUNNER_TEMP: runner, GITHUB_OUTPUT: outputs, GITHUB_RUN_ID: "55", GITHUB_RUN_ATTEMPT: "1",
      RECEIPT_DIR: join(runner, "jakh-site-release"), API_ARTIFACT_DIR: join(runner, "jakh-api-artifact"), CANDIDATE_DIR: join(runner, "jakh-site-candidate"),
    } });
    assert.equal(packaged.status, 0, packaged.stdout + packaged.stderr);
    const built = Object.fromEntries((await readFile(outputs, "utf8")).trim().split("\n").map((line) => line.split("=")));
    assert.equal(built.artifact, "static-site-candidate-55-1");
    assert.equal(built["run-attempt"], "1");
    const buildManifest = JSON.parse(await readFile(join(build, "site-worker/generated/site-manifest.json"), "utf8"));
    assert.equal(built["build-id"], buildManifest.buildId);
    assert.match(built.sha256, /^[a-f0-9]{64}$/u);

    const verify = runBlock(job("release"), "Verify the candidate hash, build ID and inventory");
    async function deployWorkspace(name, archive) {
      const workspace = join(root, name);
      const deployRunner = join(root, `${name}-runner`);
      await mkdir(join(workspace, "site-worker"), { recursive: true });
      await mkdir(join(deployRunner, "jakh-site-candidate"), { recursive: true });
      await symlink(resolve(repositoryRoot, "scripts"), join(workspace, "scripts"));
      await cp(join(build, "worker/migrations"), join(workspace, "worker/migrations"), { recursive: true });
      await cp(archive, join(deployRunner, "jakh-site-candidate/candidate.tar"));
      return { workspace, deployRunner };
    }
    const runVerify = ({ workspace, deployRunner }, overrides = {}) => bash(verify, { cwd: workspace, env: {
      GITHUB_WORKSPACE: workspace, RUNNER_TEMP: deployRunner, GITHUB_SHA: sha, GITHUB_RUN_ID: "55", GITHUB_RUN_ATTEMPT: "2",
      EXPECTED_SHA256: built.sha256, EXPECTED_BUILD_ID: built["build-id"], EXPECTED_INVENTORY_SHA: inventory, BUILD_RUN_ATTEMPT: "1",
      CANDIDATE_DIR: join(deployRunner, "jakh-site-candidate"), RECEIPT_DIR: join(deployRunner, "jakh-site-release"),
      API_ARTIFACT_DIR: join(deployRunner, "jakh-api-artifact"), ...overrides,
    } });
    const archive = join(runner, "jakh-site-candidate/candidate.tar");

    const genuine = await deployWorkspace("genuine", archive);
    const accepted = runVerify(genuine);
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.match(accepted.stdout, /Verified candidate build [a-f0-9]{64}/u);
    assert.equal(await readFile(join(genuine.workspace, "site-worker/dist/index.html"), "utf8"), "<title>Riddle Arabia</title>\n");
    assert.equal(await readFile(join(genuine.deployRunner, "jakh-site-release/candidate-artifact-inventory.json"), "utf8"),
      await readFile(join(runner, "jakh-site-release/candidate-artifact-inventory.json"), "utf8"));

    for (const [name, overrides, message] of [
      ["wrong-hash", { EXPECTED_SHA256: "0".repeat(64) }, /Candidate archive SHA-256 [a-f0-9]{64} differs/u],
      ["wrong-build", { EXPECTED_BUILD_ID: "0".repeat(64) }, /Candidate build [a-f0-9]{64} differs from the validated build/u],
      ["wrong-inventory", { EXPECTED_INVENTORY_SHA: "0".repeat(64) }, /Candidate inventory [a-f0-9]{64} differs/u],
      ["missing-identity", { EXPECTED_BUILD_ID: "" }, /did not publish a complete candidate identity/u],
    ]) {
      const rejected = runVerify(await deployWorkspace(name, archive), overrides);
      assert.equal(rejected.status, 1, name);
      assert.match(rejected.stdout + rejected.stderr, message, name);
    }

    const occupied = await deployWorkspace("occupied", archive);
    await mkdir(join(occupied.workspace, "site-worker/dist"));
    assert.match(runVerify(occupied).stdout, /already exists before extraction/u);

    // A hostile archive with a matching expected hash still cannot place links
    // or paths outside the candidate roots.
    for (const [name, prepare, message] of [
      ["link", async (dir) => { await mkdir(join(dir, "site-worker/dist"), { recursive: true }); await symlink("/etc/passwd", join(dir, "site-worker/dist/x")); return ["site-worker/dist"]; }, /link or special file/u],
      ["outside", async (dir) => { await mkdir(join(dir, "site-worker/src"), { recursive: true }); await writeFile(join(dir, "site-worker/src/index.js"), "x"); return ["site-worker/src"]; }, /outside the candidate roots/u],
    ]) {
      const hostile = join(root, `${name}-source`);
      await mkdir(hostile, { recursive: true });
      const entries = await prepare(hostile);
      const hostileArchive = join(root, `${name}.tar`);
      execFileSync("tar", ["-cf", hostileArchive, "-C", hostile, ...entries]);
      const hostileSha = execFileSync("sha256sum", [hostileArchive], { encoding: "utf8" }).split(" ")[0];
      const rejected = runVerify(await deployWorkspace(name, hostileArchive), { EXPECTED_SHA256: hostileSha });
      assert.equal(rejected.status, 1, name);
      assert.match(rejected.stdout, message, name);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
