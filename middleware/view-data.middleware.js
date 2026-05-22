export default function viewDataMiddleware(req, res, next) {
  res.locals.isAdmin = !!req.auth;

  next();
}
