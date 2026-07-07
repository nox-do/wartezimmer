import type { OpsSettings, RoutingMode } from '../db/db-types.js';

export type RoutingCapabilityFeatures = {
  complexRouting: boolean;
  journeyDesigner: boolean;
  routingSimulator: boolean;
};

export type RoutingCapabilities = {
  routingMode: RoutingMode;
  features: RoutingCapabilityFeatures;
};

type LicenseRoutingCapabilityOverrides = Partial<RoutingCapabilityFeatures>;

function resolveLicenseRoutingCapabilityOverrides(): LicenseRoutingCapabilityOverrides {
  return {};
}

export function resolveRoutingCapabilities(
  settings: Pick<OpsSettings, 'routingMode'>,
): RoutingCapabilities {
  const modeAllowsComplexRouting = settings.routingMode === 'complex';
  const baseFeatures: RoutingCapabilityFeatures = {
    complexRouting: modeAllowsComplexRouting,
    journeyDesigner: modeAllowsComplexRouting,
    routingSimulator: true,
  };

  return {
    routingMode: settings.routingMode,
    features: {
      ...baseFeatures,
      ...resolveLicenseRoutingCapabilityOverrides(),
    },
  };
}
