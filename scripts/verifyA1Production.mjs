import { pool } from "../db.js";

const lessons = [
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
  "progressive-kamlang",
  "very-maak",
  "experience-koey",
  "conjunction-and-but",
  "because-phraw",
];

const counts = await pool.query(
  "select grammar_id, count(*) filter (where publish_state='published')::int as published_count, count(*) filter (where publish_state='published' and coalesce(quality_flags, '[]'::jsonb) @> '[\"new_gen\"]'::jsonb)::int as published_new_gen_count, count(*) filter (where publish_state='retired')::int as retired_count from grammar_examples where grammar_id = any($1) group by grammar_id order by grammar_id",
  [lessons],
);

const missing = await pool.query(
  "select ge.grammar_id, count(*)::int as missing_count from grammar_examples ge cross join lateral jsonb_array_elements(ge.breakdown) item where ge.grammar_id = any($1) and ge.publish_state='published' and (not (item ? 'tones') or jsonb_array_length(item->'tones')=0) group by ge.grammar_id order by ge.grammar_id",
  [lessons],
);

const samples = {};
for (const lesson of [
  "very-maak",
  "experience-koey",
  "conjunction-and-but",
  "because-phraw",
  "place-words",
]) {
  const result = await pool.query(
    "select sort_order, thai, english from grammar_examples where grammar_id=$1 and publish_state='published' order by sort_order asc limit 3",
    [lesson],
  );
  samples[lesson] = result.rows;
}

console.log(JSON.stringify({ counts: counts.rows, missing: missing.rows, samples }, null, 2));
await pool.end();
