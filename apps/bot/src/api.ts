import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { notifyRequestSchema } from "@meet/shared";
import { client, getMember, listRoles, listVoiceChannels, memberSummary, roleMembers, searchMembers } from "./discord";
import { env } from "./env";
import { handleNotify } from "./notify";

function secretMatches(given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.INTERNAL_API_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Internal API for the web app. Reachable only inside the cluster (ClusterIP Service),
 * and every route except /health also needs the shared secret header.
 */
export function buildApi() {
  const app = Fastify({ logger: { level: "warn" } });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    if (!secretMatches(req.headers["x-internal-secret"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!client.isReady()) {
      return reply.code(503).send({ error: "bot not ready" });
    }
  });

  app.get("/health", async (_req, reply) => {
    // Liveness: the process answers. Readiness is reported in the body for debugging.
    return reply.send({ ok: true, discordReady: client.isReady() });
  });

  app.get("/members", async (req) => {
    const q = z.object({ q: z.string().default(""), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    return searchMembers(q.q, q.limit);
  });

  app.get("/members/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = await getMember(id);
    if (!m) return reply.code(404).send({ error: "not a member" });
    return memberSummary(m);
  });

  app.post("/members/lookup", async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(500) }).parse(req.body);
    const out = await Promise.all(ids.map(async (id) => getMember(id)));
    return out.filter((m) => m !== null).map(memberSummary);
  });

  app.get("/roles", async () => listRoles());

  app.get("/roles/:id/members", async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = roleMembers(id);
    if (!r) return reply.code(404).send({ error: "unknown role" });
    return r;
  });

  app.get("/voice-channels", async () => listVoiceChannels());

  app.post("/notify", async (req, reply) => {
    const body = notifyRequestSchema.parse(req.body);
    // Answer at once; DMs can take a while for big guest lists. Results land in guests[].dmStatus.
    handleNotify(body).catch((err) => console.error("notify failed:", err));
    return reply.code(202).send({ accepted: true });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "invalid request", issues: err.issues });
    console.error(err);
    return reply.code(500).send({ error: "internal error" });
  });

  return app;
}
