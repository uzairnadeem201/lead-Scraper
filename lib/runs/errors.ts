export function getReadableRunError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "42P01"
  ) {
    return "Run tables are missing in the database. Apply the latest migration before using server runs.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected run error";
}
