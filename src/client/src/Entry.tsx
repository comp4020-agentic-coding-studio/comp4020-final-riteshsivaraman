import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { BEARDS, BODY_STYLES, EYE_STYLES, FACE_SHAPES, HAIR_COLOURS, HAIR_STYLES, SHIRT_COLOURS, SKIN_TONES, type LookChoice } from "../../shared/look.ts";
import { EMPLOYEE_COLOUR, EMPLOYEE_KINDS, SPECIALTIES, STAFF_SHIRT, type EmployeeKind, type Kind, type Profile, type Specialty } from "../../shared/profile.ts";
import { Actor } from "./gfx/Actor.tsx";
import { readProfile } from "./net.ts";

// The first thing a visitor sees: who they are today (a customer, or an
// employee of a kind) and how they look. Their last choices are filled in, but
// the screen shows every time (D35).

const KIND_LABEL: Record<EmployeeKind, string> = {
  greeter: "Greeter",
  specialist: "Specialist",
  genius: "Genius",
  stock: "Stock",
  technician: "Technician",
};
const KIND_BLURB: Record<EmployeeKind, string> = {
  greeter: "Welcome people at the door and point them the right way.",
  specialist: "Look after one kind of product.",
  genius: "Serve the bar: payments, repairs and pick-ups.",
  stock: "Fetch what the bar and the floor need from the back.",
  technician: "Repair devices at the bench.",
};
// which posts have a customer conversation so far
const HAS_SCRIPT = (kind: EmployeeKind, specialty: Specialty): boolean => kind === "greeter" || (kind === "specialist" && specialty === "phones");

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const newSeed = (): string => Math.random().toString(36).slice(2, 10);

function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame((s) => {
    if (g.current) g.current.rotation.y = Math.PI + Math.sin(s.clock.elapsedTime * 0.6) * 0.7;
  });
  return <group ref={g}>{children}</group>;
}

function Preview({ look, kind }: { look: LookChoice; kind: Kind }) {
  const uniform = kind !== "customer" ? { cap: EMPLOYEE_COLOUR[kind], badge: EMPLOYEE_COLOUR[kind] } : undefined;
  const state = useMemo(() => ({ walking: false, mode: "idle" as const, mood: "smile" }), []);
  return (
    <Canvas camera={{ position: [0, 1.0, 3.6], fov: 28 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <color attach="background" args={["#cfd3d8"]} />
      <hemisphereLight args={["#ffffff", "#9aa0a6", 1.25]} />
      <directionalLight position={[-2, 4, -3]} intensity={1.4} />
      <directionalLight position={[2, 2, 3]} intensity={0.7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[1.1, 40]} />
        <meshStandardMaterial color="#aeb3b9" roughness={0.9} />
      </mesh>
      <Turntable>
        <Actor id={look.seed ?? "preview"} look={look} shirt={kind === "customer" ? undefined : STAFF_SHIRT} uniform={uniform} getState={() => state} />
      </Turntable>
    </Canvas>
  );
}

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="chips">
        {options.map((o) => (
          <button key={o} type="button" className={o === value ? "chip on" : "chip"} onClick={() => onChange(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="swatches">
        {options.map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} className={c === value ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

export function Entry({ onEnter }: { onEnter: (p: Profile) => void }) {
  const saved = useMemo(() => readProfile(), []);
  const [kind, setKind] = useState<Kind>(saved?.kind ?? "customer");
  const [specialty, setSpecialty] = useState<Specialty>(saved?.specialty ?? "phones");
  const [name, setName] = useState(saved?.name ?? "");
  const [look, setLook] = useState<LookChoice>(() => ({ seed: newSeed(), ...(saved?.look ?? {}) }));
  const set = <K extends keyof LookChoice>(k: K, v: LookChoice[K]): void => setLook((l) => ({ ...l, [k]: v }));
  const employee = kind !== "customer";

  const randomise = (): void =>
    setLook({
      seed: newSeed(),
      body: pick(BODY_STYLES),
      eyes: pick(EYE_STYLES),
      face: pick(FACE_SHAPES),
      beard: pick(BEARDS),
      hairStyle: pick(HAIR_STYLES),
      hairColour: pick(HAIR_COLOURS),
      skin: pick(SKIN_TONES),
      shirt: pick(SHIRT_COLOURS),
    });

  const go = (): void => {
    const p: Profile = { kind, name: name.trim() || undefined, look };
    if (kind === "specialist") p.specialty = specialty;
    onEnter(p);
  };

  return (
    <div className="entry">
      <div className="entry-card">
        <div className="entry-preview">
          <Preview look={look} kind={kind} />
          <div className="entry-preview-note">Drag nothing, just look: this is how others will see you.</div>
        </div>

        <div className="entry-form">
          <h1>Welcome</h1>
          <p className="entry-lede">Who are you in the store today?</p>

          <div className="who">
            <button type="button" className={!employee ? "who-btn on" : "who-btn"} onClick={() => setKind("customer")}>
              <b>A customer</b>
              <span>Look around, ask for help, buy something.</span>
            </button>
            <button type="button" className={employee ? "who-btn on" : "who-btn"} onClick={() => setKind(employee ? kind : "greeter")}>
              <b>An employee</b>
              <span>Work the floor. Help the customers who ask.</span>
            </button>
          </div>

          {employee && (
            <div className="field">
              <div className="field-label">Your post</div>
              <div className="chips">
                {EMPLOYEE_KINDS.map((k) => (
                  <button key={k} type="button" className={k === kind ? "chip on" : "chip"} onClick={() => setKind(k)} style={k === kind ? { borderColor: EMPLOYEE_COLOUR[k] } : undefined}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="field-note">{KIND_BLURB[kind as EmployeeKind]}</div>
              {kind === "specialist" && <Chips label="Which products" options={SPECIALTIES} value={specialty} onChange={setSpecialty} />}
              {!HAS_SCRIPT(kind as EmployeeKind, specialty) && <div className="field-note warn">No customer conversations for this post yet. You can still join the shop and walk about.</div>}
            </div>
          )}

          <div className="field">
            <div className="field-label">Your name</div>
            <input className="text" value={name} maxLength={24} placeholder="Leave blank for a random one" onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="entry-look">
            <div className="entry-look-head">
              <h2>Your look</h2>
              <button type="button" className="chip" onClick={randomise}>
                Randomise
              </button>
            </div>
            <Chips label="Body" options={BODY_STYLES} value={look.body} onChange={(v) => set("body", v)} />
            <Chips label="Eyes" options={EYE_STYLES} value={look.eyes} onChange={(v) => set("eyes", v)} />
            <Chips label="Face" options={FACE_SHAPES} value={look.face} onChange={(v) => set("face", v)} />
            <Chips label="Hair" options={HAIR_STYLES} value={look.hairStyle} onChange={(v) => set("hairStyle", v)} />
            <Chips label="Beard" options={BEARDS} value={look.beard} onChange={(v) => set("beard", v)} />
            <Swatches label="Hair colour" options={HAIR_COLOURS} value={look.hairColour} onChange={(v) => set("hairColour", v)} />
            <Swatches label="Skin" options={SKIN_TONES} value={look.skin} onChange={(v) => set("skin", v)} />
            {!employee && <Swatches label="Shirt" options={SHIRT_COLOURS} value={look.shirt} onChange={(v) => set("shirt", v)} />}
            {employee && <div className="field-note">Employees wear the store uniform: a cap and badge in their post's colour.</div>}
          </div>

          <button type="button" className="enter" onClick={go}>
            Enter the store
          </button>
        </div>
      </div>
    </div>
  );
}
