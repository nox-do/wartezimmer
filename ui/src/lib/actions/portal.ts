const DEFAULT_Z_INDEX = 1050;

type PortalOptions = {
  zIndex?: number;
  className?: string;
};

type PortalParams = number | PortalOptions;

function resolvePortalOptions(params: PortalParams = DEFAULT_Z_INDEX): Required<PortalOptions> {
  if (typeof params === 'number') {
    return { zIndex: params, className: '' };
  }
  return {
    zIndex: params.zIndex ?? DEFAULT_Z_INDEX,
    className: params.className ?? '',
  };
}

export function portal(node: HTMLElement, params: PortalParams = DEFAULT_Z_INDEX) {
  if (typeof document === 'undefined') {
    return;
  }

  const options = resolvePortalOptions(params);
  const container = document.createElement('div');
  container.style.cssText = `position:relative;z-index:${options.zIndex}`;
  if (options.className) {
    container.className = options.className;
  }
  document.body.appendChild(container);
  container.appendChild(node);

  return {
    update(nextParams: PortalParams = DEFAULT_Z_INDEX) {
      const nextOptions = resolvePortalOptions(nextParams);
      container.style.zIndex = String(nextOptions.zIndex);
      container.className = nextOptions.className;
    },
    destroy() {
      container.remove();
    },
  };
}
