import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";

const authMock = vi.hoisted(() => {
  let listener: ((event: unknown, session: unknown) => void) | undefined;
  let profileReader: (id: string) => Promise<{ data: unknown; error: unknown }> = async (id) => ({
    data: { id, name: "Pengguna", email: id + "@example.test", role: "staff" },
    error: null,
  });
  return {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn((callback: (event: unknown, session: unknown) => void) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    emit: (event: unknown, session: unknown) => listener?.(event, session),
    setProfileReader: (reader: typeof profileReader) => { profileReader = reader; },
    readProfile: (id: string) => profileReader(id),
  };
});

vi.mock("@/lib/supabase/browser", () => {
  const client = {
    auth: {
      onAuthStateChange: authMock.subscribe,
      getSession: authMock.getSession,
      signInWithPassword: authMock.signInWithPassword,
      resetPasswordForEmail: authMock.resetPasswordForEmail,
      signOut: authMock.signOut,
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: () => authMock.readProfile(id),
        }),
      }),
    }),
  };
  return { getSupabaseBrowserClient: () => client };
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

function session(id: string) {
  return { user: { id } } as Session;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.setProfileReader(async (id) => ({
    data: { id, name: "Pengguna", email: id + "@example.test", role: "staff" },
    error: null,
  }));
  authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
  authMock.signInWithPassword.mockResolvedValue({ error: null });
  authMock.signOut.mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe("AuthProvider session and profile lifecycle", () => {
  it("loads the profile directly after first login without a reload", async () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    authMock.signInWithPassword.mockImplementation(async () => {
      authMock.emit("SIGNED_IN", session(id));
      return { error: null };
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.login("user@example.test", "secret"); });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user?.id).toBe(id);
    });
  });

  it("restores the profile from a session returned by getSession", async () => {
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    authMock.getSession.mockResolvedValue({ data: { session: session(id) }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user?.id).toBe(id);
    });
  });

  it("keeps the newest account when an older profile request finishes late", async () => {
    const firstId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const pending = new Map<string, (result: { data: unknown; error: unknown }) => void>();
    authMock.setProfileReader((id) => new Promise((resolve) => pending.set(id, resolve)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { authMock.emit("SIGNED_IN", session(firstId)); });
    await waitFor(() => expect(pending.has(firstId)).toBe(true));
    await act(async () => { authMock.emit("SIGNED_IN", session(secondId)); });
    await waitFor(() => expect(pending.has(secondId)).toBe(true));
    await act(async () => {
      pending.get(secondId)?.({ data: { id: secondId, name: "B", email: "b@example.test", role: "staff" }, error: null });
    });
    await waitFor(() => expect(result.current.user?.id).toBe(secondId));
    await act(async () => {
      pending.get(firstId)?.({ data: { id: firstId, name: "A", email: "a@example.test", role: "staff" }, error: null });
    });
    expect(result.current.user?.id).toBe(secondId);
  });

  it("reports profile query failures and clears the error on logout", async () => {
    authMock.setProfileReader(async () => ({ data: null, error: { message: "offline" } }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { authMock.emit("SIGNED_IN", session("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")); });
    await waitFor(() => expect(result.current.error).toMatch(/profil akun gagal dimuat/i));
    await act(async () => { authMock.emit("SIGNED_OUT", null); });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
