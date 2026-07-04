import { publicFetch } from '$lib/api/public-fetch';
import type { PracticeProfile } from '$lib/ops/openapi-types';

export type { PracticeProfile } from '$lib/ops/openapi-types';

const EMPTY_PROFILE: PracticeProfile = {
  displayName: '',
  street: '',
  postalCode: '',
  city: '',
  phone: '',
  email: '',
  dataProtectionOfficer: '',
  website: '',
};

let cachedProfile: PracticeProfile | null = null;
let inflight: Promise<PracticeProfile> | null = null;
let cacheGeneration = 0;

type PracticeProfileListener = (profile: PracticeProfile) => void;
const listeners = new Set<PracticeProfileListener>();

function notifyPracticeProfileListeners(): void {
  const profile = getPracticeProfileFallback();
  for (const listener of listeners) {
    listener(profile);
  }
}

export function subscribePracticeProfile(listener: PracticeProfileListener): () => void {
  listeners.add(listener);
  if (cachedProfile) {
    listener(getPracticeProfileFallback());
  }
  return () => {
    listeners.delete(listener);
  };
}

export function updatePracticeProfileCache(profile: PracticeProfile): void {
  cacheGeneration += 1;
  cachedProfile = { ...EMPTY_PROFILE, ...profile };
  inflight = null;
  notifyPracticeProfileListeners();
}

/** Load public profile and keep `onUpdate` in sync after ops saves. */
export function mountPracticeProfileSync(onUpdate: (profile: PracticeProfile) => void): () => void {
  void loadPracticeProfile().then(onUpdate);
  return subscribePracticeProfile(onUpdate);
}

export function getPracticeProfileFallback(): PracticeProfile {
  if (!cachedProfile) {
    return { ...EMPTY_PROFILE };
  }
  return { ...EMPTY_PROFILE, ...cachedProfile };
}

export function practiceDisplayLabel(profile: PracticeProfile, fallback: string): string {
  const name = profile.displayName.trim();
  return name || fallback;
}

export async function loadPracticeProfile(force = false): Promise<PracticeProfile> {
  if (cachedProfile && !force) {
    return getPracticeProfileFallback();
  }
  if (inflight && !force) {
    return inflight;
  }

  const loadGeneration = cacheGeneration;

  inflight = publicFetch<PracticeProfile>('/api/v1/practice/profile')
    .then((result) => {
      if (!result.ok) {
        return { ...EMPTY_PROFILE };
      }
      return result.data;
    })
    .then((loaded) => {
      if (loadGeneration !== cacheGeneration) {
        return getPracticeProfileFallback();
      }
      cachedProfile = { ...EMPTY_PROFILE, ...loaded };
      notifyPracticeProfileListeners();
      return getPracticeProfileFallback();
    })
    .catch(() => ({ ...EMPTY_PROFILE }))
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export {
  formatControllerParagraph,
  formatPracticeAddress,
  formatPrivacyRightsParagraph,
} from '$lib/privacy/practice-privacy-copy';
