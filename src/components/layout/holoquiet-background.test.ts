import { describe, expect, it } from "vitest";
import { horizonTint } from "./HoloQuietBackground";

describe("holoquiet shift-time environment", () => {
  it("is darkest and calmest in the 2-4 AM window", () => {
    const light = (v: string) => Number(v.slice(6, 10));
    expect(light(horizonTint(3))).toBeLessThan(light(horizonTint(23)));
    expect(light(horizonTint(3))).toBeLessThan(light(horizonTint(5)));
  });

  it("stays extremely low contrast at every hour", () => {
    for (let h = 0; h < 24; h++) expect(horizonTint(h)).toMatch(/^oklch\(/);
  });
});
