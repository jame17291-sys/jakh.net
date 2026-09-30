import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const API_WORKFLOW_PATH = ".github/workflows/api-deploy.yml";
const PAGES_WORKFLOW_PATH = ".github/workflows/pages.yml";

export function classifyMonitorWorkflowContext(eventName, event = {}) {
  const strict = { scope: "all", allowCompatibleSchema: false };
  if (eventName !== "workflow_run") return strict;

  const run = event.workflow_run;
  // GitHub's run name can contain the custom run-name, not the workflow name.
  // Workflow paths retain their identity and may include an @ref suffix.
  const workflowPath = typeof run?.path === "string" ? run.path.split("@", 1)[0] : "";
  if (workflowPath === PAGES_WORKFLOW_PATH) return { ...strict, scope: "pages" };
  if (workflowPath !== API_WORKFLOW_PATH) return strict;

  const trustedBranch = typeof event.repository?.default_branch === "string"
    && run.head_branch === event.repository.default_branch;
  const exactCompatibilityTitle = typeof run.head_sha === "string"
    && /^[a-f0-9]{40}$/u.test(run.head_sha)
    && run.display_title === `API compatibility · ${run.head_sha}`;
  return {
    scope: "api",
    allowCompatibleSchema: trustedBranch && run.conclusion === "success" && exactCompatibilityTitle,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const context = classifyMonitorWorkflowContext(process.env.GITHUB_EVENT_NAME, event);
    await appendFile(process.env.GITHUB_OUTPUT,
      `scope=${context.scope}\nallow-compatible-schema=${context.allowCompatibleSchema}\n`, "utf8");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
