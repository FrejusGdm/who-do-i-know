import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

// Same-origin requests work on both the AWS URL and a future custom hostname.
export const authClient = createAuthClient({ plugins: [usernameClient()] });
export const { signIn, signOut, useSession } = authClient;
