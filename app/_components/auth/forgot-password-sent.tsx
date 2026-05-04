import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "@/app/_components/link";

export function ForgotPasswordSent({ email }: { email: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Check your inbox</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4">
        <p className="text-sm text-muted-foreground">
          If an account exists for{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>,
          a password reset link is on the way.
          <br />
          Didn&apos;t get it?{" "}
          <Link href="/forgot-password" className="underline underline-offset-4">
            Try again.
          </Link>
        </p>
      </CardContent>
      <CardFooter>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
