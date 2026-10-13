import crypto from "node:crypto";
import express from "express";
import { buildAuthUrl, getProviderConfig } from "../config/providers.js";

const router = express.Router();

router.get("/:provider", (req, res) => {
  const provider = req.params.provider;
  const config = getProviderConfig(provider);

  if (!config) {
    return res.sendStatus(404);
  }

  if (!config.client()) {
    return res.status(400).send(`Missing ${provider} client ID in .env`);
  }

  const stateValue = crypto.randomBytes(24).toString("hex");
  req.session[`oauth_${provider}`] = stateValue;

  req.session.save((error) => {
    if (error) {
      return res.status(500).send("Could not save OAuth session");
    }
    return res.redirect(buildAuthUrl(provider, stateValue));
  });
});

export default router;
