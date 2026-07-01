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

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
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

  if (!authReady) {
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
