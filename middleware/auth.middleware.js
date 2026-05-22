import basicAuth from "express-basic-auth";

const basicAuthMiddleware = basicAuth({
  users: {
    [process.env.ADMIN_USER]: process.env.ADMIN_PASS,
  },
  challenge: true,
  unauthorizedResponse: "Direct access denied.",
});

export default function authMiddleware(req, res, next) {
  basicAuthMiddleware(req, res, function () {
    req.session.isAdmin = true;

    next();
  });
}
