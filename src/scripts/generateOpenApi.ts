import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openApiSpec } from "../lib/openapi/spec";

const outputPath = resolve(process.cwd(), "docs/openapi.json");
writeFileSync(outputPath, `${JSON.stringify(openApiSpec, null, 2)}\n`, "utf8");
console.log(`Wrote OpenAPI spec to ${outputPath}`);
