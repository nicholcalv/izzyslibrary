const { Pool } = require("pg");

const databaseUrl = process.env.NETLIFY_DATABASE_URL;

if (!databaseUrl) {
  exports.handler = async () => ({
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "NETLIFY_DATABASE_URL is not set." }),
  });
} else {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    return null;
  }
}

function getIdFromPath(path) {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last === "books") return null;
  const id = Number(last);
  return Number.isFinite(id) ? id : null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      const books = await pool.query(
        `select id, title,
            pages_read as "pagesRead",
            total_pages as "totalPages",
            progress,
            cover_path as "coverPath",
            tag
         from books
         order by id`
      );
      const missing = await pool.query("select title from dont_have order by id");
      return jsonResponse(200, { have: books.rows, dontHave: missing.rows });
    }

    if (event.httpMethod === "POST") {
      const payload = parseJsonBody(event);
      if (!payload) {
        return jsonResponse(400, { error: "Invalid JSON." });
      }
      const title = String(payload.title || "").trim();
      if (!title) {
        return jsonResponse(400, { error: "Title is required." });
      }
      const pagesRead = Number.isFinite(payload.pagesRead) ? payload.pagesRead : null;
      const totalPages = Number.isFinite(payload.totalPages) ? payload.totalPages : null;
      const progress =
        Number.isFinite(payload.progress)
          ? payload.progress
          : Number.isFinite(pagesRead) && Number.isFinite(totalPages) && totalPages > 0
          ? pagesRead / totalPages
          : null;
      const coverPath = payload.coverPath || null;
      const tag = payload.tag || null;

      const result = await pool.query(
        `insert into books (title, pages_read, total_pages, progress, cover_path, tag)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [title, pagesRead, totalPages, progress, coverPath, tag]
      );
      return jsonResponse(201, { id: result.rows[0].id });
    }

    if (event.httpMethod === "PUT") {
      const payload = parseJsonBody(event);
      if (!payload) {
        return jsonResponse(400, { error: "Invalid JSON." });
      }
      const bookId = getIdFromPath(event.path);
      if (!bookId) {
        return jsonResponse(400, { error: "Book id is required." });
      }

      const current = await pool.query(
        "select title, pages_read, total_pages, tag, cover_path from books where id = $1",
        [bookId]
      );
      if (!current.rows.length) {
        return jsonResponse(404, { error: "Book not found." });
      }

      const row = current.rows[0];
      const title =
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title.trim()
          : row.title;
      if (!title) {
        return jsonResponse(400, { error: "Title is required." });
      }

      const pagesRead =
        payload.pagesRead === undefined
          ? row.pages_read
          : payload.pagesRead === null
          ? null
          : Number.isFinite(payload.pagesRead)
          ? payload.pagesRead
          : null;
      const totalPages = row.total_pages;
      const progress =
        pagesRead === null
          ? null
          : Number.isFinite(totalPages) && totalPages > 0
          ? pagesRead / totalPages
          : null;
      const tag =
        typeof payload.tag === "string" && payload.tag.trim() !== ""
          ? payload.tag.trim()
          : payload.tag === null
          ? null
          : row.tag;
      const coverPath =
        typeof payload.coverPath === "string" ? payload.coverPath : row.cover_path;

      const updated = await pool.query(
        `update books
         set title = $1, pages_read = $2, progress = $3, tag = $4, cover_path = $5
         where id = $6`,
        [title, pagesRead, progress, tag, coverPath, bookId]
      );
      return jsonResponse(200, { updated: updated.rowCount });
    }

    return jsonResponse(405, { error: "Method not allowed." });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Server error." });
  }
};
}
