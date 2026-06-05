import assert from "node:assert/strict";
import test from "node:test";

import { createReportExport, normalizeReportExportFormat } from "../lib/report-export.ts";

const report = {
  observations: [{
    group: "Comprehension Check",
    title: "Summary coverage",
    detail: "The timed summary mentions process evidence."
  }],
  tags: [],
  behavioralRisk: {
    totalPoints: 0,
    highCount: 0,
    mediumCount: 0,
    positiveCount: 0,
    signals: []
  },
  authorCheck: {
    similarityPercent: 12,
    flag: "green",
    flagLabel: "More Typical",
    flagDetail: "The recorded process indicators looked relatively typical overall (12%).",
    writingPatternChecks: [],
    styleConsistencyChecks: [],
    sourceHighlights: []
  },
  pasteEventCards: [{
    id: "paste-card-1",
    eventId: "event-1",
    at: 1000,
    title: "Paste event",
    detail: "12 words were inserted through paste input.",
    wordCount: 12,
    characterCount: 72,
    textPreview: "Pasted text preview",
    tagIds: [],
    replayFrameIndex: 1
  }],
  timelineMarkers: [{
    id: "timeline-paste-1",
    eventId: "event-1",
    at: 1000,
    kind: "paste-event",
    label: "Paste input",
    detail: "12 words were inserted through paste input.",
    tagIds: [],
    replayFrameIndex: 1
  }],
  frames: [],
  submittedText: "Process evidence supports fair review.",
  summaryText: "The summary mentions process evidence."
};

test("normalizeReportExportFormat defaults to html", () => {
  assert.equal(normalizeReportExportFormat(null), "html");
  assert.equal(normalizeReportExportFormat("bad"), "html");
  assert.equal(normalizeReportExportFormat("csv"), "csv");
  assert.equal(normalizeReportExportFormat("pdf"), "pdf");
});

test("createReportExport creates html, csv, and pdf payloads", () => {
  const html = createReportExport(report, "html", "session-1");
  assert.equal(html.contentType, "text/html; charset=utf-8");
  assert.match(String(html.body), /Neutral Evidence Report/);
  assert.match(String(html.body), /Paste Event Cards/);
  assert.match(String(html.body), /Timeline Markers/);
  assert.equal(html.filename, "writing-report-session-1.html");

  const csv = createReportExport(report, "csv", "session-1");
  assert.equal(csv.contentType, "text/csv; charset=utf-8");
  assert.match(String(csv.body), /"section","group","title","detail"/);
  assert.match(String(csv.body), /"paste_card"/);
  assert.match(String(csv.body), /"timeline_marker"/);

  const pdf = createReportExport(report, "pdf", "session-1");
  assert.equal(pdf.contentType, "application/pdf");
  assert.ok(pdf.body instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(pdf.body).startsWith("%PDF-1.4"), true);
});
