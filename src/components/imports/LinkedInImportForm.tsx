"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Database, FileArchive, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type ImportResult = {
  importId: string;
  totalFiles: number;
  totalBytes: number;
  rawFilesStored: number;
  connectionsParsed: number;
  messagesParsed: number;
  conversationsParsed: number;
  connectionsMatched: number;
  messagesLinkedToPeople: number;
  archiveSha256: string;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function LinkedInImportForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function submit() {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/imports/linkedin", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "LinkedIn import failed");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "LinkedIn import failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border border-neutral-200 bg-neutral-50 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-neutral-950 text-white">
            <FileArchive className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Upload LinkedIn archive</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Store the raw export files and normalize connections and messages into Postgres. The original zip is not kept.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
            setResult(null);
          }}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="justify-start rounded-md"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            Choose zip
          </Button>
          <Button
            type="button"
            className="rounded-md bg-neutral-950 text-white hover:bg-neutral-800"
            onClick={submit}
            disabled={!file || isUploading}
          >
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
            Store in Postgres
          </Button>
        </div>

        {file && (
          <div className="mt-5 border border-neutral-200 bg-white p-4 text-sm">
            <p className="font-medium text-neutral-950">{file.name}</p>
            <p className="mt-1 text-neutral-500">{formatBytes(file.size)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {result && (
        <div className="border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3 text-emerald-950">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-xl font-semibold">Archive stored</h2>
              <p className="mt-2 text-sm text-emerald-800">
                Import {result.importId} preserved {result.rawFilesStored} files and parsed the LinkedIn relationship records.
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Files", result.totalFiles],
              ["Connections", result.connectionsParsed],
              ["Messages", result.messagesParsed],
              ["Conversations", result.conversationsParsed],
              ["Connection matches", result.connectionsMatched],
              ["Message matches", result.messagesLinkedToPeople],
              ["Raw size", formatBytes(result.totalBytes)],
              ["SHA-256", result.archiveSha256.slice(0, 12)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white p-4">
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">{label}</dt>
                <dd className="mt-2 break-all text-2xl font-semibold text-neutral-950">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
