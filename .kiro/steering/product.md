---
inclusion: always
---

# Product

**Did You Hear That?** is a haunted house for headphones that runs in a browser. Something in the house makes a sound on the visitor's left or right. Once the visitor catches a sound, that creature's sound can get quieter on that ear. The house uses catches, late answers and misses to estimate the level.

It is an entry for Kiroween 2026 in the Costume Contest category. That category asks for a haunting interface whose spooky elements improve the app's function. Here the horror rule is the measurement procedure, so every design choice must serve both.

## Who it is for

People who wear headphones for hours a day and have never had their hearing checked, because the usual check is a row of beeps nobody volunteers for. The visitor is alone, on a laptop or a phone, with whatever headphones they own.

## What the visitor does

1. Enters the house. Chooses the visit, or a 60 second replay that needs no headphones. There is one visit, the full one, and no shorter one (decided by the owner on 2026-11-20).
2. The music box theme plays on entry. The visitor checks that left and right are not swapped and keeps the system volume unchanged during the test. The theme stops before the check plays.
3. Enters a moonlit yard, where Jack the jack-o'-lantern guards his candy, and a soft beat keeps time. The creatures of the house live there, one for each pitch of the visit: five. First the roll call: each creature makes its sound once in each ear, loud enough to hear easily. A missed sound may repeat once. When the roll call ends, counting starts automatically: the creatures take turns in no order, each on the left or the right, and a catch can bring one back quieter until it reaches the edge of what the visitor heard. Perfect can take a larger step down. Good gives the house evidence that it is close to the edge. Each creature goes home when both ears finish. On some turns the house makes no sound at all. Every turn comes between the beats, and the creatures creep in on the beat to snuff Jack's candle: a catch kicks one away, and one that went by or came on the other side bites Jack and dims his flame. Catches in a row build a combo, as in a rhythm game, and the points grow with it. A flame that goes out is lit again: the room goes on and every answer counts (the rhythm game, decided by the owner on 2026-11-18, replacing the lantern). When the room has been quiet for about 12 seconds with no catch, the creature whose turn it is makes its sound once, louder (a reminder, which counts for nothing in the search), and each catch is followed by a soft chime. The counting is limited in time: the room closes after 5 minutes of counting at the latest, so that the visit never wears the visitor out however much is left to find (decided by the owner on 2026-11-20). Practice, rests and pauses do not count against the 5 minutes. A creature whose search ends sooner goes home sooner, and a creature still being searched when time is up is shown as not settled, the same as a search that ran out of tries.
4. Opens the last door. A voice says three digits in noise and the visitor types them.
5. Sees the result as soon as counting ends. The theme plays once. The moonlit yard of the visit, with Jack at the foot and one lane for each creature, highest pitch at the top. From the middle of each lane, light reaches to the left and to the right as far as that ear could hear that creature's pitch, and the creature stands where its light ends (the yard, decided by the owner on 2026-11-24, replacing the cross-section of a five-storey house). The words beside the picture name each lane by its creature and its pitch.
6. Swaps the headphones and repeats a creature whose left and right differed a lot. Each such creature can be repeated until one run of it ends with a record.

## What the result may claim

Consumer headphones are not calibrated and differ from each other at every pitch. Two comparisons survive that:

- the left ear against the right ear at the same pitch, checked by the swapped-headphone repeat
- the same person with the same headphones at the same device volume, this visit against a later visit

Nothing else is claimed. Pitches are never compared with each other in words. The result may draw each ear's levels as a curve across the pitches (decided by the owner on 2026-11-25, `.kiro/specs/result-curve/`), only with both ears on the same chart and a note that the shape comes mostly from the headphones; what it invites reading is the gap between the two curves at each pitch and the change against an earlier visit, not the shape. There is no comparison with other people, no clinical scale and no verdict.

The result may also say three things about the headphones at this volume, each from the one visit's own answers and only when the visit can tell (headphone-traits spec, decided by the owner on 2026-11-25): how late the sound reaches the ear (from heard answers against the roll call's seen answers), a level under which nothing at any pitch was heard (edges piled up at several pitches), and one side quieter by about the same at every pitch. Each is an estimate about the headphones and the system, never about the visitor's ears, and none needs an extra round, a swap or a second pair.

## Experience rules

- The fear comes from things getting quieter. There are no sudden loud sounds anywhere in the product.
- Before the visitor answers, nothing on screen may reveal when a sound plays or which side it is on. The one exception is the practice at the start of the room, the roll call: while a practice sound plays, the screen may show which creature makes it, standing in the doorway of the side that sound comes from, and say that a sound is playing now; between sounds that creature stands in the middle of the room. The line itself names no side. Practice counts for nothing, comes before every counted sound of the room, and is there so that the visitor knows the house, the creatures and the headphones work and what to do. Once the counting begins, the screen never shows whose turn it is.
- After a trial is scored, and not before, the screen may say what happened: a caught sound shows its creature in the doorway of its side, and a sound that went by is shown leaving by its side ("Scritch went by on your left"). A creature whose search is over goes home, which follows its last scored trial (`.kiro/specs/one-room/design.md`, decided by the owner's coordinator on 2026-11-16 at the owner's request). Its time to answer is over by then, and the next trial's side is drawn afresh. The beat and the cue of each turn may show between trials, because they are the same for every turn, with a sound or without, and never say a side; the combo may break between trials only on the visitor's own answer (the rhythm game, 2026-11-18). A reminder sound is scored like a trial and may be drawn like one once it is: a caught reminder shows its creature on its side. The combo, the points and Jack's flame are shown on screen, and an unanswered turn with no sound says so once it is over ("Nothing came that time.").
- A visitor with no headphones, and a judge who only watches a video, must still be able to follow what happened. Every caught sound is drawn as its creature with rings and a line naming its pitch and level, and the replay mode shows a whole recorded visit.
- All interface text is in English.

## What it is not

- Not a medical device, not a diagnosis, not a validated screening test.
- No accounts, no server, no analytics. Results stay in the visitor's browser.
- No leaderboard and no comparison between visitors.
- No correction for specific headphone models.
