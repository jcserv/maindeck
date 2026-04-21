"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function UIError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-4 py-12 max-w-xl mx-auto">
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          We couldn&apos;t load this page. The service may be temporarily
          unavailable — please try again in a moment.
        </AlertDescription>
      </Alert>
      <div className="mt-4 flex justify-end">
        <Button onClick={reset} size="sm">
          Try again
        </Button>
      </div>
    </div>
  );
}
