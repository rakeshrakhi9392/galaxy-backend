import { z } from "zod";

export const cuid = z.string().min(1);
export const isoDateString = z.iso.datetime();
