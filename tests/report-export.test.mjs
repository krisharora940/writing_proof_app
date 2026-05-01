import assert from "node:assert/strict";
import test from "node:test";

import { createReportExport, normalizeReportExportFormat } from "../lib/report-export.ts";

const report = {
  observations: [{
    group: "Comprehension Check",
    title: "Summary coverage",
    detail: "The timed summary mentions process evidence."
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
  assert.equal(html.filename, "writing-report-session-1.html");

  const csv = createReportExport(report, "csv", "session-1");
  assert.equal(csv.contentType, "text/csv; charset=utf-8");
  assert.match(String(csv.body), /"section","group","title","detail"/);

  const pdf = createReportExport(report, "pdf", "session-1");
  assert.equal(pdf.contentType, "application/pdf");
  assert.ok(pdf.body instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(pdf.body).startsWith("%PDF-1.4"), true);
});
