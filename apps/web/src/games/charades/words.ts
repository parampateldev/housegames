export const CATEGORIES: Record<string, string[]> = {
  Movies: ['Jurassic Park', 'Titanic', 'The Lion King', 'Finding Nemo', 'Jaws', 'Rocky', 'Ghostbusters', 'The Matrix', 'Frozen', 'Shrek', 'Back to the Future', 'E.T.', 'Toy Story', 'Star Wars', 'Home Alone'],
  Animals: ['Kangaroo', 'Octopus', 'Penguin', 'Elephant', 'Flamingo', 'Gorilla', 'Dolphin', 'Cheetah', 'Peacock', 'Sloth', 'Crab', 'Owl', 'Bat', 'Frog', 'Snake'],
  Actions: ['Brushing teeth', 'Riding a bike', 'Fishing', 'Surfing', 'Playing guitar', 'Baking a cake', 'Skiing', 'Juggling', 'Painting', 'Swimming', 'Bowling', 'Ice skating', 'Typing', 'Yoga', 'Boxing'],
  Objects: ['Umbrella', 'Telescope', 'Chandelier', 'Backpack', 'Toaster', 'Guitar', 'Camera', 'Bicycle', 'Lantern', 'Trophy', 'Anchor', 'Compass', 'Kite', 'Ladder', 'Violin'],
  'Famous People': ['A superhero', 'A pirate', 'A chef', 'An astronaut', 'A knight', 'A wizard', 'A cowboy', 'A ninja', 'A detective', 'A queen', 'A robot', 'A vampire', 'A pilot', 'A magician', 'A referee'],
};

export function pickWord(category: string, usedWords: string[]): string {
  const pool = (CATEGORIES[category] ?? Object.values(CATEGORIES).flat()).filter((w) => !usedWords.includes(w));
  const source = pool.length > 0 ? pool : (CATEGORIES[category] ?? Object.values(CATEGORIES).flat());
  return source[Math.floor(Math.random() * source.length)];
}
