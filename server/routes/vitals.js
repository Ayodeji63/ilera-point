import { Router } from "express";

export const vitalsRouter = Router();
const bridgeOrigin = (process.env.VITALS_BRIDGE_URL || "http://127.0.0.1:8765").replace(/\/+$/, "");

async function bridgeRequest(path, options = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${bridgeOrigin}${path}`, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "The vitals sensors are unavailable.");
      error.status = response.status;
      throw error;
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError" || error.status) throw error;
    throw new Error("The local vitals service is not running. Try again or continue without vitals.");
  } finally {
    clearTimeout(deadline);
  }
}

function sendBridgeError(res, error) {
  if (error.name === "AbortError") return res.status(504).json({ error: "The vitals sensors did not respond in time." });
  if (error.status === 404) return res.status(404).json({ error: error.message });
  return res.status(503).json({ error: error.message || "The vitals sensors are unavailable." });
}

vitalsRouter.get("/temperature", async (_req, res) => {
  try { res.json(await bridgeRequest("/vitals/temperature")); }
  catch (error) { sendBridgeError(res, error); }
});

vitalsRouter.get("/health", async (_req, res) => {
  try { res.json(await bridgeRequest("/health")); }
  catch (error) { sendBridgeError(res, error); }
});

vitalsRouter.post("/session", async (_req, res) => {
  try { res.status(202).json(await bridgeRequest("/vitals/session", { method: "POST" })); }
  catch (error) { sendBridgeError(res, error); }
});

vitalsRouter.get("/session/:id", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid vitals capture session." });
  try { res.json(await bridgeRequest(`/vitals/session/${encodeURIComponent(req.params.id)}`)); }
  catch (error) { sendBridgeError(res, error); }
});
