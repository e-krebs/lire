import { useState } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { resetFixtureState } from "client/api/adapters/fixture";
import { SubscriptionsManager } from "client/components/subscriptions/SubscriptionsManager";
import { withQueryClient, withRouter, withTier } from "stories/decorators";
import type { Tier } from "stories/decorators";

type Args = ComponentProps<typeof SubscriptionsManager> & { tier: Tier };

type Props = ComponentProps<typeof SubscriptionsManager>;

// The story owns the state the app keeps in the URL; `useArgs` does not update in the test runner.
const Controlled = ({ tab: initialTab, panel: initialPanel }: Props) => {
  const [tab, setTab] = useState(initialTab);
  const [panel, setPanel] = useState(initialPanel);
  return (
    <div className="relative h-screen">
      <SubscriptionsManager
        tab={tab}
        panel={panel}
        onTabChange={(next) => {
          setTab(next);
          setPanel(undefined);
        }}
        onPanelChange={setPanel}
      />
    </div>
  );
};

const SLOW = { timeout: 10_000 };

const meta: Meta<Args> = {
  title: "Subscriptions/SubscriptionsManager",
  component: SubscriptionsManager,
  decorators: [withTier, withRouter, withQueryClient],
  parameters: { layout: "fullscreen" },
  argTypes: {
    tier: { control: "inline-radio", options: ["phone", "desktop"] },
    onTabChange: { control: false },
    onPanelChange: { control: false },
  },
  args: { tier: "desktop", tab: "categories", panel: undefined },
  beforeEach: () => {
    resetFixtureState();
  },
  render: function Render(args) {
    return <Controlled key={`${args.tab}-${args.panel?.kind}`} {...args} />;
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const ListCentred: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const column = (await canvas.findByRole("tab", { name: /Categories/ }, SLOW)).closest(
      "div.flex-col",
    )!;
    await expect(column).not.toHaveAttribute("data-panel-open");
  },
};

export const ListBesidePanel: Story = {
  args: { panel: { kind: "add", categoryId: undefined } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await screen.findByRole("complementary", { name: "Add a feed" }, SLOW);
    const column = (await canvas.findByRole("tab", { name: /Categories/ }, SLOW)).closest(
      "div.flex-col",
    )!;
    await expect(column).toHaveAttribute("data-panel-open");
  },
};

export const FeedsTab: Story = {
  args: { tab: "feeds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Example Daily News" }, SLOW);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Filter feeds" }), "foundry");
    await expect(canvas.queryByRole("button", { name: "Example Daily News" })).toBeNull();
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Filter feeds" }));
    await userEvent.type(canvas.getByRole("searchbox", { name: "Filter feeds" }), "zzzz");
    await expect(await canvas.findByText("No feed matches “zzzz”")).toBeVisible();
  },
};

export const CategoryPanelOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Design" }, SLOW));
    const panel = await screen.findByRole("complementary", { name: "Design" }, SLOW);
    await userEvent.type(
      within(panel).getByRole("searchbox", { name: "Filter feeds in Design" }),
      "nothing",
    );
    await expect(within(panel).getByText("No feed matches “nothing”")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(screen.queryByRole("complementary")).toBeNull();
    }, SLOW);
  },
};

export const RenameCategory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Design" }, SLOW));
    const panel = await screen.findByRole("complementary", { name: "Design" }, SLOW);
    const name = within(panel).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await waitFor(async () => {
      await expect(within(panel).getByText("Enter a name for this category.")).toBeVisible();
    }, SLOW);
    await userEvent.type(name, "Visual Design");
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await canvas.findByRole("button", { name: "Visual Design" }, SLOW);
    await waitFor(async () => {
      await expect(screen.queryByRole("complementary")).toBeNull();
    }, SLOW);
  },
};

export const CreateCategory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Design" }, SLOW);
    await userEvent.click(canvas.getByRole("button", { name: "＋ New" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create category" }));
    await expect(await canvas.findByText("Enter a name for the category.")).toBeVisible();
    await userEvent.type(canvas.getByRole("textbox", { name: "New category name" }), "Podcasts");
    await userEvent.click(canvas.getByRole("button", { name: "Create category" }));
    await screen.findByRole("complementary", { name: "Podcasts" }, SLOW);
    await expect(screen.getByText("No feeds in this category yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "＋ Add sources" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add website" }));
    await screen.findByRole("complementary", { name: "Add a feed" }, SLOW);
  },
};

export const CancelNewCategory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Design" }, SLOW);
    await userEvent.click(canvas.getByRole("button", { name: "＋ New" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "New category name" }), "x");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("textbox", { name: "New category name" })).toBeNull();
  },
};

export const ReorderCategories: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = await canvas.findByRole("button", { name: "Reorder Tech" }, SLOW);
    handle.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    await waitFor(async () => {
      const labels = canvas.getAllByRole("listitem").map((item) => item.textContent);
      await expect(labels[0]).toContain("Design");
      await expect(labels[1]).toContain("Tech");
    }, SLOW);
  },
};

