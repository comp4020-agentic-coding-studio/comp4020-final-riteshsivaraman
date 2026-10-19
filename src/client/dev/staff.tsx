import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { net } from "../src/net.ts";
import { StaffTalk } from "../src/StaffTalk.tsx";

// Dev only: the specialist's conversation panels with a made-up conversation,
// to check the layout by eye (`/dev/staff.html`). Not part of the built app.
net.staffConv = {
  conversationId: "x",
  customerId: "c",
  customerName: "Stacy",
  awaiting: "staff",
  status: "Your move.",
  log: [
    { who: "staff", text: "Hi, I'm Sam. What brings you in today?" },
    { who: "customer", text: "I'm after a new phone, mostly for photos." },
    { who: "staff", text: "Great. Is there a budget you'd like to stay under?" },
    { who: "customer", text: "Around two thousand dollars." },
  ],
  acts: [
    { id: "m0", label: "Ask which screen size suits them", hint: "7 → 4 / 3" },
    { id: "m1", label: "Ask about colours", hint: "7 → 5 / 2" },
    { id: "m2", label: "Offer a demo", hint: "" },
    { id: "m3", label: "Recommend the iPhone 18 Pro", hint: "" },
    { id: "seat", label: "Offer to sit down at a table", hint: "talk it through seated" },
  ],
  tones: [
    { id: "friendly", label: "friendly" },
    { id: "neutral", label: "neutral" },
    { id: "impatient", label: "impatient" },
    { id: "unsure", label: "unsure" },
  ],
  stats: {
    answers: [
      { label: "use case", value: "photos" },
      { label: "budget ceiling", value: "2000" },
    ],
    candidates: [
      { name: "iPhone 18 Pro", screen: '6.3"', from: "A$1,899", battery: "33 h video", note: "titanium" },
      { name: "iPhone 17", screen: '6.3"', from: "A$1,399", battery: "30 h video", note: "aluminium" },
      { name: "iPhone Air", screen: '6.5"', from: "A$1,599", battery: "27 h video", note: "titanium" },
      { name: "iPhone 17e", screen: '6.1"', from: "A$899", battery: "26 h video", note: "aluminium" },
    ],
  },
};
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StaffTalk />
  </StrictMode>,
);
