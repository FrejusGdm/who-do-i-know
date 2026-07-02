import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";

const TOKEN_REFRESH_MARGIN_MS = 60_000;

export async function getGoogleOAuthClientForUser(userId: string) {
  const [googleAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")))
    .limit(1);

  if (!googleAccount?.accessToken && !googleAccount?.refreshToken) {
    throw new Error("No Google OAuth tokens found for this user.");
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2.setCredentials({
    access_token: googleAccount.accessToken ?? undefined,
    refresh_token: googleAccount.refreshToken ?? undefined,
    expiry_date: googleAccount.accessTokenExpiresAt?.getTime(),
  });

  const expiresAt = googleAccount.accessTokenExpiresAt?.getTime() ?? 0;
  const needsRefresh = Boolean(
    googleAccount.refreshToken &&
      (!googleAccount.accessToken || !expiresAt || expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS),
  );

  if (needsRefresh) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials({
      ...oauth2.credentials,
      ...credentials,
      refresh_token: credentials.refresh_token ?? googleAccount.refreshToken ?? undefined,
    });

    await db
      .update(account)
      .set({
        accessToken: credentials.access_token ?? googleAccount.accessToken,
        refreshToken: credentials.refresh_token ?? googleAccount.refreshToken,
        accessTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : googleAccount.accessTokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(account.id, googleAccount.id));
  }

  return oauth2;
}
