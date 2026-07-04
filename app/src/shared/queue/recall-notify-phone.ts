/** Phone used for recall SMS/WhatsApp: MFA callback wins over terminal check-in number. */
export function resolveRecallNotifyPhone(
  callbackPhone: string | null | undefined,
  checkinPhone: string | null | undefined,
): string | null {
  const callback = callbackPhone?.trim() ?? '';
  if (callback.length > 0) {
    return callback;
  }
  const checkin = checkinPhone?.trim() ?? '';
  if (checkin.length > 0) {
    return checkin;
  }
  return null;
}
