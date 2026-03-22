/**
 * Formats a given weight (always stored in grams in the database)
 * for UI display based on the selected unit (g or kg).
 *
 * @param {number|string} weightInGrams - The raw weight in grams from the database
 * @param {string} unit - 'g' or 'kg'
 * @returns {string} - Formatted string (e.g. "1.500 kg" or "1500.00 g")
 */
export const formatWeight = (weightInGrams, unit = "g") => {
  const grams = parseFloat(weightInGrams) || 0;

  if (unit === "kg") {
    // Convert to kg with high precision but no trailing noise
    const kg = grams / 1000;
    return `${parseFloat(kg.toFixed(10))} kg`;
  }

  // Grams with high precision but no trailing noise
  return `${parseFloat(grams.toFixed(10))} g`;
};
