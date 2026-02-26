'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function CheckoutInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = searchParams.get('email');
    const plan = searchParams.get('plan') || 'pro';

    if (!email) {
      setError('Missing email parameter');
      setLoading(false);
      return;
    }

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, plan }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to create checkout session');
          setLoading(false);
        }
      })
      .catch(() => {
        setError('Network error');
        setLoading(false);
      });
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-primary">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-accent-danger mb-2">Checkout Error</h1>
          <p className="text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-primary">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-text-secondary">Redirecting to checkout...</p>
        </div>
      </div>
    );
  }

  return null;
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-background-primary">
          <div className="animate-spin h-8 w-8 border-4 border-accent-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
