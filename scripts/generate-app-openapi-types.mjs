#!/usr/bin/env node

import { generateOpenApiTypes } from './openapi-types-lib.mjs';

await generateOpenApiTypes({ group: 'app', label: 'generate-app-openapi-types' });
