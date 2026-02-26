export default function CheckoutCancelled() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background-primary">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-text-primary mb-2">Checkout Cancelled</h1>
        <p className="text-text-secondary">
          No charges were made. You can upgrade anytime from the DeepTerm app.
        </p>
      </div>
    </div>
  );
}
