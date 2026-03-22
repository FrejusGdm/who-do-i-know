export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-24 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">
          Terms of Service
        </h1>
        <p className="text-lg font-light text-[--brand-muted] mb-16">
          Last updated: January 2026
        </p>

        <div className="space-y-12 text-[--brand-muted] leading-relaxed">
          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Service
            </h2>
            <p className="text-lg">
              WhoDoYouKnow provides a one-time personal contact extraction
              service. By using this service, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Pricing
            </h2>
            <p className="text-lg">
              The service is currently free. No payment required.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Acceptable Use
            </h2>
            <p className="text-lg">
              You may only process your own email account. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-3 mt-4 text-lg">
              <li>Process email accounts belonging to others without consent</li>
              <li>Commercially resale the output</li>
              <li>Use the service for scraping or data mining purposes</li>
              <li>Attempt to circumvent security measures</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data Handling
            </h2>
            <p className="text-lg">
              We process email metadata in memory only. Email bodies are never
              accessed, stored, or sent to any external service. All data is
              deleted within 15 minutes of download. See our Privacy Policy for
              full details.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Warranty
            </h2>
            <p className="text-lg">
              The service is provided &quot;as is&quot; without warranty. We do
              not guarantee the accuracy or completeness of the generated contact
              list.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Limitation of Liability
            </h2>
            <p className="text-lg">
              Our liability is limited to the amount paid for the service, if
              any. We are not liable for any indirect, incidental, or
              consequential damages.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Contact
            </h2>
            <p className="text-lg">
              <a
                href="mailto:support@whodoyouknow.xyz"
                className="underline hover:text-[--brand-ink] transition-colors"
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
