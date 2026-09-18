import { lazy, type ComponentType } from 'react';

export type GameEntry = {
  slug: string;
  label: string;
  tagline: string;
  minPlayers: number;
  Component: ComponentType;
};

export const GAMES: GameEntry[] = [
  {
    slug: 'empire',
    label: 'Empire',
    tagline: 'Capture rival leaders and absorb their empire.',
    minPlayers: 3,
    Component: lazy(() => import('./empire')),
  },
  {
    slug: 'imposter',
    label: 'Imposter',
    tagline: 'Everyone gets a secret word, except the imposter.',
    minPlayers: 3,
    Component: lazy(() => import('./imposter')),
  },
  {
    slug: 'mafia',
    label: 'Mafia',
    tagline: 'A hidden minority hunts the town, night after night.',
    minPlayers: 5,
    Component: lazy(() => import('./mafia')),
  },
  {
    slug: 'werewolf',
    label: 'Werewolf',
    tagline: 'Root out the wolves before they pick off the village.',
    minPlayers: 7,
    Component: lazy(() => import('./werewolf')),
  },
  {
    slug: 'secret-hitler',
    label: 'Secret Hitler',
    tagline: 'Elect governments, enact policy, uncover the fascists.',
    minPlayers: 5,
    Component: lazy(() => import('./secret-hitler')),
  },
  {
    slug: 'spyfall',
    label: 'Spyfall',
    tagline: 'One player has no idea where everyone is.',
    minPlayers: 3,
    Component: lazy(() => import('./spyfall')),
  },
  {
    slug: 'codenames',
    label: 'Codenames',
    tagline: 'Give one-word clues to lead your team across the board.',
    minPlayers: 4,
    Component: lazy(() => import('./codenames')),
  },
  {
    slug: 'pictionary',
    label: 'Pictionary',
    tagline: 'Draw it. No letters, no numbers, no talking.',
    minPlayers: 4,
    Component: lazy(() => import('./pictionary')),
  },
  {
    slug: 'charades',
    label: 'Charades',
    tagline: 'Act it out. No props, no sound.',
    minPlayers: 4,
    Component: lazy(() => import('./charades')),
  },
  {
    slug: 'heads-up',
    label: 'Heads Up',
    tagline: 'Guess the word everyone else can see but you.',
    minPlayers: 3,
    Component: lazy(() => import('./heads-up')),
  },
  {
    slug: 'wavelength',
    label: 'Wavelength',
    tagline: 'Read your partner\'s mind across a hidden spectrum.',
    minPlayers: 2,
    Component: lazy(() => import('./wavelength')),
  },
  {
    slug: 'cards-against-humanity',
    label: 'Cards Against Humanity',
    tagline: 'Fill in the blank. The judge decides the winner.',
    minPlayers: 3,
    Component: lazy(() => import('./cah')),
  },
];

export function findGame(slug: string): GameEntry | undefined {
  return GAMES.find((g) => g.slug === slug);
}
