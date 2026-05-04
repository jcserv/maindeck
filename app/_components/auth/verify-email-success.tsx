"use client";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import Link from "@/app/_components/link";

export function VerifyEmailSuccess() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Email verified</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground">
          Your email is confirmed and you&apos;re signed in. Welcome to Maindeck.
        </p>
      </CardContent>
      <CardFooter>
        <Link href="/decks" className={buttonVariants({ className: "h-11 w-full" })}>
          Continue to decks
        </Link>
      </CardFooter>
    </Card>
  );
}
