import fs from 'node:fs';
import path from 'node:path';
import { composeDown } from './docker.js';
import type { SetupContext } from './setup-context.js';

export type ResetInstallHomeOptions = {
  /** Remove the install directory after `docker compose down`. Default: true. */
  removeHome?: boolean;
  /** Stop containers only; keep `.env` and install files. */
  keepFiles?: boolean;
};

export type ResetInstallHomeResult = {
  home: string;
  composeProjectName: string;
  compose: { ok: boolean; log: string } | null;
  removedHome: boolean;
};

function listHomeEntries(home: string): string[] {
  if (!fs.existsSync(home)) {
    return [];
  }
  return fs.readdirSync(home);
}

export async function resetInstallHome(
  ctx: SetupContext,
  options: ResetInstallHomeOptions = {},
): Promise<ResetInstallHomeResult> {
  const keepFiles = Boolean(options.keepFiles);
  const removeHome = options.removeHome ?? !keepFiles;

  let compose: ResetInstallHomeResult['compose'] = null;
  if (fs.existsSync(ctx.home)) {
    compose = await composeDown({
      projectRoot: ctx.home,
      composeProjectName: ctx.composeProjectName,
    });
  }

  let removedHome = false;
  if (!keepFiles && removeHome && fs.existsSync(ctx.home)) {
    for (const entry of listHomeEntries(ctx.home)) {
      fs.rmSync(path.join(ctx.home, entry), { recursive: true, force: true });
    }
    removedHome = true;
  }

  return {
    home: ctx.home,
    composeProjectName: ctx.composeProjectName,
    compose,
    removedHome,
  };
}
