import basicAuth from "express-basic-auth";

const authMiddleware = basicAuth({
  users: {
    [process.env.ADMIN_USER]: process.env.ADMIN_PASS,
  },
  challenge: true,
  unauthorizedResponse: "Direct access denied.",
});

export default authMiddleware;
