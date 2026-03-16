export default function ConnectPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
      <div className="max-w-md text-center px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Connected</h1>
        <p className="text-[--brand-muted] mb-8">
          Your Gmail account is connected. We have read-only access to your
          email metadata — we will never send emails or modify your account.
        </p>
        <a
          href="/filter"
          className="inline-block bg-[--brand-ink] text-[--brand-cream] px-8 py-3 rounded-lg font-semibold hover:bg-[--brand-gold] hover:text-[--brand-ink] transition-colors"
        >
          Configure Your Scan
        </a>
      </div>
    </main>
  );
}
