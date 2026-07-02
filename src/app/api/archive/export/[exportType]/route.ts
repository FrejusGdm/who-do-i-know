import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleMailAttachments, googleMailMessages, googlePeopleContacts } from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { toCsv } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

const EXPORTS = new Set(["messages", "attachments", "people_contacts"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportType: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { exportType } = await params;
    if (!EXPORTS.has(exportType)) {
      return NextResponse.json({ error: "Unknown archive export type" }, { status: 404 });
    }

    const csv = await buildArchiveExport(exportType, session.user.id);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="google-archive-${exportType}.csv"`,
      },
    });
  } catch (error) {
    console.error("Google archive export error:", error);
    return NextResponse.json({ error: "Failed to export Google archive data" }, { status: 500 });
  }
}

async function buildArchiveExport(exportType: string, userId: string): Promise<string> {
  if (exportType === "messages") {
    const rows = await db.select().from(googleMailMessages).where(eq(googleMailMessages.userId, userId));
    return toCsv(
      [
        "gmail_message_id",
        "gmail_thread_id",
        "labels",
        "sender_email",
        "sender_name",
        "recipients",
        "subject",
        "internal_date",
        "size_estimate",
        "snippet",
        "local_file_path",
      ],
      rows.map((message) => ({
        gmail_message_id: message.gmailMessageId,
        gmail_thread_id: message.gmailThreadId,
        labels: message.labelIds,
        sender_email: message.senderEmail,
        sender_name: message.senderName,
        recipients: message.recipients,
        subject: message.subject,
        internal_date: message.internalDate,
        size_estimate: message.sizeEstimate,
        snippet: message.snippet,
        local_file_path: message.localFilePath,
      })),
    );
  }

  if (exportType === "attachments") {
    const rows = await db.select().from(googleMailAttachments).where(eq(googleMailAttachments.userId, userId));
    return toCsv(
      ["gmail_message_id", "attachment_id", "filename", "mime_type", "size_bytes", "sha256", "local_file_path"],
      rows.map((attachment) => ({
        gmail_message_id: attachment.gmailMessageId,
        attachment_id: attachment.attachmentId,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        local_file_path: attachment.localFilePath,
      })),
    );
  }

  const rows = await db.select().from(googlePeopleContacts).where(eq(googlePeopleContacts.userId, userId));
  return toCsv(
    ["source_type", "resource_name", "names", "email_addresses", "phone_numbers", "organizations", "etag"],
    rows.map((contact) => ({
      source_type: contact.sourceType,
      resource_name: contact.resourceName,
      names: contact.names,
      email_addresses: contact.emailAddresses,
      phone_numbers: contact.phoneNumbers,
      organizations: contact.organizations,
      etag: contact.etag,
    })),
  );
}
