import { Html } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PMREMGenerator, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { engagedMoment } from "../../shared/engage.ts";
import { NPC_DESIGNATION, NPC_LABEL, scriptFor } from "../../shared/duty.ts";
import { NPCS, npcPose } from "../../shared/npcs.ts";
import { poseChanged } from "../../shared/pose.ts";
import { wrap } from "../../shared/steering.ts";
import { designationOf, EMPLOYEE_COLOUR, STAFF_SHIRT } from "../../shared/profile.ts";
import { avoidPeople } from "../../shared/people.ts";
import { SPAWN, STORE_Y, type Pose } from "../../shared/protocol.ts";
import { clampToWalkable, resolveCollisions, TABLE_H } from "../../shared/world.ts";
import { DEVICE_SLOTS, DEVICE_SLOT_BY_ID, type DeviceSlot } from "../../shared/slots.ts";
import { NameFloat } from "./NameFloat.tsx";
import { modelById } from "../../shared/talk/data.ts";
import { TABLE_ASSIGNMENTS } from "../../shared/assignments.ts";
import { productById } from "../../shared/catalogue.ts";
import { Mall, MallPeople } from "./Mall.tsx";
import { Npcs } from "./Npcs.tsx";
import { Actor, type ActorState } from "./gfx/Actor.tsx";
import { Device } from "./gfx/Device.tsx";
import { slotDevice } from "./gfx/furniture.tsx";
import { Room } from "./Room.tsx";
import { net, useNet } from "./net.ts";

const EYE_HEIGHT = 1.6;
const WALK_SPEED = 3.2; // metres per second
const SEND_EVERY_MS = 100; // 10 position updates a second
const TURN_SPEED = 1.8; // radians per second when turning with the arrow keys

// Dev: `?shot=1` is for taking comparison screenshots. It leaves the view
// where `?at=` puts it (even outside the glass), hides the HUD and sends
// nothing, so it cannot affect anyone else. `?fov=` sets the field of view.
const PARAMS = new URLSearchParams(location.search);
export const SHOT = PARAMS.has("shot");
const FOV = Number(PARAMS.get("fov")) || 72;

const keys = new Set<string>();

// First person: the camera is the visitor's eyes. Keys move you relative to
// where you are looking, and collisions use the same boxes the scene draws.
// Inspecting a device (Ritesh, 2026-10-21): it floats up off the table and hangs in
// front of your face, and dragging turns it in the air. `yaw` and `pitch` are what
// the drag has turned it by; the rest is where the scene draws it.
export const FLOAT = { x: 0, y: 0, z: 0, facing: 0, yaw: 0, pitch: 0 };
const floatReach = (kind: string): number => (kind === "laptop" ? 0.6 : kind === "tabletKb" ? 0.52 : kind === "tablet" ? 0.42 : 0.3);
const PROJECT_TMP = new Vector3();
// A conversation pans the camera in close on the other person's face (Ritesh,
// 2026-10-19: "slightly pans into their face and zooms in... you can actually
// see them talk"), the same eased-approach shape as the device-inspect camera
// above, not a cut. Held a little further back than a device inspect (people
// are bigger and the panel sits over the bottom of the screen), roughly level
// with the face rather than looking down on it.
const TALK_HEAD_Y = 1.55; // engage.ts's own gaze height for a person's face
const TALK_RADIUS = 0.9; // metres from the face — close, but not nose-to-nose
const TALK_TARGET = new Vector3();
const TALK_OFFSET = new Vector3();
// device-targeting reticle point, in normalised device coordinates
// (-1..1, y up): low and centred, not the crosshair-dead-centre of the view
const TARGET_NDC_X = 0;
const TARGET_NDC_Y = -0.55;

