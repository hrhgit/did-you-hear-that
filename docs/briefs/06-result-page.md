# Brief 06: result page

## Goal

The picture the visitor leaves with, and the visual high point of the product. A judge who never puts on headphones should remember it from a screenshot.

## The picture

The same cross-section of the house, now lit throughout. Each floor is one room and one pitch, with a left wing and a right wing. Light reaches into each wing as far as that ear could hear on that floor: deeper light means a quieter sound was caught.

## Behaviour to specify

- Each wing shows one of the four engine states. Found: light to the matching depth. Better than floor: light to the far wall, with the line "quieter than this house can whisper". Worse than cap: the wing stays dark, with a plain line saying the loudest sound the house may play was not caught. Unreliable: the wing is drawn hatched with a line saying this room should be visited again.
- Beside each floor: the left and right difference in decibels, or a dash when either wing has no number.
- Above the picture: the false alarm rate in words ("You answered 2 of 9 times when I made no sound") and, when it is over the limit, a clear notice that the whole visit is unreliable.
- The limits statement from `.kiro/steering/wording.md` sits next to the picture, always visible, never behind a link.
- Floors are never joined by a line, ranked, averaged or summed. There is no overall number.
- When a floor's difference reaches the configured limit, that floor offers the swapped repeat.
- The visit is saved to local storage with the date, the visit type and a name the visitor may give their headphones. When an earlier visit with the same headphone name exists, the earlier depths are drawn as faint outlines in the same wings.
- The visitor can delete any or all stored visits.
- A "save picture" control exports the cross-section as an image with the limits statement included in it.

## Copy

Every sentence that depends on the result is built by a function in `src/copy`.

## Hook

A hook on saving any file under `src/copy/` runs the banned-word check and reports failures to the agent.

## Properties

- **Safe wording.** For every combination of states, differences and false alarm rates, the generated text has no banned word and includes the limits statement.
- The picture never orders or connects floors: no generated text compares one floor's level with another's.

## Out of scope

- The swapped repeat itself.

## Done when

The page renders every combination of states without overlap at phone and desktop sizes, both properties pass, and storing, comparing and deleting visits work.