export const DeleteCategoryAndMoveFeeds: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "News" }, SLOW));
    const panel = await screen.findByRole("complementary", { name: "News" }, SLOW);
    await userEvent.click(await within(panel).findByRole("button", { name: "Delete category…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete News?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete and move 4 feeds" });
    await expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Design" }));
    await userEvent.click(confirm);
    await waitFor(async () => {
      await expect(canvas.queryByRole("button", { name: "News" })).toBeNull();
    }, SLOW);
  },
};

export const UnsubscribeFromCategory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Newsletters" }, SLOW));
    const panel = await screen.findByRole("complementary", { name: "Newsletters" }, SLOW);
    await userEvent.click(
      await within(panel).findByRole("button", {
        name: "Remove Example Weekly from Newsletters",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Unsubscribe from Example Weekly?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(async () => {
      await expect(screen.queryByRole("dialog")).toBeNull();
    });
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove Example Weekly from Newsletters" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Unsubscribe" }),
    );
    await waitFor(async () => {
      await expect(
        within(panel).queryByRole("button", { name: "Remove Example Weekly from Newsletters" }),
      ).toBeNull();
    }, SLOW);
  },
};

export const EditFeed: Story = {
  args: { tab: "feeds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Example Design Journal" }, SLOW),
    );
    const panel = await screen.findByRole(
      "complementary",
      { name: "Example Design Journal" },
      SLOW,
    );
    const title = within(panel).getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await expect(
      await within(panel).findByText("Enter a title for this feed."),
    ).toBeInTheDocument();
    await userEvent.type(title, "Design Journal Renamed");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Newsletters" }, SLOW),
    );
    await userEvent.type(
      within(panel).getByRole("searchbox", { name: "Filter categories" }),
      "Podcasts",
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Create “Podcasts”" }));
    await expect(
      await within(panel).findByRole("checkbox", { name: "Podcasts" }, SLOW),
    ).toBeChecked();
    const direct = within(panel).getByRole("checkbox", { name: "Opens on its site" });
    await userEvent.click(direct);
    await expect(direct).toBeChecked();
    await userEvent.click(within(panel).getByRole("button", { name: "Save changes" }));
    await canvas.findByRole("button", { name: "Design Journal Renamed" }, SLOW);
    // The new name shows before the PATCH lands; ending here would let it land in the next story.
    await waitFor(async () => {
      await expect(screen.queryByRole("complementary")).toBeNull();
    }, SLOW);
  },
};

export const SwitchFeed: Story = {
  args: { tab: "feeds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Example Design Journal" }, SLOW),
    );
    await screen.findByRole("complementary", { name: "Example Design Journal" }, SLOW);
    await userEvent.click(canvas.getByRole("button", { name: "Example Type Foundry" }));
    await screen.findByRole("complementary", { name: "Example Type Foundry" }, SLOW);
  },
};

export const UnsubscribeFromFeed: Story = {
  args: { tab: "feeds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Example Longform" }, SLOW));
    const panel = await screen.findByRole("complementary", { name: "Example Longform" }, SLOW);
    await userEvent.click(await within(panel).findByRole("checkbox", { name: "Tech" }, SLOW));
    await userEvent.click(within(panel).getByRole("button", { name: "Unsubscribe…" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Unsubscribe from Example Longform?",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Unsubscribe" }));
    await waitFor(async () => {
      await expect(canvas.queryByRole("button", { name: "Example Longform" })).toBeNull();
    }, SLOW);
  },
};

export const SubscribeByUrl: Story = {
  args: { tab: "feeds" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Example Daily News" }, SLOW);
    await userEvent.click(canvas.getByRole("button", { name: "Add website" }));
    const panel = await screen.findByRole("complementary", { name: "Add a feed" }, SLOW);
    const url = within(panel).getByRole("textbox", { name: "Feed or site URL" });
    await userEvent.type(url, "https://gardening.example.test/rss");
    await within(panel).findByRole("radio", { name: /Example Gardening/ }, SLOW);
    await userEvent.click(within(panel).getByRole("radio", { name: /Example Gardening/ }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: "Design" }));
    const fast = userEvent.setup({ delay: null });
    await fast.clear(url);
    await fast.type(url, "ab");
    await fast.click(within(panel).getByRole("button", { name: "Subscribe" }));
    await expect(await within(panel).findByText("Enter a feed or site URL.")).toBeVisible();
    await fast.type(url, "{Backspace}{Backspace}https://gardening.example.test/rss");
    await fast.click(within(panel).getByRole("button", { name: "Subscribe" }));
    await within(panel).findByRole("radio", { name: /Example Gardening/ }, SLOW);
    await userEvent.click(within(panel).getByRole("radio", { name: /Example Gardening/ }));
    await userEvent.click(within(panel).getByRole("button", { name: "Subscribe" }));
    await canvas.findByRole("button", { name: "Example Gardening" }, SLOW);
  },
};

export const PhoneSheet: Story = {
  args: { tier: "phone" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Design" }, SLOW));
    const sheet = await screen.findByRole("dialog", { name: "Design" }, SLOW);
    await expect(sheet).toHaveAttribute("open");
    await userEvent.click(within(sheet).getByRole("button", { name: "Close Design" }));
    await waitFor(async () => {
      await expect(sheet).not.toHaveAttribute("open");
    }, SLOW);
  },
};
