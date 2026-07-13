/**
 * Backend handler types derived from openapi/auth.yaml.
 */
import type { components, paths } from './generated/auth-openapi.js';

type AuthSchemas = components['schemas'];

export type StaffRole = AuthSchemas['StaffRole'];
export type StaffLoginBody = NonNullable<
  paths['/api/v1/auth/login']['post']['requestBody']
>['content']['application/json'];
export type StaffSessionResponse = AuthSchemas['StaffSessionResponse'];

export type RoomPanelPlacement = AuthSchemas['RoomPanelPlacement'];
export type RoomPanelLoginBody = NonNullable<
  paths['/api/v1/auth/room-panel/login']['post']['requestBody']
>['content']['application/json'];
export type RoomPanelSessionResponse = AuthSchemas['RoomPanelSessionResponse'];

export type AuthPinTarget = AuthSchemas['AuthPinTarget'];
export type ChangePinBody = NonNullable<
  paths['/api/v1/auth/pin/change']['post']['requestBody']
>['content']['application/json'];
export type ChangePinResponse = AuthSchemas['ChangePinResponse'];

export type DevicePairingStartBody = NonNullable<
  paths['/api/v1/auth/tv/pairing/start']['post']['requestBody']
>['content']['application/json'];
export type DevicePairingConfirmBody = NonNullable<
  paths['/api/v1/auth/tv/pairing/confirm']['post']['requestBody']
>['content']['application/json'];
export type DevicePairingParams =
  paths['/api/v1/auth/tv/pairing/{pairingId}']['get']['parameters']['path'];
