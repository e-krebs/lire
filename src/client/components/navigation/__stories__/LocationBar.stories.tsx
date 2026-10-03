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
