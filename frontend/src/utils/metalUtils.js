export const METAL_ORDER = ["Gold 24K", "Silver", "Gold 22K"];

export const METAL_PRIORITY = {
  "Gold 24K": 1,
  Silver: 2,
  "Gold 22K": 3,
};

export const sortByMetalPriority = (list, key = "metal_type") =>
  [...list].sort(
    (a, b) =>
      (METAL_PRIORITY[a[key]] ?? 99) - (METAL_PRIORITY[b[key]] ?? 99)
  );
