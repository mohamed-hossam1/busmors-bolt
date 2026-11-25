import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  META_ADS_TOOLS,
  META_ADS_TOOLKIT_VERSION,
  META_ADS_ALLOWED_TOOLS,
  assertAllowedTool,
  ReadOnlyViolation,
} from '../../src/features/meta-ads/tools'

const PLACEHOLDER = /[<>?]|TODO|slug|version/i
const NAME = /^METAADS_[A-Z0-9_]+$/
const FORBIDDEN = /CREATE|UPDATE|DELETE|SET_|PAUSE|UPLOAD|ARCHIVE|COPY/

test('insights slug is the verified literal', () => {
  assert.equal(META_ADS_TOOLS.insights, 'METAADS_GET_INSIGHTS')
})

test('listAdAccounts slug is the verified literal', () => {
  assert.equal(META_ADS_TOOLS.listAdAccounts, 'METAADS_GET_AD_ACCOUNTS')
})

test('toolkit version is the verified literal', () => {
  assert.equal(META_ADS_TOOLKIT_VERSION, '20261116_00')
})

test('allowed tools and version contain no placeholders', () => {
  for (const slug of META_ADS_ALLOWED_TOOLS) assert.doesNotMatch(slug, PLACEHOLDER)
  assert.doesNotMatch(META_ADS_TOOLKIT_VERSION, PLACEHOLDER)
})

test('every allowed tool matches the naming pattern', () => {
  for (const slug of META_ADS_ALLOWED_TOOLS) assert.match(slug, NAME)
})

test('no allowed tool is a write action', () => {
  for (const slug of META_ADS_ALLOWED_TOOLS) assert.doesNotMatch(slug, FORBIDDEN)
})

test('the allowlist holds exactly two tools', () => {
  assert.equal(META_ADS_ALLOWED_TOOLS.length, 2)
})

test('the insights tool is allowed', () => {
  assert.doesNotThrow(() => assertAllowedTool('METAADS_GET_INSIGHTS'))
})

test('write tools and empty slugs raise ReadOnlyViolation', () => {
  assert.throws(() => assertAllowedTool('METAADS_SET_AD_OBJECT_STATUS'), ReadOnlyViolation)
  assert.throws(() => assertAllowedTool('METAADS_CREATE_CAMPAIGN'), ReadOnlyViolation)
  assert.throws(() => assertAllowedTool(''), ReadOnlyViolation)
})