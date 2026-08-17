import { fail } from "@sveltejs/kit";

import { site } from "$lib/config";
import { redactEmail } from "$lib/redact";
import { addEntry, listEntries } from "$lib/server/db";
import {
  type FieldErrors,
  type GuestbookInput,
  validateEntry,
} from "$lib/validation";

import type { Actions, PageServerLoad } from "./$types";

interface FormPayload {
  values: GuestbookInput;
  errors: FieldErrors;
  formError?: string;
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return { databaseMissing: true, entries: [] };
  }

  const entries = await listEntries(db, site.entryLimit);
  // Redacted here rather than in the template, so the full address never
  // reaches the serialized page payload.
  return {
    databaseMissing: false,
    entries: entries.map((entry) => ({
      created_at: entry.created_at,
      emailMasked: redactEmail(entry.email),
      id: entry.id,
      message: entry.message,
    })),
  };
};

export const actions: Actions = {
  default: async ({ platform, request }) => {
    const form = await request.formData();

    // Honeypot: a browser leaves it empty. Report success and store nothing,
    // so a bot cannot tell it was caught.
    if (String(form.get("website") ?? "").trim() !== "") {
      return { success: true };
    }

    const { errors, valid, values } = validateEntry(
      form.get("email"),
      form.get("message"),
    );
    const payload: FormPayload = { errors, values };
    if (!valid) {
      return fail(400, payload);
    }

    const db = platform?.env?.DB;
    if (!db) {
      payload.formError = "The guestbook database is not configured.";
      return fail(503, payload);
    }

    await addEntry(db, values.email, values.message);
    return { success: true };
  },
};
