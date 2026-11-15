import { describe, expect, it } from 'vitest'

import { discoverConfigSchemaWithDefaults } from '../src/lib/config'
import { parseSchemas } from '../src/lib/parse/schema'

const config = discoverConfigSchemaWithDefaults.parse({ probes: {} })

/**
 * Infer the runtime schema of an endpoint from the response samples it returned
 *
 * @param samples Parsed response bodies, one per probe of the endpoint
 *
 * @returns The inferred schema, or undefined if inference failed
 */
async function inferSchema(...samples: unknown[]) {
  const [result] = await parseSchemas([
    {
      method: 'get',
      path: '/sample',
      config: { discriminators: true },
      samples: samples.map(sample => JSON.stringify(sample)),
    },
  ], config)

  return result?.schema
}

describe('schema inference', () => {
  // Parsing a sample must give the sample back unchanged: a dropped element type
  // makes parsing throw, and a dropped object property gets stripped from the result.
  // Each schema must also reject a value of an unrelated type, so a catch-all
  // schema such as z.unknown() does not count as a fix.
  describe('arrays with mixed element types', () => {
    it.each([
      {
        sample: ['a', null],
        rejects: [1],
      },
      {
        sample: [
          { a: 1 },
          2,
        ],
        rejects: ['a'],
      },
      {
        sample: [
          { a: 1 },
          null,
        ],
        rejects: ['a'],
      },
      {
        sample: [1, 'a'],
        rejects: [true],
      },
      {
        sample: [
          [1],
          ['a'],
        ],
        rejects: [
          [true],
        ],
      },
      {
        sample: [
          {
            tags: ['a'],
          },
          {
            tags: [1],
          },
        ],
        rejects: [
          {
            tags: [true],
          },
        ],
      },
    ])('should infer a schema that accepts $sample', async ({ sample, rejects }) => {
      const schema = await inferSchema(sample)

      expect(schema).toBeDefined()
      expect(schema!.parse(sample)).toEqual(sample)
      expect(schema!.safeParse(rejects).success).toBe(false)
    })
  })

  describe('arrays that start with null', () => {
    it.each([
      {
        sample: [null, 'a'],
        rejects: [1],
      },
      {
        sample: [
          null,
          { a: 1 },
        ],
        rejects: ['a'],
      },
      {
        sample: {
          items: [null, 'a'],
        },
        rejects: {
          items: [1],
        },
      },
    ])('should infer a schema that accepts $sample', async ({ sample, rejects }) => {
      const schema = await inferSchema(sample)

      expect(schema).toBeDefined()
      expect(schema!.parse(sample)).toEqual(sample)
      expect(schema!.safeParse(rejects).success).toBe(false)
    })
  })

  describe('endpoints with multiple probes', () => {
    it('should merge array responses from every probe', async () => {
      // e.g. the same list endpoint probed with different query parameters
      const samples = [
        [
          { id: 1 },
        ],
        [
          { id: 2, title: 'b' },
        ],
      ]

      const schema = await inferSchema(...samples)

      expect(schema).toBeDefined()

      for (const sample of samples) {
        expect(schema!.parse(sample)).toEqual(sample)
      }
    })
  })
})
