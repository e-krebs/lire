import { useRef } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, mocked, userEvent, within } from "storybook/test";
import { LocationBar } from "client/components/navigation/LocationBar";
import { ViewToggles } from "client/components/navigation/ViewToggles";
import { withRouter, withTier } from "stories/decorators";
import type { Tier } from "stories/decorators";

type Args = Omit<ComponentProps<typeof LocationBar>, "inputRef"> & { tier: Tier };

const meta: Meta<Args> = {
  title: "Components/LocationBar",
  decorators: [
    withTier,
    withRouter,
    (Story) => (
      <div className="w-[36rem] max-w-full">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    tier: { control: "inline-radio", options: ["phone", "desktop"] },
    viewControls: { control: false },
    onOpen: { control: false },
    onDraftChange: { control: false },
    onSearchKeyDown: { control: false },
    onClearScope: { control: false },
    onClearText: { control: false },
  },
  args: {
    tier: "desktop",
    edit: { search: {}, label: "Edit Technology" },
    draft: "",
    clearable: false,
    scopeLabel: "All articles",
    onOpen: fn(),
    onDraftChange: fn(),
    onSearchKeyDown: fn(),
    onClearScope: fn(),
    onClearText: fn(),
    viewControls: <ViewToggles search={{}} />,
  },
  render: function Render({ tier: _tier, ...args }) {
    const [, updateArgs] = useArgs();
    const inputRef = useRef<HTMLInputElement>(null);
    return (
      <LocationBar
        {...args}
        inputRef={inputRef}
        onDraftChange={(draft) => {
          updateArgs({ draft });
        }}
      />
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Typing: Story = {
  args: { clearable: true, scopeLabel: "Tech", draft: "rss" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("searchbox", { name: "Search articles and feeds" });
    await userEvent.click(field);
    await expect(args.onOpen).toHaveBeenCalled();
    await userEvent.type(field, "rss");
    await userEvent.keyboard("{ArrowDown}");
    await expect(args.onSearchKeyDown).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search text" }));
    await expect(args.onClearText).toHaveBeenCalled();
    await userEvent.click(field);
    await userEvent.keyboard("{Home}{Backspace}");
    await expect(args.onClearScope).toHaveBeenCalled();
  },
};

export const Shortcuts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const opened = (): number => mocked(args.onOpen).mock.calls.length;
    const before = opened();
    await userEvent.keyboard("/");
    await expect(opened()).toBe(before + 1);
    await expect(canvas.getByRole("searchbox")).toHaveFocus();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await userEvent.keyboard("{Control>}k{/Control}");
    await expect(opened()).toBe(before + 3);
  },
};

export const Phone: Story = {
  args: { tier: "phone", draft: "rss", clearable: true, scopeLabel: "Tech" },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open navigator" }));
    await expect(args.onOpen).toHaveBeenCalled();
  },
};

export const PhoneEmpty: Story = { args: { tier: "phone" } };

export const AllWithBadge: Story = { args: { count: { count: 50, capped: true } } };

export const NarrowedWithBadge: Story = {
  args: { clearable: true, scopeLabel: "Tech", count: { count: 12, capped: false } },
};

export const PhoneNarrowedWithBadge: Story = {
  args: { tier: "phone", clearable: true, scopeLabel: "Tech", count: { count: 12, capped: false } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Search everywhere instead of Tech" }),
    );
    await expect(args.onClearScope).toHaveBeenCalled();
    await expect(args.onOpen).not.toHaveBeenCalled();
  },
};

export const PhoneCategoryScope: Story = {
  args: { tier: "phone", clearable: true, scopeLabel: "Technology" },
  decorators: [
    (Story) => (
      <div className="w-97.5">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const clear = canvas.getByRole("button", { name: "Search everywhere instead of Technology" });
    const label = canvas.getByText("Technology");
    await expect(label.parentElement).toContainElement(clear);
    await userEvent.click(clear);
    await expect(args.onClearScope).toHaveBeenCalled();
    await expect(args.onOpen).not.toHaveBeenCalled();
    // A tap hits whatever paints on top: the × above the stretched opener, the opener elsewhere.
    const hit = (element: Element): Element | null => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    };
    const opener = canvas.getByRole("button", { name: "Open navigator" });
    await expect(hit(label)).toBe(opener);
    await expect(hit(canvas.getByText("Search articles, feeds…"))).toBe(opener);
    await expect(clear.contains(hit(clear))).toBe(true);
  },
};
