"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const { signIn, signUp, signOut, useSession, sendVerificationEmail } =
  createAuthClient({
    plugins: [usernameClient()],
  });
