"use client";

import { EditableField } from "@/app/_components/account/editable-field";
import { changeUsername } from "@/app/_actions/auth";

export function ChangeUsernameForm({
  defaultUsername,
}: {
  defaultUsername: string;
}) {
  return (
    <EditableField
      label="Username"
      name="username"
      initialValue={defaultUsername}
      required
      minLength={3}
      pattern="[a-zA-Z0-9_]+"
      autoComplete="username"
      successMessage="Username updated."
      onSave={async (value) => {
        const fd = new FormData();
        fd.set("username", value);
        return changeUsername(fd);
      }}
    />
  );
}
