import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFixtureState } from "client/api/adapters/fixture";
import { http, HttpResponse } from "msw";
import { fixtureBackend } from "test/fixtureBackend";
import { server } from "test/msw";
import { seedCategoryId } from "test/seedCategories";
import { AddFeed } from "client/components/subscriptions/add/AddFeed";
import type { StepId } from "client/components/subscriptions/add/AddFeed/shared";
import type { Category } from "shared/feedsApi/types";

const SLOW = { timeout: 10_000 };

const TECH = seedCategoryId("Tech");
const CATEGORIES: Category[] = [
  { id: TECH, label: "Tech", feedIds: [] },
  { id: seedCategoryId("Design"), label: "Design", feedIds: [] },
];

const Harness = ({
  initialStep = "find",
  categoryId,
  onStepChange,
  onDone,
  onCancel,
}: {
  initialStep?: StepId;
  categoryId?: string;
  onStepChange: (change: { step: StepId; replace?: boolean }) => void;
  onDone: () => void;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState(initialStep);
  return (
    <AddFeed
      categories={CATEGORIES}
      categoryId={categoryId}
      step={step}
      onStepChange={(change) => {
        onStepChange(change);
        setStep(change.step);
      }}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
};

const setup = (props: { initialStep?: StepId; categoryId?: string } = {}) => {
  const onStepChange = vi.fn<(change: { step: StepId; replace?: boolean }) => void>();
  const onDone = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness {...props} onStepChange={onStepChange} onDone={onDone} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  const ui = {
    url() {
      return screen.getByRole("textbox", { name: "Feed or site URL" });
    },
    cancel() {
      return screen.getByRole("button", { name: "Cancel" });
    },
    doneStep() {
      return within(screen.getByRole("navigation")).getByRole("button");
    },
    queryPrevious() {
      return screen.queryByRole("button", { name: "Previous" });
    },
    next() {
      return screen.getByRole("button", { name: "Next" });
    },
    previous() {
      return screen.getByRole("button", { name: "Previous" });
    },
    subscribe() {
      return screen.getByRole("button", { name: "Subscribe" });
    },
    name() {
      return screen.getByRole("textbox", { name: "Name" });
    },
    firstVariant() {
      return screen.getAllByRole("radio")[0];
    },
    firstCategory() {
      return screen.getAllByRole("checkbox")[0];
    },
    tech() {
      return screen.getByRole("checkbox", { name: "Tech" });
    },
    heading(name: string) {
      return screen.getByRole("heading", { name });
    },
    async findHeading(name: string) {
      return screen.findByRole("heading", { name });
    },
    async findName() {
      return screen.findByRole("textbox", { name: "Name" });
    },
    async findAlert() {
      return screen.findByRole("alert", {}, SLOW);
    },
    async findText(text: string) {
      return screen.findByText(text, {}, SLOW);
    },
    async findWebFeedButton() {
      return screen.findByRole("button", { name: "Make a web feed" }, SLOW);
    },
    async radio(name: RegExp) {
      return screen.findByRole("radio", { name }, SLOW);
    },
    async search(value: string) {
      await user.type(ui.url(), value);
    },
  };
  return { ui, user, onStepChange, onDone, onCancel };
};

describe("AddFeed", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_MODE", "real");
    server.use(fixtureBackend);
    resetFixtureState();
  });

  it("finds, names, previews and subscribes to a feed", async () => {
    const { ui, user, onDone } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());

    expect(await ui.findHeading("Name and preview")).toHaveFocus();
    expect(ui.name()).toHaveValue("Example Tech Daily");
    await user.click(ui.next());

    expect(ui.heading("Categories")).toBeInTheDocument();
    expect(ui.subscribe()).toBeEnabled();
    await user.click(ui.tech());
    await user.click(ui.subscribe());

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    }, SLOW);
  });

  it("goes back to a done step from the stepper", async () => {
    const { ui, user, onStepChange } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());
    await ui.findName();
    await user.click(ui.doneStep());

    expect(onStepChange).toHaveBeenLastCalledWith({ step: "find" });
    expect(ui.url()).toBeInTheDocument();
  });

  it("shows the two latest entries of a feed", async () => {
    // The seed's autocomplete does not list the previewable feed.
    server.use(
      http.get("/api/search/feeds", () =>
        HttpResponse.json([
          { feedUrl: "https://preview.example.test/feed.xml", title: "Example Preview Weekly" },
        ]),
      ),
    );
    const { ui, user } = setup();

    await ui.search("preview.example.test");
    await user.click(await ui.radio(/Example Preview Weekly/));
    await user.click(ui.next());

    expect(await ui.findText("Preview: the sidebar moves to the left")).toBeInTheDocument();
    expect(await ui.findText("Preview: offline reading comes back")).toBeInTheDocument();
    expect(document.querySelectorAll("time")).toHaveLength(2);
  });

  it("shows an entry without a date as a tile with no age", async () => {
    server.use(
      http.get("/api/search/feeds", () =>
        HttpResponse.json([{ feedUrl: "https://undated.example.test/feed.xml", title: "Undated" }]),
      ),
      http.get("/api/feeds/preview", () =>
        HttpResponse.json({
          entries: [{ title: "No date here", url: "https://undated.example.test/a" }],
        }),
      ),
    );
    const { ui, user } = setup();

    await ui.search("undated.example.test");
    await user.click(await ui.radio(/Undated/));
    await user.click(ui.next());

    expect(await ui.findText("No date here")).toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });

  it("restores the draft when going back", async () => {
    const { ui, user } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());
    await user.clear(await ui.findName());
    await user.type(ui.name(), "My tech");
    await user.click(ui.previous());

    expect(ui.url()).toHaveValue("tech.example.test");
    expect(await ui.radio(/Example Tech Daily/)).toBeChecked();
    expect(ui.next()).toBeEnabled();
    await user.click(ui.next());
    expect(await ui.findName()).toHaveValue("My tech");
  });

  it("clears the pick when the URL changes but keeps a typed name", async () => {
    const { ui, user } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());
    await user.clear(await ui.findName());
    await user.type(ui.name(), "Mine");
    await user.click(ui.previous());
    await user.type(ui.url(), "x");
    await user.click(ui.next());

    expect(ui.heading("Find")).toBeInTheDocument();
    expect(await ui.findAlert()).toHaveTextContent("Pick a feed from the results");
  });

  it("flags an empty URL on Next and focuses the field", async () => {
    const { ui, user } = setup();

    expect(ui.next()).toBeEnabled();
    await user.click(ui.next());

    expect(ui.url()).toHaveAttribute("aria-invalid", "true");
    expect(ui.url()).toHaveAccessibleDescription("Enter a feed or site URL.");
    expect(ui.url()).toHaveFocus();
  });

  it("flags a missing category on Subscribe and focuses the first one", async () => {
    const { ui, user, onDone } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());
    await user.click(await ui.findName().then(() => ui.next()));
    await user.click(ui.subscribe());

    expect(await ui.findAlert()).toHaveTextContent("Pick at least one category");
    expect(ui.firstCategory()).toHaveFocus();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("lets a feed with no preview be subscribed to", async () => {
    const { ui, user, onDone } = setup({ categoryId: TECH });

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());

    expect(await ui.findAlert()).toHaveTextContent("Preview unavailable");
    await user.click(ui.next());
    expect(ui.tech()).toBeChecked();
    await user.click(ui.subscribe());

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    }, SLOW);
  });

  it("blocks the name step on an empty name", async () => {
    const { ui, user } = setup();

    await ui.search("tech.example.test");
    await user.click(await ui.radio(/Example Tech Daily/));
    await user.click(ui.next());
    await user.clear(await ui.findName());
    await user.click(ui.next());

    expect(ui.heading("Name and preview")).toBeInTheDocument();
    expect(ui.name()).toHaveAttribute("aria-invalid", "true");
    expect(ui.name()).toHaveAccessibleDescription("Enter a name.");
    expect(ui.name()).toHaveFocus();
  });

  it("turns a page into a web feed through the variant pick", async () => {
    const { ui, user, onDone } = setup({ categoryId: TECH });

    await ui.search("https://changelog.example.test/releases");
    await user.click(await ui.findWebFeedButton());

    expect(await ui.findHeading("Name and preview")).toBeInTheDocument();
    await ui.radio(/Sidebar links/);
    await user.click(ui.next());
    expect(await ui.findAlert()).toHaveTextContent("Pick a variant.");
    expect(ui.firstVariant()).toHaveFocus();
    await user.click(await ui.radio(/Sidebar links/));
    await user.click(ui.next());
    await user.click(ui.subscribe());

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    }, SLOW);
  });

  it("sends a deep link to a later step back to the first one", async () => {
    const { ui, onStepChange } = setup({ initialStep: "categories" });

    expect(await ui.findHeading("Find")).toBeInTheDocument();
    expect(onStepChange).toHaveBeenCalledWith({ step: "find", replace: true });
  });

  it("cancels from the first step", async () => {
    const { ui, user, onCancel } = setup();

    expect(ui.queryPrevious()).toBeNull();
    await user.click(ui.cancel());

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("names a newly picked feed by its own title, not the typed name of the last one", async () => {
    server.use(
      http.get("/api/search/feeds", () =>
        HttpResponse.json([
          { feedUrl: "https://a.example.test/feed.xml", title: "Feed Alpha" },
          { feedUrl: "https://b.example.test/feed.xml", title: "Feed Beta" },
        ]),
      ),
    );
    const { ui, user } = setup();

    await ui.search("example.test");
    await user.click(await ui.radio(/Feed Alpha/));
    await user.click(ui.next());
    await user.clear(await ui.findName());
    await user.type(ui.name(), "Mine");
    await user.click(ui.previous());
    await user.click(await ui.radio(/Feed Beta/));
    await user.click(ui.next());

    expect(await ui.findName()).toHaveValue("Feed Beta");
  });

  it("keeps a preview of two entries without a URL distinct", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("/api/search/feeds", () =>
        HttpResponse.json([{ feedUrl: "https://nourl.example.test/feed.xml", title: "No URL" }]),
      ),
      http.get("/api/feeds/preview", () =>
        HttpResponse.json({
          entries: [
            { title: "First without link", url: "" },
            { title: "Second without link", url: "" },
          ],
        }),
      ),
    );
    const { ui, user } = setup();

    await ui.search("nourl.example.test");
    await user.click(await ui.radio(/No URL/));
    await user.click(ui.next());

    expect(await ui.findText("First without link")).toBeInTheDocument();
    expect(await ui.findText("Second without link")).toBeInTheDocument();
    const duplicateKeyWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("same key"),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });
});
