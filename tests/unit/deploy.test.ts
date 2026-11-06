import { describe, expect, it } from 'vitest'
import { clientKey, parseEnvironment, stageRank, STAGE_ORDER } from '../../src/shared/deploy'

describe('parseEnvironment', () => {
  it.each([
    ['dev', { stage: 'dev', client: null }],
    ['Development', { stage: 'dev', client: null }],
    ['production', { stage: 'prod', client: null }],
    ['Production', { stage: 'prod', client: null }],
    ['prod-acmecorp', { stage: 'prod', client: 'acmecorp' }],
    ['staging-globex', { stage: 'staging', client: 'globex' }],
    ['prod-aws-initech', { stage: 'prod', client: 'aws-initech' }],
    ['AcmeCorp', { stage: 'other', client: 'AcmeCorp' }],
    ['uat_acme', { stage: 'pre-prod', client: 'acme' }],
    ['nonprod', { stage: 'pre-prod', client: null }],
    ['qa/acme', { stage: 'test', client: 'acme' }],
    ['Production – web', { stage: 'prod', client: 'web' }],
    ['Preview – app-admin', { stage: 'pre-prod', client: 'app-admin' }],
    ['acme live', { stage: 'prod', client: 'acme' }]
  ])('%s', (env, expected) => {
    expect(parseEnvironment(env)).toEqual(expected)
  })

  it('only takes the first stage word, leaving later ones in the client name', () => {
    expect(parseEnvironment('prod-dev-tools')).toEqual({ stage: 'prod', client: 'dev-tools' })
  })

  it('treats an empty name as an unknown shared stage', () => {
    expect(parseEnvironment('')).toEqual({ stage: 'other', client: null })
  })
})

describe('clientKey', () => {
  it('merges spellings that differ only in case', () => {
    expect(clientKey('AcmeCorp')).toBe(clientKey('acmecorp'))
  })
  it('uses an empty key for shared stages', () => {
    expect(clientKey(null)).toBe('')
  })
})

describe('stageRank', () => {
  it('orders stages dev → prod', () => {
    const ranked = ['prod', 'dev', 'staging', 'test', 'pre-prod'].sort((a, b) => stageRank(a) - stageRank(b))
    expect(ranked).toEqual(['dev', 'test', 'pre-prod', 'staging', 'prod'])
  })
  it('puts unknown stages where "other" goes', () => {
    expect(stageRank('mystery')).toBe(STAGE_ORDER.indexOf('other'))
  })
})
