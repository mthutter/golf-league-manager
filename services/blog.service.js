// blog.service.js
import { all, run, get } from "../config/db.js";

// Altered initialization code to ensure the image_url field exists
run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`).catch((err) =>
  console.error("Failed to initialize blog table:", err.message),
);

const makeSlug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export async function getAllPosts() {
  return all("SELECT * FROM posts ORDER BY created_at DESC");
}

export async function getPostBySlug(slug) {
  return get("SELECT * FROM posts WHERE slug = ?", [slug]);
}

// Updated to accept and pass the image_url
export async function createNewPost(title, content, imageUrl) {
  const slug = makeSlug(title);
  return run(
    "INSERT INTO posts (title, slug, content, image_url) VALUES (?, ?, ?, ?)",
    [title, slug, content, imageUrl || null],
  );
}
