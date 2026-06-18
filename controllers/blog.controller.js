// blog.controller.js
import * as blogService from "../services/blog.service.js";

export async function renderIndex(req, res) {
  try {
    const search = req.query.search?.trim();
    const rawPosts = search
      ? await blogService.searchPosts(search)
      : await blogService.getAllPosts();

    // Clean up timestamps here before rendering the template
    const formattedPosts = rawPosts.map((post) => {
      let galleryCount = 0;

      try {
        galleryCount = JSON.parse(post.gallery_urls || "[]").length;
      } catch {
        galleryCount = post.gallery_urls
          ? post.gallery_urls.split("\n").filter(Boolean).length
          : 0;
      }

      return {
        ...post,
        galleryCount,
        displayDate: new Date(post.created_at + " Z").toLocaleString("en-US", {
          timeZone: "America/Denver",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    });
    res.render("blog", { view: "index", posts: formattedPosts, search });
  } catch (error) {
    res.status(500).send(`Database Error: ${error.message}`);
  }
}

export async function renderPost(req, res) {
  try {
    const post = await blogService.getPostBySlug(req.params.slug);
    try {
      post.galleryUrls = JSON.parse(post.gallery_urls || "[]");
    } catch {
      post.galleryUrls = post.gallery_urls
        ? post.gallery_urls.split("\n").filter(Boolean)
        : [];
    }

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
    console.log("gallery_urls from DB:", post.gallery_urls);
    console.log("galleryUrls array:", post.galleryUrls);

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
  const galleryUrls = req.body.gallery_urls
    ?.split("\n")
    .map((url) => url.trim())
    .filter(Boolean);

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

export async function deletePost(req, res) {
  try {
    await blogService.deletePostById(req.params.id);
    res.redirect("/blog");
  } catch (error) {
    res.status(500).send(`Database Erasure Error: ${error.message}`);
  }
}
