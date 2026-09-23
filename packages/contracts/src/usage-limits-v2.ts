import { z } from "zod";
import { MeterDefinitionV1Schema } from "./usage-events.js";
import { UsageLimitRevisionV1Schema } from "./usage-limits.js";

/** Carry the meter version for later registered-meter and declaration checks. */
export const UsageLimitRevisionV2Schema = UsageLimitRevisionV1Schema
  .omit({ schemaVersion: true })
  .extend({
    schemaVersion: z.literal(2),
    meterVersion: MeterDefinitionV1Schema.shape.version,
  }).strict();

export type UsageLimitRevisionV2 = z.infer<typeof UsageLimitRevisionV2Schema>;
