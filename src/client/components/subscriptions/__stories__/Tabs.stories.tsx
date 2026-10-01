import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Tabs, tabId, tabPanelId } from "client/components/subscriptions/Tabs";

const meta = {
  title: "Subscriptions/Tabs",
  component: Tabs<string>,
  args: {
    label: "Subscriptions",
    selected: "feeds",
    onSelect: fn(),
    tabs: [
      { id: "feeds", label: "Feeds", count: 42 },
      { id: "categories", label: "Categories", count: 6 },
    ],
  },
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return (
      <>
        <Tabs
          {...args}
          selected={selected}
          onSelect={(next) => {
            setSelected(next);
            args.onSelect(next);
          }}
        />
        {args.tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={tabPanelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            hidden={tab.id !== selected}
          />
        ))}
      </>
    );
  },
} satisfies Meta<typeof Tabs<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "a",
  },
};

export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const feeds = canvas.getByRole("tab", { name: /Feeds/ });
    const categories = canvas.getByRole("tab", { name: /Categories/ });
    feeds.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(categories).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(feeds).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(categories).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(feeds).toHaveFocus();
    await userEvent.click(categories);
    await expect(categories).toHaveAttribute("aria-selected", "true");
  },
};
