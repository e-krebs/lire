import { useRef } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { NavigatorPanel } from "client/components/navigation/NavigatorPanel";
import type { NavigatorPanelHandle } from "client/components/navigation/NavigatorPanel";
import { withQueryClient, withRouteMatch } from "stories/decorators";

const LOADED = { timeout: 10_000 };

const meta = {
  title: "Navigator/NavigatorPanel",
  component: NavigatorPanel,
  decorators: [
    withRouteMatch,
    withQueryClient,
    (Story) => (
      <div className="flex h-128 w-96 flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
        <Story />
      </div>
    ),
  ],
  argTypes: { onClose: { control: false } },
  args: {
    query: "",
    onQueryChange: fn(),
    scopeKey: "all",
    scopeLabel: "All articles",
    onClose: fn(),
  },
  render: function Render(args: ComponentProps<typeof NavigatorPanel>) {
    const [, updateArgs] = useArgs();
    const handleRef = useRef<NavigatorPanelHandle>(null);
    return (
      <>
        <input
          type="search"
          aria-label="Search"
          value={args.query}
          onChange={(event) => {
            updateArgs({ query: event.target.value });
          }}
          onKeyDown={(event) => {
            handleRef.current?.handleKeyDown(event);
          }}
          className="m-2 rounded-lg border border-hairline px-2 py-1"
        />
        <NavigatorPanel {...args} ref={handleRef} />
      </>
    );
  },
} satisfies Meta<typeof NavigatorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BrowseKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("searchbox", { name: "Search" });
    await canvas.findByText("Tech", {}, LOADED);
    await userEvent.click(field);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(async () => {
      await expect(canvas.getByText("Example Tech Daily")).toBeInTheDocument();
    }, LOADED);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(async () => {
      await expect(canvas.queryByText("Example Tech Daily")).not.toBeInTheDocument();
    });
    await userEvent.keyboard("{ArrowLeft}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowLeft}");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{Enter}");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}{ArrowUp}{ArrowDown}");
    await userEvent.keyboard("{End}");
    for (let i = 0; i < 12; i += 1) await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const Search: Story = {
  args: { query: "tech" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Matches", {}, LOADED);
    await waitFor(async () => {
      await expect(canvas.getAllByText(/tech/i).length).toBeGreaterThan(1);
    }, LOADED);
    const field = canvas.getByRole("searchbox", { name: "Search" });
    await userEvent.click(field);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const SearchEnterOnFeed: Story = {
  args: { query: "example" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Matches", {}, LOADED);
    await waitFor(async () => {
      await expect(canvas.getAllByText(/example/i).length).toBeGreaterThan(2);
    }, LOADED);
    await userEvent.click(canvas.getByRole("searchbox", { name: "Search" }));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const SearchCategoryEnter: Story = {
  args: { query: "design", scopeKey: "all" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Matches", {}, LOADED);
    await waitFor(async () => {
      await expect(canvas.getAllByText(/design/i).length).toBeGreaterThan(1);
    }, LOADED);
    await userEvent.click(canvas.getByRole("searchbox", { name: "Search" }));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const NoMatches: Story = {
  args: { query: "zzzz" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/No feeds or categories match/, {}, LOADED);
    await userEvent.click(canvas.getByRole("searchbox", { name: "Search" }));
    await userEvent.keyboard("{Enter}");
  },
};

export const RowClicks: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Tech", {}, LOADED);
    await userEvent.click(canvas.getByRole("button", { name: /Recently read/ }));
    await userEvent.click(canvas.getByRole("button", { name: /All articles/ }));
    await userEvent.click(canvas.getByRole("link", { name: "Manage subscriptions" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};
