import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillGarden } from '#core/skillgarden/loader.js'
import { substituteArguments, substituteParameters } from '#core/skillgarden/substitute.js'

describe('positional skill arguments', () => {
  it('leave dollar amounts alone, with or without args', () => {
    expect(substituteArguments('Refund at most $50 without asking.')).toBe('Refund at most $50 without asking.')
    expect(substituteArguments('Refund at most $50 for $1.', 'EM20-1')).toBe('Refund at most $50 for EM20-1.')
  })

  it('fill $1, $2… that were given, and leave the rest as written', () => {
    expect(substituteArguments('Ship $1 to $2, then $3.', 'order-7 Berlin')).toBe('Ship order-7 to Berlin, then $3.')
    expect(substituteArguments('Ship $1.')).toBe('Ship $1.')
  })

  it('read $$1 as a literal "$1", without touching $$ elsewhere', () => {
    expect(substituteArguments('Charge $$1 for $1.', 'shipping')).toBe('Charge $1 for shipping.')
    expect(substituteArguments('echo $$ > pid')).toBe('echo $$ > pid')
  })

  it('still fill $ARGUMENTS, and never fill an argument\'s own text again', () => {
    expect(substituteArguments('Hello, $ARGUMENTS!', 'Ada Lovelace')).toBe('Hello, Ada Lovelace!')
    expect(substituteArguments('Note: $1', '$2-looking second')).toBe('Note: $2-looking')
  })
})

describe('named skill parameters', () => {
  it('fill given names, blank declared ones not given, and leave other $words', () => {
    const used = new Set<string>()
    expect(substituteParameters('Order $order_number, note: $note, $ARGUMENTS, $50.', { order_number: '4821' }, { declared: ['note'], used })).toBe(
      'Order 4821, note: , $ARGUMENTS, $50.',
    )
    expect([...used]).toEqual(['order_number'])
  })
})

describe('the Skill tool', () => {
  it('keeps a skill\'s dollar amounts when it loads it without args', () => {
    const root = mkdtempSync(join(tmpdir(), 'le-skill-args-'))
    mkdirSync(join(root, 'refunds'), { recursive: true })
    writeFileSync(join(root, 'refunds', 'SKILL.md'), '---\nname: refunds\ndescription: Refund rules.\n---\nRefund up to $50 on your own; above that, ask.')
    const garden = new SkillGarden({ dirs: [root] })
    garden.buildIndex()

    expect(garden.invoke('refunds')).toBe('Refund up to $50 on your own; above that, ask.')
  })
})
