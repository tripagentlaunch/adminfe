import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScratchWizard } from "./ScratchWizard";

describe("ScratchWizard", () => {
  it("opens on the destination question, filled in from the enquiry", () => {
    const html = renderToStaticMarkup(createElement(ScratchWizard, { ask: { destinations: ["South Goa"], from: "Bengaluru", pax: 7 }, onDone: () => {}, onCancel: () => {} }));
    expect(html).toContain("Where is the customer going?");
    expect(html).toContain('value="South Goa"');
    expect(html).toContain("Continue");
  });
  it("starts empty when nothing is known", () => {
    const html = renderToStaticMarkup(createElement(ScratchWizard, { ask: {}, onDone: () => {}, onCancel: () => {} }));
    expect(html).toContain('placeholder="e.g. South Goa"');
  });
});
