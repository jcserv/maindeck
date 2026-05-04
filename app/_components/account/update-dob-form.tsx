"use client";

import { EditableField } from "@/app/_components/account/editable-field";
import { updateDateOfBirth } from "@/app/_actions/auth";

const todayISO = new Date().toISOString().split("T")[0]!;

export function UpdateDobForm({
  defaultDate,
}: {
  defaultDate: string | null;
}) {
  return (
    <EditableField
      label="Date of birth"
      name="dateOfBirth"
      initialValue={defaultDate ?? ""}
      required
      type="date"
      max={todayISO}
      successMessage="Date of birth updated."
      onSave={async (value) => {
        const fd = new FormData();
        fd.set("dateOfBirth", value);
        return updateDateOfBirth(fd);
      }}
    />
  );
}
