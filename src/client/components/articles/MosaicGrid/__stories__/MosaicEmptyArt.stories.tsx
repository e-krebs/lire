import type { Meta, StoryObj } from "@storybook/react-vite";
import { MosaicEmptyArt } from "client/components/articles/MosaicGrid/MosaicEmptyArt";
import { EMPTY_SCENES } from "client/components/articles/MosaicGrid/emptyScenes";
import { withQueryClient } from "stories/decorators";

const meta: Meta<typeof MosaicEmptyArt> = {
  title: "Components/MosaicEmptyArt",
  component: MosaicEmptyArt,
  parameters: { layout: "padded" },
  decorators: [withQueryClient],
  argTypes: {
    scene: { control: "select", options: EMPTY_SCENES },
    phase: { control: "radio", options: ["day", "dusk"] },
  },
  args: { scene: "hammock", phase: "day" },
};

export default meta;
type Story = StoryObj<typeof MosaicEmptyArt>;

export const Default: Story = {};

export const Gallery: Story = {
  argTypes: { scene: { control: false }, phase: { control: false } },
  render: () => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4 text-xs">
      {EMPTY_SCENES.flatMap((scene) =>
        (["day", "dusk"] as const).map((phase) => (
          <li
            key={`${scene}-${phase}`}
            className="flex flex-col items-center gap-2 rounded-lg p-4"
            style={{
              background: phase === "day" ? "#f1f3f4" : "#1f1f1f",
              color: phase === "day" ? "#3c4043" : "#e8eaed",
            }}
          >
            <MosaicEmptyArt scene={scene} phase={phase} />
            {`${scene} · ${phase}`}
          </li>
        )),
      )}
    </ul>
  ),
};
