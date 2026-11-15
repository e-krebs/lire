import { useRef } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Navigator } from "client/components/browse-menu/menu/Navigator";
import type { LocationModel } from "client/components/header/location/locationModel";
import { useNavigatorModel } from "client/hooks/useNavigatorModel";
import { setBarPosition } from "client/hooks/utils/barPosition";
import { withQueryClient, withRouteMatch, withTier } from "stories/decorators";
import type { Tier } from "stories/decorators";

type Args = Omit<ComponentProps<typeof Navigator>, "anchorRef" | "model"> & {
  tier: Tier;
};

const locationArgs = (overrides: Partial<LocationModel> = {}): LocationModel => ({
  scopeKey: "all",
  scopeLabel: "All articles",
  clearable: false,
  draft: "",
  onDraftChange: fn(),
  onClearScope: fn(),
  onClearText: fn(),
  onSearchKeyDown: fn(),
  ...overrides,
});

// A component of its own: the model's React hooks cannot share a render function with `useArgs`.
const Harness = ({
  tier,
  onDraftChange,
  ...args
}: Args & { onDraftChange: (draft: string) => void }) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const model = useNavigatorModel({
    open: args.open,
    query: args.location.draft,
    onQueryChange: onDraftChange,
    onClose: () => {
      args.onClose();
      if (tier !== "phone") args.onRequestFocus();
    },
    scopeKey: args.location.scopeKey,
  });
  return (
    <div className="h-screen p-4">
      <div
        ref={anchorRef}
        className="mx-auto h-10 w-xl max-w-full rounded-full border border-hairline"
      />
      <Navigator
        {...args}
        anchorRef={anchorRef}
        model={model}
        location={{ ...args.location, onSearchKeyDown: model.handleKeyDown, onDraftChange }}
      />
    </div>
  );
};

const meta: Meta<Args> = {
  title: "Browse menu/Menu/Navigator",
  decorators: [withTier, withRouteMatch, withQueryClient],
  parameters: { layout: "fullscreen" },
  argTypes: {
    tier: { control: "inline-radio", options: ["phone", "desktop"] },
    onClose: { control: false },
    onRequestFocus: { control: false },
    location: { control: false },
  },
  args: {
    tier: "desktop",
    open: true,
    location: locationArgs(),
    onClose: fn(),
    onRequestFocus: fn(),
  },
  render: function Render({ tier, ...args }) {
    const [, updateArgs] = useArgs();
    return (
      <Harness
        {...args}
        tier={tier}
        onDraftChange={(draft) => {
          updateArgs({ location: { ...args.location, draft } });
        }}
      />
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
  args: { tier: "desktop" },
};

const LOADED = { timeout: 10_000 };

const touch = ({ target, y }: { target: Element; y: number }): Touch =>
  new Touch({ identifier: 1, target, clientX: 10, clientY: y });

const swipe = ({ target, from, to }: { target: Element; from: number; to: number }): void => {
  const fire = ({ type, y }: { type: string; y: number }): void => {
    const point = touch({ target, y });
    target.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === "touchend" ? [] : [point],
        changedTouches: [point],
      }),
    );
  };
  fire({ type: "touchstart", y: from });
  fire({ type: "touchmove", y: from + (to - from) / 2 });
  fire({ type: "touchmove", y: to });
  fire({ type: "touchend", y: to });
};

export const DesktopDismiss: Story = {
  args: { tier: "desktop", location: locationArgs({ draft: "tech" }) },
  play: async ({ args }) => {
    const body = within(document.body);
    await body.findByRole("group", { name: "Navigator" });
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onRequestFocus).toHaveBeenCalled();
    await userEvent.click(document.body);
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalledTimes(2);
    });
    await body.findByText("Matches", {}, LOADED);
  },
};

export const DesktopFocusOut: Story = {
  args: { tier: "desktop" },
  play: async ({ args }) => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
    outside.remove();
  },
};

export const Phone: Story = { args: { tier: "phone" } };

export const PhoneSearching: Story = {
  args: {
    tier: "phone",
    location: locationArgs({ draft: "tech", clearable: true, scopeLabel: "Tech" }),
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const field = await body.findByRole("searchbox", { name: "Search articles and feeds" });
    await body.findByText("Matches", {}, LOADED);
    await userEvent.click(field);
    await userEvent.keyboard("{ArrowDown}{ArrowUp}");
    if (!(field instanceof HTMLInputElement)) throw new Error("expected an input");
    field.setSelectionRange(0, 0);
    await userEvent.keyboard("{Backspace}");
    await expect(args.location.onClearScope).toHaveBeenCalled();
    await userEvent.click(body.getByRole("button", { name: "Clear search text" }));
    await expect(args.location.onClearText).toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
  },
};

export const PhoneBackdropClose: Story = {
  args: { tier: "phone" },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole("dialog", { name: "Navigator" });
    dialog.click();
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
  },
};

export const PhoneSwipeClose: Story = {
  args: { tier: "phone" },
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole("dialog", { name: "Navigator" });
    await body.findByText("Tech", {}, LOADED);
    const field = body.getByRole("searchbox", { name: "Search articles and feeds" });
    swipe({ target: field, from: 200, to: 150 });
    await waitFor(async () => {
      await expect(dialog.style.translate).toBe("");
    });
    swipe({ target: field, from: 200, to: 190 });
    swipe({ target: field, from: 200, to: 100 });
    swipe({ target: field, from: 200, to: 450 });
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
  },
};

export const PhoneBarAtBottom: Story = {
  args: { tier: "phone" },
  play: async ({ args }) => {
    setBarPosition("bottom");
    const body = within(document.body);
    const dialog = await body.findByRole("dialog", { name: "Navigator" });
    const field = body.getByRole("searchbox", { name: "Search articles and feeds" });
    window.visualViewport?.dispatchEvent(new Event("resize"));
    swipe({ target: field, from: 300, to: 250 });
    swipe({ target: field, from: 300, to: 100 });
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
    await expect(dialog).toBeInTheDocument();
    setBarPosition("top");
  },
};
