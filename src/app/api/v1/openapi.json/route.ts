import { jsonOk } from "@/lib/api";
import { openApiSpec } from "@/lib/openapi/spec";

export async function GET() {
  return jsonOk(openApiSpec, {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
}
