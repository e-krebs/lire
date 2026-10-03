# Test conventions

One style for Vitest and Playwright tests: how to structure a file, where queries live, what
mocking is allowed, and which of it a linter checks. Where a task brief and this doc differ, this
doc wins — it absorbs pilot feedback that a brief written earlier does not see.

## Structure

The top-level `describe` names the unit under test (a component, a hook, a module). Every nested
`describe` title starts with `when ` and names one condition. Tests use `it`, never `test`, in
Vitest. `it` titles state the behaviour in the third person.

```ts
describe("SubscriptionList", () => {
  describe("when the list is empty", () => {
    it("shows the empty state")
  })
})
```

A file runs top to bottom in this order: the imports, then module-level constants and any type
`ui` refers to, then the module-level `ui` object, then any helper `setup()` calls, then `setup()`
itself, then any other module-level code, such as fixture components and helpers, then the
`describe` blocks. A file with no `ui` or no `setup()` skips that block and keeps the rest in
order.

A helper's own fixture data, read by no other helper, is a local inside that helper, not a
module-level constant beside it:

```ts
const mount = (url: string) => {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([...])
  return render(<RouterProvider router={createRouter({ routeTree, ... })} />)
}
```

A helper called from exactly one place is inlined at that call site instead of kept as a named
function beside `setup()` or inside a `describe`. Two near-duplicate helpers that differ by one
behaviour merge into a single helper that takes that difference as a parameter, rather than staying
as two:

```ts
const intercept = ({
  method,
  path,
  status,
  once,
}: { method: Method; path: string; status?: number; once?: boolean }): (() => void) => {
  // status omitted holds the request; status given fails it at once.
}
```

A helper used by one `describe` block only is a local inside that block. A helper used across
several `describe` blocks, or by `setup()` itself, stays at module level.

The arrange work lives in a local `setup()` function, a plain function each test calls at its
start. It renders, stubs and seeds, takes an object for what varies per test, and returns what the
test acts on. `beforeEach`, `afterEach`, `beforeAll` and `afterAll` stay only where a hook is the
only way to run the code, such as a teardown that must run after a failed assertion.

```ts
const setup = ({ stored }: { stored?: string } = {}) => {
  if (stored !== undefined) window.localStorage.setItem(STORAGE_KEY, stored)
  render(<Panel />)
  return { width: () => Number(ui.handle.getAttribute("aria-valuenow")) }
}

it("restores a stored width", () => {
  expect(setup({ stored: "500" }).width()).toBe(500)
})
```

In Playwright specs, the top-level `test.describe` names the feature, nested ones start with
`when `, and `test()` stays the test function.

```ts
test.describe("Subscriptions", () => {
  test.describe("when a feed has no unread entries", () => {
    test("hides its badge", async ({ page }) => { ... })
  })
})
```

## Queries

Every DOM query sits in one module-level object with getter properties, named `ui`. A query that
takes arguments becomes a method on the same object. `within(...)` calls also live inside `ui`.
Async `findBy*` queries are getters that return the promise.

```ts
const ui = {
  get saveButton() {
    return screen.getByRole("button", { name: "Save" })
  },
  row(name: string) {
    return screen.getByRole("row", { name })
  },
}
```

Every query inside `ui`, in every getter and every method, takes an exact string, never a
`RegExp` or a `/.../` pattern. Pass the full text the markup renders, such as `"Feeds · 9"` rather
than `/^Feeds/`. When an accessible name joins a label to text that varies, such as an unread
count, query the element that holds the label by its exact text instead of matching the name
with a pattern.

When a test holds a `view` from `render` or `renderApp`, prefer `screen` in `ui`. A query scoped
to a fixed container, such as the one open dialog or a region of the page, is a plain getter on
`ui` that finds the container itself. It never takes the container as a parameter:

```ts
const ui = {
  get dialogConfirm() {
    return within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" })
  },
}
```

A locator never gets two accessors, one that throws and one that returns `null`, when both are
sync. Keep only the `query*` form and assert `!` at the call site that needs the throw:

```ts
const ui = {
  panel: {
    queryRow(title: string) {
      return within(this.panel).queryByRole("button", { name: title })
    },
  },
}

await user.click(ui.panel.queryRow("Save changes")!)
expect(ui.panel.queryRow("Save changes")).not.toBeInTheDocument()
```

A test that needs to wait for a `query*` locator wraps the call in `waitFor` at the call site
instead of adding a second, `find*` accessor for the same locator:

```ts
const ui = {
  get handles() {
    return screen.queryAllByRole("button", HANDLE_OPTIONS)
  },
}

await waitFor(() => expect(ui.handles).toHaveLength(4))
```

A method takes a container only when the container truly varies per call, such as a row picked by
name:

```ts
const ui = {
  rowButton({ row, name }: { row: string; name: string }) {
    return within(screen.getByRole("row", { name: row })).getByRole("button", { name })
  },
}
```

