export function requireLocal(req, res, next) {
  const address = req.socket.remoteAddress || "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) {
    return res.status(403).json({ error: "Local access only" });
  }
  next();
}
