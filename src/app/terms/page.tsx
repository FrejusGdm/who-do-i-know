export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-4xl font-bold mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-[--brand-muted] mb-8">
          Last updated: January 2026
        </p>

        <div className="space-y-6 text-[--brand-muted] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Service
            </h2>
            <p>
              WhoDoYouKnow provides a one-time personal contact extraction
              service. By using this service, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Payment
            </h2>
            <p>
              The service costs $9 USD, charged once via Stripe. No
              subscriptions. No refunds after processing begins. If processing
              fails, you will not be charged.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Acceptable Use
            </h2>
            <p>
              You may only process your own email account. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Process email accounts belonging to others without consent</li>
              <li>Commercially resale the output</li>
              <li>Use the service for scraping or data mining purposes</li>
              <li>Attempt to circumvent security measures</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data Handling
            </h2>
            <p>
              We process email metadata in memory only. Email bodies are never
              accessed, stored, or sent to any external service. All data is
              deleted within 15 minutes of download. See our Privacy Policy for
              full details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Warranty
            </h2>
            <p>
              The service is provided &quot;as is&quot; without warranty. We do
              not guarantee the accuracy or completeness of the generated contact
              list.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Limitation of Liability
            </h2>
            <p>
              Our liability is limited to the amount paid for the service ($9
              USD). We are not liable for any indirect, incidental, or
              consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Contact
            </h2>
            <p>
              <a
                href="mailto:support@whodoyouknow.xyz"
                className="underline"
              >
                support@whodoyouknow.xyz
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
