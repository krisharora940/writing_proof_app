import type { ProfessorReportResponse } from "./server-boundaries";

export type ReportExportFormat = "html" | "csv" | "pdf";

export type ReportExport = {
  body: string | Uint8Array;
  contentType: string;
  filename: string;
};

export function normalizeReportExportFormat(value: string | null): ReportExportFormat {
  if (value === "csv" || value === "pdf") return value;
  return "html";
}

export function createReportExport(report: ProfessorReportResponse, format: ReportExportFormat, sessionId: string): ReportExport {
  if (format === "csv") {
    return {
      body: createCsv(report),
      contentType: "text/csv; charset=utf-8",
      filename: `writing-report-${sessionId}.csv`
    };
  }

  if (format === "pdf") {
    return {
      body: createPdf(report),
      contentType: "application/pdf",
      filename: `writing-report-${sessionId}.pdf`
    };
  }

  return {
    body: createHtml(report),
    contentType: "text/html; charset=utf-8",
    filename: `writing-report-${sessionId}.html`
  };
}

function createCsv(report: ProfessorReportResponse) {
  const rows = [
    ["section", "group", "title", "detail"],
    ...report.observations.map((item) => ["observation", item.group, item.title, item.detail]),
    ["submitted_text", "", "", report.submittedText],
    ["timed_summary", "", "", report.summaryText]
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function createHtml(report: ProfessorReportResponse) {
  const observations = report.observations.map((item) => (
    `<article><p>${escapeHtml(item.group)}</p><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.detail)}</p></article>`
  )).join("");

  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>Neutral Evidence Report</title>",
    "<style>body{font-family:Arial,sans-serif;line-height:1.5;max-width:920px;margin:40px auto;padding:0 24px;color:#17202a}article{border-top:1px solid #ccd5df;padding:16px 0}p:first-child{font-size:12px;text-transform:uppercase;color:#56616f}pre{white-space:pre-wrap;background:#f6f8fa;padding:16px;border-radius:6px}</style>",
    "</head><body><h1>Neutral Evidence Report</h1>",
    observations || "<p>No observations available.</p>",
    "<h2>Submitted Text</h2>",
    `<pre>${escapeHtml(report.submittedText)}</pre>`,
    "<h2>Timed Summary</h2>",
    `<pre>${escapeHtml(report.summaryText)}</pre>`,
    "</body></html>"
  ].join("");
}

function createPdf(report: ProfessorReportResponse) {
  const lines = [
    "Neutral Evidence Report",
    "",
    ...report.observations.flatMap((item) => [
      `${item.group}: ${item.title}`,
      item.detail,
      ""
    ]),
    "Submitted Text",
    report.submittedText,
    "",
    "Timed Summary",
    report.summaryText
  ].flatMap(wrapLine);
  const stream = `BT /F1 11 Tf 50 760 Td 14 TL ${lines.map((line) => `(${pdfText(line)}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  const offsets: number[] = [];
  let pdf = "%PDF-1.4\n";
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function pdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrapLine(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const lines = [];
  for (let index = 0; index < clean.length; index += 86) {
    lines.push(clean.slice(index, index + 86));
  }
  return lines.slice(0, 42);
}
