import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import request from "supertest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";
import { PrismaService } from "../src/prisma/prisma.service";

export type Login = "aigerim" | "daulet" | "erlan" | "asel" | "dinara";

export interface TestApi {
  app: INestApplication;
  prisma: PrismaService;
  /** Wipes and re-seeds the database. */
  reset(): Promise<void>;
  token(who: Login): Promise<string>;
  get(who: Login | null, path: string): request.Test;
  post(who: Login | null, path: string, body?: object): request.Test;
  put(who: Login | null, path: string, body?: object): request.Test;
  close(): Promise<void>;
}

export async function createTestApi(customize?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApi> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  // Listen once: otherwise supertest opens/closes the shared server per request, which breaks
  // a request built before another one (e.g. a lazy login) finishes.
  await app.listen(0, "127.0.0.1");
  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();

  const tokens = new Map<Login, string>();
  const token = async (who: Login) => {
    if (!tokens.has(who)) {
      const res = await request(server).post("/api/v1/auth/login").send({ email: `${who}@jana.demo`, password: "demo1234" });
      if (res.status !== 200) throw new Error(`login ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
      tokens.set(who, res.body.token);
    }
    return tokens.get(who)!;
  };
  const authed = async (who: Login | null, t: request.Test) => (who ? t.set("Authorization", `Bearer ${await token(who)}`) : t);

  // supertest's Test is thenable; wrap so callers can `await api.get(...)` with auth applied.
  const call = (method: "get" | "post" | "put", who: Login | null, path: string, body?: object) => {
    const t = request(server)[method](`/api/v1${path}`);
    const ready = authed(who, body !== undefined ? t.send(body) : t);
    return ready.then((x) => x) as unknown as request.Test;
  };

  return {
    app,
    prisma,
    reset: async () => {
      await seedDatabase(prisma, { force: true });
    },
    token,
    get: (who, path) => call("get", who, path),
    post: (who, path, body) => call("post", who, path, body),
    put: (who, path, body) => call("put", who, path, body),
    close: () => app.close(),
  };
}

/** Today ± n days as YYYY-MM-DD (server-local calendar, same as the API). */
export function day(offset: number): string {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + offset)).toISOString().slice(0, 10);
}
