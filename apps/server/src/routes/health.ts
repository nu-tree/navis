import { Hono } from "hono";

// DB 를 건드리지 않는다 — 프로세스가 살아있는지만 본다.
export const health = new Hono().get("/", (c) => c.json({ ok: true }));
