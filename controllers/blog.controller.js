// blog.controller.js
import * as blogService from "../services/blog.service.js";

export async function renderIndex(req, res) {
  try {
    const posts = await blogService.getAllPosts();
    res.render("blog", { view: "index", posts });
  } catch (error) {
    res.status(500).send(`Database Error: ${error.message}`);
  }
}

export function renderNewForm(req, res) {
  res.render("blog", { view: "new" });
}

export async function renderPost(req, res) {
  try {
    const post = await blogService.getPostBySlug(req.params.slug);
    if (!post) return res.status(404).send("Blog post not found");
    res.render("blog", { view: "show", post });
  } catch (error) {
    res.status(500).send(`Database Error: ${error.message}`);
  }
}

export async function createPost(req, res) {
  const { title, content, image_url } = req.body; // 👈 Extract image URL from form
  if (!title || !content)
    return res.status(400).send("Title and content are required.");

  try {
    await blogService.createNewPost(title, content, image_url); // 👈 Pass to service
    res.redirect("/blog");
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).send("A post with that title already exists.");
    }
    res.status(500).send(`Database Error: ${error.message}`);
  }
}
