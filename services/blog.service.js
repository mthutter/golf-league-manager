import { all, run, get } from "../config/db.js";

// Initialize the blog table and ensure all modern fields exist
run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    gallery_urls TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`).catch((err) =>
  console.error("Failed to initialize blog table:", err.message),
);

// Helper function to turn post titles into URLs
const makeSlug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

// Fetch all posts ordered by newest first
export async function getAllPosts() {
  return all("SELECT * FROM posts ORDER BY created_at DESC");
}

// Fetch a single post by its URL slug identifier
export async function getPostBySlug(slug) {
  return get("SELECT * FROM posts WHERE slug = ?", [slug]);
}

// Search across titles and content text fields
export async function searchPosts(searchTerm) {
  return all(
    `SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC`,
    [`%${searchTerm}%`, `%${searchTerm}%`],
  );
}

// Write a new post to the database matching all schema columns
export async function createNewPost(title, content, imageUrl, galleryUrls) {
  const slug = makeSlug(title);
  return run(
    "INSERT INTO posts (title, slug, content, image_url, gallery_urls) VALUES (?, ?, ?, ?, ?)",
    [title, slug, content, imageUrl || null, JSON.stringify(galleryUrls || [])],
  );
}

// Purge a specific blog post row by its database primary key
export async function deletePostById(id) {
  return run("DELETE FROM posts WHERE id = ?", [id]);
}