function Player() {
  const { camera, gl } = useThree();
  const lastSent = useRef(0);
  const sent = useRef<Pose | null>(null);
  const velocity = useRef({ x: 0, z: 0 });
  // inspecting a device (D39): the standing pose to snap back to when it ends
  const wasInspecting = useRef<string | null>(null);
  const standPose = useRef({ ry: 0, pitch: 0 });
  // true while easing back out of an inspection — the same motion as panning
  // in, run in reverse (Ritesh, 2026-10-12), not a snap
  const exiting = useRef(false);
  // conversation camera: the id it last panned to (so a new conversation
  // starting re-captures the stand pose to return to) and whether it is
  // currently easing back out after the conversation ended
  const wasTalkingWith = useRef<string | null>(null);
  const talkStandPose = useRef({ ry: 0, pitch: 0 });
  const talkExiting = useRef(false);
  const wasThird = useRef(false);

  useEffect(() => {
    // `?at=x,z,yawDegrees` starts the camera elsewhere, for screenshots and
    // checks. It only moves your own view: the server still clamps and relays
    // whatever pose you then send.
    const at = new URLSearchParams(location.search).get("at")?.split(",").map(Number);
    // a fourth number is the pitch in degrees (negative looks down)
    const start = at && (at.length === 3 || at.length === 4) && at.every(Number.isFinite) ? at : null;
    camera.position.set(start ? start[0] : SPAWN.x, STORE_Y + EYE_HEIGHT, start ? start[1] : SPAWN.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(start && start.length === 4 ? (start[3] * Math.PI) / 180 : 0, start ? (start[2] * Math.PI) / 180 : SPAWN.ry, 0);
    const down = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "KeyV" && !e.repeat) {
        net.thirdPerson = !net.thirdPerson;
        net.changed();
      }
      if ((e.code === "Escape" || e.code === "KeyE") && net.myInspectSlot) net.inspectEnd();
      else if (e.code === "Escape" && net.escort) net.escortCancel();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    // Look by dragging with the mouse held down. The pointer is never captured
    // by the browser, so the cursor stays on screen all the time.
    const canvas = gl.domElement;
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    let dragging = false;
    let dragDistance = 0;
    const press = (e: PointerEvent) => {
      dragging = true;
      dragDistance = 0;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const drag = (e: PointerEvent) => {
      if (!dragging) return;
      dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (net.myInspectSlot) {
        // looking at a device: drag turns it in the air instead of turning your head
        FLOAT.yaw += e.movementX * 0.01;
        FLOAT.pitch += e.movementY * 0.01;
        return;
      }
      // a conversation holds the camera on the other person's face: dragging
      // doesn't fight that (same as it already doesn't move you while talking)
      if (net.locked) return;
      camera.rotation.y -= e.movementX * 0.003;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - e.movementY * 0.003));
    };
    const release = (e: PointerEvent) => {
      dragging = false;
      // a tap, not a drag, while inspecting: tap-away puts the device down (D26)
      if (net.myInspectSlot && dragDistance < 4) net.inspectEnd();
      canvas.releasePointerCapture?.(e.pointerId);
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", press);
    canvas.addEventListener("pointermove", drag);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    return () => {
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointermove", drag);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [camera, gl]);

  // turn the body (not just the camera) so everyone else sees which way you face
  const faceToward = (tx: number, tz: number): void => {
    const dx = tx - net.me.x;
    const dz = tz - net.me.z;
    if (Math.hypot(dx, dz) < 0.05) return;
    const ry = Math.atan2(-dx, -dz);
    const now = performance.now();
    if (poseChanged(sent.current, { x: net.me.x, z: net.me.z, ry }) && now - lastSent.current >= SEND_EVERY_MS) {
      lastSent.current = now;
      sent.current = { x: net.me.x, z: net.me.z, ry };
      net.send({ type: "move", x: net.me.x, z: net.me.z, ry });
    }
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // just joined: the view goes where the server put you (outside the entrance for a
    // customer, the back room for an employee), unless the URL placed the camera
    if (net.spawn) {
      if (!new URLSearchParams(location.search).has("at")) {
        camera.position.set(net.spawn.x, STORE_Y + EYE_HEIGHT, net.spawn.z);
        camera.rotation.order = "YXZ";
        camera.rotation.set(0, net.spawn.ry, 0);
        net.me.x = net.spawn.x;
        net.me.z = net.spawn.z;
      }
      net.spawn = null;
    }

    // Inspecting a device (D39): the device stays on the table; your own
    // position doesn't change (others still see you standing there), only
    // the camera eases in close and orbits on drag. Ends the frame early —
    // normal walking/looking is fully suspended while this is going on.
    const slot = net.myInspectSlot ? DEVICE_SLOT_BY_ID.get(net.myInspectSlot) : undefined;
    if (slot) {
      if (wasInspecting.current !== slot.id) {
        wasInspecting.current = slot.id;
        FLOAT.yaw = 0;
        FLOAT.pitch = 0;
        standPose.current = { ry: camera.rotation.y, pitch: camera.rotation.x };
        camera.rotation.order = "YXZ";
      }
      // you stay where you stand; the device comes up off the table to hang in front of you
      const dx = slot.x - net.me.x;
      const dz = slot.z - net.me.z;
      const reach = floatReach(slot.kind);
      const dh = Math.hypot(dx, dz) || 1;
      const eyeY = STORE_Y + EYE_HEIGHT;
      FLOAT.x = net.me.x + (dx / dh) * reach;
      FLOAT.z = net.me.z + (dz / dh) * reach;
      FLOAT.y = eyeY - 0.12;
      FLOAT.facing = Math.atan2(-dx, -dz);
      const ease = 1 - Math.exp(-10 * dt);
      camera.position.x += (net.me.x - camera.position.x) * ease;
      camera.position.y += (eyeY - camera.position.y) * ease;
      camera.position.z += (net.me.z - camera.position.z) * ease;
      camera.rotation.y += wrap(FLOAT.facing - camera.rotation.y) * ease;
      camera.rotation.x += (Math.atan2(FLOAT.y - eyeY, reach) - camera.rotation.x) * ease;
      faceToward(slot.x, slot.z); // others see you turned to the device, leaning over it
      return;
    }
    if (wasInspecting.current) {
      // put down: the exact reverse of the pan in (Ritesh, 2026-10-12), eased
      // back to standing where you actually are, looking the way you were —
      // not a snap
      exiting.current = true;
      wasInspecting.current = null;
    }
    if (exiting.current) {
      const ease = 1 - Math.exp(-10 * dt);
      const ty = STORE_Y + EYE_HEIGHT;
      camera.position.x += (net.me.x - camera.position.x) * ease;
      camera.position.y += (ty - camera.position.y) * ease;
      camera.position.z += (net.me.z - camera.position.z) * ease;
      camera.rotation.y += wrap(standPose.current.ry - camera.rotation.y) * ease;
      camera.rotation.x += (standPose.current.pitch - camera.rotation.x) * ease;
      const atPos = Math.hypot(camera.position.x - net.me.x, camera.position.y - ty, camera.position.z - net.me.z) < 0.01;
      const atRot = Math.abs(wrap(standPose.current.ry - camera.rotation.y)) < 0.01 && Math.abs(standPose.current.pitch - camera.rotation.x) < 0.01;
      if (atPos && atRot) {
        exiting.current = false;
        camera.position.set(net.me.x, ty, net.me.z);
        camera.rotation.order = "YXZ";
        camera.rotation.set(standPose.current.pitch, standPose.current.ry, 0);
      } else {
        return; // still easing out: movement stays suspended, same as panning in
      }
    }

    // A conversation: pan in on the other person's face (Ritesh, 2026-10-19),
    // the same eased-approach shape as inspecting a device, so it reads as the
    // camera choosing to lean in, not a cut. `withId` is an NPC's engage.ts
    // position when it has walked over to stand and talk (not its scripted
    // route — mid-walkover it hasn't arrived yet, so there is nothing to aim
    // at besides where it already stands), or another visitor's own reported
    // position if a human is staffing the desk.
    const talkWithId = net.talking?.withId ?? net.staffTalking?.customerId ?? null;
    if (talkWithId) {
      const eng = net.engaged.get(talkWithId);
      const remote = net.remotes.get(talkWithId);
      const now = net.serverNow();
      const at = eng ? engagedMoment(talkWithId, eng, now) : remote ? { x: remote.x, z: remote.z } : npcPose(NPCS.find((n) => n.id === talkWithId) ?? NPCS[0]!, now);
      if (wasTalkingWith.current !== talkWithId) {
        wasTalkingWith.current = talkWithId;
        talkExiting.current = false;
        talkStandPose.current = { ry: camera.rotation.y, pitch: camera.rotation.x };
      }
      TALK_TARGET.set(at.x, STORE_Y + (eng?.seated || net.seats.has(talkWithId) ? 1.2 : TALK_HEAD_Y), at.z); // a seated head is lower
      const mySeat = net.you ? net.seats.get(net.you.id) : undefined;
      const ease = 1 - Math.exp(-6 * dt); // a touch slower than the device pan: a lean, not a snap-zoom
      if (mySeat) {
        // sitting: the view is fixed at your seat, looking straight at them
        const tx = mySeat.x + (at.x - mySeat.x) * 0.1;
        const tz = mySeat.z + (at.z - mySeat.z) * 0.1;
        camera.position.x += (tx - camera.position.x) * ease;
        camera.position.y += (STORE_Y + 1.18 - camera.position.y) * ease;
        camera.position.z += (tz - camera.position.z) * ease;
        camera.lookAt(TALK_TARGET);
        net.me.x = mySeat.x;
        net.me.z = mySeat.z;
        faceToward(mySeat.fx, mySeat.fz); // the body sits turned a little towards them, as everyone else sees
        return;
      }
      // stand off on the near side, between where you are now and their face,
      // so the pan reads as leaning toward them rather than swinging around
      const dx = camera.position.x - TALK_TARGET.x;
      const dz = camera.position.z - TALK_TARGET.z;
      const d = Math.hypot(dx, dz) || 1;
      TALK_OFFSET.set((dx / d) * TALK_RADIUS, 0, (dz / d) * TALK_RADIUS);
      camera.position.x += (TALK_TARGET.x + TALK_OFFSET.x - camera.position.x) * ease;
      camera.position.y += (TALK_TARGET.y - camera.position.y) * ease;
      camera.position.z += (TALK_TARGET.z + TALK_OFFSET.z - camera.position.z) * ease;
      camera.lookAt(TALK_TARGET);
      // the body turns to the other person too, so both are seen face to face; the
      // specialist steps in close if the customer was left some way off (after a demo)
      const me = net.you?.id;
      if (net.staffTalking && me && !net.seats.has(me) && !net.seats.has(talkWithId)) {
        const gx = net.me.x - at.x;
        const gz = net.me.z - at.z;
        const gd = Math.hypot(gx, gz);
        if (gd > 1.9) {
          const step = Math.min(gd - 1.4, 1.6 * dt);
          let nx = net.me.x - (gx / gd) * step;
          let nz = net.me.z - (gz / gd) * step;
          ({ x: nx, z: nz } = clampToWalkable(net.role, nx, nz));
          ({ x: nx, z: nz } = resolveCollisions(nx, nz, net.role));
          net.me.x = nx;
          net.me.z = nz;
        }
      }
      faceToward(at.x, at.z);
      return; // the position sent to others (net.me) is untouched: only the local view moves
    }
    if (wasTalkingWith.current) {
      // conversation ended: ease back to standing where you actually are,
      // looking the way you were — the exact reverse of panning in, not a snap
      talkExiting.current = true;
      wasTalkingWith.current = null;
    }
    if (talkExiting.current) {
      const ease = 1 - Math.exp(-6 * dt);
      const ty = STORE_Y + EYE_HEIGHT;
      camera.position.x += (net.me.x - camera.position.x) * ease;
      camera.position.y += (ty - camera.position.y) * ease;
      camera.position.z += (net.me.z - camera.position.z) * ease;
      camera.rotation.y += wrap(talkStandPose.current.ry - camera.rotation.y) * ease;
      camera.rotation.x += (talkStandPose.current.pitch - camera.rotation.x) * ease;
      const atPos = Math.hypot(camera.position.x - net.me.x, camera.position.y - ty, camera.position.z - net.me.z) < 0.01;
      const atRot = Math.abs(wrap(talkStandPose.current.ry - camera.rotation.y)) < 0.01 && Math.abs(talkStandPose.current.pitch - camera.rotation.x) < 0.01;
      if (atPos && atRot) {
        talkExiting.current = false;
        camera.position.set(net.me.x, ty, net.me.z);
        camera.rotation.order = "YXZ";
        camera.rotation.set(talkStandPose.current.pitch, talkStandPose.current.ry, 0);
      } else {
        return; // still easing out: movement stays suspended, same as the talk itself did
      }
    }

    // in a conversation you stand and read; the keys pick from the menu
    const talking = net.locked;
    const forward = talking ? 0 : (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const strafe = talking ? 0 : (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);

    // Left and right arrows turn you on the spot (a left turn raises yaw).
    const turn = talking ? 0 : (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    if (turn !== 0) camera.rotation.y += turn * TURN_SPEED * dt;

    // Heading from the camera: forward is where you look, flattened to the floor.
    const yaw = camera.rotation.y;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);

    let wx = fx * forward + rx * strafe;
    let wz = fz * forward + rz * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }

    // Ease towards the wanted speed so you accelerate and settle, not snap.
    const ease = 1 - Math.exp(-12 * dt);
    velocity.current.x += (wx * WALK_SPEED - velocity.current.x) * ease;
    velocity.current.z += (wz * WALK_SPEED - velocity.current.z) * ease;

    // (in third person the camera is behind you, so your own place is net.me)
    const fromMe = net.thirdPerson || wasThird.current;
    wasThird.current = net.thirdPerson;
    let x = (fromMe ? net.me.x : camera.position.x) + velocity.current.x * dt;
    let z = (fromMe ? net.me.z : camera.position.z) + velocity.current.z * dt;
    // where you may stand depends on your role (staff reach the back room)
    if (SHOT) return;
    ({ x, z } = clampToWalkable(net.role, x, z));
    ({ x, z } = resolveCollisions(x, z, net.role));
    // people are solid too: other visitors, staff, customers, walkers
    ({ x, z } = avoidPeople(x, z, [...net.remotes.values()], net.serverNow()));
    ({ x, z } = clampToWalkable(net.role, x, z));
    net.me.x = x;
    net.me.z = z;
    if (net.thirdPerson) camera.position.set(x - fx * 2.4, STORE_Y + EYE_HEIGHT + 0.5, z - fz * 2.4);
    else camera.position.set(x, STORE_Y + EYE_HEIGHT, z);

    // Heading as the server and other clients know it: 0 faces +z.
    const ry = Math.atan2(-fx, -fz);
    const now = performance.now();
    if (poseChanged(sent.current, { x, z, ry }) && now - lastSent.current >= SEND_EVERY_MS) {
      lastSent.current = now;
      sent.current = { x, z, ry };
      net.send({ type: "move", x, z, ry });
    }
  });

  return null;
}

// Other visitors, drawn as people, eased towards the last position the server
// reported so ten updates a second look continuous. Anyone acting as staff
// wears the cap and badge.
function Remotes() {
  const root = useRef<Group>(null);
  const live = useNet();
  const speeds = useRef(new Map<string, ActorState>());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-14 * dt);
    for (const r of net.remotes.values()) {
      const px = r.x;
      const pz = r.z;
      r.x += (r.tx - r.x) * ease;
      r.z += (r.tz - r.z) * ease;
      r.ry += wrap(r.try - r.ry) * ease;
      const speed = dt > 0 ? Math.hypot(r.x - px, r.z - pz) / dt : 0;
      const prev = speeds.current.get(r.info.id);
      // smooth the estimate, otherwise the legs flicker on and off
      const smooth = prev ? (prev.speed ?? 0) + (speed - (prev.speed ?? 0)) * 0.2 : speed;
      const walking = smooth > 0.25 && !net.seats.has(r.info.id);
      let state: ActorState = { walking, mode: "idle", mood: "neutral", speed: smooth, seated: net.seats.has(r.info.id) };
      // what they are doing, so everyone sees it: leaning over the device they
      // are inspecting, or talking and listening in a conversation
      const looking = [...net.inspections.values()].find((i) => i.visitorId === r.info.id);
      const slot = looking ? DEVICE_SLOT_BY_ID.get(looking.slotId) : undefined;
      const chat = net.chats.get(r.info.id);
      // showing intent to talk: eyes on the person they want, and a wave
      const reaching = [...net.intents.values()].find((i) => i.fromId === r.info.id && i.state === "open" && (i.ready || !i.human));
      let target: { x: number; z: number } | undefined;
      if (reaching) {
        const npcDef = NPCS.find((n) => n.id === reaching.toId);
        target = reaching.toId === net.you?.id ? net.me : (net.remotes.get(reaching.toId) ?? (npcDef ? npcPose(npcDef, net.serverNow()) : undefined));
      }
      if (reaching && target && !walking) state = { ...state, mode: "wave", mood: "smile", gaze: { x: target.x, y: 1.55, z: target.z } };
      else if (slot && !walking) state = { ...state, mode: "observe", mood: "curious", gaze: { x: slot.x, y: TABLE_H + 0.05, z: slot.z } };
      else if (chat && !walking) {
        const other = chat.with === net.you?.id ? net.me : net.remotes.get(chat.with);
        // only the one who just spoke talks, and only as long as the line takes to say
        const talkingNow = net.serverNow() < chat.until;
        const mine = chat.speaker === r.info.id;
        state = { ...state, mode: talkingNow ? (mine ? "talk" : "listen") : "idle", mood: talkingNow && mine ? "smile" : "neutral", ...(other ? { gaze: { x: other.x, y: 1.55, z: other.z } } : {}) };
      }
      speeds.current.set(r.info.id, state);
    }
    root.current?.children.forEach((child) => {
      const r = net.remotes.get(child.name);
      if (r) {
        // sitting: exactly on the stool, turned the way the seat faces (a body is not left halfway into the table)
        const seat = net.seats.get(child.name);
        if (seat) {
          child.position.set(seat.x, STORE_Y, seat.z);
          child.rotation.y = Math.atan2(-(seat.fx - seat.x), -(seat.fz - seat.z));
        } else {
          child.position.set(r.x, STORE_Y, r.z);
          child.rotation.y = r.ry;
        }
      }
    });
  });

  return (
    <group ref={root}>
      {[...live.remotes.values()].map((r) => (
        <group key={r.info.id} name={r.info.id} position={[r.x, STORE_Y, r.z]}>
          <Actor
            id={r.info.id}
            shirt={r.identity.kind === "customer" ? r.info.colour : STAFF_SHIRT}
            look={r.identity.look}
            uniform={
              r.identity.kind !== "customer"
                ? { cap: EMPLOYEE_COLOUR[r.identity.kind], badge: EMPLOYEE_COLOUR[r.identity.kind] }
                : r.role === "staff"
                  ? { cap: "#ffd23f", badge: "#ffd23f" } // the dev switch
                  : undefined
            }
            getState={() => speeds.current.get(r.info.id) ?? { walking: false, mode: "idle", mood: "neutral" }}
          />
          <NameFloat id={r.info.id} name={r.info.name} npc={false} y={2.0} />
        </group>
      ))}
    </group>
  );
}

