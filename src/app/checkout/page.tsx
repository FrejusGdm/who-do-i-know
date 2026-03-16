export default function CheckoutPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
      <div className="max-w-md text-center px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Checkout</h1>
        <p className="text-[--brand-muted] mb-8">
          One-time payment of $9. You&apos;ll be redirected to Stripe.
        </p>
      </div>
    </main>
  );
}
