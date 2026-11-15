import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { NavigatorPanel } from "client/components/browse-menu/menu/NavigatorPanel";
import { useNavigatorModel } from "client/hooks/useNavigatorModel";
import { withQueryClient, withRouteMatch } from "stories/decorators";

const LOADED = { timeout: 10_000 };

type StoryArgs = Omit<ComponentProps<typeof NavigatorPanel>, "model"> & {
  query: string;
  scopeKey: string;
};

// A component of its own: the model's React hooks cannot share a render function with `useArgs`.
const Harness = ({
  query,
  scopeKey,
  onQueryChange,
  ...args
}: StoryArgs & { onQueryChange: (value: string) => void }) => {
  const model = useNavigatorModel({
    open: true,
    query,
    onQueryChange: fn(),
    onClose: args.onClose,
    scopeKey,
  });
  return (
    <>
      <input
        type="search"
        aria-label="Search"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        onKeyDown={(event) => {
          model.handleKeyDown(event);
        }}
        className="m-2 rounded-lg border border-hairline px-2 py-1"
      />
      <NavigatorPanel {...args} model={model} />
    </>
  );
};

const meta = {
  title: "Browse menu/Menu/NavigatorPanel",
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
    scopeKey: "all",
    scopeLabel: "All articles",
    onClose: fn(),
  },
  render: function Render({ query, scopeKey, ...args }: StoryArgs) {
    const [, updateArgs] = useArgs();
    return (
      <Harness
        {...args}
        query={query}
        scopeKey={scopeKey}
        onQueryChange={(value) => {
          updateArgs({ query: value });
        }}
      />
    );
  },
} satisfies Meta<StoryArgs>;

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
