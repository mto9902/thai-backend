import dotenv from "dotenv";

dotenv.config();

import { pool } from "../db.js";

const STAGE_GRAMMAR_IDS = {
  "A1.1": [
    "svo",
    "negative-mai",
    "identity-pen",
    "polite-particles",
    "name-chue",
    "question-mai",
    "question-words",
    "have-mii",
    "no-have-mai-mii",
    "location-yuu",
    "adjectives",
    "this-that",
    "go-come-pai-maa",
    "origin-maa-jaak",
    "not-identity-mai-chai",
    "natural-address-pronouns",
  ],
  "A1.2": [
    "place-words",
    "possession-khong",
    "want-yaak",
    "request-khor",
    "classifiers",
    "price-thaorai",
    "time-expressions",
    "imperatives",
    "negative-imperative-ya",
    "can-dai",
    "future-ja",
    "very-maak",
    "progressive-kamlang",
    "experience-koey",
    "conjunction-and-but",
    "because-phraw",
  ],
  "A2.1": [
    "past-laew",
    "recent-past-phoeng",
    "duration-penwela-manan",
    "female-particles-kha-kha",
    "frequency-adverbs",
    "like-chorp",
    "knowledge-ruu-ruujak",
    "skill-pen",
    "permission-dai",
    "quantifiers-thuk-bang-lai",
    "sequence-conjunctions",
    "comparison-kwaa",
    "relative-thi",
    "reported-speech",
  ],
  "A2.2": [
    "endurance-wai",
    "superlative",
    "must-tong",
    "should-khuan",
    "prefix-naa-adjective",
    "feelings-rusuek",
    "try-lawng",
    "resultative-ok-samret",
    "passive-tuuk",
    "conditionals",
    "change-state-khuen-long",
    "in-order-to-phuea",
  ],
};

function parseArgs(argv) {
  const options = {
    stage: "",
    publishState: "published",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--stage") {
      options.stage = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--publish-state") {
      options.publishState = argv[index + 1] ?? "published";
      index += 1;
    }
  }

  return options;
}

async function main() {
  const { stage, publishState } = parseArgs(process.argv.slice(2));
  if (!stage) {
    throw new Error("Missing required --stage argument");
  }

  const grammarIds = STAGE_GRAMMAR_IDS[stage];
  if (!Array.isArray(grammarIds) || grammarIds.length === 0) {
    throw new Error(`No grammar list configured for stage ${stage}`);
  }
  const updateResult = await pool.query(
    `
      UPDATE grammar_examples
      SET quality_flags = CASE
        WHEN quality_flags @> '["legacy"]'::jsonb
          THEN quality_flags
        ELSE quality_flags || '["legacy"]'::jsonb
      END,
      updated_at = NOW()
      WHERE grammar_id = ANY($1::text[])
        AND publish_state = $2
      RETURNING grammar_id
    `,
    [grammarIds, publishState],
  );

  const counts = new Map();
  for (const row of updateResult.rows) {
    counts.set(row.grammar_id, (counts.get(row.grammar_id) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        stage,
        publishState,
        lessonCount: grammarIds.length,
        updatedRows: updateResult.rowCount,
        byGrammar: Object.fromEntries(
          [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