// "Press E to talk": the nearest person in front of you who has something to
// say, within a couple of metres. Only for customers who are free to talk.
// "Press E to inspect" (D39, extended 2026-10-12 to every tabled device, not
// just the phone pilot) works the same way, for anyone free to look —
// talking takes priority if both are in range at once.
const TALK_HINT_RANGE = 2.6;
// genuinely in front of you, within arm's reach — not the far end of the
// same table (Ritesh, 2026-10-12: "especially not on the other end of the
// table"), kept a little under the server's own INSPECT_RANGE
const DEVICE_HINT_RANGE = 1.15; // Ritesh, 2026-10-12: "a bit of a larger distance threshold" (was 0.8)
const DEVICE_HINT_COS = 0.5; // within about a 60° cone of where you're looking
// mirrors furniture.tsx's own override, so the hint names the same model it draws
const PILOT_PHONE_MODEL = new URLSearchParams(location.search).get("pilotPhone") ?? undefined;
const nameOfSlot = (slot: DeviceSlot): string => {
  const modelId = PILOT_PHONE_MODEL ?? TABLE_ASSIGNMENTS[slot.tableId]?.[slot.side];
  if (!modelId) return "device";
  const named = productById(modelId)?.name;
  if (named) return named;
  // a model the catalogue has no price list for yet (the 18 Pro Max): the talk data names it
  try {
    return modelById(modelId.replace(/^iphone-/, "")).name;
  } catch {
    return "device";
  }
};
function Interact() {
  const { camera } = useThree();
  useEffect(() => {
    const press = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || net.locked) return;
      if (net.staffConv?.collect) {
        if (net.stockNear) net.stockCollect();
        return;
      }
      if (net.hint?.intentId) (net.hint.show ? net.intentShow(net.hint.intentId) : net.intentAccept(net.hint.intentId));
      else if (net.hint) net.talkStart(net.hint.id);
      else if (net.deviceHint && !net.myInspectSlot) net.inspectStart(net.deviceHint.slotId);
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, []);

  useFrame(() => {
    const coll = net.staffConv?.collect;
    const near = !!coll && Math.hypot(net.me.x - coll.at.x, net.me.z - coll.at.z) < 2.4;
    if (near !== net.stockNear) {
      net.stockNear = near;
      net.changed();
    }
    const yaw = camera.rotation.y;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);

    // Among the devices in range and roughly ahead, the target is whichever
    // one's on-screen position is closest to a point low and centred in the
    // view (Ritesh, 2026-10-12) — so turning to look at a different phone on
    // the same table re-picks it, the way aiming a reticle would, rather than
    // always locking onto whichever is nearest in the world.
    let bestDevice: { slot: DeviceSlot; sd: number } | null = null;
    if (!net.locked && !net.myInspectSlot && net.status === "open") {
      for (const s of DEVICE_SLOTS) {
        if (net.inspections.has(s.id)) continue;
        const dx = s.x - net.me.x;
        const dz = s.z - net.me.z;
        const d = Math.hypot(dx, dz);
        if (d > DEVICE_HINT_RANGE) continue;
        if (d > 0.15 && (dx * fx + dz * fz) / d < DEVICE_HINT_COS) continue; // not genuinely facing it
        PROJECT_TMP.set(s.x, STORE_Y + TABLE_H + 0.1, s.z).project(camera);
        if (PROJECT_TMP.z > 1) continue; // behind the near/far clip
        const sdx = PROJECT_TMP.x - TARGET_NDC_X;
        const sdy = PROJECT_TMP.y - TARGET_NDC_Y;
        const sd = sdx * sdx + sdy * sdy;
        if (!bestDevice || sd < bestDevice.sd) bestDevice = { slot: s, sd };
      }
    }
    const nextDevice = bestDevice ? { slotId: bestDevice.slot.id, name: nameOfSlot(bestDevice.slot) } : null;
    if (nextDevice?.slotId !== net.deviceHint?.slotId) {
      net.deviceHint = nextDevice;
      net.changed();
    }

    let best: { id: string; name: string; d: number; intentId?: string; show?: boolean } | null = null;
    const free = net.state === "arriving" || net.state === "browsing" || net.state === "waiting_for_help";
    // someone has shown intent to talk to you and is close enough: E accepts it
    // (customers and staff alike). Your own outstanding intents are not offered again.
    const myId = net.you?.id;
    if (myId && !net.locked && net.status === "open" && (free || net.identity.kind !== "customer")) {
      const now = net.serverNow();
      for (const it of net.intents.values()) {
        if (it.toId !== myId || it.state !== "open") continue;
        if (it.human && !it.ready) continue; // a real user has not shown intent yet
        const e = net.engaged.get(it.fromId);
        const rem = net.remotes.get(it.fromId);
        const pos = e ? engagedMoment(it.fromId, e, now) : rem;
        if (!pos) continue;
        const d = Math.hypot(pos.x - net.me.x, pos.z - net.me.z);
        if (d > TALK_HINT_RANGE) continue;
        if (!best || d < best.d) best = { id: it.fromId, name: it.fromName, d, intentId: it.id };
      }
    }
    // a specialist standing by their customer: E shows intent to talk
    if (myId && !best && !net.locked && net.status === "open" && net.identity.kind !== "customer") {
      for (const it of net.intents.values()) {
        if (it.fromId !== myId || !it.human || it.ready || it.state !== "open") continue;
        const r = net.remotes.get(it.toId);
        if (!r) continue;
        const d = Math.hypot(r.x - net.me.x, r.z - net.me.z);
        if (d <= TALK_HINT_RANGE && (!best || d < (best as { d: number }).d)) best = { id: it.toId, name: it.toName, d, intentId: it.id, show: true } as unknown as typeof best;
      }
    }
    const waitingOn = new Set([...net.intents.values()].filter((i) => i.fromId === myId).map((i) => i.toId));
    if (!best && net.identity.kind === "customer" && free && !net.locked && net.status === "open") {
      const consider = (id: string, name: string, x: number, z: number) => {
        if (waitingOn.has(id)) return;
        const dx = x - net.me.x;
        const dz = z - net.me.z;
        const d = Math.hypot(dx, dz);
        if (d > TALK_HINT_RANGE) return;
        // roughly in front of you, not behind
        if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) return;
        if (!best || d < best.d) best = { id, name, d };
      };
      const now = net.serverNow();
      for (const n of NPCS) {
        const post = NPC_DESIGNATION[n.id];
        if (!post || !scriptFor(post) || net.offDuty.has(n.id) || net.engaged.has(n.id) || net.released.has(n.id)) continue;
        const p = npcPose(n, now);
        if (p.present) consider(n.id, NPC_LABEL[n.id] ?? n.id, p.x, p.z);
      }
      for (const r of net.remotes.values()) {
        if (r.identity.kind === "customer") continue;
        const post = designationOf({ kind: r.identity.kind, specialty: r.identity.specialty });
        if (post && scriptFor(post)) consider(r.info.id, r.info.name, r.x, r.z);
      }
    }
    const b = best as { id: string; name: string; intentId?: string; show?: boolean } | null;
    const next = b ? { id: b.id, name: b.name, intentId: b.intentId, show: b.show } : null;
    if (next?.id !== net.hint?.id || next?.intentId !== net.hint?.intentId || next?.show !== net.hint?.show) {
      net.hint = next;
      net.changed();
    }
  });
  return null;
}

