import type { OpsSettings, RoutingMode } from '../db/db-types.js';
import { isComplexRoutingLicensed } from './routing-license.js';

export type RoutingCapabilityFeatures = {
  complexRouting: boolean;
  journeyDesigner: boolean;
  routingSimulator: boolean;
  complexRoutingLicensed: boolean;
};

export type RoutingCapabilities = {
  routingMode: RoutingMode;
  features: RoutingCapabilityFeatures;
};

export function resolveRoutingCapabilities(
  settings: Pick<OpsSettings, 'routingMode'>,
): RoutingCapabilities {
  const licensed = isComplexRoutingLicensed();
  const complexActive = settings.routingMode === 'complex' && licensed;

  return {
    routingMode: settings.routingMode,
    features: {
      complexRouting: complexActive,
      journeyDesigner: complexActive,
      routingSimulator: true,
      complexRoutingLicensed: licensed,
    },
  };
}
