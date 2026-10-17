import { execSync } from "child_process";

/** Brings the test database schema up to date once per `npm test`. */
export default function globalSetup() {
  require("./setup-env");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
}
