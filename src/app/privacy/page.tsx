export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-24 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">Privacy Policy</h1>
        <p className="text-lg font-light text-[--brand-muted] mb-16">Last updated: May 2026</p>

        <div className="space-y-12 text-[--brand-muted] leading-relaxed">
          <p>
            WhoDoYouKnow (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your
            privacy.
          </p>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data We Access
            </h2>
            <p className="text-lg">
              We request read-only access to your Gmail account and Google
              Contacts solely to identify people you have meaningfully
              communicated with.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data We Process
            </h2>
            <p className="text-lg">
              Email metadata (sender names, email addresses, subject lines,
              message counts) and, when you enable full-context processing,
              message content are processed to understand your relationships.
              Full-context processing stores raw message bodies in your private
              database so the app can build better summaries and reprocess them
              later.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data We Store
            </h2>
            <ul className="list-disc list-inside space-y-3 text-lg">
              <li>Your email address (to deliver your download link)</li>
              <li>Job status (pending/processing/complete)</li>
              <li>
                Your Gmail relationship memory: people, contact methods,
                thread metadata, stored message bodies when enabled, AI
                summaries, private notes, tags, mentor-signal rankings, and
                export records
              </li>
              <li>
                Your filter preferences, sync history, and queued AI processing
                task metadata
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data We Never Store
            </h2>
            <ul className="list-disc list-inside space-y-3 text-lg">
              <li>
                Google OAuth access tokens after processing completes
              </li>
              <li>
                AI provider keys supplied through BYOK mode
              </li>
              <li>
                Payment card information
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data Deletion
            </h2>
            <p className="text-lg">
              You can request deletion of stored relationship data at any time.
              Google OAuth access tokens are deleted immediately after
              processing completes. CSV download files may be removed or expire
              separately from the database-backed relationship memory.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Data Security
            </h2>
            <ul className="list-disc list-inside space-y-3 text-lg">
              <li>
                All connections to our servers are encrypted using HTTPS/TLS
              </li>
              <li>
                Google user data is stored only to provide the private
                relationship-memory product you requested
              </li>
              <li>
                Google OAuth access tokens are revoked and deleted immediately
                after processing completes
              </li>
              <li>
                BYOK API keys are used for the current request and are not saved
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Google API Services
            </h2>
            <p className="text-lg">
              Our use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="underline hover:text-[--brand-ink] transition-colors"
                target="_blank"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Prohibited Uses
            </h2>
            <p className="text-lg mb-4">
              We do not use Google user data for any purpose other than
              providing the relationship-memory service you requested.
              Specifically, Google user data is never used for:
            </p>
            <ul className="list-disc list-inside space-y-3 text-lg">
              <li>Targeted, personalized, or interest-based advertising</li>
              <li>Selling, renting, or trading data to third parties or data brokers</li>
              <li>Training AI or machine learning models</li>
              <li>Determining creditworthiness or for lending purposes</li>
              <li>Any purpose unrelated to the core functionality of WhoDoYouKnow</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Third Parties
            </h2>
            <p className="text-lg mb-4">
              We do not sell, rent, or trade your Google user data to any
              third party. We only share data with the following service
              providers, strictly to operate the service:
            </p>
            <ul className="list-disc list-inside space-y-3 text-lg">
              <li>
                OpenRouter: Routes AI inference to models from OpenAI and
                Anthropic. When Cloud or BYOK processing is selected, thread
                excerpts, message bodies, private notes, and relationship
                context may be sent for summarization and mentor-signal
                analysis. These providers have stated that API data is not used
                for model training.
              </li>
              <li>Vercel: hosting and temporary file storage</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Your Rights
            </h2>
            <p className="text-lg">
              You may request deletion of your data at any time by emailing{" "}
              <a href="mailto:privacy@whodoyouknow.work" className="underline hover:text-[--brand-ink] transition-colors">
                privacy@whodoyouknow.work
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl text-[--brand-ink] mb-4">
              Contact
            </h2>
            <p className="text-lg">
              <a href="mailto:privacy@whodoyouknow.work" className="underline hover:text-[--brand-ink] transition-colors">
                privacy@whodoyouknow.work
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
