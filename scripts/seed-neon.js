const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dataPath = path.join(__dirname, "..", "data", "books.json");
const raw = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(raw);
const books = Array.isArray(data.have) ? data.have : [];
const missing = Array.isArray(data.dontHave) ? data.dontHave : [];

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  const client = await pool.connect();
  try {
    const booksCount = await client.query("select count(*) from books");
    const missingCount = await client.query("select count(*) from dont_have");
    if (Number(booksCount.rows[0].count) > 0 || Number(missingCount.rows[0].count) > 0) {
      console.log("Tables are not empty; skipping seed.");
      return;
    }

    await client.query("begin");

    for (const book of books) {
      await client.query(
        `insert into books (title, pages_read, total_pages, progress, cover_path, tag)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          book.title || "",
          Number.isFinite(book.pagesRead) ? book.pagesRead : null,
          Number.isFinite(book.totalPages) ? book.totalPages : null,
          Number.isFinite(book.progress) ? book.progress : null,
          book.coverPath || null,
          book.tag || null,
        ]
      );
    }

    for (const item of missing) {
      await client.query(
        "insert into dont_have (title) values ($1) on conflict (title) do nothing",
        [item.title || ""]
      );
    }

    await client.query("commit");
    console.log("Seed completed.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
