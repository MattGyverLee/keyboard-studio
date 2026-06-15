// Phase F sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly during the parallel migration.
// The main registry.ts will be consolidated by the team lead after all phase
// agents return. Until then, this file is the authoritative Phase F registry.
//
// All imports are static (not dynamic) so the registry is synchronous.

import type { QuestionModule } from "../types.ts";

import pfWelcomeParagraphMod from "./f/pf_welcome_paragraph.ts";
import pfUsageTip1Mod from "./f/pf_usage_tip_1.ts";
import pfUsageTip2Mod from "./f/pf_usage_tip_2.ts";
import pfUsageTip3Mod from "./f/pf_usage_tip_3.ts";
import pfUsageTip4Mod from "./f/pf_usage_tip_4.ts";
import pfUsageTip5Mod from "./f/pf_usage_tip_5.ts";
import pfCreditsMod from "./f/pf_credits.ts";
import pfContactInfoMod from "./f/pf_contact_info.ts";

/**
 * Phase F synchronous sub-registry: { [questionId]: QuestionModule }
 * Merged into the main registry by the team lead after all phase agents return.
 */
export const phaseFRegistry: Readonly<Record<string, QuestionModule>> = {
  pf_welcome_paragraph: pfWelcomeParagraphMod,
  pf_usage_tip_1: pfUsageTip1Mod,
  pf_usage_tip_2: pfUsageTip2Mod,
  pf_usage_tip_3: pfUsageTip3Mod,
  pf_usage_tip_4: pfUsageTip4Mod,
  pf_usage_tip_5: pfUsageTip5Mod,
  pf_credits: pfCreditsMod,
  pf_contact_info: pfContactInfoMod,
} as const;
