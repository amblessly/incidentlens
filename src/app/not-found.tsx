import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-heading text-6xl font-semibold tracking-tight">404</p>
      <div>
        <p className="text-lg font-medium">Page not found</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The incident or page you are looking for does not exist.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
