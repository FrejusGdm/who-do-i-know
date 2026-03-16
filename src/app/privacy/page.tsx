export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream] py-12 px-6">
      <div className="max-w-2xl mx-auto prose">
        <h1 className="font-serif text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-sm text-[--brand-muted] mb-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Data We Access</h2>
        <p className="text-[--brand-muted]">
          We request read-only access to your Gmail account and Google Contacts
          solely to identify people you have meaningfully communicated with.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">
          Data We Process (Not Store)
        </h2>
        <p className="text-[--brand-muted]">
          Email thread metadata (sender names, email addresses, subject line
          snippets, and message counts) is processed in memory on our servers.
          We do not store, log, or retain any email content.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Data Deletion</h2>
        <p className="text-[--brand-muted]">
          All processed data is permanently deleted within 15 minutes of your
          download, or within 24 hours if no download occurs.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">Contact</h2>
        <p className="text-[--brand-muted]">privacy@whodoyouknow.xyz</p>
      </div>
    </main>
  );
}
