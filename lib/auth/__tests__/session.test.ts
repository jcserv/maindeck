import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth/auth";
import { getSession, requireSession } from "../session";

const mockGetSession = vi.mocked(auth.api.getSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSession", () => {
  it("returns null when better-auth returns no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("returns null when user is missing from session", async () => {
    mockGetSession.mockResolvedValue({ session: {} } as never);

    const session = await getSession();
    expect(session).toBeNull();
  });

  it("returns a Session with all required fields", async () => {
    const dob = new Date("1990-06-15");
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        dateOfBirth: dob,
        name: "testuser",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    } as never);

    const session = await getSession();

    expect(session).toEqual({
      userId: "user-1",
      email: "test@example.com",
      username: "testuser",
      dateOfBirth: dob,
    });
  });

  it("falls back to empty string when username is null", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        username: null,
        dateOfBirth: new Date("1990-01-01"),
        name: "user",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    } as never);

    const session = await getSession();
    expect(session?.username).toBe("");
  });

  it("returns null for dateOfBirth when the field is absent", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        dateOfBirth: null,
        name: "testuser",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    } as never);

    const session = await getSession();
    expect(session?.dateOfBirth).toBeNull();
  });
});

describe("requireSession", () => {
  it("returns the session when one exists", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        dateOfBirth: new Date("1990-01-01"),
        name: "testuser",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    } as never);

    const session = await requireSession();
    expect(session.userId).toBe("user-1");
  });

  it("redirects to /sign-in when session is missing", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });
});
