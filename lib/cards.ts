import type { Card } from "./types";

// Truths are yes/no questions, so the market is "Will {name} answer YES?".
const TRUTHS = [
  "Have you ever pretended to be on a phone call to avoid talking to someone?",
  "Have you ever looked up an ex's new partner on social media?",
  "Have you ever cried at a commercial?",
  "Have you ever lied about reading a book you never opened?",
  "Have you ever re-gifted a present?",
  "Have you Googled yourself in the last month?",
  "Do you still sleep with a stuffed animal?",
  "Have you ever faked being sick to get out of plans?",
  "Have you ever sent a text about someone TO that someone?",
  "Have you ever eaten food off the floor using the five-second rule?",
  "Have you ever laughed at a joke you didn't understand?",
  "Have you ever rehearsed an argument in the shower?",
  "Do you have a secret alt or finsta account?",
  "Have you ever cheated at a board game?",
  "Have you ever pretended to know the words at a concert?",
  "Have you ever been kicked out of a class, store or event?",
  "Is your daily screen time over 6 hours?",
  "Have you ever used an AI to write a text to your crush?",
  "Have you lied at any point tonight?",
  "Have you ever forgotten someone's name mid-conversation and faked it?",
  "Have you ever stopped singing in the car because someone looked over?",
  "Have you ever bought clothes, worn them once and returned them?",
  "Do you secretly think you're the funniest person in this room?",
  "Have you ever cried in a movie theater?",
  "Have you ever waved back at someone who was waving at someone else?",
  "Have you ever read someone's texts over their shoulder?",
  "Have you ever had a crush on a friend's sibling?",
  "Have you ever ghosted someone after a first date?",
  "Have you ever practiced your signature to look more important?",
  "Have you ever pretended your phone died to avoid replying?",
];

// Dares stay party-safe: embarrassing, never dangerous. Anyone can chicken out.
const DARES = [
  "Give a 30-second TED talk on why your favorite snack deserves a Nobel Prize.",
  "Read your last sent text out loud in a movie-trailer voice.",
  "Pitch a terrible crypto startup like a finance bro for 30 seconds.",
  "Do 10 pushups while someone narrates it like the Olympics.",
  "Serenade the player on your right with a song the room picks.",
  "Do a dramatic slow-motion runway walk across the room.",
  "Hold a plank for 45 seconds while the room heckles you.",
  "Talk in a British accent until the next round starts.",
  "Recreate a famous movie scene with the player across from you.",
  "Show the room your screen time report.",
  "Do 30 seconds of stand-up comedy. Silence counts against you.",
  "Let the room choose your phone wallpaper for the rest of the night.",
  "Beatbox for 20 seconds without stopping.",
  "Give a tearful Oscar speech for Best Supporting Snack.",
  "Act out the last three emojis you sent until someone guesses them.",
  "Do your best villain laugh three times, louder each time.",
  "Attempt the worm. Commitment is graded, not quality.",
  "Show the room the last photo in your camera roll (you can veto one).",
  "Read the 5 most recent songs in your music history out loud.",
  "Do an infomercial for an object the room hands you. 30 seconds.",
  "Speak only in questions until the next round starts.",
  "Imitate another player until someone guesses who it is.",
  "Send 'I have something to tell you' to a friend and wait 60 seconds before explaining.",
  "Freestyle rap about the current leader's portfolio for 20 seconds.",
];

export const BASE_DECK: Card[] = [
  ...TRUTHS.map((text, i) => ({ id: `t${i}`, kind: "truth" as const, text })),
  ...DARES.map((text, i) => ({ id: `d${i}`, kind: "dare" as const, text })),
];

export function marketQuestion(card: Card, name: string) {
  return card.kind === "truth" ? `Will ${name} answer YES?` : `Will ${name} complete the dare?`;
}
