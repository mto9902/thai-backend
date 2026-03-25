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

const KEEP_COUNT = 25;

const SUSPICIOUS_PATTERNS = [
  /มเหสี/u,
  /มหาลัย/u,
  /สตรอเบอร์รี่/u,
  /คอมพิวเตอร์/u,
  /จักรยาน/u,
  /เครื่องบิน/u,
  /ลูกค้าของเรา/u,
  /ภรรยา/u,
  /consultant/i,
  /department store/i,
  /queen/i,
];

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function difficultyRank(value) {
  if (value === "easy") {
    return 0;
  }

  if (value === "medium") {
    return 1;
  }

  return 2;
}

function reviewRank(row) {
  const published =
    row.review_status === "approved" &&
    row.tone_status === "approved" &&
    Number(row.tone_confidence) >= 99;

  if (published) {
    return 0;
  }

  if (row.review_status === "approved" && Number(row.tone_confidence) >= 97) {
    return 1;
  }

  if (row.review_status === "approved") {
    return 2;
  }

  if (Number(row.tone_confidence) >= 97) {
    return 3;
  }

  if (Number(row.tone_confidence) > 0) {
    return 4;
  }

  return 5;
}

function hasSuspiciousContent(row) {
  const text = `${row.thai ?? ""} ${row.english ?? ""} ${row.romanization ?? ""}`;
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
}

function compareRows(a, b) {
  const reviewDelta = reviewRank(a) - reviewRank(b);
  if (reviewDelta !== 0) {
    return reviewDelta;
  }

  const suspiciousDelta = Number(hasSuspiciousContent(a)) - Number(hasSuspiciousContent(b));
  if (suspiciousDelta !== 0) {
    return suspiciousDelta;
  }

  const difficultyDelta = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
  if (difficultyDelta !== 0) {
    return difficultyDelta;
  }

  const wordDelta = Number(a.word_count) - Number(b.word_count);
  if (wordDelta !== 0) {
    return wordDelta;
  }

  const thaiLengthDelta = Number(a.thai_length) - Number(b.thai_length);
  if (thaiLengthDelta !== 0) {
    return thaiLengthDelta;
  }

  const confidenceDelta = Number(b.tone_confidence) - Number(a.tone_confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  const sortDelta = Number(a.sort_order) - Number(b.sort_order);
  if (sortDelta !== 0) {
    return sortDelta;
  }

  return Number(a.id) - Number(b.id);
}

function formatPreviewRow(row) {
  return [
    `#${row.id}`,
    `${row.review_status}/${row.tone_status}/${row.tone_confidence}`,
    row.difficulty,
    row.thai,
    row.english,
  ].join(" | ");
}

async function fetchRows(client) {
  const result = await client.query(
    `
    SELECT
      id,
      grammar_id,
      sort_order,
      thai,
      english,
      romanization,
      difficulty,
      review_status,
      tone_status,
      tone_confidence,
      COALESCE(jsonb_array_length(breakdown), 0) AS word_count,
      char_length(thai) AS thai_length
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
    ORDER BY array_position($1::text[], grammar_id), sort_order, id
    `,
    [A11_GRAMMAR_IDS],
  );

  const rowsByGrammar = new Map(A11_GRAMMAR_IDS.map((grammarId) => [grammarId, []]));
  for (const row of result.rows) {
    rowsByGrammar.get(row.grammar_id)?.push(row);
  }

  return rowsByGrammar;
}

function selectRows(rowsByGrammar) {
  const selectedByGrammar = new Map();
  const deleteIds = [];

  for (const grammarId of A11_GRAMMAR_IDS) {
    const rows = [...(rowsByGrammar.get(grammarId) ?? [])].sort(compareRows);
    const selected = rows.slice(0, KEEP_COUNT);
    const selectedIds = new Set(selected.map((row) => Number(row.id)));
    const removed = rows.filter((row) => !selectedIds.has(Number(row.id)));
    selectedByGrammar.set(grammarId, {
      selected,
      removed,
      before: rows.length,
    });
    deleteIds.push(...removed.map((row) => Number(row.id)));
  }

  return {
    selectedByGrammar,
    deleteIds,
  };
}

async function applySelection(client, selectedByGrammar, deleteIds) {
  await client.query("BEGIN");

  try {
    if (deleteIds.length > 0) {
      await client.query(
        `
        DELETE FROM grammar_examples
        WHERE id = ANY($1::bigint[])
        `,
        [deleteIds],
      );
    }

    for (const grammarId of A11_GRAMMAR_IDS) {
      const selected = selectedByGrammar.get(grammarId)?.selected ?? [];
      for (let index = 0; index < selected.length; index += 1) {
        await client.query(
          `
          UPDATE grammar_examples
          SET sort_order = $1
          WHERE id = $2
          `,
          [1000 + index, selected[index].id],
        );
      }
    }

    for (const grammarId of A11_GRAMMAR_IDS) {
      const selected = selectedByGrammar.get(grammarId)?.selected ?? [];
      for (let index = 0; index < selected.length; index += 1) {
        await client.query(
          `
          UPDATE grammar_examples
          SET sort_order = $1
          WHERE id = $2
          `,
          [index, selected[index].id],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const client = await pool.connect();

  try {
    const rowsByGrammar = await fetchRows(client);
    const { selectedByGrammar, deleteIds } = selectRows(rowsByGrammar);

    console.log(
      `${apply ? "Applying" : "Dry run"} smart A1.1 trim -> keep ${KEEP_COUNT} rows per grammar`,
    );

    for (const grammarId of A11_GRAMMAR_IDS) {
      const summary = selectedByGrammar.get(grammarId);
      const selected = summary?.selected ?? [];
      const removed = summary?.removed ?? [];
      const before = summary?.before ?? 0;
      const selectedPublished = selected.filter(
        (row) =>
          row.review_status === "approved" &&
          row.tone_status === "approved" &&
          Number(row.tone_confidence) >= 99,
      ).length;

      console.log(
        `${grammarId}: ${before} -> ${selected.length} (published kept ${selectedPublished}, removed ${removed.length})`,
      );
      for (const row of selected.slice(0, 5)) {
        console.log(`  keep ${formatPreviewRow(row)}`);
      }
      if (selected.length > 5) {
        console.log(`  ...and ${selected.length - 5} more kept rows`);
      }
    }

    if (!apply) {
      console.log("");
      console.log(`Total rows to remove: ${deleteIds.length}`);
      console.log("Re-run with --apply to persist the trim.");
      return;
    }

    await applySelection(client, selectedByGrammar, deleteIds);
    console.log("");
    console.log(`Trim applied. Removed ${deleteIds.length} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to smart-trim A1.1 rows:", error);
  process.exitCode = 1;
});
