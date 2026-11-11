// "UNIQLO EUROPE LIMITED" and "Tesco UK" are Uniqlo and Tesco. Given a company key (lower-case
// words, legal suffixes already removed), drop the words that only say which arm of the company
// posted the advert, so both arms share one profile, logo and prominence.
const ARM_WORDS = /\b(uk|gb|europe|emea|group|holdings|plc|careers|early careers|international|global|ireland|and|in|the|usa|services|trading)\b/g;

export const brandKey = (key: string) => key.replace(ARM_WORDS, " ").replace(/\s+/g, " ").trim();
