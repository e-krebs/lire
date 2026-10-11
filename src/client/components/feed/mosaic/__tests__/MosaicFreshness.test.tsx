import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setLocalePreference } from "client/i18n/locale";
import { MosaicFreshness } from "../MosaicGrid/MosaicFreshness";

const ui = {
  text(pattern: RegExp) {
    return screen.getByText(pattern);
  },
};

const renderRow = ({ count }: { count: number }) => {
  render(
    <MosaicFreshness
      updatedAt={undefined}
      refreshing={false}
      onRefresh={() => {}}
      searchQuery="rust"
      count={count}
    />,
  );
};

describe("MosaicFreshness", () => {
  it("counts the results with the English plural", () => {
    renderRow({ count: 1 });
    expect(ui.text(/Results for “rust” ·/)).toHaveTextContent("Results for “rust” · 1 article");
  });

  it("counts the results with the French quotes and plural", () => {
    setLocalePreference("fr");
    renderRow({ count: 0 });
    expect(ui.text(/Résultats pour/).textContent).toBe("Résultats pour « rust » · 0 article");
  });
});
