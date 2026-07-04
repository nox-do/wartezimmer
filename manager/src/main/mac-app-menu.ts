import { Menu, type MenuItemConstructorOptions } from 'electron';

const APP_NAME = 'Praxis Flow';

export function installMacApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `Über ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `${APP_NAME} ausblenden` },
        { role: 'hideOthers', label: 'Andere ausblenden' },
        { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: `${APP_NAME} beenden` },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
