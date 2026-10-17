// Vercel serverless entry. vercel.json rewrites all traffic here, and Express
// matches on the full "/api/v1/..." path exactly as it does locally.
import { createApp } from "../src/app";

export default createApp();
