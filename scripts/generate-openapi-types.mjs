#!/usr/bin/env node

import { generateOpenApiTypes } from './openapi-types-lib.mjs';

await generateOpenApiTypes({ group: 'ui', label: 'generate-openapi-types' });
