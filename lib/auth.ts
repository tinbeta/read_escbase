import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export type AllowedUser = {
  user: User;
};

// Every AI-consuming API route calls this first. It reads the Google session
// token the client attached as `Authorization: Bearer <access_token>`,
// validates it against Supabase, then checks the caller's email against the
// ALLOWED_EMAIL allowlist. The client-side gate in components/auth-gate.tsx
// mirrors this same allowlist for UX (instant feedback), but this server
// check is the real enforcement — never trust the client-side check alone.
export async function requireAllowedUser(request: NextRequest): Promise<AllowedUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("Bạn cần đăng nhập Google.", 401);

  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new AuthError("Supabase chưa được cấu hình.", 503);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AuthError("Phiên đăng nhập không hợp lệ.", 401);

  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length === 0) {
    throw new AuthError("Chưa cấu hình ALLOWED_EMAIL trên server.", 503);
  }

  if (!data.user.email || !allowedEmails.includes(data.user.email.toLowerCase())) {
    throw new AuthError("Tài khoản Google này không có quyền dùng Fast Escbase.", 403);
  }

  return { user: data.user };
}
