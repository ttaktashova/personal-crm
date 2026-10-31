import { describe, expect, it } from "vitest";

import {
  buildListHref,
  firstValue,
  parsePage,
  parsePageSize,
  resolveGroupFilter,
  resolvePageSize,
} from "./pagination";

const encoded = (text: string) => encodeURIComponent(text);

// What Next.js gives the page for an address: the first value of each parameter.
function searchParamsOf(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("buildListHref", () => {
  it("writes the group first, then the search, the page and the size", () => {
    expect(buildListHref({ group: 3, q: "петров", page: 2, size: 100 })).toBe(
      `/?group=3&q=${encoded("петров")}&page=2&size=100`,
    );
  });

  it("leaves a missing group out of the address", () => {
    expect(buildListHref({ group: null, page: 1, size: 50 })).toBe("/");
    expect(buildListHref({ group: null, page: 2, size: 100 })).toBe("/?page=2&size=100");
  });

  it("builds the addresses of before the groups as they were", () => {
    expect(buildListHref({ page: 1, size: 50 })).toBe("/");
    expect(buildListHref({ page: 2, size: 100 })).toBe("/?page=2&size=100");
    expect(buildListHref({ q: "ан", page: 1, size: 25 })).toBe(`/?q=${encoded("ан")}&size=25`);
  });

  it("gives the first page of a group with the same search and size", () => {
    // The link of a group in the row above the list, from page 3 of a search.
    expect(buildListHref({ group: 5, q: "ан", page: 1, size: 100 })).toBe(
      `/?group=5&q=${encoded("ан")}&size=100`,
    );
  });

  it("keeps the group when the search is cleared", () => {
    expect(buildListHref({ group: 3, page: 1, size: 25 })).toBe("/?group=3&size=25");
  });

  it("is read back as the same group, search, page and size", () => {
    const href = buildListHref({ group: 3, q: "петров", page: 2, size: 100 });
    const params = searchParamsOf(href);

    expect(resolveGroupFilter(params.group, [{ id: 1 }, { id: 3 }])).toBe(3);
    expect(firstValue(params.q)).toBe("петров");
    expect(parsePage(params.page)).toBe(2);
    expect(parsePageSize(params.size)).toBe(100);
  });
});

describe("resolveGroupFilter", () => {
  const groups = [{ id: 1 }, { id: 3 }];

  it("keeps a group that exists", () => {
    expect(resolveGroupFilter("3", groups)).toBe(3);
  });

  it("shows everyone when the address has no group", () => {
    expect(resolveGroupFilter(undefined, groups)).toBeNull();
  });

  it("shows everyone when the group is not a number", () => {
    expect(resolveGroupFilter("abc", groups)).toBeNull();
    expect(resolveGroupFilter("", groups)).toBeNull();
    expect(resolveGroupFilter("-3", groups)).toBeNull();
    expect(resolveGroupFilter("3.5", groups)).toBeNull();
  });

  it("shows everyone when the group was deleted", () => {
    expect(resolveGroupFilter("999", groups)).toBeNull();
    expect(resolveGroupFilter("3", [])).toBeNull();
  });

  it("takes the first of a repeated parameter", () => {
    expect(resolveGroupFilter(["1", "3"], groups)).toBe(1);
  });
});

describe("resolvePageSize", () => {
  it("takes the size of the address first", () => {
    expect(resolvePageSize("25", "100")).toBe(25);
  });

  it("then the one remembered in this browser", () => {
    expect(resolvePageSize(undefined, "100")).toBe(100);
    expect(resolvePageSize("7", "100")).toBe(100);
  });

  it("then 50", () => {
    expect(resolvePageSize(undefined, undefined)).toBe(50);
    expect(resolvePageSize("abc", "7")).toBe(50);
  });
});
