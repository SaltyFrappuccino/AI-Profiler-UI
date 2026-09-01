export const SYSTEM_LINEAGE_SCHEMA_VERSION = "system-lineage.v1";

const REQUIRED_OBJECTS = ["summary"] as const;
const REQUIRED_COLLECTIONS = [
  "sourceGroups",
  "services",
  "schemaModelCatalog",
  "contracts",
  "processes",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function reportEnvelopeErrors(document: unknown): string[] {
  if (!isObject(document)) return ["report must be a JSON object"];

  const errors: string[] = [];
  if (document.schemaVersion !== SYSTEM_LINEAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SYSTEM_LINEAGE_SCHEMA_VERSION}, got ${String(document.schemaVersion)}`);
  }
  if (typeof document.generatedAt !== "string" || !document.generatedAt.trim()) {
    errors.push("generatedAt must be a non-empty string");
  }
  for (const key of REQUIRED_OBJECTS) {
    if (!isObject(document[key])) errors.push(`${key} must be an object`);
  }
  for (const key of REQUIRED_COLLECTIONS) {
    const value = document[key];
    if (!Array.isArray(value)) errors.push(`${key} must be an array`);
    else if (value.some((item) => !isObject(item))) errors.push(`${key} must contain only objects`);
  }
  return errors;
}
