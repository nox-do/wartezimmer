/**
 * UI types derived from openapi/auth.yaml (generated via `npm run generate:openapi-types`).
 * Fastify handlers use app/src/api/generated/auth.fastify-schemas.ts — keep in sync via npm run generate:api.
 */
import type { components } from '$lib/auth/generated/auth-openapi';

type AuthSchemas = components['schemas'];

export type RoomPanelMode = AuthSchemas['RoomPanelMode'];
export type RoomPanelPlacement = AuthSchemas['RoomPanelPlacement'];
export type RoomPanelRoom = AuthSchemas['RoomPanelRoom'];
export type RoomPanelRoomsResponse = AuthSchemas['RoomPanelRoomsResponse'];
export type RoomPanelSessionResponse = AuthSchemas['RoomPanelSessionResponse'];
export type RoomPanelLoginRequest = AuthSchemas['RoomPanelLoginRequest'];

export type StaffRole = AuthSchemas['StaffRole'];
export type StaffSessionResponse = AuthSchemas['StaffSessionResponse'];
export type StaffLoginRequest = AuthSchemas['StaffLoginRequest'];

export type AuthPinTarget = AuthSchemas['AuthPinTarget'];
export type ChangePinRequest = AuthSchemas['ChangePinRequest'];
export type ChangePinResponse = AuthSchemas['ChangePinResponse'];

export type DevicePairingStartResponse = AuthSchemas['DevicePairingStartResponse'];
export type DevicePairingStatusResponse = AuthSchemas['DevicePairingStatusResponse'];
export type DevicePairingConfirmResponse = AuthSchemas['DevicePairingConfirmResponse'];
