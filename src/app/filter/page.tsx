export default function FilterPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-4xl font-bold mb-2">
          Configure Your Scan
        </h1>
        <p className="text-[--brand-muted] mb-8">
          Shape what gets scanned before you pay.
        </p>
        <div className="space-y-6">
          <div className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
            <h2 className="font-semibold mb-2">Date Range</h2>
            <p className="text-sm text-[--brand-muted]">
              Filter configuration will be available after auth setup.
            </p>
          </div>
          <div className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
            <h2 className="font-semibold mb-2">Domain Blocklist</h2>
            <p className="text-sm text-[--brand-muted]">
              Exclude specific email domains from scanning.
            </p>
          </div>
          <div className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
            <h2 className="font-semibold mb-2">LLM Provider</h2>
            <p className="text-sm text-[--brand-muted]">
              Cloud (default) · Local (Ollama) · BYOK
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
