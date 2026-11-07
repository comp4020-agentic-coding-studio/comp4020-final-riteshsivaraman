# Sound: a procedural soundscape (WebAudio)

labels: type:feature, area:client, size:m, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: none. Cues for payment and unboxing hook in once #2 and #7 land.

## Behaviour
Everything synthesised with WebAudio, no audio files: quiet room tone, spatialised footsteps and a murmur for nearby people, a door chime, a scan beep and an NFC chirp for payment, a soft click on UI taps. Muted until the first click or tap (browser autoplay rules), with a mute toggle. Volume falls off with distance; at most a fixed number of voices at once so a phone does not choke.

## Acceptance criteria
1. No sound before a user gesture; mute toggle works and persists locally.
2. Distant people are quieter; a person behind a wall is muffled or silent.
3. Voice count is capped; CPU time with 20 people in the room stays within budget (measured on a phone-sized viewport).
4. No audio asset files appear in the repo.

## Spec line
"The sound module exposes a pure mixer: given listener and source positions it returns gains, capped at N voices; no audio files are imported." (Pure-function check in spec/; the sound itself is advisory.)

## Advisory / judged
Calm, hotel-lobby feel. Feel-check with speakers on.

## Feeds
None directly (atmosphere for the calm-room claim in the README); justified by the README's 'calm' definition.

## Out of scope
Music, speech, recorded samples.
