// dsh-image-gen smoke test — offline-safe: tests pure logic only.
// Run: node --test test/smoke.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { sniffMediaType, classifyFailure } from '../index.js'

test('sniffMediaType detects png from magic bytes', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  assert.equal(sniffMediaType(png), 'image/png')
})

test('sniffMediaType detects jpeg', () => {
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  assert.equal(sniffMediaType(jpg), 'image/jpeg')
})

test('sniffMediaType rejects garbage', () => {
  const bad = Uint8Array.from([0x00, 0x01, 0x02, 0x03])
  assert.equal(sniffMediaType(bad), undefined)
})

test('classifyFailure buckets quota errors', () => {
  assert.equal(classifyFailure('insufficient credits 402'), 'quota')
  assert.equal(classifyFailure('balance exceeded'), 'quota')
})

test('classifyFailure buckets rate limits', () => {
  assert.equal(classifyFailure('429 rate limit exceeded'), 'rate-limit')
})

test('classifyFailure buckets network errors', () => {
  assert.equal(classifyFailure('ECONNREFUSED'), 'network')
  assert.equal(classifyFailure('fetch failed: ENOTFOUND api.example.com'), 'network')
})

test('classifyFailure buckets invalid requests', () => {
  assert.equal(classifyFailure('400 unknown model "foo"'), 'invalid')
  assert.equal(classifyFailure('422 validation error'), 'invalid')
})

test('classifyFailure returns other for unknown', () => {
  assert.equal(classifyFailure('some weird error'), 'other')
})
