import { describe, expect, it } from "vitest";
import { SEAT_CHOICES, addPersonProblem, daysLeftText, personStatus, emailNote, prettyCode, reminderNote, seatChoiceLabel, seatsText, shareMessage, waDigits, whatsappUrl } from "./inviteShare";

describe("prettyCode", () => {
  it("groups an 8-character code in fours and leaves anything else alone", () => {
    expect(prettyCode("KM4TQR2X")).toBe("KM4T-QR2X");
    expect(prettyCode("MAISON-2026")).toBe("MAISON-2026");
    expect(prettyCode(null)).toBe("");
  });
});

describe("waDigits / whatsappUrl", () => {
  it("handles the common ways a number is written", () => {
    expect(waDigits("+91 98765 43210")).toBe("919876543210");
    expect(waDigits("98765 43210")).toBe("919876543210");
    expect(waDigits("09876543210")).toBe("919876543210");
    expect(waDigits("0091 98765 43210")).toBe("919876543210");
    expect(waDigits("+971 50 123 4567")).toBe("971501234567");
  });
  it("gives nothing for a number that cannot be right", () => {
    expect(waDigits("123")).toBe("");
    expect(waDigits(null)).toBe("");
  });
  it("opens the person's chat with the text ready, or WhatsApp's own chooser when there is no number", () => {
    expect(whatsappUrl("+91 98765 43210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
    expect(whatsappUrl("", "hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("shareMessage", () => {
  const link = "https://site.test/claim?code=KM4TQR2X";
  it("leads with the link and keeps the code only as a fallback", () => {
    const m = shareMessage({ firstName: "Asha", link, code: "KM4TQR2X", advisorName: "Bhanumathi" });
    expect(m.split("\n")).toEqual([
      "Hi Asha, your TripAgent invitation is ready. Tap to open it:",
      link,
      "If you're ever asked for the code: KM4T-QR2X",
      "— Bhanumathi",
    ]);
  });
  it("copes with no name, no code and no advisor", () => {
    expect(shareMessage({ link })).toBe(`Your TripAgent invitation is ready. Tap to open it:\n${link}`);
  });
});

describe("what the advisor is told", () => {
  it("says when the email failed, with the reason shortened", () => {
    const n = emailNote({ email_status: "failed", email_error: "x".repeat(200) })!;
    expect(n.tone).toBe("bad");
    expect(n.text).toContain("didn't go through");
    expect(n.text.length).toBeLessThan(200);
  });
  it("says when it went, and how often", () => {
    expect(emailNote({ email_status: "sent", send_count: 1 })).toEqual({ tone: "ok", text: "Email sent" });
    expect(emailNote({ email_status: "sent", send_count: 3 })!.text).toBe("Email sent (3 times)");
    expect(emailNote({})).toBeNull();
  });
  it("flags a waiting invitation that needs a reminder or is about to end, and nothing else", () => {
    expect(reminderNote({ claim_status: "pending", reminder: "expiring" })!.tone).toBe("bad");
    expect(reminderNote({ claim_status: "pending", reminder: "nudge" })!.tone).toBe("warn");
    expect(reminderNote({ claim_status: "claimed", reminder: "nudge" })).toBeNull();
    expect(reminderNote({ claim_status: "pending", reminder: null })).toBeNull();
  });
  it("counts days and places", () => {
    expect(daysLeftText(5)).toBe("5 days left");
    expect(daysLeftText(1)).toBe("1 day left");
    expect(daysLeftText(0)).toBe("ends today");
    expect(daysLeftText(null)).toBe("");
    expect(seatsText({ seats: 3, seats_used: 2 })).toBe("2 of 3 places taken");
    expect(seatsText({ seats: 1 })).toBe("");
  });
  it("labels the seat choices", () => {
    expect(SEAT_CHOICES.map(seatChoiceLabel)).toEqual(["Just them", "Up to 2 people", "Up to 3 people", "Up to 5 people", "Up to 10 people"]);
  });
});

describe("people added to an invitation", () => {
  it("says where each person stands", () => {
    expect(personStatus({ status: "unused" })).toEqual({ tone: "warn", text: "Invited, not claimed yet" });
    expect(personStatus({ status: "redeemed" })).toEqual({ tone: "ok", text: "Joined" });
    expect(personStatus({ status: "revoked" })).toEqual({ tone: "bad", text: "Access taken back" });
    expect(personStatus({ status: "unused", expired: true })).toEqual({ tone: "bad", text: "Invitation ended" });
  });
  it("checks the details before they are sent", () => {
    expect(addPersonProblem({ name: "M", email: "m@x.co", phone: "" })).toBe("Enter their name.");
    expect(addPersonProblem({ name: "Meera", email: "meera", phone: "" })).toBe("Enter a valid email address.");
    expect(addPersonProblem({ name: "Meera", email: "m@x.co", phone: "12" })).toContain("phone number");
    expect(addPersonProblem({ name: "Meera", email: "m@x.co", phone: "" })).toBeNull();
    expect(addPersonProblem({ name: "Meera", email: "m@x.co", phone: "+91 98765 43210" })).toBeNull();
  });
});
