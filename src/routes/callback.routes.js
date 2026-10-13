import express from "express";
import { buildTokenPayload, getAccountRecord, getProviderConfig } from "../config/providers.js";
import { getState, save } from "../data/stateStore.js";
import { safeError } from "../utils/safeError.js";

const router = express.Router();

router.get("/:provider", async (req, res) => {
  const provider = req.params.provider;
  const config = getProviderConfig(provider);
  const state = getState();

  if (!config) return res.sendStatus(404);
  if (!req.query.state || req.query.state !== req.session[`oauth_${provider}`]) {
    return res.status(400).send("OAuth state mismatch");
  }

  delete req.session[`oauth_${provider}`];

  try {
    const response = await fetch(config.token, {
      method: "POST",
      body: new URLSearchParams(buildTokenPayload(provider, String(req.query.code || ""))),
    });

    const tokenData = await response.json();
    if (!response.ok) throw Error(JSON.stringify(tokenData));

    state.tokens[provider] = {
      ...tokenData,
      refresh_token: tokenData.refresh_token || state.tokens[provider]?.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };

    const accountProfile = await config.accountProfile(state.tokens[provider].access_token);
    state.accounts[provider] = getAccountRecord(provider, accountProfile);

    await save();
    return res.redirect("/");
  } catch (error) {
    return res.status(500).send("OAuth failed: " + safeError(error));
  }
});

export default router;
