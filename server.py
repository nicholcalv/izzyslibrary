import argparse
import base64
import io
import json
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image

try:
    import pillow_heif
except ImportError:
    pillow_heif = None

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "library.db"
BOOKS_JSON = DATA_DIR / "books.json"


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            pagesRead INTEGER,
            totalPages INTEGER,
            progress REAL,
            coverPath TEXT,
            tag TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dont_have (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL UNIQUE
        )
        """
    )
    conn.commit()
    ensure_book_columns(conn)
    seed_if_empty(conn)
    conn.close()


def normalize_cover_data_url(cover_path):
    if not isinstance(cover_path, str) or not cover_path.startswith("data:"):
        return cover_path

    if "," not in cover_path:
        raise ValueError("Invalid cover image data.")

    header, b64data = cover_path.split(",", 1)
    mime = header.split(";")[0].replace("data:", "").strip().lower()

    if mime in ("image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"):
        if pillow_heif is None:
            raise ValueError("HEIC conversion is not available on this server.")

        pillow_heif.register_heif_opener()
        raw = base64.b64decode(b64data)
        with Image.open(io.BytesIO(raw)) as img:
            rgb = img.convert("RGB")
            out = io.BytesIO()
            rgb.save(out, format="JPEG", quality=90)
        encoded = base64.b64encode(out.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"

    return cover_path


def ensure_book_columns(conn):
    columns = {
        row[1] for row in conn.execute("PRAGMA table_info(books)").fetchall()
    }
    if "tag" not in columns:
        conn.execute("ALTER TABLE books ADD COLUMN tag TEXT")
        conn.commit()


def seed_if_empty(conn):
    if not BOOKS_JSON.exists():
        return

    cur = conn.execute("SELECT COUNT(*) FROM books")
    if cur.fetchone()[0] == 0:
        data = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
        for book in data.get("have", []):
            conn.execute(
                """
                INSERT OR IGNORE INTO books (id, title, pagesRead, totalPages, progress, coverPath, tag)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    book.get("id"),
                    book.get("title"),
                    book.get("pagesRead"),
                    book.get("totalPages"),
                    book.get("progress"),
                    book.get("coverPath"),
                    book.get("tag"),
                ),
            )

    cur = conn.execute("SELECT COUNT(*) FROM dont_have")
    if cur.fetchone()[0] == 0:
        data = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
        for item in data.get("dontHave", []):
            conn.execute(
                "INSERT OR IGNORE INTO dont_have (title) VALUES (?)",
                (item.get("title"),),
            )

    conn.commit()


def get_books():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    books = [
        dict(row)
        for row in conn.execute(
            "SELECT id, title, pagesRead, totalPages, progress, coverPath, tag FROM books ORDER BY id"
        ).fetchall()
    ]
    dont_have = [
        dict(row)
        for row in conn.execute(
            "SELECT title FROM dont_have ORDER BY id"
        ).fetchall()
    ]
    conn.close()
    return {"have": books, "dontHave": dont_have}


