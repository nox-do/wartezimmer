import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSecuredEmbedUrl,
  issuePreviewEmbedAccessToken,
  revokePreviewEmbedAccessForSession,
  validatePreviewEmbedAccessToken,
} from './preview-embed-access.js';

test('embed token is bound to previewSessionId and documentId', () => {
  const sessionId = 'session-a';
  const docA = 'doc-a';
  const docB = 'doc-b';

  const tokenA = issuePreviewEmbedAccessToken(sessionId, docA);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docA, tokenA), true);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docB, tokenA), false);

  const url = buildSecuredEmbedUrl(sessionId, docB, `/internal/preview/embed/${sessionId}`);
  const params = new URL(url, 'http://localhost');
  const access = params.searchParams.get('access') ?? '';
  assert.equal(params.searchParams.get('documentId'), docB);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docB, access), true);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docA, access), false);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docA, tokenA), false);
});

test('revokePreviewEmbedAccessForSession invalidates prior tokens', () => {
  const sessionId = 'session-b';
  const docId = 'doc-1';
  const token = issuePreviewEmbedAccessToken(sessionId, docId);
  revokePreviewEmbedAccessForSession(sessionId);
  assert.equal(validatePreviewEmbedAccessToken(sessionId, docId, token), false);
});
