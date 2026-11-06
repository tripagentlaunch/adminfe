/* Pictures for the meals an airline sells (guide 6.5 meals[]: code, airlineDescription, price - no image).
   1. If the catalog item itself carries a picture URL, that is used (any of the usual field names, https only).
   2. Otherwise the meal is drawn as a simple illustration picked from its name (tray, salad, sandwich, ...),
      so the list is never a wall of identical icons. Nothing is fetched from anywhere else. */

export type MealKind =
  | "tray" | "salad" | "sandwich" | "coffee" | "drink" | "dessert" | "fruit" | "soup" | "breakfast" | "noodles" | "snack";

// First match wins, so more specific words come first ("fruit salad" is a salad, "sweet corn soup" is a soup).
const RULES: Array<[MealKind, RegExp]> = [
  ["dessert", /\b(tiramisu|cake|pudding|brownie|mousse|cheesecake|dessert|ice[\s-]?cream|halwa|kheer|rasgulla|rasmalai|sandesh|shondesh|gulab|jamun|pastry|tart|sweets?\s+box|mithai)\b/i],
  ["sandwich", /\b(sandwich(es)?|burger|wrap|roll|panini|bun|sub|toastie|bagel)\b/i],
  ["salad", /\b(salads?|quinoa|coleslaw|greens)\b/i],
  ["fruit", /\b(fruits?|melon|papaya|berries|berry)\b/i],
  ["soup", /\b(soup|broth|shorba|chowder)\b/i],
  ["coffee", /\b(coffee|tea|latte|cappuccino|espresso|chai|hot\s+beverage|cocoa)\b/i],
  ["drink", /\b(juice|smoothie|lassi|shake|soda|beverage|drink|buttermilk|chaas|water|mocktail)\b/i],
  ["breakfast", /\b(omelette|omelet|eggs?|breakfast|poha|upma|idli|dosa|paratha|cereal|pancakes?|muesli|oats|porridge|croissant)\b/i],
  ["noodles", /\b(noodles?|pasta|spaghetti|hakka|macaroni|penne|lasagne|lasagna)\b/i],
  ["snack", /\b(snacks?|nuts|chips|cookies?|biscuits?|samosa|cutlet|popcorn|puff|nachos|pakora|sev)\b/i],
];

export function mealKind(label: unknown): MealKind {
  const text = String(label || "");
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return "tray"; // a plated main or a special diet meal ("Low Purine Meal")
}

const IMAGE_KEYS = [
  "imageUrl", "imageURL", "image_url", "image", "imgUrl", "img", "mealImage", "mealImageUrl",
  "thumbnail", "thumbnailUrl", "photo", "photoUrl", "picture", "pictureUrl",
];

/** A usable https picture URL from the catalog's own meal item, or null. Never a script or data URL. */
export function mealImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  for (const key of IMAGE_KEYS) {
    const v = item[key];
    if (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v.trim())) return v.trim();
  }
  return null;
}
