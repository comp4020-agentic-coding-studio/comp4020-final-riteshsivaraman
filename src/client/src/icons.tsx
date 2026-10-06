// Small inline stroke icons, 18px, 1.6px stroke --- deliberately minimal
// (not a full icon library dependency) but present, since icon-less text
// nav is exactly what read as "unstyled" against Outlook's reference shot.
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

export const InboxIcon = () => (
  <svg {...base}>
    <path d="M4 12h4l2 3h4l2-3h4" />
    <path d="M5.5 5h13l2.5 7v7a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1v-7z" />
  </svg>
);
export const SentIcon = () => (
  <svg {...base}>
    <path d="M4 11l16-7-5 16-4-6-6-3z" />
  </svg>
);
export const DraftsIcon = () => (
  <svg {...base}>
    <path d="M4 19h16" />
    <path d="M13.5 5.5l3 3L8 17l-4 1 1-4z" />
  </svg>
);
export const ComposeIcon = () => (
  <svg {...base}>
    <path d="M4 20h16" />
    <path d="M14.5 4.5l3 3L8 17l-4 1 1-4z" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);
export const EyeIcon = () => (
  <svg {...base} width={14} height={14}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
