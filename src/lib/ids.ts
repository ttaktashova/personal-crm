const MAX_ID = 2_147_483_647; // Postgres integer upper bound

// A row id from the URL ("42") or from a server action argument (42).
export function parseId(value: unknown): number | null {
  let id: number;
  if (typeof value === "number") {
    id = value;
  } else if (typeof value === "string" && /^\d{1,10}$/.test(value)) {
    id = Number(value);
  } else {
    return null;
  }
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}
