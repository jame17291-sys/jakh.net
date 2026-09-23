/** Focused browser regressions against synthetic, loopback-only admin data. */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  startAdminWorkspaceFixture, SCIENCE_ID, REPORT_ID, MISSING_REPORT_ID,
  REPORT_QUESTION_ID, CURRENT_QUESTION, REPORTED_QUESTION,
} from "./admin-workspace-fixture.mjs";

const fixture = await startAdminWorkspaceFixture();
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.JAKH_BROWSER_EXECUTABLE || (existsSync(macChrome) ? macChrome : undefined);
let browser;
const failures = [];
let passed = 0;

async function eventually(read, predicate, message, timeout = 10_000) {
  const start = Date.now();
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((done) => setTimeout(done, 40));
  } while (Date.now() - start < timeout);
  assert.fail(`${message}: ${JSON.stringify(value)}`);
}

async function visible(page, selector) { await page.locator(selector).first().waitFor({ state: "visible" }); }
async function textContains(page, selector, expected) {
  return eventually(() => page.locator(selector).textContent(), (text) => text?.includes(expected), `${selector} should contain ${expected}`);
}
async function openContent(page) {
  await page.locator("#contentTab").click();
  await visible(page, '[data-content-question]');
}
async function search(page, text) {
  await page.locator("#contentSearch").fill(text);
}
async function openQuestion(page, id) {
  await search(page, id);
  await visible(page, `[data-content-question="${id}"]`);
  await page.locator(`[data-content-question="${id}"]`).click();
  await visible(page, "#contentEditorForm");
  await textContains(page, "#contentEditorTitle", id);
}
function mutations(path) {
  return fixture.getState().requests.filter((request) => request.method !== "GET" && (!path || request.path === path));
}

