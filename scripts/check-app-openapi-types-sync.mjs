#!/usr/bin/env node

import { checkOpenApiTypesSync } from './openapi-types-lib.mjs';

await checkOpenApiTypesSync({
  group: 'app',
  label: 'check-app-openapi-types-sync',
});
