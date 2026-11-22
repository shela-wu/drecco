+++
title="Tug of Words"

[extra]
team="Emil Parikh"
thumbnail="thumbnail.png"
+++

# Tug of Words

Two players share **one word** and take turns changing it, one letter at a time. Each player has a
**target word**, picked by the computer so that neither player starts ahead.

## Every move (both modes)

- **Change, add or remove exactly one letter.** LIME → LAME (change), CAVE → CRAVE (add), CRAVE → RAVE (remove).
- The result must be a **real word**, at most **7 letters**.
- **No word can be used twice** in a game.
- Players alternate, **10 moves each**. You may **pass** instead of moving: it uses one of your 10 moves,
  leaves the word unchanged and scores nothing. If you have no legal move, you pass automatically.

## Simple mode (for younger players)

- Your target is a short word, like **CAT**. You want its letters in the shared word, **in any position**.
- **After each of your moves**, you score **1 point for every one of your target's letters** in the word.
  (DATE has the A and T of CAT, so Red scores 2.)
- Get **all** your letters into the word at once and you **win right away**.
- Otherwise, **most points after 10 moves each wins**. If points are tied, whoever has more of their
  letters in the final word wins. Still tied: a draw.

## Advanced mode (for older players)

- Turn the shared word **into your target word**. Make it your target and you **win right away**.
- Otherwise, after 10 moves each, whoever's target is **fewer letters away** wins (the fewest changes,
  adds or removes needed to turn the final word into the target).
- Tied? Whoever has the **shorter chain of real, unused words** left to their target wins.
- A **match is two games** from the same start, with seats swapped. The **lowest total letters away**
  across both games wins the match.

## Tips

- Every move can help your opponent too. Don't leave them one letter away from finishing.
- Block by changing a letter they need, and remember that used words are gone for good.
- Adding a letter makes room; long words have fewer moves, which can trap a player.

## Controls

Type your word and press **Enter** (or click **Play**). Two players can share one screen, or Blue can be
the **computer**: **Easy** goes for its own letters, **Hard** also looks one move ahead and blocks you.

Word list: SCOWL English (see `CREDITS.txt`).
