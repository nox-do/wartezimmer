#!/usr/bin/env node

import { checkOpenApiTypesSync } from './openapi-types-lib.mjs';

await checkOpenApiTypesSync({
  group: 'ui',
  label: 'check-openapi-types-sync',
});