def insert_book(payload):
    title = str(payload.get("title") or "").strip()
    if not title:
        raise ValueError("Title is required.")

    pages_read = payload.get("pagesRead")
    total_pages = payload.get("totalPages")
    progress = payload.get("progress")
    cover_path = payload.get("coverPath")
    tag = payload.get("tag")

    if cover_path:
        cover_path = normalize_cover_data_url(cover_path)

    if isinstance(pages_read, (int, float)):
        pages_read = int(pages_read)
    else:
        pages_read = None

    if isinstance(total_pages, (int, float)):
        total_pages = int(total_pages)
    else:
        total_pages = None

    if progress is None and pages_read is not None and total_pages:
        progress = pages_read / total_pages

    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        """
        INSERT INTO books (title, pagesRead, totalPages, progress, coverPath, tag)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (title, pages_read, total_pages, progress, cover_path, tag),
    )
    conn.commit()
    book_id = cur.lastrowid
    conn.close()
    return book_id


def delete_missing_title(title):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("DELETE FROM dont_have WHERE title = ?", (title,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    return deleted


def insert_missing_title(title):
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("Title is required.")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "INSERT OR IGNORE INTO dont_have (title) VALUES (?)",
        (clean_title,),
    )
    conn.commit()
    inserted = cur.rowcount
    conn.close()
    return inserted


def update_book_details(book_id, title, pages_read, tag, cover_path):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT title, totalPages, tag, coverPath FROM books WHERE id = ?",
        (book_id,),
    ).fetchone()
    if row is None:
        conn.close()
        raise ValueError("Book not found.")

    updated_title = title.strip() if isinstance(title, str) else row["title"]
    if not updated_title:
        conn.close()
        raise ValueError("Title is required.")

    updated_tag = tag.strip() if isinstance(tag, str) else row["tag"]
    if updated_tag == "":
        updated_tag = None

    if isinstance(cover_path, str):
        updated_cover = normalize_cover_data_url(cover_path)
    else:
        updated_cover = row["coverPath"]

    total_pages = row["totalPages"]
    if pages_read is None:
        progress = None
    elif total_pages:
        progress = pages_read / total_pages
    else:
        progress = None

    cur = conn.execute(
        """
        UPDATE books
        SET title = ?, pagesRead = ?, progress = ?, tag = ?, coverPath = ?
        WHERE id = ?
        """,
        (updated_title, pages_read, progress, updated_tag, updated_cover, book_id),
    )
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return updated


class LibraryHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/books"):
            data = get_books()
            payload = json.dumps(data, ensure_ascii=True).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/books"):
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
                book_id = insert_book(payload)
            except (json.JSONDecodeError, ValueError) as exc:
                message = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(message)))
                self.end_headers()
                self.wfile.write(message)
                return

            response = json.dumps({"id": book_id}).encode("utf-8")
            self.send_response(201)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return

        if self.path.startswith("/api/missing"):
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
                inserted = insert_missing_title(str(payload.get("title") or ""))
            except (json.JSONDecodeError, ValueError) as exc:
                message = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(message)))
                self.end_headers()
                self.wfile.write(message)
                return

            response = json.dumps({"inserted": inserted}).encode("utf-8")
            self.send_response(201)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        if self.path.startswith("/api/missing"):
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            title = (query.get("title") or [""])[0].strip()
            if not title:
                message = json.dumps({"error": "Title is required."}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(message)))
                self.end_headers()
                self.wfile.write(message)
                return

            deleted = delete_missing_title(title)
            response = json.dumps({"deleted": deleted}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        if self.path.startswith("/api/books/"):
            parsed = urlparse(self.path)
            parts = parsed.path.strip("/").split("/")
            if len(parts) != 3 or not parts[2].isdigit():
                self.send_response(400)
                self.end_headers()
                return

            book_id = int(parts[2])
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            try:
                payload = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self.send_response(400)
                self.end_headers()
                return

            title = payload.get("title")
            tag = payload.get("tag")
            pages_read = payload.get("pagesRead")
            cover_path = payload.get("coverPath")
            if pages_read is None:
                pages_read_value = None
            elif isinstance(pages_read, (int, float)):
                pages_read_value = int(pages_read)
            else:
                self.send_response(400)
                self.end_headers()
                return

            try:
                updated = update_book_details(book_id, title, pages_read_value, tag, cover_path)
            except ValueError as exc:
                message = str(exc)
                status = 404 if "not found" in message.lower() else 400
                response = json.dumps({"error": message}).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)
                return

            response = json.dumps({"updated": updated}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            return

        self.send_response(404)
        self.end_headers()


def run_server(port):
    handler = lambda *args, **kwargs: LibraryHandler(*args, directory=str(BASE_DIR), **kwargs)
    server = ThreadingHTTPServer(("localhost", port), handler)
    print(f"Serving on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    init_db()
    run_server(args.port)
