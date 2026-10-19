import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { HAIR_COLOURS, HAIR_FOR, SHIRT_COLOURS, SKIN_TONES, type LookChoice } from "../../shared/look.ts";
import { FIRST_NAMES, GENDERS, randomName, type Gender } from "../../shared/names.ts";
import { EMPLOYEE_COLOUR, EMPLOYEE_KINDS, SPECIALTIES, STAFF_SHIRT, type EmployeeKind, type Kind, type Profile, type Specialty } from "../../shared/profile.ts";
import { Actor } from "./gfx/Actor.tsx";
import { readProfile } from "./net.ts";

// The first thing a visitor sees. It is built so that one click gets you in:
// a random character and a random name are already chosen, and everything
// else (who you are, male or female, hair, colours) is optional. Everyone is
// drawn the same way (toon body, round eyes), so there is no style to pick.

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
const BEARD_FOR_MALE = ["none", "stubble", "moustache", "goatee", "full"] as const;
// which posts have a customer conversation so far
const HAS_SCRIPT = (kind: EmployeeKind, specialty: Specialty): boolean => kind === "greeter" || (kind === "specialist" && specialty === "phones");

const isPoolName = (n: string): boolean => [...FIRST_NAMES.male, ...FIRST_NAMES.female].includes(n as never);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const newSeed = (): string => Math.random().toString(36).slice(2, 10);
const reduceMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

function rollLook(gender: Gender): LookChoice {
  return {
    seed: newSeed(),
    gender,
    hairStyle: pick(HAIR_FOR[gender]),
    hairColour: pick(HAIR_COLOURS),
    skin: pick(SKIN_TONES),
    shirt: pick(SHIRT_COLOURS),
    // about a third of men get some facial hair
    beard: gender === "male" && Math.random() < 0.35 ? pick(BEARD_FOR_MALE.slice(1)) : "none",
  };
}

function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<Group>(null);
  const still = useMemo(reduceMotion, []);
  useFrame((s) => {
    if (g.current) g.current.rotation.y = Math.PI + (still ? 0.35 : Math.sin(s.clock.elapsedTime * 0.6) * 0.7);
  });
  return <group ref={g}>{children}</group>;
}

function Preview({ look, kind }: { look: LookChoice; kind: Kind }) {
  const uniform = kind !== "customer" ? { cap: EMPLOYEE_COLOUR[kind], badge: EMPLOYEE_COLOUR[kind] } : undefined;
  const state = useMemo(() => ({ walking: false, mode: "idle" as const, mood: "smile" }), []);
  return (
    <Canvas camera={{ position: [0, 0.95, 4.2], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <hemisphereLight args={["#ffffff", "#a7adb5", 1.3]} />
      <directionalLight position={[-2, 4, -3]} intensity={1.4} />
      <directionalLight position={[2, 2, 3]} intensity={0.7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.0, 48]} />
        <meshStandardMaterial color="#d9dce1" roughness={0.9} />
      </mesh>
      <Turntable>
        <Actor id={look.seed ?? "preview"} look={look} shirt={kind === "customer" ? undefined : STAFF_SHIRT} uniform={uniform} getState={() => state} />
      </Turntable>
    </Canvas>
  );
}

function Segmented<T extends string>({ label, options, value, onChange, show }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; show?: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="seg">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "on" : undefined} onClick={() => onChange(o)}>
          {show ? show(o) : o}
        </button>
      ))}
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="opt">
      <div className="opt-label">{label}</div>
      <div className="swatches">
        {options.map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} aria-pressed={c === value} className={c === value ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
    </div>
  );
}

