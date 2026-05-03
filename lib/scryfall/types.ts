import { z } from "zod";
import { ScryfallCardSchema } from "./schema";

export type ScryfallCard = z.infer<typeof ScryfallCardSchema>;
