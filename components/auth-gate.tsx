"use client";

import { CircleUserRound, LoaderCircle, LockKeyhole, LogOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthProvider } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function getAllowedEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ALLOWED_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getSupabaseAuthStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    const host = new URL(url).hostname;
    const projectRef = host.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function readCachedSession(): Session | null {
  if (typeof window === "undefined") return null;

  const storageKey = getSupabaseAuthStorageKey();
  if (!storageKey) return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const session =
      parsed && typeof parsed === "object" && "currentSession" in parsed
        ? (parsed.currentSession as Session | null)
        : (parsed as Session | null);

    if (!session?.access_token || !session.user?.email) return null;
    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cachedSession = readCachedSession();
    const cachedSessionTimer = cachedSession
      ? window.setTimeout(() => {
          if (!cancelled) setSession(cachedSession);
        }, 0)
      : null;

    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      if (cachedSessionTimer) window.clearTimeout(cachedSessionTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    setError("");
    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (authError) setError(authError.message);
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
  }

  const allowedEmails = getAllowedEmails();
  const sessionEmail = session?.user.email?.toLowerCase() || "";
  const hasAccess = allowedEmails.length > 0 && allowedEmails.includes(sessionEmail);

  if (!authReady && !hasAccess) {
    return (
      <main className="login-screen">
        <div className="login-orb">
          <LoaderCircle className="spin" size={30} />
        </div>
        <p className="login-loading">Đang kiểm tra đăng nhập...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="login-screen">
        <div className="login-brand">
          <Image src="/esclogo-classic-v2.png" alt="" width={56} height={56} />
          <span>
            Fast <strong>Escbase</strong>
          </span>
        </div>
        <p className="eyebrow">Đọc nhanh video ngắn</p>
        <p className="login-copy">
          Dán link TikTok, Facebook Reel hoặc Youtube Short để AI tóm tắt và kiểm chứng tính đúng sai của nội dung.
        </p>
        <button className="google-button" type="button" onClick={signIn}>
          <CircleUserRound size={20} /> Đăng nhập bằng Google
        </button>
        <p className="login-lock">
          <LockKeyhole size={14} /> Chỉ tài khoản được cấp quyền mới truy cập
        </p>
        {error && <p className="error-box">{error}</p>}
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="login-screen">
        <div className="login-orb login-orb-denied">
          <LockKeyhole size={34} />
        </div>
        <p className="eyebrow">Quyền truy cập riêng tư</p>
        <h1>
          Tài khoản này
          <br />
          <em>không được phép</em>
        </h1>
        <p className="login-copy">{session.user.email} chưa được cấp quyền dùng Fast Escbase.</p>
        <button className="google-button" type="button" onClick={signOut}>
          <LogOut size={18} /> Đăng xuất
        </button>
      </main>
    );
  }

  return (
    <AuthProvider value={{ accessToken: session.access_token, email: sessionEmail, signOut }}>
      {children}
    </AuthProvider>
  );
}
