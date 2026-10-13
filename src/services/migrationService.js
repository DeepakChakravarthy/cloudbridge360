import { appConfig } from "../config/env.js";
import { providers } from "../config/providers.js";
import { getState, event, save } from "../data/stateStore.js";
import { safeError } from "../utils/safeError.js";
import { now } from "../utils/now.js";
import { AdaptiveThroughputController } from "./throughputController.js";

const refreshLocks = new Map();

export function connected(provider) {
  const state = getState();
  return (
    !!state.tokens[provider]?.refresh_token ||
    (!!state.tokens[provider]?.access_token &&
      Date.now() < state.tokens[provider].expires_at)
  );
}

export function keyOf(file) {
  const state = getState();
  return `${state.accounts.microsoft?.id || "ms"}:${file.id}:${file.etag}`;
}

export function legacyKeyOf(file) {
  return `${file.id}:${file.etag}`;
}

export async function access(provider) {
  const state = getState();
  const token = state.tokens[provider];

  if (!token) throw Error(`Not connected: ${provider}`);
  if (token.access_token && Date.now() < token.expires_at - 120000) {
    return token.access_token;
  }

  if (refreshLocks.has(provider)) return refreshLocks.get(provider);

  const task = (async () => {
    if (!token.refresh_token) throw Error(`Reconnect ${provider}: refresh token missing`);

    const config = providers[provider];
    const refreshPayload = config.refreshTokenParams({
      refreshToken: token.refresh_token,
      clientId: config.client(),
      clientSecret: config.secret() || "",
      scope: config.scope,
    });

    const response = await fetch(config.token, {
      method: "POST",
      body: new URLSearchParams(refreshPayload),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw Error(`Token refresh failed for ${provider}: ${JSON.stringify(payload)}`);
    }

    state.tokens[provider] = {
      ...token,
      ...payload,
      refresh_token: payload.refresh_token || token.refresh_token,
      expires_at: Date.now() + payload.expires_in * 1000,
    };

    await save();
    return payload.access_token;
  })();

  refreshLocks.set(provider, task);

  try {
    return await task;
  } finally {
    refreshLocks.delete(provider);
  }
}

export async function api(provider, url, options = {}) {
  const token = await access(provider);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw Error(`${provider} HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  return response;
}

export async function retry(fn, name, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fn();
    } catch (error) {
      if (
        index === attempts - 1 ||
        !/(429|500|502|503|504|fetch failed|timeout|ECONNRESET|ETIMEDOUT)/i.test(
          safeError(error),
        )
      ) {
        throw error;
      }

      const delay = Math.min(30000, 1200 * 2 ** index + Math.random() * 500);
      event("RETRY", name, `${safeError(error)}; retry in ${Math.ceil(delay / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function isMedia(file) {
  const mime = file.file?.mimeType || "";
  return (
    /^image\//.test(mime) ||
    /^video\//.test(mime) ||
    /\.(jpg|jpeg|png|gif|heic|heif|webp|tif|tiff|bmp|mp4|mov|avi|mkv|m4v|3gp)$/i.test(
      file.name,
    )
  );
}

export async function scanDrive() {
  const queue = [
    "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,file,folder,size,eTag&$top=200",
  ];
  const files = [];

  while (queue.length) {
    let url = queue.shift();

    while (url) {
      const data = await retry(
        () => api("microsoft", url).then((response) => response.json()),
        "Scan",
      );

      for (const file of data.value || []) {
        if (file.folder) {
          queue.push(
            `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(file.id)}/children?$select=id,name,file,folder,size,eTag&$top=200`,
          );
        } else if (file.file && isMedia(file)) {
          files.push({
            id: file.id,
            name: file.name,
            size: file.size || 0,
            mime: file.file.mimeType || "application/octet-stream",
            etag: file.eTag || "",
          });
        }
      }

      url = data["@odata.nextLink"];
    }
  }

  return files;
}

export function buildPublicJob() {
  const state = getState();
  const job = state.job;
  if (!job) return null;

  const { id, running, total, done, skipped, failed, pending, startedAt, finishedAt, interrupted, errors, active } = job;

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

let createQueue = Promise.resolve();

function serialCreate(fn) {
  const result = createQueue.catch(() => undefined).then(fn);
  createQueue = result.catch(() => undefined);
  return result;
}

export async function createMedia(file, uploadToken) {
  return serialCreate(async () => {
    const response = await api("google", "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newMediaItems: [{
          description: "Imported from OneDrive via CloudBridge360",
          simpleMediaItem: { fileName: file.name, uploadToken },
        }],
      }),
    });

    const result = await response.json();
    const item = result.newMediaItemResults?.[0];
    if (item?.status?.code) {
      throw Error(`Google create error ${item.status.code}: ${item.status.message}`);
    }
    if (!item?.mediaItem?.id) {
      throw Error("Google did not return a media item ID");
    }

    return item.mediaItem.id;
  });
}

export async function initGoogleUpload(file) {
  const token = await access("google");
  const response = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Content-Type": file.mime,
      "X-Goog-Upload-Content-Length": String(file.size),
      "Content-Type": "application/octet-stream",
      "Content-Length": "0",
    },
  });

  if (!response.ok) {
    throw Error(`Google upload init HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const uploadUrl = response.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw Error("Google did not provide resumable upload URL");
  }

  return uploadUrl;
}

export async function queryOffset(uploadUrl) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "query", "Content-Length": "0" },
  });

  if (!response.ok) throw Error(`Google upload query HTTP ${response.status}`);

  const offset = Number(response.headers.get("x-goog-upload-size-received") || "0");
  return { offset, status: response.headers.get("x-goog-upload-status") };
}

export async function sendChunk(uploadUrl, bytes, offset, final) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": final ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": String(offset),
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });

  if (!response.ok) {
    throw Error(`Google chunk HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  return final ? response.text() : null;
}

export async function sourceStream(file, offset = 0) {
  const headers = offset ? { Range: `bytes=${offset}-` } : {};
  const response = await api(
    "microsoft",
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(file.id)}/content`,
    { headers },
  );

  if (offset && response.status !== 206) {
    throw Error("OneDrive did not honor Range request; cannot safely resume");
  }

  if (!response.body) {
    throw Error("OneDrive returned an empty stream");
  }

  return response.body.getReader();
}

export async function uploadFile(file, active) {
  if (file.size <= 0) throw Error("Empty or unknown file size");
  if (
    (file.mime.startsWith("image/") && file.size > appConfig.maxImageBytesPerFile) ||
    (file.mime.startsWith("video/") && file.size > appConfig.maxVideoBytesPerFile)
  ) {
    throw Error("File exceeds Google Photos per-file limit");
  }

  const uploadUrl = await initGoogleUpload(file);
  let offset = 0;
  let uploadToken = null;
  const reader = await sourceStream(file);
  let pending = Buffer.alloc(0);

  try {
    while (offset < file.size) {
      while (pending.length < Math.min(appConfig.chunkSize, file.size - offset)) {
        const { value, done } = await reader.read();
        if (done) throw Error("OneDrive stream ended before expected file size");
        pending = Buffer.concat([pending, Buffer.from(value)]);
      }

      const length = Math.min(appConfig.chunkSize, file.size - offset);
      const bytes = pending.subarray(0, length);
      pending = pending.subarray(length);
      const final = offset + length === file.size;

      try {
        uploadToken = await sendChunk(uploadUrl, bytes, offset, final);
        offset += length;
        active.bytes = offset;
      } catch (error) {
        const query = await queryOffset(uploadUrl).catch(() => null);
        if (!query || query.offset !== offset + length || final) {
          throw Error(
            `${safeError(error)}; upload outcome uncertain. Review destination before retrying.`,
          );
        }

        offset = query.offset;
        active.bytes = offset;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (!uploadToken) {
    throw Error("Google did not provide a finalized upload token");
  }

  active.stage = "Creating Google Photos item";
  return createMedia(file, uploadToken);
}

export async function processOne(file, job) {
  const state = getState();
  const key = keyOf(file);

  if (
    state.records[key]?.status === "imported" ||
    state.records[legacyKeyOf(file)]?.status === "imported"
  ) {
    job.skipped += 1;
    return true;
  }

  if (
    state.records[key]?.status === "uncertain" ||
    state.records[key]?.status === "uploading"
  ) {
    job.failed += 1;
    job.errors.push({
      name: file.name,
      error: "Prior outcome uncertain; inspect Google Photos before retrying",
    });
    return false;
  }

  const active = {
    name: file.name,
    size: file.size,
    bytes: 0,
    stage: "Starting",
    startedAt: now(),
  };

  job.active[file.id] = active;
  event("STARTED", file.name, `${file.size} bytes`);
  state.records[key] = { name: file.name, status: "uploading", at: now() };
  await save();

  try {
    const mediaId = await uploadFile(file, active);
    state.records[key] = {
      name: file.name,
      status: "imported",
      at: now(),
      mediaId,
    };
    job.done += 1;
    event("SUCCESS", file.name, `Google media ID: ${mediaId}`);
    return true;
  } catch (error) {
    const message = safeError(error);
    const uncertain =
      /uncertain|Google create|batchCreate|Google did not return|fetch failed/i.test(message) ||
      active.stage === "Creating Google Photos item";

    state.records[key] = {
      name: file.name,
      status: uncertain ? "uncertain" : "failed",
      at: now(),
      error: message,
    };

    job.failed += 1;
    job.errors.push({ name: file.name, error: message });
    event(uncertain ? "UNCERTAIN" : "FAILED", file.name, message);
    return false;
  } finally {
    delete job.active[file.id];
    await save();
  }
}

export async function runJob(files) {
  const state = getState();
  const job = state.job;
  const throughputController = new AdaptiveThroughputController({
    minConcurrency: appConfig.minUploadConcurrency,
    maxConcurrency: appConfig.maxUploadConcurrency,
    initialConcurrency: appConfig.concurrency,
  });
  let cursor = 0;

  try {
    const concurrency = throughputController.getTargetConcurrency();
    await Promise.all(
      Array.from({ length: Math.min(concurrency, files.length) }, async () => {
        while (cursor < files.length) {
          const file = files[cursor];
          cursor += 1;
          const startedAt = Date.now();
          const success = await processOne(file, job);
          const elapsedMs = Date.now() - startedAt;
          throughputController.recordBatch({
            successCount: success ? 1 : 0,
            failureCount: success ? 0 : 1,
            totalBytes: file.size,
            elapsedMs,
          });
        }
      }),
    );
  } catch (error) {
    event("JOB_ERROR", "Migration", safeError(error));
    job.errors.push({ name: "Job", error: safeError(error) });
  } finally {
    job.running = false;
    job.finishedAt = now();
    job.pending = Math.max(0, job.total - job.done - job.skipped - job.failed);
    job.throughput = throughputController.snapshot();
    event(
      "COMPLETED",
      "Migration",
      `${job.done} imported, ${job.skipped} skipped, ${job.failed} failed, ${job.pending} pending`,
    );
    await save();
  }
}
