export type PackageInfo = { license: string; homepage?: string };

export type LibraryGroup = { pattern: RegExp; label: string; homepage?: string };

export type Library = { label: string; license: string; homepage?: string };

type BuildLibrariesInput = {
  packages: Record<string, PackageInfo>;
  groups: LibraryGroup[];
  labels: Partial<Record<string, string>>;
};

export const buildLibraries = ({ packages, groups, labels }: BuildLibrariesInput): Library[] => {
  const lines = new Map<string, { label: string; homepage?: string; members: PackageInfo[] }>();
  for (const name of Object.keys(packages).sort()) {
    const group = groups.find((g) => g.pattern.test(name));
    const key = group ? group.label : name;
    const line = lines.get(key) ?? {
      label: group?.label ?? labels[name] ?? name,
      homepage: group ? group.homepage : undefined,
      members: [],
    };
    line.members.push(packages[name]);
    lines.set(key, line);
  }

  return [...lines.values()]
    .map(({ label, homepage, members }) => {
      const licenses = [...new Set(members.map((m) => m.license))];
      if (licenses.length > 1) {
        throw new Error(`${label}: members have different licences (${licenses.join(", ")})`);
      }
      const single = members.length === 1 ? members[0] : undefined;
      return {
        label,
        license: licenses[0],
        homepage: homepage ?? single?.homepage,
      };
    })
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase(), "en"));
};
