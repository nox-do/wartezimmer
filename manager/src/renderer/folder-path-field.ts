import { setButtonIcon } from './lucide-icons.js';

export function createFolderPathField(options: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => Promise<string | null>;
  disabled?: boolean;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'folder-path-row';

  const label = document.createElement('label');
  label.className = 'folder-path-label';
  label.textContent = options.label;

  const controls = document.createElement('div');
  controls.className = 'folder-path-controls';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wizard-input folder-path-input';
  input.value = options.value;
  input.disabled = options.disabled ?? false;
  input.spellcheck = false;
  input.addEventListener('input', () => {
    options.onChange(input.value);
  });

  const browse = document.createElement('button');
  browse.type = 'button';
  browse.className = 'btn-icon btn-secondary';
  browse.setAttribute('aria-label', `${options.label}: Ordner wählen`);
  browse.title = 'Ordner wählen';
  setButtonIcon(browse, 'folder-open');
  browse.disabled = options.disabled ?? false;
  browse.addEventListener('click', () => {
    void options.onBrowse().then((path) => {
      if (path) {
        input.value = path;
        options.onChange(path);
      }
    });
  });

  controls.append(input, browse);
  row.append(label, controls);
  return row;
}
