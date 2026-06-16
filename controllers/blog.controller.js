// blog.controller.js
import * as blogService from "../services/blog.service.js";

export async function renderIndex(req, res) {
  try {
    const rawPosts = await blogService.getAllPosts();

    // Clean up timestamps here before rendering the template
    const formattedPosts = rawPosts.map((post) => ({
      ...post,
      displayDate: new Date(post.created_at + " Z").toLocaleString("en-US", {
        timeZone: "America/Denver",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    res.render("blog", { view: "index", posts: formattedPosts });
  } catch (error) {
    res.status(500).send(`Database Error: ${error.message}`);
  }
}

export async function renderPost(req, res) {
  try {
    const post = await blogService.getPostBySlug(req.params.slug);
    if (!post) return res.status(404).send("Blog post not found");

    // Clean up the single post date string
    post.displayDate = new Date(post.created_at + " Z").toLocaleString(
      "en-US",
      {
        timeZone: "America/Denver",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );

    res.render("blog", { view: "show", post });
  } catch (error) {
    res.status(500).send(`Database Error: ${error.message}`);
  }
}

// Keep renderNewForm and createPost exactly the same...

export function renderNewForm(req, res) {
  res.render("blog", { view: "new" });
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
