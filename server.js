import "./src/server.js";

function requireLocal(req, res, next) {
    if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
    )
        return res.status(403).json({ error: "Local access only" });
    next();
}
app.use("/api", requireLocal);
app.use("/auth", requireLocal);
app.use("/callback", requireLocal);
app.get("/auth/:provider", (req, res) => {
    const p = req.params.provider,
        c = providers[p];
    if (!c) return res.sendStatus(404);
    if (!c.client())
        return res.status(400).send(`Missing ${p} client ID in .env`);
    const stateValue = crypto.randomBytes(24).toString("hex");
    req.session[`oauth_${p}`] = stateValue;
    const u = new URL(c.auth);
    for (const [k, v] of Object.entries({
        client_id: c.client(),
        redirect_uri: redirect(p),
        response_type: "code",
        scope: c.scope,
        state: stateValue,
        ...(p === "google"
            ? { access_type: "offline", prompt: "consent" }
            : { prompt: "select_account" }),
    }))
        u.searchParams.set(k, v);
    req.session.save((err) =>
        err
            ? res.status(500).send("Could not save OAuth session")
            : res.redirect(u.toString()),
    );
});
app.get("/callback/:provider", async (req, res) => {
    const p = req.params.provider,
        c = providers[p];
    if (!c) return res.sendStatus(404);
    if (!req.query.state || req.query.state !== req.session[`oauth_${p}`])
        return res.status(400).send("OAuth state mismatch");
    delete req.session[`oauth_${p}`];
    try {
        const r = await fetch(c.token, {
            method: "POST",
            body: new URLSearchParams({
                client_id: c.client(),
                client_secret: c.secret() || "",
                code: String(req.query.code || ""),
                redirect_uri: redirect(p),
                grant_type: "authorization_code",
            }),
        });
        const t = await r.json();
        if (!r.ok) throw Error(JSON.stringify(t));
        state.tokens[p] = {
            ...t,
            refresh_token: t.refresh_token || state.tokens[p]?.refresh_token,
            expires_at: Date.now() + t.expires_in * 1000,
        };
        const profileUrl =
            p === "microsoft"
                ? "https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName"
                : "https://www.googleapis.com/oauth2/v3/userinfo";
        // Google userinfo may be inaccessible with only Photos scope. Use a stable token-derived identity fallback only for local mode.
        if (p === "microsoft") {
            const me = await api(p, profileUrl).then((r) => r.json());
            state.accounts.microsoft = {
                id: me.id,
                name: me.userPrincipalName || me.displayName,
            };
        } else {
            // Google identity scope is not requested; never infer account identity from token contents.
            state.accounts.google = {
                id: "local-google-account",
                name: "Connected Google Photos account",
            };
        }
        await save();
        res.redirect("/");
    } catch (e) {
        res.status(500).send("OAuth failed: " + safeError(e));
    }
});
const refreshLocks = new Map();
async function access(p) {
    const t = state.tokens[p];
    if (!t) throw Error(`Not connected: ${p}`);
    if (t.access_token && Date.now() < t.expires_at - 120000)
        return t.access_token;
    if (refreshLocks.has(p)) return refreshLocks.get(p);
    const task = (async () => {
        if (!t.refresh_token) throw Error(`Reconnect ${p}: refresh token missing`);
        const c = providers[p];
        const r = await fetch(c.token, {
            method: "POST",
            body: new URLSearchParams({
                client_id: c.client(),
                client_secret: c.secret() || "",
                refresh_token: t.refresh_token,
                grant_type: "refresh_token",
                ...(p === "microsoft" ? { scope: c.scope } : {}),
            }),
        });
        const v = await r.json();
        if (!r.ok)
            throw Error(`Token refresh failed for ${p}: ${JSON.stringify(v)}`);
        state.tokens[p] = {
            ...t,
            ...v,
            refresh_token: v.refresh_token || t.refresh_token,
            expires_at: Date.now() + v.expires_in * 1000,
        };
        await save();
        return v.access_token;
    })();
    refreshLocks.set(p, task);
    try {
        return await task;
    } finally {
        refreshLocks.delete(p);
    }
}
async function api(p, url, options = {}) {
    const token = await access(p);
    const r = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!r.ok)
        throw Error(`${p} HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
    return r;
}
async function retry(fn, name, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            if (
                i === attempts - 1 ||
                !/(429|500|502|503|504|fetch failed|timeout|ECONNRESET|ETIMEDOUT)/i.test(
                    safeError(e),
                )
            )
                throw e;
            const wait = Math.min(30000, 1200 * 2 ** i + Math.random() * 500);
            event(
                "RETRY",
                name,
                `${safeError(e)}; retry in ${Math.ceil(wait / 1000)}s`,
            );
            await sleep(wait);
        }
    }
}

function isMedia(f) {
    const mime = f.file?.mimeType || "";
    return (
        /^image\//.test(mime) ||
        /^video\//.test(mime) ||
        /\.(jpg|jpeg|png|gif|heic|heif|webp|tif|tiff|bmp|mp4|mov|avi|mkv|m4v|3gp)$/i.test(
            f.name,
        )
    );
}
async function scanDrive() {
    const queue = [
        "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,file,folder,size,eTag&$top=200",
    ];
    const files = [];
    while (queue.length) {
        let url = queue.shift();
        while (url) {
            const d = await retry(
                () => api("microsoft", url).then((r) => r.json()),
                "Scan",
            );
            for (const f of d.value || []) {
                if (f.folder)
                    queue.push(
                        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(f.id)}/children?$select=id,name,file,folder,size,eTag&$top=200`,
                    );
                else if (f.file && isMedia(f))
                    files.push({
                        id: f.id,
                        name: f.name,
                        size: f.size || 0,
                        mime: f.file.mimeType || "application/octet-stream",
                        etag: f.eTag || "",
                    });
            }
            url = d["@odata.nextLink"];
        }
    }
    return files;
}

