// Split out from contact.ts: a "use server" file may only export async
// functions, so the shared type and initial state live here instead.
type ContactFields = "name" | "company" | "contact" | "message";

interface ContactFormState {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Partial<Record<ContactFields, string[]>>;
  // Echoes back what the visitor typed so a failed submission (validation
  // error, or a real send failure) doesn't wipe the form — native <form
  // action={...}> submissions reset uncontrolled inputs by default.
  values?: Partial<Record<ContactFields, string>>;
}

const contactFormInitialState: ContactFormState = { status: "idle", message: "" };

export { contactFormInitialState };
export type { ContactFormState, ContactFields };
