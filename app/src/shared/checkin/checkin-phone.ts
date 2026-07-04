import { canonicalizePhone } from '../phone/canonicalize-phone.js';

/** Telefon aus Terminal-Anmeldung für späteres Portal-Prefill und Recall-SMS. */
export function resolveCheckinPhoneForTicket(authPath: string, phoneNumber: string): string | null {
  if (authPath !== 'phone_dob') {
    return null;
  }
  return canonicalizePhone(phoneNumber);
}
