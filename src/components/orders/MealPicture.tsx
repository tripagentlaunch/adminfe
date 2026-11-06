"use client";
import { useState } from "react";
import { mealImageUrl, mealKind, type MealKind } from "../../lib/mealPicture";

/* The picture of a meal in the Meals list: the airline's own photo when its catalog item carries one,
   otherwise a small flat illustration chosen from the meal's name (lib/mealPicture.ts). */

const INK = "#5b4a2e", LEAF = "#6f9f4a", GOLD = "#d9a441", CREAM = "#fbf3df", RED = "#cf5a45", PLATE = "#ffffff", RIM = "#d8cdb4";

function Art({ kind }: { kind: MealKind }) {
  switch (kind) {
    case "salad":
      return (<>
        <ellipse cx="60" cy="62" rx="34" ry="8" fill={RIM} />
        <path d="M26 44 h68 a34 22 0 0 1 -68 0z" fill={PLATE} stroke={RIM} strokeWidth="2" />
        <circle cx="46" cy="42" r="9" fill={LEAF} /><circle cx="62" cy="38" r="10" fill="#8cbf5f" /><circle cx="76" cy="43" r="8" fill={LEAF} />
        <circle cx="54" cy="46" r="5" fill={RED} /><circle cx="70" cy="47" r="4.5" fill={RED} /><circle cx="60" cy="33" r="4" fill={GOLD} />
      </>);
    case "sandwich":
      return (<>
        <ellipse cx="60" cy="64" rx="38" ry="8" fill={RIM} />
        <path d="M24 52 L60 28 L96 52 Z" fill={GOLD} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M24 52 L96 52 L96 58 L24 58 Z" fill={LEAF} /><path d="M24 58 L96 58 L96 62 L24 62 Z" fill={RED} />
        <path d="M24 62 L96 62 L60 84 Z" fill="#e8b85a" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      </>);
    case "coffee":
      return (<>
        <ellipse cx="60" cy="66" rx="36" ry="8" fill={RIM} />
        <path d="M38 36 h40 v16 a20 20 0 0 1 -40 0z" fill={PLATE} stroke={INK} strokeWidth="2" />
        <path d="M78 40 h6 a7 7 0 0 1 0 14 h-8" fill="none" stroke={INK} strokeWidth="2" />
        <ellipse cx="58" cy="37" rx="20" ry="4" fill="#8a5a2b" />
        <path d="M50 28 c-4 -5 4 -7 0 -12 M62 28 c-4 -5 4 -7 0 -12" fill="none" stroke={RIM} strokeWidth="2.5" strokeLinecap="round" />
      </>);
    case "drink":
      return (<>
        <ellipse cx="60" cy="72" rx="24" ry="6" fill={RIM} />
        <path d="M42 24 h36 l-5 46 h-26z" fill="#f7c873" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M44 38 h32" stroke={PLATE} strokeWidth="3" opacity=".6" />
        <path d="M66 24 l8 -14" stroke={RED} strokeWidth="4" strokeLinecap="round" />
        <circle cx="52" cy="54" r="4" fill={GOLD} />
      </>);
    case "dessert":
      return (<>
        <ellipse cx="60" cy="68" rx="38" ry="8" fill={RIM} />
        <path d="M32 50 h56 v14 h-56z" fill="#c98a52" stroke={INK} strokeWidth="1.5" />
        <path d="M32 40 h56 v10 h-56z" fill={CREAM} stroke={INK} strokeWidth="1.5" />
        <path d="M32 30 h56 v10 h-56z" fill="#a66a3c" stroke={INK} strokeWidth="1.5" />
        <circle cx="60" cy="24" r="6" fill={RED} /><path d="M60 18 q3 -8 9 -8" fill="none" stroke={LEAF} strokeWidth="2.5" strokeLinecap="round" />
      </>);
    case "fruit":
      return (<>
        <ellipse cx="60" cy="66" rx="38" ry="8" fill={RIM} />
        <path d="M24 46 h72 a36 20 0 0 1 -72 0z" fill={PLATE} stroke={RIM} strokeWidth="2" />
        <circle cx="44" cy="40" r="11" fill={RED} /><circle cx="62" cy="36" r="12" fill="#f2a43a" /><circle cx="80" cy="41" r="10" fill={LEAF} />
        <path d="M62 24 q4 -6 9 -6" fill="none" stroke={LEAF} strokeWidth="2.5" strokeLinecap="round" />
      </>);
    case "soup":
      return (<>
        <ellipse cx="60" cy="68" rx="36" ry="7" fill={RIM} />
        <path d="M26 44 h68 a34 24 0 0 1 -68 0z" fill={PLATE} stroke={INK} strokeWidth="2" />
        <ellipse cx="60" cy="44" rx="34" ry="6" fill="#e9a23b" />
        <path d="M50 34 c-4 -5 4 -7 0 -12 M64 34 c-4 -5 4 -7 0 -12" fill="none" stroke={RIM} strokeWidth="2.5" strokeLinecap="round" />
      </>);
    case "breakfast":
      return (<>
        <ellipse cx="60" cy="66" rx="40" ry="9" fill={RIM} />
        <circle cx="60" cy="46" r="28" fill={PLATE} stroke={RIM} strokeWidth="2" />
        <path d="M42 46 c0 -12 14 -16 22 -10 c10 -4 18 6 12 16 c-4 8 -16 8 -22 6 c-8 0 -12 -4 -12 -12z" fill={CREAM} stroke={RIM} strokeWidth="1.5" />
        <circle cx="60" cy="46" r="8" fill={GOLD} />
      </>);
    case "noodles":
      return (<>
        <ellipse cx="60" cy="68" rx="36" ry="7" fill={RIM} />
        <path d="M26 46 h68 a34 22 0 0 1 -68 0z" fill={PLATE} stroke={INK} strokeWidth="2" />
        <path d="M34 44 c8 -12 14 8 22 -4 s14 8 22 -4 s8 6 8 6" fill="none" stroke="#e5b24f" strokeWidth="4" strokeLinecap="round" />
        <path d="M38 50 c8 -8 14 6 22 -2 s12 6 20 0" fill="none" stroke="#f0c566" strokeWidth="4" strokeLinecap="round" />
        <circle cx="72" cy="38" r="4" fill={RED} />
      </>);
    case "snack":
      return (<>
        <ellipse cx="60" cy="68" rx="36" ry="7" fill={RIM} />
        <path d="M30 62 L50 30 h22 L90 62z" fill={GOLD} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="52" cy="46" r="3" fill={RED} /><circle cx="66" cy="42" r="3" fill={RED} /><circle cx="62" cy="54" r="3" fill={RED} /><circle cx="76" cy="54" r="3" fill={RED} />
      </>);
    default: // tray: a compartment meal
      return (<>
        <ellipse cx="60" cy="70" rx="42" ry="7" fill={RIM} />
        <rect x="22" y="30" width="76" height="38" rx="8" fill="#eceef0" stroke="#c4c9ce" strokeWidth="2" />
        <rect x="27" y="35" width="40" height="28" rx="6" fill={PLATE} stroke="#d6dadd" />
        <rect x="71" y="35" width="22" height="28" rx="6" fill={PLATE} stroke="#d6dadd" />
        <circle cx="38" cy="46" r="4" fill={CREAM} /><circle cx="48" cy="52" r="4" fill={CREAM} /><circle cx="56" cy="44" r="4" fill={CREAM} /><circle cx="44" cy="58" r="3.5" fill={CREAM} />
        <circle cx="76" cy="44" r="5" fill={GOLD} /><circle cx="86" cy="52" r="5" fill={LEAF} /><circle cx="78" cy="57" r="4" fill={RED} />
      </>);
  }
}

export function MealPicture({ label, item }: { label: string; item?: unknown }) {
  const url = mealImageUrl(item);
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ow-meal-img" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return (
    <svg className="ow-meal-img ow-meal-art" viewBox="0 0 120 90" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <Art kind={mealKind(label)} />
    </svg>
  );
}
