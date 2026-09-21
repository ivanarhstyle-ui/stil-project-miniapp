import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const {
  PORT = "10000",
  TELEGRAM_BOT_TOKEN,
  ALLOWED_TELEGRAM_IDS = "",
  AUTH_MAX_AGE_SECONDS = "86400",
  ALLOWED_ORIGINS = "",
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  SUPABASE_BUCKET = "project-files",
  WORKSPACE_ID = "main",
} = process.env;

for (const [name, value] of Object.entries({
  TELEGRAM_BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const allowedUserIds = new Set(
  ALLOWED_TELEGRAM_IDS.split(",").map(v => v.trim()).filter(Boolean)
);
const allowedOrigins = ALLOWED_ORIGINS.split(",").map(v => v.trim()).filter(Boolean);
const maxAuthAge = Number(AUTH_MAX_AGE_SECONDS) || 86400;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin is not allowed"));
    }
  },
  methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Telegram-Init-Data"],
}));
app.use(express.json({ limit: "12mb" }));

function timingSafeHexEqual(a, b) {
  try {
    const aa = Buffer.from(String(a), "hex");
    const bb = Buffer.from(String(b), "hex");
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function computeTelegramHash(params, excludeSignature = false) {
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    if (excludeSignature && key === "signature") continue;
    pairs.push([key, value]);
  }
  pairs.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(TELEGRAM_BOT_TOKEN)
    .digest();
  return crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
}

function validateTelegramInitData(initData) {
  if (!initData) throw Object.assign(new Error("Telegram initData is missing"), { status: 401 });
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) throw Object.assign(new Error("Telegram hash is missing"), { status: 401 });

  // Telegram's classic bot-token validation uses every received field except hash.
  // Some newer clients also include signature; fallback without signature keeps compatibility.
  const valid =
    timingSafeHexEqual(computeTelegramHash(params, false), receivedHash) ||
    timingSafeHexEqual(computeTelegramHash(params, true), receivedHash);

  if (!valid) throw Object.assign(new Error("Invalid Telegram signature"), { status: 401 });

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(now - authDate) > maxAuthAge) {
    throw Object.assign(new Error("Telegram session expired. Reopen the Mini App."), { status: 401 });
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch {
    throw Object.assign(new Error("Invalid Telegram user data"), { status: 401 });
  }
  if (!user?.id) throw Object.assign(new Error("Telegram user is missing"), { status: 401 });

  const userId = String(user.id);
  if (allowedUserIds.size > 0 && !allowedUserIds.has(userId)) {
    throw Object.assign(new Error("This Telegram account is not allowed"), { status: 403 });
  }
  return user;
}

function auth(req, res, next) {
  try {
    req.telegramUser = validateTelegramInitData(req.get("X-Telegram-Init-Data"));
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message || "Unauthorized" });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "STIL Project backend" });
});

app.use("/api", auth);

app.get("/api/me", (req, res) => {
  res.json({ user: req.telegramUser, workspaceId: WORKSPACE_ID });
});

app.get("/api/state", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("app_state")
      .select("state,updated_at,updated_by")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();

    if (error) throw error;
    res.json({
      state: data?.state || null,
      updatedAt: data?.updated_at || null,
      updatedBy: data?.updated_by || null,
    });
  } catch (err) {
    next(err);
  }
});

app.put("/api/state", async (req, res, next) => {
  try {
    const state = req.body?.state;
    if (!state || typeof state !== "object") {
      return res.status(400).json({ error: "state object is required" });
    }

    const payload = {
      id: WORKSPACE_ID,
      state,
      updated_at: new Date().toISOString(),
      updated_by: String(req.telegramUser.id),
    };

    const { data, error } = await supabase
      .from("app_state")
      .upsert(payload, { onConflict: "id" })
      .select("updated_at,updated_by")
      .single();

    if (error) throw error;
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function safeName(name = "document") {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return cleaned || "document";
}

app.post("/api/files", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const projectId = String(req.body.projectId || "");
    const targetType = String(req.body.targetType || "");
    const targetId = String(req.body.targetId || "");
    const label = String(req.body.label || "");
    const id = String(req.body.id || crypto.randomUUID());

    if (!projectId || !targetType || !targetId) {
      return res.status(400).json({ error: "projectId, targetType and targetId are required" });
    }

    const storagePath = [
      WORKSPACE_ID,
      safeName(projectId),
      safeName(targetType),
      safeName(targetId),
      `${id}-${safeName(req.file.originalname)}`
    ].join("/");

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || "application/octet-stream",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const row = {
      id,
      workspace_id: WORKSPACE_ID,
      project_id: projectId,
      target_type: targetType,
      target_id: targetId,
      label,
      name: req.file.originalname || "document",
      mime_type: req.file.mimetype || "application/octet-stream",
      size: req.file.size || 0,
      storage_path: storagePath,
      uploaded_by: String(req.telegramUser.id),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("project_files")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;

    res.json({
      file: {
        id: data.id,
        projectId: data.project_id,
        targetType: data.target_type,
        targetId: data.target_id,
        label: data.label || "",
        name: data.name,
        mimeType: data.mime_type,
        type: data.mime_type,
        size: Number(data.size || 0),
        createdAt: new Date(data.created_at).toLocaleString("ru-RU"),
        uploadedBy: data.uploaded_by,
      }
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/files/:id/meta", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("project_files")
      .select("*")
      .eq("id", req.params.id)
      .eq("workspace_id", WORKSPACE_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "File not found" });
    res.json({ file: data });
  } catch (err) {
    next(err);
  }
});

app.get("/api/files/:id/url", async (req, res, next) => {
  try {
    const { data: file, error } = await supabase
      .from("project_files")
      .select("storage_path")
      .eq("id", req.params.id)
      .eq("workspace_id", WORKSPACE_ID)
      .maybeSingle();

    if (error) throw error;
    if (!file) return res.status(404).json({ error: "File not found" });

    const { data, error: signedError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(file.storage_path, 60 * 10);

    if (signedError) throw signedError;
    res.json({ url: data.signedUrl, expiresIn: 600 });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/files/:id", async (req, res, next) => {
  try {
    const { data: file, error } = await supabase
      .from("project_files")
      .select("storage_path")
      .eq("id", req.params.id)
      .eq("workspace_id", WORKSPACE_ID)
      .maybeSingle();

    if (error) throw error;
    if (!file) return res.status(404).json({ error: "File not found" });

    const { error: storageError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([file.storage_path]);
    if (storageError) throw storageError;

    const { error: dbError } = await supabase
      .from("project_files")
      .delete()
      .eq("id", req.params.id)
      .eq("workspace_id", WORKSPACE_ID);
    if (dbError) throw dbError;

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Файл слишком большой. Максимум 50 МБ." });
  }
  res.status(500).json({ error: err?.message || "Internal server error" });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`STIL Project backend listening on port ${PORT}`);
});
