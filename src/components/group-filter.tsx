import { cookies } from "next/headers";
import Link from "next/link";

import { GroupsDialog } from "@/components/groups-dialog";
import { listGroups } from "@/lib/groups";
import {
  buildListHref,
  firstValue,
  PAGE_SIZE_COOKIE,
  resolveGroupFilter,
  resolvePageSize,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

// 44px tall on a phone, 36px on a computer, like the other controls of the main page.
const CHIP_CLASS =
  "inline-flex min-h-11 items-center rounded-chip border px-4 text-ui whitespace-nowrap transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring sm:min-h-9 sm:px-3.5";

// "Все · Аналитики · Друзья · …" under the page title, and the "Группы" button that opens
// the window for managing the groups. A group is a plain link to the list with ?group=,
// so Back, a copied address and a bookmark all keep the group. The search and the page size
// stay when the group changes; the page goes back to the first one.
export async function GroupFilter({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const cookieStore = await cookies();

  const groups = await listGroups();
  const selectedId = resolveGroupFilter(params.group, groups);
  const pageSize = resolvePageSize(params.size, cookieStore.get(PAGE_SIZE_COOKIE)?.value);
  const query = (firstValue(params.q) ?? "").trim();

  const hrefFor = (group: number | null) =>
    buildListHref({ group, q: query, page: 1, size: pageSize });

  return (
    <div className="flex items-start gap-2">
      {/* On a phone the groups that do not fit scroll sideways in one row; on a computer
          they wrap. The padding and the negative margin keep the focus outline from being clipped. */}
      <nav
        aria-label="Группы"
        className="-m-1 min-w-0 flex-1 overflow-x-auto p-1 [scrollbar-width:none] sm:overflow-visible"
      >
        <ul className="flex flex-nowrap gap-2 sm:flex-wrap">
          <li>
            <GroupLink href={hrefFor(null)} selected={selectedId === null}>
              Все
            </GroupLink>
          </li>
          {groups.map((group) => (
            <li key={group.id}>
              <GroupLink href={hrefFor(group.id)} selected={selectedId === group.id}>
                {group.name}
              </GroupLink>
            </li>
          ))}
        </ul>
      </nav>
      <GroupsDialog groups={groups} />
    </div>
  );
}

function GroupLink({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        CHIP_CLASS,
        selected
          ? "border-primary bg-primary font-semibold text-primary-foreground"
          : "border-border-strong bg-card text-card-foreground hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
