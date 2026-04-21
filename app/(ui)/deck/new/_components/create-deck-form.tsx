"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import {
  FORMAT_OPTIONS,
  SELECT_CLASS,
  VISIBILITY_OPTIONS,
} from "@/app/_components/deck-create/constants";
import { createDeck } from "@/lib/deck/actions";
import { Format, Visibility } from "@/lib/generated/prisma/enums";

type FormState = { error?: string; deckId?: string } | null;

async function createDeckAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const deckId = await createDeck(formData);
    return { deckId };
  } catch {
    return { error: "Failed to create deck. Please try again." };
  }
}

export function CreateDeckForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    createDeckAction,
    null,
  );

  useEffect(() => {
    if (state?.deckId) {
      router.push(`/deck/${state.deckId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <FormError>{state.error}</FormError>}

      <Field label="Deck Name" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          placeholder="My Commander Deck"
          required
          maxLength={255}
          className="h-11"
        />
      </Field>

      <Field label="Format" htmlFor="format" required>
        <select
          id="format"
          name="format"
          defaultValue={Format.COMMANDER}
          className={SELECT_CLASS}
          required
        >
          {FORMAT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Visibility" htmlFor="visibility">
        <select
          id="visibility"
          name="visibility"
          defaultValue={Visibility.PRIVATE}
          className={SELECT_CLASS}
        >
          {VISIBILITY_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" htmlFor="description" optional>
        <Textarea
          id="description"
          name="description"
          placeholder="Describe your deck strategy..."
          rows={4}
          maxLength={2000}
          className="resize-none"
        />
      </Field>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 mt-2"
      >
        {isPending ? "Creating..." : "Create Deck"}
      </Button>
    </form>
  );
}
