// Map raw Postgres / Supabase errors to human-readable messages.
export function humanizeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | undefined;
  if (!e) return "Something went wrong. Please try again.";
  const code = e.code;
  const msg = e.message ?? "";

  switch (code) {
    case "23505":
      return "A record with this value already exists (duplicate SKU or unique field).";
    case "23503":
      return "Cannot complete this action because related records depend on it.";
    case "23502":
      return "A required field is missing.";
    case "23514":
      return "One of the values violates a validation rule.";
    case "42501":
    case "PGRST301":
      return "You don't have permission to perform this action.";
    case "PGRST116":
      return "Record not found.";
  }
  if (/duplicate key/i.test(msg)) return "Duplicate value — that SKU or identifier is already in use.";
  if (/foreign key/i.test(msg))
    return "Cannot delete this record because other records reference it.";
  if (/permission denied/i.test(msg)) return "You don't have permission to perform this action.";
  if (/JWT|token/i.test(msg)) return "Your session expired. Please sign in again.";
  if (/network|fetch/i.test(msg)) return "Network error — please check your connection.";
  return msg || "Unexpected error. Please try again.";
}
