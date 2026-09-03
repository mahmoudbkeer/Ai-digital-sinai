import { describe, expect, it } from "vitest";
import { localeDirection, localeMessages } from "./i18n";

describe("locale-driven login copy", () => {
  it("changes the displayed login label and page direction", () => {
    expect(localeMessages.ar.login).toBe("تسجيل الدخول ←");
    expect(localeMessages.en.login).toBe("Sign in →");
    expect(localeMessages.ar.login).not.toBe(localeMessages.en.login);
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });
});