async function scenario(name, run, { role = "OWNER", lang = "en", viewport = { width: 1440, height: 960 } } = {}) {
  fixture.reset();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== fixture.baseUrl) {
      externalRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  try {
    await page.goto(`${fixture.baseUrl}/admin?role=${role}&lang=${lang}`, { waitUntil: "domcontentloaded" });
    await visible(page, "#adminApp");
    await run(page);
    assert.deepEqual(errors, [], "Admin emitted browser exceptions");
    assert.deepEqual(externalRequests, [], "Synthetic admin attempted to contact an external service");
    console.log(`PASS admin workspace: ${name}`);
    passed++;
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL admin workspace: ${name}\n${error.stack || error}`);
  } finally {
    fixture.releaseAll();
    await context.close();
  }
}

async function assertNoOverflow(page) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return { width, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth };
  });
  assert.ok(result.documentWidth <= result.width + 1 && result.bodyWidth <= result.width + 1, `Horizontal overflow: ${JSON.stringify(result)}`);
}

async function audit(page, label) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  assert.deepEqual(results.violations.map((violation) => ({
    id: violation.id, impact: violation.impact, description: violation.description,
    nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
  })), [], `${label} WCAG violations`);
}

try {
  browser = await chromium.launch({ headless: true, executablePath });

  await scenario("global ID and Arabic search need no category; filters and selection survive navigation", async (page) => {
    await openContent(page);
    assert.equal(await page.locator("#contentCategory").inputValue(), "");
    await search(page, REPORT_QUESTION_ID);
    await visible(page, `[data-content-question="${REPORT_QUESTION_ID}"]`);
    assert.equal(await page.locator("[data-content-question]").count(), 1);
    await search(page, "شرلوك");
    await visible(page, `[data-content-question="${REPORT_QUESTION_ID}"]`);
    assert.equal(await page.locator("[data-content-question]").count(), 1);
    await page.locator(`[data-content-question="${REPORT_QUESTION_ID}"]`).click();
    await textContains(page, "#contentEditorTitle", REPORT_QUESTION_ID);
    await page.locator("#peopleTab").click();
    await visible(page, "#peopleResults .person-card");
    await page.locator("#contentTab").click();
    assert.equal(await page.locator("#contentSearch").inputValue(), "شرلوك");
    await textContains(page, "#contentEditorTitle", REPORT_QUESTION_ID);
    await page.locator("#contentBackButton").click();
    assert.equal(await page.locator("#contentSearch").inputValue(), "شرلوك");
    await visible(page, `[data-content-question="${REPORT_QUESTION_ID}"]`);
    await page.locator("#contentClearFilters").click();
    await eventually(() => page.locator("[data-content-question]").count(), (count) => count === 30, "Default result page should contain 30 cards");
    await page.locator("#contentNextPage").click();
    await eventually(() => page.locator("[data-content-question]").count(), (count) => count === 7, "Second result page should contain remaining seven cards");
    await page.locator("#contentPreviousPage").click();
    await eventually(() => page.locator("[data-content-question]").count(), (count) => count === 30, "Previous page should restore first result set");
  });

  await scenario("overview counts open their matching work queues and clear unrelated library filters", async (page) => {
    await openContent(page);
    await page.locator("#contentCategory").selectOption("science");
    await search(page, SCIENCE_ID);
    await page.locator("#overviewTab").click();
    for (const status of ["LIVE", "DRAFT", "IN_REVIEW"]) {
      await page.locator(`#metricGrid [data-content-queue="${status}"]`).click();
      await visible(page, "[data-content-question]");
      assert.equal(await page.locator("#contentStatus").inputValue(), status);
      assert.equal(await page.locator("#contentCategory").inputValue(), "");
      assert.equal(await page.locator("#contentSearch").inputValue(), "");
      const expected = fixture.getState().edits.filter((edit) => status === "LIVE" ? edit.hasPublishedVersion : edit.workflowStatus === status);
      await eventually(() => page.locator("[data-content-question]").count(), (count) => count === expected.length, `${status} should match its overview count`);
      for (const edit of expected) await visible(page, `[data-content-question="${edit.questionId}"]`);
      if (status === "LIVE") {
        await visible(page, '[data-content-question="science-fixture-004"]');
        await visible(page, `[data-content-question="${REPORT_QUESTION_ID}"]`);
      }
      await page.locator("#overviewTab").click();
    }
    await page.locator('#metricGrid [data-feedback-queue="new"]').click();
    await visible(page, ".feedback-card");
    assert.equal(await page.locator("#feedbackStatus").inputValue(), "new");
    assert.equal(await page.locator(".feedback-card").count(), 2);
  });

  await scenario("editor and preview languages are independent and changing shell language preserves unsaved input", async (page) => {
    await openContent(page);
    await openQuestion(page, SCIENCE_ID);
    await page.locator('[data-editor-language="ar"]').click();
    await visible(page, "#contentQuestionAr");
    const originalArabic = await page.locator("#contentQuestionAr").inputValue();
    await page.locator("#contentQuestionAr").fill(`${originalArabic} تعديل تجريبي`);
    await page.locator("#contentPreviewLanguage").selectOption("ar");
    await textContains(page, "#contentPreviewCard", "تعديل تجريبي");
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator("#contentPreviewCard .content-preview-card").getAttribute("dir"), "rtl");
    await page.locator("#contentPreviewLanguage").selectOption("en");
    await textContains(page, "#contentPreviewCard", "Which gas");
    await visible(page, "#contentQuestionAr");
    let languagePrompts = 0;
    page.on("dialog", async (dialog) => { languagePrompts++; await dialog.dismiss(); });
    await page.locator("#languageToggle").click();
    await eventually(() => page.locator("html").getAttribute("lang"), (value) => value === "ar", "Shell should switch to Arabic");
    assert.equal(languagePrompts, 0, "Language switch preserves the draft and needs no discard prompt");
    assert.equal(await page.locator("#contentQuestionAr").inputValue(), `${originalArabic} تعديل تجريبي`);
    assert.equal(await page.locator("#contentPreviewLanguage").inputValue(), "en");
    await textContains(page, "#contentPreviewCard", "Which gas");
    assert.equal(mutations().length, 0, "Preview and language changes must not write content");
  });

  await scenario("structured sources retain legacy punctuation, reject unsafe URLs, and recover after save failure", async (page) => {
    await openContent(page);
    await openQuestion(page, SCIENCE_ID);
    assert.equal(await page.locator('[data-source-field="title"]').first().inputValue(), "Reference | edition two");
    const url = page.locator('[data-source-field="url"]').first();
    await url.fill("http://example.test/unsafe");
    await page.locator("#contentSaveDraft").click();
    await visible(page, "#contentEditorMessage");
    assert.equal(await url.getAttribute("aria-invalid"), "true", "Invalid URL should be identified on its field");
    assert.equal(mutations(`/api/admin/content/${SCIENCE_ID}`).length, 0, "Invalid source must not be submitted");
    await url.fill("https://example.test/corrected");
    await page.locator('[data-editor-language="en"]').click();
    const changed = "Which gas dominates Earth's atmosphere?";
    await page.locator("#contentQuestionEn").fill(changed);
    fixture.control({ failNextSave: true });
    await page.locator("#contentSaveDraft").click();
    await textContains(page, "#contentEditorMessage", "Fixture save failed");
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), changed);
    assert.equal(await url.inputValue(), "https://example.test/corrected");
    assert.ok(await page.locator("#contentSaveDraft").isEnabled(), "Save must recover after request failure");
    assert.notEqual(fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, changed);
    await page.locator("#contentSaveDraft").click();
    await eventually(() => fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, (value) => value === changed, "Retry should persist edited content");
    await eventually(() => page.locator("#contentEditorMessage").isVisible(), (value) => value === false, "Successful retry should clear save error");
    const saved = fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID);
    assert.equal(saved.draft.sources[0].title, "Reference | edition two");
    assert.equal(saved.draft.sources[0].url, "https://example.test/corrected");
    assert.equal(saved.categorySlug, "science", "Global search must retain the record's category for saving");
  });

  await scenario("a slow save preserves text entered while the request is pending", async (page) => {
    await openContent(page);
    await openQuestion(page, SCIENCE_ID);
    const submitted = "The draft submitted to the server?";
    const newer = "A newer edit typed while saving?";
    await page.locator("#contentQuestionEn").fill(submitted);
    fixture.control({ saveDelayMs: 400 });
    await page.locator("#contentSaveDraft").click();
    await page.locator("#contentQuestionEn").fill(newer);
    await eventually(() => page.locator("#contentSaveDraft").isEnabled(), (value) => value, "Save should complete");
    assert.equal(fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, submitted);
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), newer);
    await textContains(page, "#contentSaveState", "Unsaved");
    fixture.control({ saveDelayMs: 0 });
    await page.locator("#contentSaveDraft").click();
    await eventually(() => fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, (value) => value === newer, "A second save should persist the newer edit");
  });

  await scenario("a delayed refresh cannot replace another question selected and edited during the request", async (page) => {
    await openContent(page);
    await openQuestion(page, SCIENCE_ID);
    await search(page, "");
    const refresh = fixture.holdNext("GET", "/api/admin/content");
    await page.locator("#contentLoadButton").click();
    await eventually(() => refresh.wasReceived(), (received) => received, "Refresh should be waiting on the delayed response");
    await page.locator('[data-content-question="science-fixture-002"]').click();
    const newer = "Question B edited while question A's refresh is pending?";
    await page.locator("#contentQuestionEn").fill(newer);
    refresh.release();
    await eventually(() => page.locator("#contentQuestionList").getAttribute("aria-busy"), (value) => value === "false", "Delayed refresh should settle");
    await textContains(page, "#contentEditorTitle", "science-fixture-002");
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), newer);
    await textContains(page, "#contentSaveState", "Unsaved");
    assert.equal(mutations().length, 0, "Refresh must not implicitly save the newer draft");
  });

  await scenario("a saved edit completed during an older refresh remains saved in both editor and library", async (page) => {
    await openContent(page);
    await openQuestion(page, SCIENCE_ID);
    await search(page, "");
    const refresh = fixture.holdNext("GET", "/api/admin/content");
    await page.locator("#contentLoadButton").click();
    await eventually(() => refresh.wasReceived(), (received) => received, "Refresh should capture the old server snapshot");
    const saved = "This edit was saved after refresh began?";
    await page.locator("#contentQuestionEn").fill(saved);
    await page.locator("#contentSaveDraft").click();
    await eventually(() => fixture.getState().edits.find((edit) => edit.questionId === SCIENCE_ID).draft.question.en, (value) => value === saved, "Save should complete while refresh remains pending");
    await eventually(() => page.locator("#contentSaveDraft").isEnabled(), (value) => value, "Save should finish its UI update");
    refresh.release();
    await eventually(() => page.locator("#contentQuestionList").getAttribute("aria-busy"), (value) => value === "false", "Older refresh should settle");
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), saved);
    await textContains(page, "#contentEditorTitle", "v4");
    assert.doesNotMatch(await page.locator("#contentSaveState").textContent(), /unsaved/iu);
    await page.locator('[data-content-question="science-fixture-002"]').click();
    await page.locator(`[data-content-question="${SCIENCE_ID}"]`).click();
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), saved, "Reopening from the library must use the saved version, not the stale refresh snapshot");
  });

  await scenario("dirty navigation cancellation retains edits and accepted discard loads the next question", async (page) => {
    await openContent(page);
    await page.locator("#contentCategory").selectOption("science");
    await visible(page, `[data-content-question="${SCIENCE_ID}"]`);
    await page.locator(`[data-content-question="${SCIENCE_ID}"]`).click();
    await page.locator("#contentQuestionEn").fill("Unsaved question remains available?");
    let prompt;
    page.once("dialog", async (dialog) => { prompt = dialog.message(); await dialog.dismiss(); });
    await page.locator('[data-content-question="science-fixture-002"]').click();
    assert.ok(prompt, "Changing the selected question should ask before discarding");
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), "Unsaved question remains available?");
    await textContains(page, "#contentEditorTitle", SCIENCE_ID);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-content-question="science-fixture-002"]').click();
    await textContains(page, "#contentEditorTitle", "science-fixture-002");
    assert.equal(await page.locator("#contentQuestionEn").inputValue(), "Science fixture question 2?");
    assert.equal(mutations().length, 0, "Discard must not silently persist the abandoned draft");
  });

  await scenario("report links show original and current wording, missing records are explicit, resolution notes persist", async (page) => {
    await page.locator("#feedbackTab").click();
    await visible(page, `#feedbackResults [data-feedback-open-question="${REPORT_ID}"]`);
    await page.locator(`#feedbackResults [data-feedback-open-question="${REPORT_ID}"]`).click();
    await textContains(page, "#contentEditorTitle", REPORT_QUESTION_ID);
    await textContains(page, "#contentReportContext", REPORTED_QUESTION);
    await textContains(page, "#contentReportContext", CURRENT_QUESTION);
    assert.match(await page.locator("#contentReportContext").textContent(), /differ|chang|match/iu, "Changed report wording should be explained");
    await page.locator("[data-return-feedback]").click();
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const note = "Verified the revised question against its source; original report retained.";
    await page.locator(`[data-feedback-resolution="${REPORT_ID}"]`).fill(note);
    await page.locator(`[data-feedback-save-note="${REPORT_ID}"]`).click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote?.text, (value) => value === note, "Resolution note should persist");
    const report = fixture.getState().suggestions.find((item) => item.id === REPORT_ID);
    assert.equal(report.status, "new", "Saving a note must not change report status");
    assert.ok(report.text.includes(REPORTED_QUESTION), "The original report should remain unchanged");
    await page.locator(`#feedbackResults [data-feedback-open-question="${MISSING_REPORT_ID}"]`).click();
    await textContains(page, "#contentReportContext", "tv-shows-removed-999");
    assert.match(await page.locator("#contentReportContext").textContent(), /not (?:be )?found|no longer|missing|unavailable/iu, "Missing content should show an explicit explanation");
  });

  await scenario("administrator cannot publish their own draft; independent review remains available", async (page) => {
    await openContent(page);
    await openQuestion(page, "science-fixture-002");
    await visible(page, "#contentPublish");
    assert.equal(await page.locator("#contentPublish").isDisabled(), true);
    await textContains(page, "#contentEditorMessage", "Another administrator");
    await page.locator("#contentBackButton").click();
    await openQuestion(page, "science-fixture-003");
    assert.equal(await page.locator("#contentPublish").isEnabled(), true);
    await page.locator("#contentPublish").click();
    await visible(page, "#reauthDialog[open]");
    assert.equal(mutations().length, 0, "Publish must await password confirmation");
    await page.locator("#reauthCancel").click();
  }, { role: "ADMIN" });

  await scenario("failed note saves and failed status changes preserve the entered resolution text", async (page) => {
    await page.locator("#feedbackTab").click();
    const input = page.locator(`[data-feedback-resolution="${REPORT_ID}"]`);
    const save = page.locator(`[data-feedback-save-note="${REPORT_ID}"]`);
    const status = page.locator(`[data-feedback-status="${REPORT_ID}"]`);
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const firstNote = "The note must remain available after a temporary save failure.";
    await input.fill(firstNote);
    fixture.control({ failNextNote: true });
    await save.click();
    await textContains(page, "#toastRegion", "Fixture note could not be saved");
    assert.equal(await input.inputValue(), firstNote);
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote, null);
    await eventually(() => save.isEnabled(), (enabled) => enabled, "Note save button should recover");
    await save.click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote?.text, (value) => value === firstNote, "Retry should preserve and save the note");
    await eventually(() => input.inputValue(), (value) => value === "", "Successful note save should clear the composition field");

    const secondNote = "Checked both languages and implemented the correction.";
    await input.fill(secondNote);
    fixture.control({ failNextNote: true });
    await status.selectOption("implemented");
    await visible(page, "#actionReviewDialog[open]");
    assert.equal(await page.locator("#actionReviewReason").inputValue(), secondNote, "Status review should carry the resolution note into its audit reason");
    await page.locator("#actionReviewConfirm").click();
    await eventually(() => status.inputValue(), (value) => value === "new", "Failed status change should restore previous state");
    assert.equal(await input.inputValue(), secondNote, "Failure must retain the user's note");
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).status, "new");
    await status.selectOption("implemented");
    await visible(page, "#actionReviewDialog[open]");
    await page.locator("#actionReviewConfirm").click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).status, (value) => value === "implemented", "Status retry should succeed");
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote.text, secondNote);
  });

  await scenario("resolution drafts survive language changes, pagination, report navigation and another note save", async (page) => {
    fixture.control({ feedbackPageSize: 2 });
    await page.locator("#feedbackTab").click();
    const note = page.locator(`[data-feedback-resolution="${REPORT_ID}"]`);
    const other = page.locator(`[data-feedback-resolution="${MISSING_REPORT_ID}"]`);
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const draft = "Unsubmitted investigation notes must remain available throughout review.";
    const otherDraft = "Another report can be saved without losing the first draft.";
    await note.fill(draft);
    await other.fill(otherDraft);
    await page.locator("#languageToggle").click();
    assert.equal(await note.inputValue(), draft);
    assert.equal(await other.inputValue(), otherDraft);
    await page.locator("#languageToggle").click();
    await page.locator("#loadMoreFeedback").click();
    await eventually(() => page.locator("#feedbackResults .feedback-card").count(), (count) => count === 3, "Load more should append the remaining report");
    assert.equal(await note.inputValue(), draft);
    assert.equal(await other.inputValue(), otherDraft);
    await page.locator(`#feedbackResults [data-feedback-open-question="${REPORT_ID}"]`).click();
    await textContains(page, "#contentEditorTitle", REPORT_QUESTION_ID);
    await page.locator("[data-return-feedback]").click();
    assert.equal(await note.inputValue(), draft);
    assert.equal(await other.inputValue(), otherDraft);
    await page.locator(`[data-feedback-save-note="${MISSING_REPORT_ID}"]`).click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === MISSING_REPORT_ID).resolutionNote?.text, (value) => value === otherDraft, "The second report note should save");
    await eventually(() => other.inputValue(), (value) => value === "", "The submitted second draft should clear");
    assert.equal(await note.inputValue(), draft, "Saving a different report must not discard this draft");
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote, null, "Preserved text should remain an unsaved draft");
  });

  await scenario("skip-to-content keyboard navigation preserves dirty feedback without asking to discard", async (page) => {
    await page.locator("#feedbackTab").click();
    const note = page.locator(`[data-feedback-resolution="${REPORT_ID}"]`);
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const draft = "Keyboard navigation within this page must retain the investigation draft.";
    await note.fill(draft);
    const prompts = [];
    page.on("dialog", async (dialog) => { prompts.push(dialog.message()); await dialog.dismiss(); });
    await page.locator(".skip-link").focus();
    await page.locator(".skip-link").press("Enter");
    await eventually(() => new URL(page.url()).hash, (hash) => hash === "#main", "Skip link should navigate to the content fragment");
    assert.deepEqual(prompts, [], "Same-page navigation must not trigger a discard prompt");
    assert.equal(await page.locator("#main").evaluate((main) => document.activeElement === main), true);
    assert.equal(await note.inputValue(), draft);
    await page.locator("#languageToggle").click();
    assert.equal(await note.inputValue(), draft, "Skip link must not clear the persistent draft map");
    assert.equal(mutations().length, 0);
  });

  await scenario("slow resolution note save preserves newer typing and prevents a competing status mutation", async (page) => {
    await page.locator("#feedbackTab").click();
    const note = page.locator(`[data-feedback-resolution="${REPORT_ID}"]`);
    const save = page.locator(`[data-feedback-save-note="${REPORT_ID}"]`);
    const status = page.locator(`[data-feedback-status="${REPORT_ID}"]`);
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const submitted = "The resolution note submitted first.";
    const newer = "New evidence typed while the first note is still saving.";
    await note.fill(submitted);
    const pending = fixture.holdNext("PATCH", `/api/admin/suggestions/${REPORT_ID}`);
    await save.click();
    await eventually(() => pending.wasReceived(), (received) => received, "Note request should be held for the race");
    assert.equal(await status.isDisabled(), true, "Status must be locked while a note for this report is saving");
    assert.equal(await save.isDisabled(), true);
    await note.fill(newer);
    pending.release();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote?.text, (value) => value === submitted, "Only the submitted snapshot should reach the server");
    await eventually(() => save.isEnabled(), (value) => value, "Note controls should unlock after completion");
    assert.equal(await note.inputValue(), newer);
    assert.equal(await status.isEnabled(), true);
    await save.click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote?.text, (value) => value === newer, "A second explicit save should persist the newer draft");
  });

  await scenario("status and note mutations for one report cannot race and reopen completed feedback", async (page) => {
    await page.locator("#feedbackTab").click();
    const note = page.locator(`[data-feedback-resolution="${REPORT_ID}"]`);
    const save = page.locator(`[data-feedback-save-note="${REPORT_ID}"]`);
    const status = page.locator(`[data-feedback-status="${REPORT_ID}"]`);
    await visible(page, `[data-feedback-resolution="${REPORT_ID}"]`);
    const resolution = "Verified and implemented the question correction.";
    const followup = "Additional resolution context written during the status update.";
    await note.fill(resolution);
    await status.selectOption("implemented");
    await visible(page, "#actionReviewDialog[open]");
    const pending = fixture.holdNext("PATCH", `/api/admin/suggestions/${REPORT_ID}`);
    await page.locator("#actionReviewConfirm").click();
    await eventually(() => pending.wasReceived(), (received) => received, "Status update should be held for the race");
    assert.equal(await save.isDisabled(), true, "A note save cannot be submitted against the previous status");
    assert.equal(await status.isDisabled(), true);
    await note.fill(followup);
    assert.equal(mutations(`/api/admin/suggestions/${REPORT_ID}`).length, 1);
    pending.release();
    await eventually(() => save.isEnabled(), (value) => value, "Report controls should unlock after status finishes");
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).status, "implemented");
    assert.equal(await note.inputValue(), followup);
    assert.equal(await status.inputValue(), "implemented");
    await save.click();
    await eventually(() => fixture.getState().suggestions.find((item) => item.id === REPORT_ID).resolutionNote?.text, (value) => value === followup, "Follow-up note should save after status completion");
    assert.equal(fixture.getState().suggestions.find((item) => item.id === REPORT_ID).status, "implemented");
    assert.deepEqual(mutations(`/api/admin/suggestions/${REPORT_ID}`).map((request) => request.body.status), ["implemented", "implemented"], "The subsequent note must use the newly completed status");
  });

  await scenario("owner self-publish still requires password confirmation and a reason", async (page) => {
    await openContent(page);
    await openQuestion(page, "science-fixture-003");
    assert.equal(await page.locator("#contentPublish").isEnabled(), true);
    await page.locator("#contentPublish").click();
    await visible(page, "#reauthDialog[open]");
    await page.locator("#reauthPassword").fill("synthetic-fixture-password");
    await page.locator("#reauthSubmit").click();
    await visible(page, "#actionReviewDialog[open]");
    await page.locator("#actionReviewConfirm").click();
    await visible(page, "#actionReviewReasonError");
    assert.equal(mutations("/api/admin/content/science-fixture-003/publish").length, 0);
    await page.locator("#actionReviewReason").fill("Owner reviewed both languages against source material.");
    await page.locator("#actionReviewConfirm").click();
    await eventually(() => fixture.getState().edits.find((edit) => edit.questionId === "science-fixture-003").workflowStatus, (status) => status === "PUBLISHED", "Reviewed owner override should publish only after both safeguards");
    assert.equal(mutations("/api/admin/content/science-fixture-003/publish").length, 1);
  });

  for (const lang of ["en", "ar"]) {
    for (const width of [1440, 640, 390]) {
      await scenario(`${lang.toUpperCase()} accessibility and reflow at ${width}px`, async (page) => {
        await visible(page, "#metricGrid .metric-card");
        await assertNoOverflow(page);
        await audit(page, `${lang} overview at ${width}`);
        await openContent(page);
        await assertNoOverflow(page);
        await audit(page, `${lang} library at ${width}`);
        await openQuestion(page, SCIENCE_ID);
        await page.locator(`[data-editor-language="${lang}"]`).click();
        await page.locator("#contentPreviewLanguage").selectOption(lang);
        const englishTab = page.locator('[data-editor-language="en"]');
        await englishTab.focus();
        await englishTab.press("Tab");
        assert.equal(await page.locator('[data-editor-language="ar"]').evaluate((element) => document.activeElement === element), true);
        await page.keyboard.press("Enter");
        assert.equal(await page.locator('[data-editor-language="ar"]').getAttribute("aria-pressed"), "true", "Native language controls should activate using Enter");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        assert.equal(await page.locator('[data-editor-language="compare"]').getAttribute("aria-pressed"), "true");
        await visible(page, "#contentQuestionEn");
        await visible(page, "#contentQuestionAr");
        assert.equal(await page.locator("#contentQuestionEn").getAttribute("dir"), "ltr");
        assert.equal(await page.locator("#contentQuestionEn").getAttribute("lang"), "en");
        await page.locator(`[data-editor-language="${lang}"]`).click();
        await assertNoOverflow(page);
        await audit(page, `${lang} editor at ${width}`);
        const saveControls = await page.locator("#contentSaveDraft").evaluate((button) => {
          let node = button;
          while (node && !["sticky", "fixed"].includes(getComputedStyle(node).position)) node = node.parentElement;
          return node ? { position: getComputedStyle(node).position, bottom: getComputedStyle(node).bottom } : null;
        });
        assert.ok(saveControls, "Save actions must have a persistent sticky/fixed ancestor");
        await page.locator(`#contentQuestion${lang === "ar" ? "Ar" : "En"}`).focus();
        assert.equal(await page.locator(`#contentQuestion${lang === "ar" ? "Ar" : "En"}`).evaluate((element) => element === document.activeElement), true);
        await page.locator("#feedbackTab").click();
        await visible(page, ".feedback-card");
        await assertNoOverflow(page);
        await audit(page, `${lang} feedback at ${width}`);
        await page.locator("#autopilotTab").click();
        await visible(page, "#autopilotPanel");
        assert.equal(await page.locator("#adminTabs [data-tab]:visible").count(), 7, "Owner navigation should expose the seven supported tabs");
        await assertNoOverflow(page);
        await audit(page, `${lang} autopilot at ${width}`);
        assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
      }, { lang, viewport: { width, height: width === 640 ? 400 : 900 } });
    }
  }

  for (const lang of ["en", "ar"]) {
    for (const width of [320, 375]) {
      await scenario(`${lang.toUpperCase()} maximum-source fields remain unobscured by sticky save controls at ${width}px`, async (page) => {
        await openContent(page);
        await openQuestion(page, SCIENCE_ID);
        for (let index = 1; index < 8; index++) {
          await page.locator("#contentAddSource").click();
          await page.locator('[data-source-field="title"]').last().fill(`Reference ${index + 1}`);
          await page.locator('[data-source-field="publisher"]').last().fill("Fixture reference library");
          await page.locator('[data-source-field="url"]').last().fill(`https://example.test/reference/${index + 1}`);
        }
        assert.equal(await page.locator('[data-source-field="url"]').count(), 8);
        const lastUrl = page.locator('[data-source-field="url"]').last();
        await lastUrl.focus();
        await eventually(() => lastUrl.evaluate((input) => {
          const rect = input.getBoundingClientRect();
          const actions = document.querySelector(".content-editor-actions").getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return {
            visible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.bottom <= actions.top + 1,
            hit: document.elementFromPoint(centerX, centerY) === input,
            rect: { top: rect.top, bottom: rect.bottom },
            actions: { top: actions.top, bottom: actions.bottom },
          };
        }), (result) => result.visible && result.hit, "Focused last source URL must remain visible above sticky actions");
        await assertNoOverflow(page);
      }, { lang, viewport: { width, height: 800 } });
    }
  }
} finally {
  await browser?.close();
  await fixture.close();
}

console.log(`Admin workspace browser regression: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
