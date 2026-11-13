import { HttpError } from "./http";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, `Missing environment variable ${name}. Add it to .env.local (see .env.local.example).`);
  }
  return value;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}
