import { expect, test } from 'claude-code/testing'

import { annotate } from '../hooks/annotate'

const REPLY = 'Claude یک مدل است.\n\n- مورد `اول`\n- مورد دوم'
const PROMPT = 'این باگ را درست کن:\n- مورد اول'

test('the engine draws both rows itself, from the marked text', async ($, on) => {
  const drawn: string[] = []

  // Stands for the engine: records the text it is asked to draw
  on('ui.render', ($, e) => {
    drawn.push((e.props as { text: string }).text)

    return { type: 'Text', props: {}, children: ['engine'] }
  })

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const reply = await $.ui.mount({
      plugin: 'rtl-messages',
      surface,
      component: 'AssistantMessage',
      props: { text: REPLY, isFirstOfReply: true },
    })
    const prompt = await $.ui.mount({
      plugin: 'rtl-messages',
      surface,
      component: 'UserMessage',
      props: { text: PROMPT, origin: { kind: 'composer' }, isExpanded: false },
    })

    // The mod returned the engine's drawing, not a tree of its own
    expect(await reply.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(await prompt.find({ type: 'Text', text: 'engine' })).toBeDefined()
    expect(drawn).toEqual([annotate(REPLY, 'markdown'), annotate(PROMPT, 'plain')])

    drawn.length = 0
    await reply.unmount()
    await prompt.unmount()
  }

  expect(annotate(REPLY, 'markdown')).not.toBe(REPLY)
  expect(annotate(PROMPT, 'plain')).not.toBe(PROMPT)
})

test('the terminal, and a message with nothing RTL in it, pass through untouched', async ($, on) => {
  const drawn: string[] = []

  on('ui.render', ($, e) => {
    drawn.push((e.props as { text: string }).text)

    return { type: 'Text', props: {}, children: ['engine'] }
  })

  const inTerminal = await $.ui.mount({
    plugin: 'rtl-messages',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: REPLY, isFirstOfReply: true },
  })
  const english = await $.ui.mount({
    plugin: 'rtl-messages',
    surface: 'desktop',
    component: 'AssistantMessage',
    props: { text: 'Plain **English** reply.', isFirstOfReply: false },
  })

  expect(drawn).toEqual([REPLY, 'Plain **English** reply.'])

  await inTerminal.unmount()
  await english.unmount()
})

test('a reply that grows as it streams is marked again at each length', async ($, on) => {
  const drawn: string[] = []

  on('ui.render', ($, e) => {
    drawn.push((e.props as { text: string }).text)

    return { type: 'Text', props: {}, children: ['engine'] }
  })

  const reply = await $.ui.mount({
    plugin: 'rtl-messages',
    surface: 'desktop',
    component: 'AssistantMessage',
    props: { text: 'Claude', isFirstOfReply: true },
  })

  await reply.redraw({ text: 'Claude یک', isFirstOfReply: true })
  await reply.redraw({ text: 'Claude یک مدل است.', isFirstOfReply: true })

  // LTR until its Persian arrives, then RTL: the rule looks at how it closes
  expect(drawn).toEqual([
    'Claude',
    annotate('Claude یک', 'markdown'),
    annotate('Claude یک مدل است.', 'markdown'),
  ])

  await reply.unmount()
})
