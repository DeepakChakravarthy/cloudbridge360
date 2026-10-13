import crypto from "node:crypto";
import express from "express";
import { getState, save, publicJob } from "../data/stateStore.js";
import { connected, keyOf, runJob, scanDrive } from "../services/migrationService.js";
import { safeError } from "../utils/safeError.js";
import { requireLocal } from "../middleware/localOnly.js";

const router = express.Router();
router.use(requireLocal);

router.get("/status", (req, res) => {
  const state = getState();
  res.json({
    microsoft: connected("microsoft"),
    google: connected("google"),
    accounts: state.accounts,
    scanned: state.files.length,
    job: publicJob(),
    events: state.events.slice(-40),
  });
});

router.get("/history", (req, res) => {
  const state = getState();
  res.json({
    records: Object.entries(state.records).map(([key, value]) => ({
      key,
      name: value.name,
      status: value.status,
      at: value.at,
      mediaId: value.mediaId || null,
      error: value.error || null,
    })),
  });
});

router.get("/report.csv", (req, res) => {
  const state = getState();
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Source key", "Name", "Status", "Date", "Google media ID", "Error"],
    ...Object.entries(state.records).map(([key, value]) => [
      key,
      value.name,
      value.status,
      value.at,
      value.mediaId || "",
      value.error || "",
    ]),
  ];

  res
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="cloudbridge-report.csv"')
    .send(rows.map((row) => row.map(escape).join(",")).join("\r\n"));
});

router.get("/scan", async (req, res) => {
  const state = getState();
  if (state.job?.running) {
    return res.status(409).json({ error: "Cannot scan while migrating" });
  }

  try {
    state.files = await scanDrive();
    await save();
    return res.json({
      count: state.files.length,
      bytes: state.files.reduce((total, file) => total + file.size, 0),
      files: state.files.slice(0, 100),
    });
  } catch (error) {
    return res.status(500).json({ error: safeError(error) });
  }
});

router.post("/migrate", async (req, res) => {
  const state = getState();
  if (state.job?.running) {
    return res.status(409).json({ error: "Migration already running" });
  }

  if (!state.files.length) {
    return res.status(400).json({ error: "Scan OneDrive first" });
  }

  const retryOnly = req.body?.retryOnly === true;
  const files = retryOnly
    ? state.files.filter((file) => state.records[keyOf(file)]?.status === "failed")
    : state.files;

  state.job = {
    id: crypto.randomUUID(),
    running: true,
    total: files.length,
    done: 0,
    skipped: 0,
    failed: 0,
    pending: files.length,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errors: [],
    active: {},
  };

  await save();
  res.json({ started: true, total: files.length });
  void runJob(files).catch((error) => console.error("Unexpected worker failure:", error));
});

export default router;
