"use client";

import { EditableField } from "@/app/_components/editable-field";
import { changeEmail } from "@/lib/auth/actions";

export function ChangeEmailForm({
  defaultEmail,
}: {
  defaultEmail: string;
}) {
  return (
    <EditableField
      label="Email address"
      name="newEmail"
      initialValue={defaultEmail}
      required
      type="email"
      autoComplete="email"
      resetOnSuccess
      successMessage={(submitted) =>
        `Verification email sent to ${submitted}. Click the link to confirm.`
      }
      onSave={async (value) => {
        const fd = new FormData();
        fd.set("newEmail", value);
        return changeEmail(fd);
      }}
    />
  );
}
