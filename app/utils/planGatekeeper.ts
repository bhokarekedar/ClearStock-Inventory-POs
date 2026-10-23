export type PlanTier = "starter" | "growth" | "scale";

export interface PlanConfig {
  id: PlanTier;
  name: string;
  priceMonthly: number;
  maxSkus: number;
  maxSuppliers: number;
  allowedLookbackWindows: Array<"7" | "14" | "30" | "90">;
  allowsCasePackRounding: boolean;
  allowsMultiLocationReceiving: boolean;
  allowsCustomSafetyFormula: boolean;
  prioritySupport: boolean;
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  starter: {
    id: "starter",
    name: "Starter Plan",
    priceMonthly: 9,
    maxSkus: 50,
    maxSuppliers: 1,
    allowedLookbackWindows: ["30"],
    allowsCasePackRounding: false,
    allowsMultiLocationReceiving: false,
    allowsCustomSafetyFormula: false,
    prioritySupport: false,
  },
  growth: {
    id: "growth",
    name: "Growth Plan",
    priceMonthly: 39,
    maxSkus: Infinity,
    maxSuppliers: Infinity,
    allowedLookbackWindows: ["7", "14", "30", "90"],
    allowsCasePackRounding: true,
    allowsMultiLocationReceiving: false,
    allowsCustomSafetyFormula: false,
    prioritySupport: false,
  },
  scale: {
    id: "scale",
    name: "Scale Plan",
    priceMonthly: 89,
    maxSkus: Infinity,
    maxSuppliers: Infinity,
    allowedLookbackWindows: ["7", "14", "30", "90"],
    allowsCasePackRounding: true,
    allowsMultiLocationReceiving: true,
    allowsCustomSafetyFormula: true,
    prioritySupport: true,
  },
};

export function getPlanConfig(plan?: string | null): PlanConfig {
  if (plan === "starter") return PLAN_CONFIGS.starter;
  if (plan === "scale") return PLAN_CONFIGS.scale;
  return PLAN_CONFIGS.growth; // default
}
