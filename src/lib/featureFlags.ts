import { createContext, useContext } from "react";

export interface FeatureFlags {
  ai_price_update: boolean;
  ai_order_fill: boolean;
}

export const defaultFlags: FeatureFlags = {
  ai_price_update: true,
  ai_order_fill: true,
};

export const FeatureFlagsContext = createContext<FeatureFlags>(defaultFlags);

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}
