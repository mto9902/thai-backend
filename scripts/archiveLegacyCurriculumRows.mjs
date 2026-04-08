import dotenv from "dotenv";

dotenv.config();

import { pool } from "../db.js";

const CURRICULUM_GRAMMAR_IDS = [
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
  "tend-to-mak-ja",
  "rather-khon-khang",
  "too-much-koen-pai",
  "just-in-time-pho-di",
  "to-be-khue-vs-pen",
  "reciprocal-kan",
  "beneficial-hai",
  "do-in-advance-wai",
  "continuation-aspect",
  "about-concerning-kiaw-kap",
  "also-kor",
  "prefer-di-kwa",
  "cause-result-phro-wa",
  "cause-result-tham-hai",
  "cause-result-jueng",
  "sequence-laew-kor",
  "sequence-jaak-nan",
  "sequence-nai-thi-sut",
  "not-yet-yang",
  "intermediate-negation",
  "reflexive-tua-eng",
  "distributive-tae-la",
  "intention-tang-jai",
  "almost-kueap",
  "barely-thaep-ja",
  "extent-jon",
  "since-tang-tae",
  "every-time-thuk-khrang-thi",
  "depends-on-khun-yu-kap",
  "so-that-ja-dai",
  "instead-of-thaen-thi-ja",
  "indirect-questions-ru-plao",
  "expanded-relative-structures",
  "perspective-marker-samrap",
  "opinion-marker-nai-khwam-hen",
  "stance-marker-tam-thi-chan-hen",
  "nominalization-karn-khwam",
  "contrast-tae-thawaa",
  "concession-maewaa",
  "concession-thang-thi",
  "result-complements-b1",
  "serial-verbs-motion",
  "serial-verbs-manner",
  "serial-verbs-causative",
  "time-clause-phoo-kor",
  "time-clause-tangtae",
  "time-clause-rawang",
  "time-clause-tanthii",
  "about-to-kamlangja",
  "gradually-khoi-khoi",
  "secretly-aep",
  "by-chance-bang-oen",
  "unintentionally-mai-dai-tang-jai",
  "probability-khong-ja",
  "expectation-naa-ja",
  "inevitability-yom",
  "obligation-phueng",
  "as-expected-yang-thi-khit",
  "according-to-tam-thi",
  "in-case-phuea-wa",
  "as-long-as-trap-dai-thi",
  "worth-doing-khum-kha",
  "waste-sia",
  "proportional-ying-ying",
  "equal-comparison-thao-kan",
  "similarity-khlaai-kap",
  "difference-taang-jaak",
  "only-piang-thaonan",
  "especially-doey-phro",
  "at-least-most-yaang",
  "exclusively-chaphaw",
  "particle-leuy-emphasis",
  "particle-thiiediaw",
  "particle-chiew",
  "particle-si-sa",
  "particle-na-softener",
  "particle-la-topic-shift",
  "particle-na-la-contrast",
  "particle-naw-casual-confirm",
  "particle-waa-mai",
  "rhetorical-mi-chai-rue",
  "turns-out-klai-pen-wa",
  "pretend-klaeng",
  "definitive-sa-sia",
  "regret-sia-dai",
  "no-wonder-mina-la",
  "to-the-point-of-thung-khap",
  "apart-from-nok-jak",
  "not-only-but-also-mai-phiang-tae",
  "unless-wen-tae",
  "even-mae-tae",
  "let-alone-nap-prasa-arai",
  "as-if-rao-kap-wa",
  "causative-tham-hai",
  "causative-hai-complex",
  "passive-don-vs-thuuk",
  "passive-subject-affected",
  "cleft-kaan-thi-khue",
  "complementizer-waa-complex",
  "fronted-adverbial-clause",
  "elaboration-marker-khue",
  "topic-introducer-samrap",
  "concessive-marker-yaang-rai-kor",
  "addition-marker-nok-jaak-nan",
  "therefore-formal-jueng",
  "although-formal-maewaa",
  "consequently-song-phal",
  "in-contrast-formal-nai-khana",
  "once-phor",
  "keep-doing-ruai",
  "supposed-to-khuan-ja",
  "seems-like-duu",
  "scope-thao-thi",
  "clarification-mai-dai-pla-wa",
  "correction-mai-chai-wa-tae",
  "evaluation-thue-wa-nap-wa",
  "concessive-mae",
  "even-if-tor-hai",
  "no-matter-mai-waa",
  "scope-kor-taam",
  "even-mae-tae-c1",
  "resultative-hai",
  "consequence-song-phon",
  "cause-duay-het-thi",
  "the-more-ying",
  "result-extreme-thueng-khan",
  "passive-formal",
  "nominalization-karn-thi",
  "formal-evaluation-thue-pen",
  "procedural-doi",
  "clarification-klao-kue",
  "however-yangrai-kor-taam",
  "contrast-nai-thang-trong-kham",
  "framing-thang-nii",
  "case-nai-karani-thi",
];

const PRESERVE_NEW_STANDARD_GRAMMAR_IDS = [
  "past-laew",
  "recent-past-phoeng",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
  "permission-dai",
  "skill-pen",
];

async function main() {
  const preservedCleanup = await pool.query(
    `
      UPDATE grammar_examples
      SET quality_flags = quality_flags - 'legacy',
          updated_at = NOW()
      WHERE grammar_id = ANY($1::text[])
        AND quality_flags @> '["legacy"]'::jsonb
      RETURNING grammar_id
    `,
    [PRESERVE_NEW_STANDARD_GRAMMAR_IDS],
  );

  const legacyResult = await pool.query(
    `
      UPDATE grammar_examples
      SET quality_flags = CASE
        WHEN quality_flags @> '["legacy"]'::jsonb
          THEN quality_flags
        ELSE quality_flags || '["legacy"]'::jsonb
      END,
      updated_at = NOW()
      WHERE grammar_id = ANY($1::text[])
        AND grammar_id <> ALL($2::text[])
        AND publish_state <> 'retired'
      RETURNING grammar_id
    `,
    [CURRICULUM_GRAMMAR_IDS, PRESERVE_NEW_STANDARD_GRAMMAR_IDS],
  );

  const counts = new Map();
  for (const row of legacyResult.rows) {
    counts.set(row.grammar_id, (counts.get(row.grammar_id) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        preservedCleanedRows: preservedCleanup.rowCount,
        archivedLegacyRows: legacyResult.rowCount,
        preservedLessons: PRESERVE_NEW_STANDARD_GRAMMAR_IDS,
        archivedLessonCount: counts.size,
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
