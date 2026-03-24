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

async function main() {
  const result = await pool.query(
    `
    SELECT
      id,
      grammar_id,
      thai,
      english,
      sort_order,
      tone_confidence,
      review_status
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
      AND review_status = 'approved'
      AND tone_status = 'approved'
      AND tone_confidence >= 99
    ORDER BY array_position($1::text[], grammar_id), sort_order ASC, id ASC
    `,
    [A11_GRAMMAR_IDS],
  );

  console.log("Published A1.1 rows");
  console.log("");

  for (const row of result.rows) {
    console.log(
      [
        `- ${row.grammar_id} #${row.sort_order + 1}`,
        `[row ${row.id}]`,
        row.thai,
        `=> ${row.english}`,
        `(confidence ${row.tone_confidence})`,
        `/admin/grammar/${row.grammar_id}?row=${row.id}`,
      ].join(" "),
    );
  }

  console.log("");
  console.log(`Total published A1.1 rows: ${result.rows.length}`);
}

main()
  .catch((err) => {
    console.error("Failed to report published A1.1 rows:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
