import { createApp } from "../src/app.js";

export default async function handler(req, res) {
  const app = await createApp();
  return app(req, res);
}
