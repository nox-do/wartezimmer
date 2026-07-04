/** Documented delivery default for MFA and Ops staff login. */
export const DEFAULT_STAFF_PIN = '0000';

/** pbkdf2-sha256 hash of {@link DEFAULT_STAFF_PIN} (fixed dev/delivery seed). */
export const DEFAULT_STAFF_PIN_HASH =
  'pbkdf2-sha256$100000$cHJheGlzLWZsb3ctc3RhZmYtZGV2LXBpbi1zZWVkLXYx$HT9LqSxynL17qcNaYzJHZ0d51Cqtk1bxUb12izpJdls';

export const DEFAULT_ROOM_PANEL_PIN_HASH = DEFAULT_STAFF_PIN_HASH;
