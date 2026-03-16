import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

function readPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DB_POOL_MAX = readPositiveIntEnv("DB_POOL_MAX", 15);
const DB_POOL_IDLE_TIMEOUT_MS = readPositiveIntEnv(
  "DB_POOL_IDLE_TIMEOUT_MS",
  30000,
);
const DB_POOL_CONNECTION_TIMEOUT_MS = readPositiveIntEnv(
  "DB_POOL_CONNECTION_TIMEOUT_MS",
  5000,
);
const DB_POOL_MAX_USES = readPositiveIntEnv("DB_POOL_MAX_USES", 7500);

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_POOL_CONNECTION_TIMEOUT_MS,
  maxUses: DB_POOL_MAX_USES,
  ssl: {
    rejectUnauthorized: false
  }
});

export function getPoolStats() {
  return {
    max: DB_POOL_MAX,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

pool.query("SELECT NOW()")
  .then(() => console.log("DB connected"))
  .catch(err => console.error("DB error:", err));
