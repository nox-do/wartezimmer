import { isManagerError, ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import type { PraxisManagerApi } from './praxis-manager-api.js';

/** Electron drops custom Error properties. Reject with a plain DTO across contextBridge. */
export function serializeManagerApiErrors(api: PraxisManagerApi): PraxisManagerApi {
  return Object.fromEntries(
    Object.entries(api).map(([key, value]) => [
      key,
      typeof value !== 'function'
        ? value
        : async (...args: unknown[]) => {
            try {
              return await Reflect.apply(value, undefined, args);
            } catch (error) {
              if (error instanceof ManagerApiError) throw error.toJSON();
              throw error;
            }
          },
    ]),
  ) as PraxisManagerApi;
}

/** Recreate the same Error class in the receiving renderer context. */
export function restoreManagerApiErrors(api: PraxisManagerApi): PraxisManagerApi {
  return Object.fromEntries(
    Object.entries(api).map(([key, value]) => [
      key,
      typeof value !== 'function'
        ? value
        : async (...args: unknown[]) => {
            try {
              return await Reflect.apply(value, undefined, args);
            } catch (error) {
              if (isManagerError(error)) throw new ManagerApiError(error);
              throw error;
            }
          },
    ]),
  ) as PraxisManagerApi;
}
