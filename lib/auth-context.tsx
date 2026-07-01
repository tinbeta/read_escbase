"use client";

import { createContext, useContext } from "react";

type AuthContextValue = {
  accessToken: string | null;
  email: string | null;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  accessToken: null,
  email: null,
  signOut: () => undefined,
});

export const AuthProvider = AuthContext.Provider;

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
