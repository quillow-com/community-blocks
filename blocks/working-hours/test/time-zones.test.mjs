import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterTimeZones,
  timeZoneLabel,
  timeZoneOptions,
} from '../package/settings/time-zone-field.mjs'

test('time-zone labels show a human-readable city alongside the unmodified IANA ID', () => {
  assert.deepEqual(timeZoneLabel('America/New_York'), {
    value: 'America/New_York',
    city: 'New York',
    label: 'New York · America/New_York',
  })
  assert.equal(
    timeZoneLabel('America/Argentina/Buenos_Aires').city,
    'Buenos Aires'
  )
  assert.equal(timeZoneLabel('UTC').label, 'Coordinated Universal Time · UTC')
})

test('zone options are unique, city-sorted, UTC-first and preserve saved/device aliases', () => {
  const options = timeZoneOptions('US/Eastern', 'Pacific/Honolulu', [
    'Europe/Berlin',
    'Asia/Dubai',
    'Europe/Berlin',
  ])
  assert.deepEqual(
    options.map(({ value }) => value),
    ['UTC', 'Europe/Berlin', 'Asia/Dubai', 'US/Eastern', 'Pacific/Honolulu']
  )
  assert.equal(
    options.find(({ value }) => value === 'US/Eastern').value,
    'US/Eastern'
  )
  assert.equal(timeZoneOptions('Invalid/Zone', undefined, []).length, 1)
  assert.equal(timeZoneOptions('UTC', undefined, ['Invalid/Zone']).length, 1)
})

test('city and IANA searches accept case, underscores, whitespace, paths and multiple words', () => {
  const options = timeZoneOptions('UTC', 'UTC', [
    'Europe/Berlin',
    'Asia/Dubai',
    'America/New_York',
    'America/Argentina/Buenos_Aires',
  ])
  for (const query of [
    'new york',
    'NEW_YORK',
    ' America/New_York ',
    'york america',
  ]) {
    assert.deepEqual(
      filterTimeZones(options, query).map(({ value }) => value),
      ['America/New_York']
    )
  }
  assert.equal(
    filterTimeZones(options, 'buenos aires')[0].value,
    'America/Argentina/Buenos_Aires'
  )
  assert.equal(filterTimeZones(options, 'Berlin')[0].value, 'Europe/Berlin')
  assert.equal(filterTimeZones(options, '').length, options.length)
  assert.deepEqual(filterTimeZones(options, 'No such city'), [])
})
