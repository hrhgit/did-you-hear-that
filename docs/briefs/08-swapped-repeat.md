# Brief 08: swapped repeat

## Goal

Tell a difference between ears apart from a difference between the two sides of the headphones, using the only tool available: turning the headphones around and repeating the room.

## Behaviour to specify

- Offered on the result page for any floor whose left and right difference reaches the configured limit and where both wings have a number.
- The visitor is told to put the left earpiece on the right ear and the right earpiece on the left, and confirms. A single-sided sound is then played and the visitor says which ear heard it, which confirms the swap happened. If it did not, the instruction is repeated.
- The room is run again with the engine exactly as before. The product keeps track of which earpiece is on which ear.
- The outcome is one of three:
  - **follows the ear**: the same ear needed the louder sound both times. The text says the difference seems to belong to the ears, and repeats when to see a hearing professional.
  - **follows the earpiece**: the same earpiece needed the louder sound both times. The text says the difference seems to belong to the headphones.
  - **unclear**: anything else, including a difference that shrank below half the limit, or an unreliable repeat.
- The result page shows the repeat next to the first run for that floor.
- Calibration is not repeated. The same calibration gain is used.

## Properties

- **Correct attribution.** Simulate a listener with a chosen ear difference and headphones with a chosen imbalance between sides, across the range from none to large for each. When only the ear difference is at or above the limit, the outcome is "follows the ear". When only the headphone imbalance is, the outcome is "follows the earpiece". When neither is, the repeat is not offered. When both are, the outcome is never stated as certain. Within one upward step of a boundary, "unclear" is also accepted.

## Out of scope

- Any correction of the result for headphone imbalance. The product reports what it found and does not adjust numbers.

## Done when

The property passes and the repeat can be completed from the result page in a simulated and a real visit.
