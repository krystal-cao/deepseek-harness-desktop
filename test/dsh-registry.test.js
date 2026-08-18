import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchDshCatalog } from '../src/dsh-registry.js'

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => payload,
  })
}

test('fetchDshCatalog returns every official dsh version and latest', async () => {
  const catalog = await fetchDshCatalog({
    fetcher: fakeFetch({
      // `latest` stays the auto-follow/update target; canary RCs on `next`
      // remain visible in the list through their tags instead.
      'dist-tags': { latest: '0.1.0-rc.6', next: '0.1.0-rc.7' },
      versions: {
        '0.0.1-rc.1': {},
        '0.0.1-rc.2': {},
        '0.0.1-rc.5': {},
        '0.1.0-rc.2': {},
        '0.1.0-rc.3': {},
        '0.1.0-rc.7': {},
        '0.1.0-rc.6': {},
        'not-a-version': {},
      },
      time: {
        '0.1.0-rc.7': '2026-08-17T00:00:00.000Z',
        '0.1.0-rc.6': '2026-08-01T00:00:00.000Z',
      },
    }),
  })
  assert.equal(catalog.latest, '0.1.0-rc.6')
  assert.deepEqual(catalog.versions, [
    { version: '0.0.1-rc.1', publishedAt: null, tags: [] },
    { version: '0.0.1-rc.2', publishedAt: null, tags: [] },
    { version: '0.0.1-rc.5', publishedAt: null, tags: [] },
    { version: '0.1.0-rc.2', publishedAt: null, tags: [] },
    { version: '0.1.0-rc.3', publishedAt: null, tags: [] },
    { version: '0.1.0-rc.7', publishedAt: '2026-08-17T00:00:00.000Z', tags: ['next'] },
    { version: '0.1.0-rc.6', publishedAt: '2026-08-01T00:00:00.000Z', tags: ['latest'] },
  ])
})

test('fetchDshCatalog still resolves latest when only the latest tag exists', async () => {
  const catalog = await fetchDshCatalog({
    fetcher: fakeFetch({
      'dist-tags': { latest: '0.1.0-rc.6' },
      versions: { '0.1.0-rc.6': {} },
    }),
  })
  assert.equal(catalog.latest, '0.1.0-rc.6')
})

test('fetchDshCatalog fails loudly on HTTP errors', async () => {
  await assert.rejects(fetchDshCatalog({ fetcher: fakeFetch({}, { ok: false, status: 500 }) }), /HTTP 500/)
})

test('fetchDshCatalog rejects when latest is not a valid dsh version', async () => {
  await assert.rejects(
    fetchDshCatalog({
      fetcher: fakeFetch({
        'dist-tags': { latest: 'latest' },
        versions: { '0.1.0-rc.6': {} },
      }),
    }),
    /latest/,
  )
})

test('fetchDshCatalog requests the abbreviated npm metadata format', async () => {
  let requestedAccept
  await fetchDshCatalog({
    fetcher: async (url, options) => {
      requestedAccept = options?.headers?.accept
      return {
        ok: true,
        status: 200,
        json: async () => ({
          'dist-tags': { latest: '0.1.0-rc.6' },
          versions: { '0.1.0-rc.6': {} },
        }),
      }
    },
  })
  assert.equal(requestedAccept, 'application/vnd.npm.install-v1+json')
})
