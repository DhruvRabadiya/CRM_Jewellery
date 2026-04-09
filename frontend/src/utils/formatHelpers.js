/**
 * Formats a given weight (always stored in grams in the database)
 * for UI display in grams.
 *
 * @param {number|string} weightInGrams - The raw weight in grams from the database
 * @param {string} unit - 'g' (kept for backward compatibility, always treated as grams)
 * @returns {string} - Formatted string (e.g. "1500.00 g")
 */
export const formatWeight = (weightInGrams, unit = "g") => {
  const grams = parseFloat(weightInGrams) || 0;

  // Always display in grams
  return `${parseFloat(grams.toFixed(10))} g`;
};
