export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[--brand-muted] mb-8">Last updated: January 2026</p>

        <div className="space-y-6 text-[--brand-muted] leading-relaxed">
          <p>
            WhoDoYouKnow (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your
            privacy.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data We Access
            </h2>
            <p>
              We request read-only access to your Gmail account and Google
              Contacts solely to identify people you have meaningfully
              communicated with.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data We Process (Not Store)
            </h2>
            <p>
              Email thread metadata (sender names, email addresses, subject line
              snippets, and message counts) is processed in memory on our
              servers. We do not store, log, or retain any email content, subject
              lines, or contact information beyond what is described below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data We Store
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Your email address (to deliver your download link)</li>
              <li>Job status (pending/processing/complete)</li>
              <li>
                Your filter preferences (date range, excluded domains) — deleted
                after job completion
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data We Never Store
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Email bodies or full subject lines</li>
              <li>Email thread content</li>
              <li>Contact names or personal information from your contacts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Data Deletion
            </h2>
            <p>
              All processed data is permanently deleted within 15 minutes of
              your download, or within 24 hours if no download occurs. Your
              Google access token is deleted immediately after processing
              completes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Google API Services
            </h2>
            <p>
              Our use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="underline"
                target="_blank"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Third Parties
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Stripe: payment processing (their privacy policy applies)
              </li>
              <li>
                OpenRouter: LLM inference on contact metadata (no PII sent —
                only email addresses and subject snippets)
              </li>
              <li>Vercel: hosting and temporary file storage</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Your Rights
            </h2>
            <p>
              You may request deletion of your data at any time by emailing{" "}
              <a href="mailto:privacy@whodoyouknow.xyz" className="underline">
                privacy@whodoyouknow.xyz
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[--brand-ink] mb-2">
              Contact
            </h2>
            <p>
              <a href="mailto:privacy@whodoyouknow.xyz" className="underline">
                privacy@whodoyouknow.xyz
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
