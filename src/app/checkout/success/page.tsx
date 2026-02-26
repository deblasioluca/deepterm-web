export default function CheckoutSuccess() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background-primary">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">Welcome to Pro!</h1>
        <p className="text-text-secondary mb-6">
          Your subscription is active. Return to the DeepTerm app —
          your Pro features will activate automatically within a few minutes.
        </p>
        <p className="text-sm text-text-tertiary">
          You can close this page.
        </p>
      </div>
    </div>
  );
}
