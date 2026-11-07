# Demo phones: live camera viewfinder (4c)

labels: type:feature, area:client, size:m, wave:w2
status: draft (scoped with Ritesh 2026-11-07)
depends on: 4a and 4b.

## Behaviour
Opening Camera on a demo phone shows a live, low-resolution view of the store from that phone's position and facing (a second camera rendered into a small texture, about 256 px, about 10 fps), including other people in the room. The shutter button flashes the screen and adds a procedurally rendered frame to the Photos grid for that session. The extra render runs only while someone has that phone's camera open and is off otherwise.

## Acceptance criteria
1. Camera opens only from the home screen; closing it stops the extra render within a frame.
2. At 390x844 the main scene stays smooth with one camera open (measured: report frame times with and without, on the verifier's machine).
3. Other visitors' avatars show up in the viewfinder.
4. The shutter adds a photo to Photos without any network request that stores image data.
5. If the device cannot afford the render (frame time over budget), it falls back to a static viewfinder without breaking.

## Spec line
"The viewfinder renders only while a camera screen is open and falls back safely; advisory otherwise." (mostly judged)

## Advisory / judged
Frame-time feel on a phone and on the marker's machine. Goes to the feel-check.

## Feeds
Demo tables.

## Out of scope
Saving photos server-side, filters, video.
