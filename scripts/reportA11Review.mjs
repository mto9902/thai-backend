import { pool } from "../db.js";

const A11_GRAMMAR_IDS = [
  "svo",
  "polite-particles",
  "name-chue",
  "natural-address-pronouns",
  "identity-pen",
  "adjectives",
  "negative-mai",
  "question-mai",
  "question-words",
  "have-mii",
  "no-have-mai-mii",
  "location-yuu",
  "origin-maa-jaak",
  "this-that",
  "not-identity-mai-chai",
  "go-come-pai-maa",
];

function formatCell(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, " ");
}

async function main() {
  const result = await pool.query(
    `
    SELECT
      grammar_id,
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'approved'
      )::int AS approved_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'approved'
          AND tone_status = 'approved'
          AND tone_confidence >= 99
      )::int AS published_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'flagged'
      )::int AS flagged_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'in_review'
      )::int AS in_review_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'needs_changes'
      )::int AS needs_changes_rows,
      COUNT(*) FILTER (
        WHERE review_status = 'hidden'
      )::int AS hidden_rows,
      MIN(tone_confidence)::int AS min_confidence,
      MAX(tone_confidence)::int AS max_confidence,
      ROUND(AVG(tone_confidence)::numeric, 1) AS avg_confidence
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
    GROUP BY grammar_id
    ORDER BY array_position($1::text[], grammar_id)
    `,
    [A11_GRAMMAR_IDS],
  );

  const byId = new Map(result.rows.map((row) => [row.grammar_id, row]));

  const header = [
    formatCell("grammar_id", 28),
    formatCell("total", 7),
    formatCell("published", 10),
    formatCell("approved", 10),
    formatCell("flagged", 9),
    formatCell("review", 8),
    formatCell("changes", 9),
    formatCell("hidden", 8),
    formatCell("min", 5),
    formatCell("avg", 5),
    formatCell("max", 5),
  ].join(" ");

  console.log("A1.1 grammar review summary");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const grammarId of A11_GRAMMAR_IDS) {
    const row = byId.get(grammarId);
    console.log(
      [
        formatCell(grammarId, 28),
        formatCell(row?.total_rows ?? 0, 7),
        formatCell(row?.published_rows ?? 0, 10),
        formatCell(row?.approved_rows ?? 0, 10),
        formatCell(row?.flagged_rows ?? 0, 9),
        formatCell(row?.in_review_rows ?? 0, 8),
        formatCell(row?.needs_changes_rows ?? 0, 9),
        formatCell(row?.hidden_rows ?? 0, 8),
        formatCell(row?.min_confidence ?? "-", 5),
        formatCell(row?.avg_confidence ?? "-", 5),
        formatCell(row?.max_confidence ?? "-", 5),
      ].join(" "),
    );
  }
}

main()
  .catch((err) => {
    console.error("Failed to build A1.1 review summary:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
