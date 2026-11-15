import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "client/components/app/notices/RouteError";
import { setLocalePreference } from "client/i18n/locale";

const error = new Error("boom");

const ui = {
  get alert() {
    return screen.getByRole("alert");
  },
  get homeLink() {
    return screen.getByRole("link", { name: "Home" });
  },
  get reloadButton() {
    return screen.getByRole("button", { name: "Reload the page" });
  },
  get queryBoom() {
    return screen.queryByText("boom");
  },
};

describe("RouteError", () => {
  it("shows the title as an alert in English, without the error message", () => {
    render(<RouteError error={error} reset={vi.fn<() => void>()} />);

    expect(ui.alert).toHaveTextContent("Something went wrong.");
    expect(ui.queryBoom).not.toBeInTheDocument();
  });

  it("shows the title in French", () => {
    setLocalePreference("fr");
    render(<RouteError error={error} reset={vi.fn<() => void>()} />);

    expect(ui.alert).toHaveTextContent("Une erreur est survenue.");
    setLocalePreference("en");
  });

  it("renders the children under the button", () => {
    render(
      <RouteError error={error} reset={vi.fn<() => void>()}>
        <a href="/">Home</a>
      </RouteError>,
    );

    expect(ui.homeLink).toBeInTheDocument();
  });

  it("reloads the page from the button", () => {
    const reload = vi.fn<() => void>();
    vi.stubGlobal("location", { reload });
    render(<RouteError error={error} reset={vi.fn<() => void>()} />);

    fireEvent.click(ui.reloadButton);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("logs the error once", () => {
    const consoleError = vi.fn<(...args: unknown[]) => void>();
    vi.stubGlobal("console", { ...console, error: consoleError });
    render(<RouteError error={error} reset={vi.fn<() => void>()} />);

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
