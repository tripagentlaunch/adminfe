import { describe, expect, it } from "vitest";
import { mealImageUrl, mealKind } from "./mealPicture";

describe("mealKind", () => {
  it("picks an illustration from the meal's name", () => {
    const cases: Array<[string, string]> = [
      ["Shondesh Tiramisu", "dessert"], ["Seasonal Fresh Fruit Platter", "fruit"], ["Quinoa Salad", "salad"],
      ["Chicken Jungle Sandwich", "sandwich"], ["Herb Roast Vegetable Roll", "sandwich"], ["Hot Coffee", "coffee"],
      ["Masala Chai", "coffee"], ["Fresh Orange Juice", "drink"], ["Sweet Corn Soup", "soup"], ["Cheese Omelette", "breakfast"],
      ["Hakka Noodles", "noodles"], ["Samosa", "snack"],
    ];
    for (const [name, kind] of cases) expect(mealKind(name), name).toBe(kind);
  });
  it("uses a plated tray for mains and special diet meals", () => {
    for (const name of ["Paneer Makhani with Jeera Aloo & Rice", "No Salt Meal", "Low Purine Meal", "Low Protein Meal", "High Fiber Meal", "VGML"]) {
      expect(mealKind(name), name).toBe("tray");
    }
  });
  it("matches whole words only (steak is not tea, salt is not salad)", () => {
    expect(mealKind("Grilled Steak")).toBe("tray");
    expect(mealKind("No Salt Meal")).toBe("tray");
  });
  it("survives empty input", () => {
    for (const v of [undefined, null, "", 5]) expect(mealKind(v)).toBe("tray");
  });
});

describe("mealImageUrl", () => {
  it("takes a picture the catalog item carries, under any usual field name", () => {
    expect(mealImageUrl({ code: "VGML", imageUrl: "https://cdn.example.com/m/1.jpg" })).toBe("https://cdn.example.com/m/1.jpg");
    expect(mealImageUrl({ thumbnail: " https://cdn.example.com/t.png " })).toBe("https://cdn.example.com/t.png");
    expect(mealImageUrl({ photo: "https://x.co/p.webp", image: "https://x.co/i.webp" })).toBe("https://x.co/i.webp");
  });
  it("refuses anything that is not a plain https URL", () => {
    for (const bad of ["javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "http://insecure.example.com/a.jpg", "//cdn.example.com/a.jpg",
      "https://x.co/a b.jpg", "https://x.co/a\"onerror=1", "", "meals/1.jpg"]) {
      expect(mealImageUrl({ imageUrl: bad }), bad).toBeNull();
    }
    for (const v of [null, undefined, "x", 3, [], {}]) expect(mealImageUrl(v)).toBeNull();
  });
});
