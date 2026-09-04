import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { encryptSessionToken } from "@/infrastructure/auth/session-token";
import { proxy } from "./proxy";

const SECRET = "test-secret-at-least-32-bytes-long!!";

function request(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `session=${cookie}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

async function follow(path: string, cookie?: string): Promise<string | null> {
  const response = await proxy(request(path, cookie));
  return response.headers.get("location");
}

describe("auth proxy", () => {
  const previousSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.SESSION_SECRET = previousSecret;
  });

  it("lets a logged-out visitor see the landing page at /", async () => {
    expect(await follow("/")).toBeNull();
  });

  it("still sends logged-out visitors on /add to /login", async () => {
    const location = await follow("/add");
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/login");
  });

  it("lets a logged-out visitor reach /login and /signup", async () => {
    expect(await follow("/login")).toBeNull();
    expect(await follow("/signup")).toBeNull();
  });

  it("sends a logged-in visitor on /login to their map", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "30d",
    );
    const location = await follow("/login", token);
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/map");
  });

  it("sends a logged-in visitor on / to their map", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "30d",
    );
    const location = await follow("/", token);
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/map");
  });

  it("lets a logged-in visitor stay on /map", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "30d",
    );
    expect(await follow("/map", token)).toBeNull();
  });

  it("sends logged-out visitors on /map to the pitch at /", async () => {
    const location = await follow("/map");
    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe("/");
  });
});
