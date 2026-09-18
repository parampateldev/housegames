export const CATEGORIES: Record<string, string[]> = {
  Animals: ['Kangaroo', 'Octopus', 'Penguin', 'Elephant', 'Flamingo', 'Gorilla', 'Dolphin', 'Cheetah', 'Peacock', 'Sloth', 'Crab', 'Owl', 'Bat', 'Frog', 'Snake', 'Whale', 'Tiger', 'Koala'],
  Movies: ['Jurassic Park', 'Titanic', 'The Lion King', 'Finding Nemo', 'Jaws', 'Rocky', 'Ghostbusters', 'The Matrix', 'Frozen', 'Shrek', 'Back to the Future', 'E.T.', 'Toy Story', 'Star Wars', 'Home Alone'],
  Jobs: ['Doctor', 'Firefighter', 'Chef', 'Teacher', 'Pilot', 'Plumber', 'Astronaut', 'Lawyer', 'Electrician', 'Farmer', 'Dentist', 'Photographer'],
  Objects: ['Umbrella', 'Telescope', 'Chandelier', 'Backpack', 'Toaster', 'Guitar', 'Camera', 'Bicycle', 'Lantern', 'Trophy', 'Anchor', 'Compass', 'Kite', 'Ladder', 'Violin'],
};

export function nextWord(category: string, usedWords: string[]): string {
  const pool = (CATEGORIES[category] ?? Object.values(CATEGORIES).flat()).filter((w) => !usedWords.includes(w));
  const source = pool.length > 0 ? pool : (CATEGORIES[category] ?? Object.values(CATEGORIES).flat());
  return source[Math.floor(Math.random() * source.length)];
}