function keyOf(f) {
    return `${state.accounts.microsoft?.id || "ms"}:${f.id}:${f.etag}`;
}

function legacyKeyOf(f) {
    return `${f.id}:${f.etag}`;
}

function publicJob() {
    const j = state.job;
    if (!j) return null;
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
    } = j;
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
app.get("/api/status", (req, res) =>
    res.json({
        microsoft: connected("microsoft"),
        google: connected("google"),
        accounts: state.accounts,
        scanned: state.files.length,
        job: publicJob(),
        events: state.events.slice(-40),
    }),
);
app.get("/api/history", (req, res) =>
    res.json({
        records: Object.entries(state.records).map(([key, v]) => ({
            key,
            name: v.name,
            status: v.status,
            at: v.at,
            mediaId: v.mediaId || null,
            error: v.error || null,
        })),
    }),
);
app.get("/api/report.csv", (req, res) => {
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [
        ["Source key", "Name", "Status", "Date", "Google media ID", "Error"],
        ...Object.entries(state.records).map(([key, v]) => [
            key,
            v.name,
            v.status,
            v.at,
            v.mediaId || "",
            v.error || "",
        ]),
    ];
    res
        .type("text/csv")
        .set("Content-Disposition", 'attachment; filename="cloudbridge-report.csv"')
        .send(rows.map((row) => row.map(esc).join(",")).join("\r\n"));
});
app.get("/api/scan", requireBoth, async (req, res) => {
    if (state.job?.running)
        return res.status(409).json({ error: "Cannot scan while migrating" });
    try {
        state.files = await scanDrive();
        await save();
        res.json({
            count: state.files.length,
            bytes: state.files.reduce((n, f) => n + f.size, 0),
            files: state.files.slice(0, 100),
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});
// Avoid multiple simultaneous mediaItems:batchCreate calls per user.
let createQueue = Promise.resolve();

function serialCreate(fn) {
    const result = createQueue.catch(() => { }).then(fn);
    createQueue = result.catch(() => { });
    return result;
}
async function createMedia(f, token) {
    return serialCreate(async () => {
        const r = await api(
            "google",
            "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    newMediaItems: [
                        {
                            description: "Imported from OneDrive via CloudBridge360",
                            simpleMediaItem: { fileName: f.name, uploadToken: token },
                        },
                    ],
                }),
            },
        );
        const result = await r.json();
        const item = result.newMediaItemResults?.[0];
        if (item?.status?.code)
            throw Error(
                `Google create error ${item.status.code}: ${item.status.message}`,
            );
        if (!item?.mediaItem?.id)
            throw Error("Google did not return a media item ID");
        return item.mediaItem.id;
    });
}
async function initGoogleUpload(f) {
    const token = await access("google");
    const r = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Content-Type": f.mime,
            "X-Goog-Upload-Content-Length": String(f.size),
            "Content-Type": "application/octet-stream",
            "Content-Length": "0",
        },
    });
    if (!r.ok)
        throw Error(
            `Google upload init HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`,
        );
    const url = r.headers.get("x-goog-upload-url");
    if (!url) throw Error("Google did not provide resumable upload URL");
    return url;
}
async function queryOffset(uploadUrl) {
    const r = await fetch(uploadUrl, {
        method: "POST",
        headers: { "X-Goog-Upload-Command": "query", "Content-Length": "0" },
    });
    if (!r.ok) throw Error(`Google upload query HTTP ${r.status}`);
    const offset = Number(r.headers.get("x-goog-upload-size-received") || "0");
    return { offset, status: r.headers.get("x-goog-upload-status") };
}
async function sendChunk(uploadUrl, bytes, offset, final) {
    const r = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "X-Goog-Upload-Command": final ? "upload, finalize" : "upload",
            "X-Goog-Upload-Offset": String(offset),
            "Content-Type": "application/octet-stream",
        },
        body: bytes,
    });
    if (!r.ok)
        throw Error(
            `Google chunk HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`,
        );
    return final ? r.text() : null;
}
async function sourceStream(f, offset = 0) {
    const headers = offset ? { Range: `bytes=${offset}-` } : {};
    const r = await api(
        "microsoft",
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(f.id)}/content`,
        { headers },
    );
    if (offset && r.status !== 206)
        throw Error("OneDrive did not honor Range request; cannot safely resume");
    if (!r.body) throw Error("OneDrive returned an empty stream");
    return r.body.getReader();
}
async function uploadFile(f, active) {
    if (f.size <= 0) throw Error("Empty or unknown file size");
    if (
        (f.mime.startsWith("image/") && f.size > 200 * 1024 * 1024) ||
        (f.mime.startsWith("video/") && f.size > 20 * 1024 ** 3)
    )
        throw Error("File exceeds Google Photos per-file limit");
    const uploadUrl = await initGoogleUpload(f);
    let offset = 0,
        uploadToken = null;
    // Bounded streaming: read chunks from OneDrive and send directly to Google. No media files stored.
    let reader = await sourceStream(f);
    let pending = Buffer.alloc(0);
    try {
        while (offset < f.size) {
            while (pending.length < Math.min(CHUNK, f.size - offset)) {
                const { value, done } = await reader.read();
                if (done)
                    throw Error("OneDrive stream ended before expected file size");
                pending = Buffer.concat([pending, Buffer.from(value)]);
            }
            const length = Math.min(CHUNK, f.size - offset);
            const bytes = pending.subarray(0, length);
            pending = pending.subarray(length);
            const final = offset + length === f.size;
            try {
                uploadToken = await sendChunk(uploadUrl, bytes, offset, final);
                offset += length;
                active.bytes = offset;
            } catch (e) {
                // Resolve ambiguous outcomes with Google's acknowledged offset.
                const q = await queryOffset(uploadUrl).catch(() => null);
                if (!q || q.offset !== offset + length || final)
                    throw Error(
                        `${safeError(e)}; upload outcome uncertain. Review destination before retrying.`,
                    );
                offset = q.offset;
                active.bytes = offset;
            }
        }
    } finally {
        await reader.cancel().catch(() => { });
    }
    if (!uploadToken)
        throw Error("Google did not provide a finalized upload token");
    active.stage = "Creating Google Photos item";
    // A failure after creation may be ambiguous: don't automatically retry batchCreate.
    const mediaId = await createMedia(f, uploadToken);
    return mediaId;
}
async function processOne(f, job) {
    const key = keyOf(f);
    if (
        state.records[key]?.status === "imported" ||
        state.records[legacyKeyOf(f)]?.status === "imported"
    ) {
        job.skipped++;
        return;
    }
    if (
        state.records[key]?.status === "uncertain" ||
        state.records[key]?.status === "uploading"
    ) {
        job.failed++;
        job.errors.push({
            name: f.name,
            error: "Prior outcome uncertain; inspect Google Photos before retrying",
        });
        return;
    }
    const active = {
        name: f.name,
        size: f.size,
        bytes: 0,
        stage: "Starting",
        startedAt: now(),
    };
    job.active[f.id] = active;
    event("STARTED", f.name, `${f.size} bytes`);
    state.records[key] = { name: f.name, status: "uploading", at: now() };
    await save();
    try {
        const id = await uploadFile(f, active);
        state.records[key] = {
            name: f.name,
            status: "imported",
            at: now(),
            mediaId: id,
        };
        job.done++;
        event("SUCCESS", f.name, `Google media ID: ${id}`);
    } catch (e) {
        const msg = safeError(e);
        // Conservative default: an API error after bytes sent may be an ambiguous success.
        const uncertain =
            /uncertain|Google create|batchCreate|Google did not return|fetch failed/i.test(
                msg,
            ) || active.stage === "Creating Google Photos item";
        state.records[key] = {
            name: f.name,
            status: uncertain ? "uncertain" : "failed",
            at: now(),
            error: msg,
        };
        job.failed++;
        job.errors.push({ name: f.name, error: msg });
        event(uncertain ? "UNCERTAIN" : "FAILED", f.name, msg);
    } finally {
        delete job.active[f.id];
        await save();
    }
}
async function runJob(files) {
    const job = state.job;
    let cursor = 0;
    try {
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
                while (cursor < files.length) {
                    const f = files[cursor++];
                    await processOne(f, job);
                }
            }),
        );
    } catch (e) {
        event("JOB_ERROR", "Migration", safeError(e));
        job.errors.push({ name: "Job", error: safeError(e) });
    } finally {
        job.running = false;
        job.finishedAt = now();
        job.pending = Math.max(0, job.total - job.done - job.skipped - job.failed);
        event(
            "COMPLETED",
            "Migration",
            `${job.done} imported, ${job.skipped} skipped, ${job.failed} failed, ${job.pending} pending`,
        );
        await save();
    }
}
app.post("/api/migrate", requireBoth, async (req, res) => {
    if (state.job?.running)
        return res.status(409).json({ error: "Migration already running" });
    if (!state.files.length)
        return res.status(400).json({ error: "Scan OneDrive first" });
    const retryOnly = req.body?.retryOnly === true;
    const files = retryOnly
        ? state.files.filter((f) => state.records[keyOf(f)]?.status === "failed")
        : state.files;
    state.job = {
        id: crypto.randomUUID(),
        running: true,
        total: files.length,
        done: 0,
        skipped: 0,
        failed: 0,
        pending: files.length,
        startedAt: now(),
        finishedAt: null,
        errors: [],
        active: {},
    };
    await save();
    res.json({ started: true, total: files.length });
    void runJob(files).catch((e) =>
        console.error("Unexpected worker failure:", e),
    );
});
app.listen(PORT, "127.0.0.1", () =>
    console.log(`CloudBridge360 running at ${BASE}`),
);
