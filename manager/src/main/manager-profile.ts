import fs from 'node:fs';
import path from 'node:path';
import { managerInstanceUserDataKey } from './setup-identity.js';

export function managerProfilePath(input: {
  profileHome: string;
  installHome: string;
  isPackaged: boolean;
}): string {
  const root = path.join(input.profileHome, 'manager');
  return input.isPackaged
    ? root
    : path.join(root, `instance-${managerInstanceUserDataKey(input.installHome)}`);
}

/** Create the profile directory before Electron opens it. */
export function prepareManagerProfile(input: {
  profileHome: string;
  installHome: string;
  isPackaged: boolean;
}): string {
  const profile = managerProfilePath(input);
  fs.mkdirSync(profile, { recursive: true });
  return profile;
}
