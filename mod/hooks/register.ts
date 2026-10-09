import type { Register } from 'claude-code'

import { annotate } from './annotate'

// Both rows keep the engine's own drawing: only the text they draw changes,
// and only where a block of it is RTL. The stored message, and what the model
// read, stay as they were.
//
// The terminal is left alone: it lays text out itself, cell by cell, and what
// it does with a bidi control is the emulator's to say.
//
// The question dialog is left alone too. It shows every bidi control as a
// visible replacement character and lays its text out LTR whatever the text
// opens with, so marks there only add noise.
export const register: Register = on => {
  // An assistant reply's text block: markdown
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (e.surface === 'terminal') {
      return next(e)
    }

    const text = annotate(e.props.text, 'markdown')

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  // A user-role row, the prompt among them: drawn as typed
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    if (e.surface === 'terminal') {
      return next(e)
    }

    const text = annotate(e.props.text, 'plain')

    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })
}
