const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  exports.handler = async () => ({
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "DATABASE_URL is not set." }),
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "POST") {
      const payload = parseJsonBody(event);
      if (!payload) {
        return jsonResponse(400, { error: "Invalid JSON." });
      }
      const title = String(payload.title || "").trim();
      if (!title) {
        return jsonResponse(400, { error: "Title is required." });
      }
      const result = await pool.query(
        "insert into dont_have (title) values ($1) on conflict (title) do nothing",
        [title]
      );
      return jsonResponse(201, { inserted: result.rowCount });
    }

    if (event.httpMethod === "DELETE") {
      const params = event.queryStringParameters || {};
      const title = String(params.title || "").trim();
      if (!title) {
        return jsonResponse(400, { error: "Title is required." });
      }
      const result = await pool.query("delete from dont_have where title = $1", [title]);
      return jsonResponse(200, { deleted: result.rowCount });
    }

    return jsonResponse(405, { error: "Method not allowed." });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Server error." });
  }
};
}