// Who is looking at what, right now (D39): server-authoritative, so a visitor
// who joins mid-inspection still sees it, matching how NPC engagement works.
// This is the only visible trace of "someone's always watching" another
// visitor's own browsing, not just staff watching customers.
// The device "Press E to inspect [name]" is about to target, highlighted —
// local only (it's a cursor, not something other visitors need to see).
function DeviceHintGlow() {
  const live = useNet();
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const mat = ref.current.material as MeshBasicMaterial;
    mat.opacity = 0.35 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });
  if (!live.deviceHint) return null;
  const slot = DEVICE_SLOT_BY_ID.get(live.deviceHint.slotId);
  if (!slot) return null;
  return (
    <mesh ref={ref} position={[slot.x, STORE_Y + TABLE_H + 0.002, slot.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.09, 0.12, 32]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// A place to go: a ring on the floor and a downward arrow bobbing above it
// (Ritesh, 2026-10-19: "implement this for everything"). One component for
// every "go here": where you were told to wait, where staff are walking you,
// the till, and for a specialist the customer they are to meet.
function GuideMarker({ x, z, colour, radius = 0.7 }: { x: number; z: number; colour: string; radius?: number }) {
  const ring = useRef<Mesh>(null);
  const arrow = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(t * 4);
    if (arrow.current) {
      arrow.current.position.y = STORE_Y + 1.55 + Math.sin(t * 3) * 0.12;
      arrow.current.rotation.y = t * 1.2;
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={ring} position={[0, STORE_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.78, radius, 40]} />
        <meshBasicMaterial color={colour} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={arrow} position={[0, STORE_Y + 1.55, 0]}>
        {/* a cone pointing down on a short stem */}
        <mesh position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.2, 0.34, 4]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.1, 0.24, 0.1]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// Every place you have been told to go.
function GuideMarkers() {
  const live = useNet();
  const out: Array<{ key: string; x: number; z: number; colour: string }> = [];
  // where staff are walking you (a demo device, the till): yellow
  if (live.escort && !live.myInspectSlot) out.push({ key: "escort", x: live.escort.goal.x, z: live.escort.goal.z, colour: "#ffd23f" });
  // where you were told to wait to be fetched: green
  const w = live.waitingAt;
  if (w) out.push({ key: "wait", x: w.x, z: w.z, colour: "#8cf0b4" });
  // a specialist waiting for the phone: the stock person: purple
  const coll = live.staffConv?.collect;
  if (coll) out.push({ key: "collect", x: coll.at.x, z: coll.at.z, colour: "#c79bff" });
  // a specialist: where to meet each customer you have been sent for: blue
  if (live.isEmployee && live.you) {
    for (const i of live.intents.values()) {
      if (i.fromId !== live.you.id || i.state === "queued") continue;
      const r = live.remotes.get(i.toId);
      const spot = i.wait ?? (r ? { x: r.x, z: r.z } : null);
      if (spot) out.push({ key: `meet:${i.id}`, x: spot.x, z: spot.z, colour: "#6cc4ff" });
    }
  }
  return (
    <>
      {out.map((m) => (
        <GuideMarker key={m.key} x={m.x} z={m.z} colour={m.colour} />
      ))}
    </>
  );
}

// The device you are inspecting, floated up off its table and held in front of
// you. It rises from where it sat, and dragging turns it in the air.
function FloatingDevice() {
  const live = useNet();
  const root = useRef<Group>(null);
  const turn = useRef<Group>(null);
  const tip = useRef<Group>(null);
  const shown = useRef<{ id: string; x: number; y: number; z: number } | null>(null);
  const look = live.myInspectSlot ? slotDevice(live.myInspectSlot) : null;
  const slot = live.myInspectSlot ? DEVICE_SLOT_BY_ID.get(live.myInspectSlot) : undefined;
  useFrame((_, delta) => {
    const g = root.current;
    if (!g || !slot) return;
    // start from the table, then ease up to the place in front of you
    if (!shown.current || shown.current.id !== slot.id) shown.current = { id: slot.id, x: slot.x, y: STORE_Y + TABLE_H, z: slot.z };
    const k = 1 - Math.exp(-9 * Math.min(delta, 0.05));
    const sh = shown.current;
    sh.x += (FLOAT.x - sh.x) * k;
    sh.y += (FLOAT.y - sh.y) * k;
    sh.z += (FLOAT.z - sh.z) * k;
    g.position.set(sh.x, sh.y, sh.z);
    g.rotation.y = FLOAT.facing;
    if (turn.current) turn.current.rotation.y = FLOAT.yaw;
    if (tip.current) tip.current.rotation.x = FLOAT.pitch;
  });
  if (!look || !slot) return null;
  return (
    <group ref={root}>
      <group ref={turn}>
        <group ref={tip}>
          <Device kind={look.kind} model={look.model ?? (look.kind === "phone" ? "iphone-18-pro" : undefined)} colour={look.colour} x={0} y={0} z={0} rotY={0} held />
        </group>
      </group>
    </group>
  );
}

// You, seen from behind, when you ask for it (V): your own character is
// otherwise out of sight, as it is behind your eyes.
function SelfView() {
  const { camera } = useThree();
  const live = useNet();
  const root = useRef<Group>(null);
  const state = useRef<ActorState>({ walking: false, mode: "idle", mood: "neutral" });
  const last = useRef({ x: 0, z: 0 });
  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const show = net.thirdPerson && !net.locked && !net.myInspectSlot && !net.escort;
    g.visible = show;
    if (!show) return;
    const dt = Math.max(delta, 1e-3);
    const speed = Math.hypot(net.me.x - last.current.x, net.me.z - last.current.z) / dt;
    last.current = { x: net.me.x, z: net.me.z };
    const prev = state.current.speed ?? 0;
    const smooth = prev + (speed - prev) * 0.2;
    const seat = net.you ? net.seats.get(net.you.id) : undefined;
    // your own open intent to talk: you wave, so you can see what others see
    const reaching = [...net.intents.values()].some((i) => i.fromId === net.you?.id && i.state === "open" && (i.ready || !i.human));
    state.current = { walking: smooth > 0.25 && !seat, mode: reaching && !seat && smooth < 0.25 ? "wave" : "idle", mood: reaching ? "smile" : "neutral", speed: smooth, seated: !!seat };
    g.position.set(net.me.x, STORE_Y, net.me.z);
    g.rotation.y = camera.rotation.y;
  });
  if (!live.you || !live.identity) return null;
  const id = live.identity;
  return (
    <group ref={root} visible={false}>
      <Actor
        id={live.you.id}
        shirt={id.kind === "customer" ? live.you.colour : STAFF_SHIRT}
        look={id.look}
        uniform={id.kind !== "customer" ? { cap: EMPLOYEE_COLOUR[id.kind], badge: EMPLOYEE_COLOUR[id.kind] } : undefined}
        getState={() => state.current}
      />
    </group>
  );
}

