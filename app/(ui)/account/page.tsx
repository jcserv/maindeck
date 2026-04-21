import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { ChangeUsernameForm } from "@/app/_components/change-username-form";
import { ChangeEmailForm } from "@/app/_components/change-email-form";
import { UpdateDobForm } from "@/app/_components/update-dob-form";
import { ChangePasswordForm } from "@/app/_components/change-password-form";
import { DeleteAccountButton } from "@/app/_components/delete-account-button";
import { FormSuccess } from "@/components/ui/form-success";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SearchParams = Promise<{ emailChanged?: string; reset?: string }>;

type PageProps = {
  searchParams: SearchParams;
};

async function AccountBanners({ searchParams }: { searchParams: SearchParams }) {
  const { emailChanged, reset } = await searchParams;
  return (
    <>
      {emailChanged === "1" && (
        <FormSuccess>
          Email change requested. Check your new inbox for a verification link.
        </FormSuccess>
      )}
      {reset === "1" && (
        <FormSuccess>Password updated successfully.</FormSuccess>
      )}
    </>
  );
}

async function AccountSections() {
  const session = await requireSession();

  return (
    <>
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ChangeUsernameForm defaultUsername={session.username} />
          <ChangeEmailForm defaultEmail={session.email} />
          <UpdateDobForm
            defaultDate={
              session.dateOfBirth.toISOString().split("T")[0] ?? null
            }
          />
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton username={session.username} />
        </CardContent>
      </Card>
    </>
  );
}

function AccountSectionsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-[260px] rounded-xl bg-muted animate-pulse" />
      <div className="h-[160px] rounded-xl bg-muted animate-pulse" />
      <div className="h-[120px] rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

export default function AccountPage({ searchParams }: PageProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Account settings</h1>

      <Suspense fallback={null}>
        <AccountBanners searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<AccountSectionsSkeleton />}>
        <AccountSections />
      </Suspense>
    </div>
  );
}
