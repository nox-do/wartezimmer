import esheepScriptUrl from './vendor/eSheep.js?url';
import esheepAnimationUrl from './vendor/eSheep.xml?url';

type SheepOptions = {
  allowPopup: string;
  collisionsWith: string[];
  footerMargin: number;
  spawnContainer: HTMLElement;
};

declare global {
  interface Window {
    Sheep?: new (options: SheepOptions) => {
      Start: (animationXmlUrl: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadEsheepScript(): Promise<void> {
  if (window.Sheep) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = esheepScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load eSheep'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function spawnMfaEsheep(): Promise<void> {
  await loadEsheepScript();

  if (!window.Sheep) {
    return;
  }

  const spawnContainer =
    document.querySelector<HTMLElement>('.mfa-dashboard-layout') ??
    document.querySelector<HTMLElement>('.mfa-page') ??
    document.body;

  const sheep = new window.Sheep({
    allowPopup: 'no',
    collisionsWith: ['.mfa-quicksettings', '.wait-zone'],
    footerMargin: 0,
    spawnContainer,
  });

  sheep.Start(esheepAnimationUrl);
}
