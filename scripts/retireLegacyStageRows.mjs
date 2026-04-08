import dotenv from "dotenv";

dotenv.config();

import { pool } from "../db.js";

const STAGE_LESSON_IDS = {
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

function parseRequestedStages(argv) {
  const requested = argv.slice(2);
  if (requested.length === 0) {
    return ["A1.1", "A1.2"];
  }

  const invalid = requested.filter((stage) => !STAGE_LESSON_IDS[stage]);
  if (invalid.length > 0) {
    throw new Error(
      `Unknown stages: ${invalid.join(", ")}. Valid stages: ${Object.keys(STAGE_LESSON_IDS).join(", ")}`,
    );
  }

  return requested;
}

async function main() {
  const stages = parseRequestedStages(process.argv);
  const lessonIds = [...new Set(stages.flatMap((stage) => STAGE_LESSON_IDS[stage]))];

  const result = await pool.query(
    `
      UPDATE grammar_examples
      SET publish_state = 'retired',
          quality_flags = CASE
            WHEN quality_flags @> '["legacy"]'::jsonb
              THEN quality_flags
            ELSE quality_flags || '["legacy"]'::jsonb
          END,
          updated_at = NOW()
      WHERE grammar_id = ANY($1::text[])
        AND publish_state <> 'retired'
      RETURNING grammar_id, publish_state
    `,
    [lessonIds],
  );

  const counts = new Map();
  for (const row of result.rows) {
    counts.set(row.grammar_id, (counts.get(row.grammar_id) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        retiredRowCount: result.rowCount,
        stageCount: stages.length,
        stages,
        lessonCount: lessonIds.length,
        perLesson: Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
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
    await pool.end();
  });
