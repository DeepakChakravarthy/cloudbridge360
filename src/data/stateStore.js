import fs from "node:fs/promises";
import { appConfig } from "../config/env.js";
import { now } from "../utils/now.js";

const emptyState = {
  files: [],
  job: null,
  records: {},
  events: [],
  accounts: {},
  tokens: {},
};

export let state = { ...emptyState };
let writing = Promise.resolve();

export async function initializeState() {
  await fs.mkdir(appConfig.dataDir, { recursive: true });

  try {
    const raw = await fs.readFile(appConfig.statePath, "utf8");
    state = { ...emptyState, ...JSON.parse(raw) };
  } catch {
    state = { ...emptyState };
  }

  try {
    const old = JSON.parse(await fs.readFile(appConfig.legacyHistoryPath, "utf8"));
    for (const [key, value] of Object.entries(old)) {
      if (!state.records[key]) {
        state.records[key] = { ...value, status: "imported", legacy: true };
      }
    }
  } catch {
    // optional history import
  }

  for (const record of Object.values(state.records)) {
    if (record.status === "uploading") {
      record.status = "uncertain";
      record.error = "Interrupted while uploading; verify destination before retrying";
    }
  }

  if (state.job?.running) {
    state.job.running = false;
    state.job.interrupted = true;
    state.job.finishedAt = now();
  }

  await save();
}

export function getState() {
  return state;
}

export function event(type, name, message) {
  state.events.push({
    time: now(),
    type,
    name,
    message: String(message).slice(0, 500),
  });

  if (state.events.length > 300) {
    state.events.splice(0, state.events.length - 300);
  }

  console.log(`[${type}] ${name}: ${message}`);
}

export function save() {
  writing = writing
    .catch(() => undefined)
    .then(async () => {
      const tmp = `${appConfig.statePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2));
      await fs.rename(tmp, appConfig.statePath);
    });

  return writing;
}

export function publicJob() {
  const job = state.job;
  if (!job) return null;

  const {
    id,
    running,
    total,
    done,
    skipped,
    failed,
    pending,
    startedAt,
    finishedAt,
    interrupted,
    errors,
    active,
  } = job;

  return {
    id,
    running,
    total,
    done,
    skipped,
    failed,
    pending,
    startedAt,
    finishedAt,
    interrupted,
    errors: errors.slice(-100),
    active,
  };
}
