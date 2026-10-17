/** Environment config, validated once at startup. */
const isProd = process.env.NODE_ENV === "production";
const DEV_SECRET = "janamen-dev-secret";

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd) throw new Error("JWT_SECRET must be set (≥16 chars) in production");
  return DEV_SECRET;
}

export const config = {
  port: Number(process.env.PORT ?? 8000),
  jwtSecret: jwtSecret(),
  jwtTtl: 12 * 60 * 60, // seconds
  /** Comma-separated origins allowed to call the API from a browser; "*" allows any. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  /** "mock" is the only implementation today; a real adapter plugs in by adding a case in IntegrationsModule. */
  integrationsMode: process.env.INTEGRATIONS_MODE ?? "mock",
};
