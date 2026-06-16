import { describe, expect, it } from "vitest";

import { mapTrelloExport } from "./import-export-client";

describe("mapTrelloExport", () => {
  it("maps open lists/cards, skipping closed ones", () => {
    const mapped = mapTrelloExport({
      name: "My Trello Board",
      lists: [
        { id: "l1", name: "To Do" },
        { id: "l2", name: "Old", closed: true },
      ],
      cards: [
        { idList: "l1", name: "Card A", desc: "details", due: null },
        { idList: "l1", name: "Closed card", closed: true },
        { idList: "l2", name: "In closed list" },
      ],
    });
    expect(mapped).toEqual({
      name: "My Trello Board",
      lists: [
        {
          name: "To Do",
          cards: [{ name: "Card A", desc: "details", due: null }],
        },
      ],
    });
  });

  it("rejects JSON that isn't a Trello board export", () => {
    expect(mapTrelloExport({})).toBeNull();
    expect(mapTrelloExport({ lists: [] })).toBeNull();
  });
});
