import type { ApiClient } from "./client";
import { mockApi } from "./mock";
import { realApi } from "./real";

export const API_MODE: "mock" | "real" = process.env.NEXT_PUBLIC_API_MODE === "real" ? "real" : "mock";

export const api: ApiClient = API_MODE === "real" ? realApi : mockApi;

export { ApiError, isApiError } from "./errors";
export { getToken, setToken } from "./token";
export { resetMockData } from "./mock";
export type * from "./types";
