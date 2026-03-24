import { pool } from "../db.js";

function parseArgs(argv) {
  const grammarIds = [];
  let keep = 25;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--grammar" || arg === "-g") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value after --grammar");
      }
      grammarIds.push(value.trim());
      index += 1;
      continue;
    }

    if (arg === "--keep" || arg === "-k") {
      const value = Number.parseInt(argv[index + 1] || "", 10);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--keep must be a positive integer");
      }
      keep = value;
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }
  }

  const uniqueGrammarIds = Array.from(
    new Set(grammarIds.map((grammarId) => grammarId.trim()).filter(Boolean)),
  );

  if (uniqueGrammarIds.length === 0) {
    throw new Error("Provide at least one --grammar <id>");
  }

  return {
    grammarIds: uniqueGrammarIds,
    keep,
    apply,
  };
}

async function fetchCounts(client, grammarIds) {
  const result = await client.query(
    `
    SELECT grammar_id, COUNT(*)::int AS row_count
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
    GROUP BY grammar_id
    ORDER BY array_position($1::text[], grammar_id)
    `,
    [grammarIds],
  );

  return new Map(result.rows.map((row) => [row.grammar_id, row.row_count]));
}

async function fetchRowsToDelete(client, grammarIds, keep) {
  const result = await client.query(
    `
    WITH ranked AS (
      SELECT
        id,
        grammar_id,
        thai,
        sort_order,
        ROW_NUMBER() OVER (
          PARTITION BY grammar_id
          ORDER BY sort_order ASC, id ASC
        ) AS rank
      FROM grammar_examples
      WHERE grammar_id = ANY($1::text[])
    )
    SELECT id, grammar_id, thai, sort_order, rank
    FROM ranked
    WHERE rank > $2
    ORDER BY grammar_id ASC, rank ASC, id ASC
    `,
    [grammarIds, keep],
  );

  return result.rows;
}

async function applyTrim(client, grammarIds, keep) {
  await client.query("BEGIN");

  try {
    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,
          grammar_id,
          ROW_NUMBER() OVER (
            PARTITION BY grammar_id
            ORDER BY sort_order ASC, id ASC
          ) AS rank
        FROM grammar_examples
        WHERE grammar_id = ANY($1::text[])
      )
      DELETE FROM grammar_examples g
      USING ranked
      WHERE g.id = ranked.id
        AND ranked.rank > $2
      `,
      [grammarIds, keep],
    );

    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,
          grammar_id,
          ROW_NUMBER() OVER (
            PARTITION BY grammar_id
            ORDER BY sort_order ASC, id ASC
          ) AS rank
        FROM grammar_examples
        WHERE grammar_id = ANY($1::text[])
      )
      UPDATE grammar_examples g
      SET sort_order = ranked.rank - 1
      FROM ranked
      WHERE g.id = ranked.id
      `,
      [grammarIds],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const { grammarIds, keep, apply } = parseArgs(process.argv.slice(2));
  const client = await pool.connect();

  try {
    const beforeCounts = await fetchCounts(client, grammarIds);
    const rowsToDelete = await fetchRowsToDelete(client, grammarIds, keep);

    console.log(
      `${apply ? "Applying" : "Dry run"} trim for ${grammarIds.join(", ")} -> keep ${keep} rows each`,
    );

    for (const grammarId of grammarIds) {
      const before = beforeCounts.get(grammarId) ?? 0;
      const deleteCount = rowsToDelete.filter(
        (row) => row.grammar_id === grammarId,
      ).length;
      const after = Math.min(before, keep);
      console.log(`${grammarId}: ${before} -> ${after} (${deleteCount} rows removed)`);
    }

    if (rowsToDelete.length > 0) {
      console.log("");
      console.log("Rows that would be removed:");
      for (const row of rowsToDelete.slice(0, 20)) {
        console.log(
          `- ${row.grammar_id} #${row.rank} (sort ${row.sort_order}) ${row.thai}`,
        );
      }
      if (rowsToDelete.length > 20) {
        console.log(`...and ${rowsToDelete.length - 20} more rows`);
      }
    } else {
      console.log("No rows exceed the requested keep-count.");
    }

    if (!apply) {
      console.log("");
      console.log("No changes were made. Re-run with --apply to persist.");
      return;
    }

    await applyTrim(client, grammarIds, keep);
    const afterCounts = await fetchCounts(client, grammarIds);

    console.log("");
    console.log("Trim applied successfully.");
    for (const grammarId of grammarIds) {
      console.log(`${grammarId}: now ${afterCounts.get(grammarId) ?? 0} rows`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to trim grammar rows:", err);
  process.exitCode = 1;
});
