/* Planet Creator — the classic world.
 *
 * A world (see index.js) may take over any step of reading a week: its climate,
 * its baseline terrain, one last shaping pass, its palette, and objects of its
 * own standing in the scene. This one takes over none of them — it declares who
 * it is and nothing else — so a week read as `classic` goes down exactly the
 * path base.js drew before worlds existed and every pin still holds. It is the
 * reference the other worlds are read against, and the one `auto` falls back to
 * when no world claims a week.
 */
export default {
  id: 'classic',
  label: 'Classic',
  blurb: "The week as it has always been drawn: round five's terrain, climate and palette.",
};