export function Entry({ onEnter }: { onEnter: (p: Profile) => void }) {
  const saved = useMemo(() => readProfile(), []);
  const [kind, setKind] = useState<Kind>(saved?.kind === "specialist" ? "specialist" : "customer"); // only a specialist can be joined as
  const [specialty] = useState<Specialty>("phones"); // phones is the only post with customer conversations
  const [gender, setGender] = useState<Gender>(saved?.look?.gender ?? pick(GENDERS));
  const [look, setLook] = useState<LookChoice>(() => (saved?.look?.seed ? { ...saved.look } : rollLook(saved?.look?.gender ?? gender)));
  const [name, setName] = useState(saved?.name ?? randomName(look.gender ?? gender));
  const [typed, setTyped] = useState(Boolean(saved?.name)); // once they type, we stop re-rolling it
  const employee = kind !== "customer";
  const set = <K extends keyof LookChoice>(k: K, v: LookChoice[K]): void => setLook((l) => ({ ...l, [k]: v }));

  const shuffle = (g: Gender = gender): void => {
    setLook(rollLook(g));
    if (!typed || isPoolName(name)) setName(randomName(g)); // a name we generated follows the gender; one they typed stays
  };
  const chooseGender = (g: Gender): void => {
    setGender(g);
    shuffle(g);
  };
  const post = employee ? (kind === "specialist" ? `${specialty} specialist` : KIND_LABEL[kind as EmployeeKind]) : "Visitor";
  const accent = employee ? EMPLOYEE_COLOUR[kind as EmployeeKind] : "#1d1f23";

  const go = (): void => {
    const p: Profile = { kind, name: name.trim() || undefined, look };
    if (kind === "specialist") p.specialty = specialty;
    onEnter(p);
  };

  return (
    <div className="entry" style={{ ["--post" as string]: accent }}>
      <div className="entry-grid">
        <section className="stage" aria-label="Your character">
          <Preview look={look} kind={kind} />
          <div className="badge">
            <div className="badge-band">
              <span>Hello</span>
              <span className="badge-post">{post}</span>
            </div>
            <div className="badge-body">
              <label htmlFor="who">my name is</label>
              <div className="badge-row">
                <input
                  id="who"
                  value={name}
                  maxLength={24}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    setName(e.target.value);
                    setTyped(true);
                  }}
                />
                <button
                  type="button"
                  className="dice"
                  aria-label="Pick another random name"
                  onClick={() => {
                    setName(randomName(gender));
                    setTyped(false);
                  }}
                >
                  ↻
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <header>
            <img className="entry-logo" src="/brand/logo.png" alt="" width={44} height={44} />
            <h1>Step inside</h1>
            <p>You're ready to go. Change anything you like first.</p>
          </header>

          <div className="group">
            <h2>You are</h2>
            <Segmented label="Customer or specialist" options={["customer", "employee"] as const} value={employee ? "employee" : "customer"} onChange={(v) => setKind(v === "customer" ? "customer" : "specialist")} show={(v) => (v === "customer" ? "A customer" : "A phones specialist")} />
            {employee && (
              <div className="posts">
                <p className="note">The store opens with two specialists. Join as an extra one: customers are sent to you first, and you serve them from the staff panel.</p>
              </div>
            )}
          </div>

          <div className="group">
            <h2>Your character</h2>
            <div className="char-row">
              <Segmented label="Male or female" options={GENDERS} value={gender} onChange={chooseGender} show={(g) => (g === "male" ? "Male" : "Female")} />
              <button type="button" className="shuffle" onClick={() => shuffle()}>
                Shuffle
              </button>
            </div>
            <details className="fine">
              <summary>Fine-tune</summary>
              <div className="opt">
                <div className="opt-label">Hair</div>
                <div className="chips">
                  {HAIR_FOR[gender].map((h) => (
                    <button key={h} type="button" className={look.hairStyle === h ? "chip on" : "chip"} aria-pressed={look.hairStyle === h} onClick={() => set("hairStyle", h)}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <Swatches label="Hair colour" options={HAIR_COLOURS} value={look.hairColour} onChange={(v) => set("hairColour", v)} />
              {gender === "male" && (
                <div className="opt">
                  <div className="opt-label">Beard</div>
                  <div className="chips">
                    {BEARD_FOR_MALE.map((b) => (
                      <button key={b} type="button" className={(look.beard ?? "none") === b ? "chip on" : "chip"} aria-pressed={(look.beard ?? "none") === b} onClick={() => set("beard", b)}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Swatches label="Skin" options={SKIN_TONES} value={look.skin} onChange={(v) => set("skin", v)} />
              {!employee ? <Swatches label="Shirt" options={SHIRT_COLOURS} value={look.shirt} onChange={(v) => set("shirt", v)} /> : <p className="note">Employees wear the store uniform.</p>}
            </details>
          </div>

          <button type="button" className="enter" onClick={go}>
            Enter the store
          </button>
        </section>
      </div>
    </div>
  );
}
