import * as blogService from "../services/blog.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /blog
 */
export const renderIndex = catchAsync(async (req, res, next) => {
  const search = req.query.search?.trim();

  logger.info("Fetching blog index listings");

  const rawPosts = search ? await blogService.searchPosts(search) : await blogService.getAllPosts();

  // Clean up timestamps here before rendering the template
  const formattedPosts = rawPosts.map((post) => {
    let galleryCount;

    try {
      galleryCount = JSON.parse(post.gallery_urls || "[]").length;
    } catch {
      galleryCount = post.gallery_urls ? post.gallery_urls.split("\n").filter(Boolean).length : 0;
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

  return res.render("blog", {
    view: "index",
    posts: formattedPosts,
    search,
  });
});

/**
 * GET /blog/:slug
 */
export const renderPost = catchAsync(async (req, res, next) => {
  const { slug } = req.params;
  const post = await blogService.getPostBySlug(slug);

  // FIX: Perform the object validation check immediately before referencing its properties
  if (!post) {
    logger.warn(
      {
        slug,
      },
      "Requested blog post slug not found",
    );
    res.status(404);
    return res.render("404"); // Render a clean EJS 404 page for user convenience
  }

  try {
    post.galleryUrls = JSON.parse(post.gallery_urls || "[]");
  } catch {
    post.galleryUrls = post.gallery_urls ? post.gallery_urls.split("\n").filter(Boolean) : [];
  }

  // Clean up the single post date string
  post.displayDate = new Date(post.created_at + " Z").toLocaleString("en-US", {
    timeZone: "America/Denver",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return res.render("blog", {
    view: "show",
    post,
  });
});

/**
 * GET /blog/new
 */
export const renderNewForm = (req, res) => {
  return res.render("blog", {
    view: "new",
  });
};

/**
 * POST /blog
 */
export const createPost = catchAsync(async (req, res, next) => {
  const { title, content, image_url } = req.body;

  if (!title || !content) {
    logger.warn(
      {
        titleHasValue: !!title,
        contentHasValue: !!content,
      },
      "Validation failure: Blog post missing fields",
    );
    return res.status(400).send("Title and content are required.");
  }

  try {
    await blogService.createNewPost(title, content, image_url);
    logger.info("New blog post created successfully");
    posthog.capture({
      distinctId: req.session?.id,
      event: "blog_post_created",
      properties: {
        has_image: !!image_url,
      },
    });
    return res.redirect("/blog");
  } catch (error) {
    // Intercept expected constraint validations safely
    if (error.message.includes("UNIQUE constraint failed")) {
      logger.warn(
        {
          title,
        },
        "Blog creation rejected: Non-unique title string",
      );
      return res.status(400).send("A post with that title already exists.");
    }
    // Let any genuine operational crashes flow out to centralized logger middleware
    throw error;
  }
});

/**
 * DELETE /blog/:id
 */
export const deletePost = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  await blogService.deletePostById(id);

  logger.info("Blog post removed cleanly");
  return res.redirect("/blog");
});