function InspectMarkers() {
  const live = useNet();
  return (
    <>
      {[...live.inspections.values()].map((i) => {
        // not your own: it would float right in the middle of your own close-up
        // view, and you already know you're the one looking
        if (i.visitorId === live.you?.id) return null;
        const slot = DEVICE_SLOT_BY_ID.get(i.slotId);
        if (!slot) return null;
        const name = live.remotes.get(i.visitorId)?.info.name ?? "Someone";
        return (
          <Html key={i.slotId} position={[slot.x, STORE_Y + TABLE_H + 0.42, slot.z]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
            <div className="name-tag">
              <b>{name}</b>
              <span>is looking at this</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}

// Soft reflections on glass, metal and the polished floor, from a small
// procedural room (no image download, so it costs nothing to load).
export function Reflections() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function Store() {
  return (
    <Canvas
      camera={{ fov: FOV, near: 0.1, far: 120 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      style={{ position: "fixed", inset: 0 }}
    >
      <color attach="background" args={["#dfe3e7"]} />
      <Reflections />
      <hemisphereLight args={["#ffffff", "#d3d6da", 1.25]} />
      <directionalLight position={[4, 8, -3]} intensity={0.6} />
      {/* daylight through the glass front */}
      <directionalLight position={[0, 6, -14]} intensity={0.5} />
      <group position={[0, STORE_Y, 0]}>
        <Room />
      </group>
      <Mall />
      <MallPeople />
      <fog attach="fog" args={["#dfe3e7", 28, 85]} />
      <Remotes />
      <Npcs />
      <Interact />
      <InspectMarkers />
      <FloatingDevice />
      <SelfView />
      <DeviceHintGlow />
      <GuideMarkers />
      <Player />
    </Canvas>
  );
}
