export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto prose">
        <h1 className="font-serif text-4xl font-bold mb-8">
          Terms of Service
        </h1>
        <p className="text-sm text-[--brand-muted] mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Service</h2>
        <p className="text-[--brand-muted]">
          WhoDoYouKnow provides a one-time personal contact extraction service.
          By using this service, you agree to these terms.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Payment</h2>
        <p className="text-[--brand-muted]">
          The service costs $9 USD, charged once. No subscriptions. No refunds
          after processing begins.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Acceptable Use</h2>
        <p className="text-[--brand-muted]">
          You may only process your own email account. Commercial resale of
          output is prohibited.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Contact</h2>
        <p className="text-[--brand-muted]">support@whodoyouknow.xyz</p>
      </div>
    </main>
  );
}