An action that opens or creates a piece of UI and returns a `ui` accessor is a method on the
sub-object that accessor belongs to, not a free function beside `setup()`. It sits at the level of
the state it returns: an action that returns `ui.panel` is a method of `ui.panel`, one that returns
`ui.dialog` is a method of `ui.dialog`:

```ts
const ui = {
  panel: {
    async open({ page, label }: { page: Page; label: string }) {
      await page.user.click(await ui.findRow(label))
      await ui.findPanel(label)
      return this
    },
  },
  dialog: {
    async openDelete({ page, label }: { page: Page; label: string }) {
      const panel = await ui.panel.open({ page, label })
      await page.user.click(panel.queryRow("Delete category…")!)
      return this
    },
  },
}
```

A helper that fires an event on a `ui` locator, such as a hover or a synthetic pointer event, is
also a method on `ui`, even when it returns nothing. It sits beside the locators it acts on
instead of staying a free function beside `setup()`:

```ts
const ui = {
  button(name: string) {
    return screen.getByRole("button", { name })
  },
  pointer({ type, target }: { type: "pointerover" | "pointerout"; target: Element }) {
    fireEvent(target, new Event(type, { bubbles: true }))
  },
  hover(target: Element) {
    ui.pointer({ type: "pointerover", target })
  },
}
```

In e2e specs, `ui` is a factory called once per test:

```ts
const ui = (page: Page) => ({
  get saveButton() {
    return page.getByRole("button", { name: "Save" })
  },
})
```

## Locale

Tests run in English: the setup file resets the locale preference to `system` after every test, and
`system` resolves to English under jsdom, so assertions use the English catalog text. A test that
needs French calls `setLocalePreference("fr")` from `client/i18n/locale` and relies on that reset to
undo it. The Vitest config pins `TZ=UTC`, so time-dependent assertions do not depend on the host
timezone. A catalog test walks every message of every locale and calls each function with sample
arguments, so a French message needs no test of its own for coverage.

## No mocks

Banned: `vi.mock`, `vi.doMock`, `vi.unmock`, `vi.doUnmock`, `vi.mocked`, `vi.importMock`,
`vi.hoisted`, `vi.spyOn`.

Allowed: MSW handlers with `server.use` at the network boundary, Playwright `page.route`, `vi.fn`
for callback props, `vi.stubGlobal` and `vi.stubEnv` for jsdom and env gaps, fake timers, and real
inputs such as an `env` object whose getter throws instead of a spy.

For layout values jsdom lacks, use `Object.defineProperty` on `HTMLElement.prototype` in
`setup()`:

```ts
const setup = () => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 200 })
  render(<Frame />)
}
```

A test file does not undo a global stub. The global `afterEach` in `src/test/setup.ts` undoes them
after every client test: it unstubs globals and env, restores real timers, restores
`window.localStorage` and every own property of `HTMLElement.prototype` and `Element.prototype`, and removes the MSW
`server.events` listeners. A file keeps a local `afterEach` only for teardown that is unsafe to
run after every file. The client project runs without isolation, so its files share one jsdom
per worker: a test that patches a global the setup file does not restore leaks into the next file,
and the failure then depends on file order. The server project has no setup file, so `worker.test.ts` keeps its own
`afterEach(() => vi.unstubAllGlobals())` for its `fetch` stub.

To hold or fail an API request instead of mocking the transport, stub `VITE_API_MODE=real`, add
the `fixtureBackend` catch-all handler from `src/test/fixtureBackend.ts` with `server.use`, and
add the specific handler for the path you want to hold or fail in a later `server.use` call,
because MSW tries the most recently added handlers first. `fixtureBackend` forwards every `/api/*` request to the real
`fixtureTransport`, so it keeps fixture state across a test's requests without a mock:

```ts
const setup = () => {
  vi.stubEnv("VITE_API_MODE", "real")
  server.use(fixtureBackend)
  resetFixtureState()
  render(<App />)
}
```

A read mark is batched client side ([markReadQueue.ts](../../src/client/api/markReadQueue.ts)): the
request leaves at 5 ids or after 10 s, and on `pagehide`. A test that asserts the request calls
`markReadQueue.flush()` first.

## Enforcement

oxlint checks these rules on every Vitest and Playwright test file:

- `vitest/no-restricted-vi-methods` — flags the banned `vi.*` methods above
- `vitest/consistent-test-it` — requires `it`, not `test`, inside a Vitest `describe`
- `vitest/require-top-level-describe` — caps a Vitest file at one top-level `describe`
- `test-conventions/nested-describe-when` — requires a nested `describe`/`test.describe` title to
  start with `when `
- `test-conventions/queries-in-getters` — requires a `screen`/`view`/`within(...)`/`page` query to
  sit inside a getter or method of an object literal

`code-conventions/no-raw-jsx-text` is off in `__tests__`, `__stories__` and `routes/dev.*.tsx`.

These gaps stay review-enforced, because a wider rule would cost more false positives than it
catches: a chained query off another query (`ui.list.getByRole(...)`), a query on a `render()`
result destructured under a different name, `container.querySelector`, and a `RegExp` inside
`ui`, which no lint rule catches.
