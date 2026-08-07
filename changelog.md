# Changelog

All notable changes to Noodlr, newest first. Written for GMs rather than developers.

## 0.4.47

- **The sheet survey now covers player characters.** `api.surveyActions()` existed to learn monster sheets
  and skipped characters on purpose, which meant it could not see any of the things that go wrong on a
  character: what claims an action slot, how many attacks one Action buys, and what lets a rogue Dash for a
  bonus action. Characters are reported as their own section, so the monster counts stay comparable with
  earlier runs.
- **It also lists every feature in the world that would be charged an action slot and is not exempted as
  extra damage.** Most entries are legitimate — a handful of D&D 5e's own features really do cost an action
  to deal damage — but this is where a mis-authored ability hides, and it is what turned a rogue's Sneak
  Attack into a spent action. If you hit that class of problem again, this list is the first place to look.
- **Attacks-per-action now reports where it got the number from** in both surveys: a class feature's
  identifier, a monster's Multiattack prose, an unparseable Multiattack that fell back to two, or your own
  override. Of everything the action economy uses, that value is the one that is detected rather than
  counted, so a refused-but-legal swing is usually explained here.

## 0.4.46

- **Sneak Attack is no longer charged as an action.** A rogue who hit, was offered its Sneak Attack and was
  then told it had already used its action for the turn. Sneak Attack is extra damage on a hit that has
  already happened — never a second action — and the same is now true of every feature of that shape:
  Cunning Strike, Colossus Slayer, Divine Strike, Potent Spellcasting, Primal Strike, Brutal Strike,
  Frenzy, Lifedrinker, Eldritch Smite, Empowered Evocation, Overchannel, Elemental Affinity, Foe Slayer and
  Hurl Through Hell. Stock D&D 5e marks these correctly and was never the problem; imported and premade
  sheets sometimes do not, and now it no longer matters which. For anything not on that list, set
  `flags.noodlr.damageRider` on the item. Automated monsters also stop treating riders as things they could
  choose to do on their turn.
- **Chat cards name the right character.** If you own several characters, Noodlr's cards were sometimes
  signed with the wrong one — typically the character assigned to you in User Configuration, even when it
  was not on the scene and you were plainly playing somebody else. Foundry stamps any card that names no
  speaker with your assigned character, and a dozen of Noodlr's cards were leaving it blank. Every card now
  says who it is from: the creature it is about, or Noodlr itself for announcements about the fight.
- **Noodlr works out which characters you are actually playing, and accepts that it may be more than one.**
  The token you have selected comes first, then your assigned character, then anything else you own on the
  scene. Ownership granted through "All Players: Owner" is now recognised, where before only an explicit
  per-player Owner row was.
- "Put it back" on the undo buttons now reads "Undo".
- `api.surveyPlayed()` shows who each connected user is playing versus the character Foundry falls back to,
  and `api.surveyEconomy()` now lists every activity that would be charged a slot, so a feature carrying an
  activation it should not have is visible at a glance.

## 0.4.45

- **Automated Conditions 5e can stay switched on.** If you run AC5e, Noodlr now hands it the whole
  condition-rules job rather than doing the same work twice. That is not Noodlr giving up something you
  had: AC5e covers every rule Noodlr's condition automation covers and several it does not, including
  disadvantage for attacking while Prone or Restrained, Invisible, Grappled, and Blinded rules that
  account for what a creature can actually see. Both modules running was not simply harmless duplication
  — they reach the same rulings by different routes, so which one you got depended on load order.
- **One piece stays with Noodlr: a creature that is Incapacitated, Stunned, Paralyzed or Unconscious
  still cannot take an action.** AC5e has that rule too, but its setting for it ships switched off, so
  leaving it to them would mean nobody enforced it. If you turn AC5e's "casting spells checks" setting to
  Warn or Enforce, Noodlr steps aside from that as well.
- **Fixed: an automatically failed save could be cancelled with the feature turned off.** Switching off
  condition automation in Text Generation stopped the explanation appearing but did not stop the save
  being cancelled, so a Paralyzed character's Strength save vanished with nothing said about it. The
  switch now does what it says.
- `game.modules.get("noodlr").api.surveyConditions()` reports whether AC5e has taken over.

## 0.4.44

- **Concentration saves are rolled, and failing one actually ends the spell.** D&D 5e already works out
  the right DC when a concentrating creature takes damage and whispers a button to whoever owns it — and
  then nothing reads the answer. Nowhere in the system does a failed concentration save end anything: the
  card shows the failure in red and the Wall of Fire stays up. Both halves are now closed. The save is
  rolled the moment the damage lands, and losing it drops the spell with a line in chat saying what was
  lost and why.
- **The save is rolled on the right person's screen.** A character's Constitution save is still their own
  roll, with the usual dialog for Bless or Inspiration; a monster's is rolled quietly by the GM. Noodlr
  works out who owns the creature and asks only that one client, so nobody rolls twice and nothing waits
  on a button the table never noticed. The old prompt is suppressed so there is no stale one left behind —
  and if you close the dialog without rolling, the prompt comes back rather than the save vanishing.
- **Being Incapacitated, dying, or dropping to 0 hit points ends concentration outright**, with no save.
  That sentence is in the rules in both editions and was enforced by nothing at all, so a Held or
  Unconscious caster kept their spell running. There is also no longer a pointless save prompt in front of
  a character who has just been knocked out — at 0 hit points the spell is already over.
- Turn it off in **Text Generation** if you would rather keep the old prompt. It also stands aside on its
  own when midi-qol's concentration handling is set to anything other than None, so the two never both
  act. There is deliberately no undo on this one: ending concentration also removes whatever the spell had
  placed on the battlefield, and that cannot be faithfully put back.
- New diagnostic: `game.modules.get("noodlr").api.surveyConcentration()` reports what the selected
  creature is concentrating on, who would roll its save, and at what DC.

## 0.4.43

- **Fixed: rolling Stealth no longer made you permanently invisible.** Any Stealth check at all — for a
  skill contest, for initiative, for anything — used to make a creature hidden, with no Hide action, no
  cover and no expiry. Hostiles then never noticed that character, never started a fight, and could be
  killed one at a time without ever reacting. Taking the **Hide action** is now what makes you hidden; a
  Stealth roll only supplies the number others must beat. If you are not hiding, you are seen.
- **Fixed: attacking from hiding did not reveal you when midi-qol was installed.** Noodlr was watching for
  an attack message that midi never posts. It now reads the attack roll itself, so it works with midi,
  without it, and from any sheet.
- **Fixed: a creature attacked out of combat did nothing.** Damage only ever pulled a creature into a fight
  that was already running, so an ambush on a camp with no encounter open went entirely unnoticed. Being
  hurt now starts the fight.
- **A Hide button, because D&D 5e ships none.** Rogues have one inside Cunning Action and a few monsters
  have their own; everyone else had no way to declare they were sneaking. The dragon toolbar now has one
  for every player. It enforces the 2024 rules — you must be heavily obscured or behind three-quarters or
  total cover and out of every enemy's line of sight, and beat DC 15 — and tells you plainly when you
  cannot. Under 2014 rules the prerequisites are left to the GM, as that edition intends.
- **Skulker works.** A missed attack normally gives your position away; Skulker's Sniper benefit means it
  does not, and its Fog of War gives advantage on Hide during combat. Both are now honoured, so the feat
  does what the book says instead of nothing.
- **Hiding ends when it should**: on an attack roll, on casting a spell out loud, when an enemy finds you,
  and when the fight is over. Removing the Hiding condition by hand ends it too.
- **Creatures caught unawares are marked Surprised**, which under 2024 rules the system already turns into
  disadvantage on initiative — it just never decided who deserved it. Players are never marked
  automatically; ambushing the party stays your call.
- **The Invisibility spell ends when its target attacks, deals damage, or casts.** Greater Invisibility is
  deliberately left alone, which is the whole reason it costs a fourth-level slot. (midi ends both under
  one setting.) Potions and innate invisibility are untouched.
- All three new behaviours are switchable under Text Generation. `api.surveyHide()` explains why the
  selected token can or cannot hide, and what each watcher can see.

## 0.4.42

- **Dropping to 0 hit points now means something.** Stock D&D 5e floors hit points at zero and never
  applies Unconscious, Dead, or death-save failures from damage — instant death when leftover damage
  meets your hit point maximum is journal prose only. Characters (and Important NPCs) now fall
  Unconscious and start dying; ordinary NPCs are marked Dead and defeated on the tracker.
- **Damage while dying ticks death saves.** Each hit at 0 adds a failure (two on a critical). Three
  failures, or a single hit whose leftover damage meets max HP, kills outright. Three successful death
  saves mark Stable. Healing above 0 clears the marks (stock already resets the counters).
- Switchable under Text Generation, with a separate toggle for whether Important NPCs get death saves.
  Stands aside when midi-qol's Add Dead is enabled. Every card carries an undo.
  `api.surveyDying()` reports what would happen for the selected token.

## 0.4.41

- **Condition combat math is applied, not just painted on the token.** Stock D&D 5e applies statuses and
  never reads most of them when a roll is built. Poisoned is listed under attack disadvantage and ignored;
  advantage against Blinded, Paralyzed, Petrified, Restrained, Stunned or Unconscious targets; melee
  advantage (and ranged disadvantage) against a Prone target; disadvantage when the attacker is Blinded,
  Poisoned or Frightened; auto-fail Strength and Dexterity saves while Paralyzed, Stunned, Petrified or
  Unconscious; and a hit within 5 feet of a Paralyzed or Unconscious creature becoming a critical — all of
  that lived only as journal prose. Those rules now land on the roll itself.
- **Incapacitated means you cannot start the action.** Nested statuses already apply Incapacitated for
  Paralyzed, Stunned, Unconscious and Petrified; nothing consulted it. An Incapacitated creature can no
  longer begin an action, bonus action or reaction.
- Switchable under Text Generation. `api.surveyConditions()` reports what would apply for the controlled
  token against its current target — the first thing to check if a roll looks wrong.
- Also fixed: action-economy enforcement now registers on every client, not only the GM's. Player browsers
  were previously never held to the budget on their own machine.

## 0.4.40

- **Pushes and pulls now actually move people.** Nothing in the stack has ever done this. The D&D 5e system
  automates no forced movement whatsoever — no activity type even has a field that could hold a distance,
  the Push weapon mastery is a tooltip, and every distance in the published content sits in description
  prose. Repelling Blast ships as an enchantment whose entire mechanical content is adding ", Repelling" to
  the cantrip's name as a reminder for you. A shove, a Push-mastery hit, Thunderwave, Thorn Whip, Lightning
  Lure, Gust of Wind, Pulse Wave, Telekinesis, Crusher, Charger, Shield Master, Tavern Brawler, Repelling
  Blast, Grasp of Hadar, Open Hand Technique, Pushing Attack, Thunderbolt Strike, Bigby's Forceful Hand and
  Reverse Gravity now move the creature they land on.
- **Being pushed into things works properly.** Walls stop a shoved creature where it hits them, so do
  occupied spaces and the edge of the map, and the chat line says how far it actually went rather than how
  far it was meant to go. If it lands in something harmful the card names it — nobody else's implementation
  checks that, and a creature shoved into Spike Growth ought to notice.
- **Shoves cost the victim nothing and provoke nothing**, which is what the 2024 rules say and what makes
  this safe to run alongside the Speed limit added last release. A pushed creature keeps its whole move, and
  nobody gets a free swing at it on the way past.
- **Every push carries an undo.** These rules mostly say you *can* push, not that you must, so rather than
  interrupt with a confirmation on every hit the movement simply happens and the card offers "Put it back".
  `api.undoForcedMovement()` reverses everything from the current fight at once.
- **Grapplers drag their captives.** Walk away holding somebody and they come with you.
- **You can push by hand too.** Select the creature doing it, target the ones being moved, and call
  `api.push(15)` or `api.pull(10)` — the same engine, with you choosing the distance. Useful for the rules
  the table adjudicates itself. `api.surveyForced()` says which of your character's features were
  recognised, which is the first thing to check when a feat did not fire.
- Switchable under Text Generation, and it stands down automatically on any item Gambit's Premades or
  Chris's Premades already automates, so nobody gets pushed twice.

## 0.4.39

- **Speed is now a limit.** Nothing in Foundry has ever enforced it: the system colours the drag ruler red
  once you pass your Speed and then lets you keep going, so a character could cross the whole map and still
  attack. Tokens now stop at the edge of their Speed. If you have something left to spend, you may keep
  dragging — that is charged as a Dash and said out loud in chat, so the table can see it. The GM's own
  dragging is never restricted. `api.surveyMovement()` explains any token's budget.
- **Rogues and monks Dash the way they're supposed to.** Cunning Action and Step of the Wind make Dash a
  bonus action rather than an action, as does Expeditious Retreat while it lasts, so those characters keep
  their action for the fight. Anything else that grants it can be marked with an Active Effect on
  `flags.noodlr.bonusDash`.
- **The fight ends when it's over.** No more handing out turns to an initiative order in which nobody has an
  enemy left. Once the last hostile falls, the summary card posts and the tracker clears itself.
- **No more six-second pauses for corpses.** Dead creatures are skipped instantly instead of holding the
  table open for a turn nobody is watching — which is what made the end of a fight such a slog.
- **Archers draw their swords.** A creature that ran out of arrows was sitting out the rest of the fight,
  because the empty quiver was never noticed. It now falls back to whatever else it is carrying.
- **Creatures walk out of fire.** A hostile stood inside an Incendiary Cloud until it died, because nothing
  in the decision tree knew one square could be worse than another. Anything with an animal's instincts now
  notices it is standing in something harmful and steps clear. Mindless things still burn where they stand.
- Both new behaviours can be switched off under Text Generation.

## 0.4.38

- **One action per turn, at last.** Neither Foundry nor the D&D 5e system counts actions — the only
  per-turn limits either enforces are legendary actions and movement, so nothing has ever stopped anyone
  attacking five times and casting twice. Noodlr now counts an action, a bonus action and a reaction for
  every combatant, refreshing at the start of that creature's own turn.
- **Fighters still get every swing.** Extra Attack is read from the character sheet, and Multiattack from
  the monster's own stat block, so one action buys as many attacks as the creature is entitled to.
- **Monsters Noodlr runs are held to the rules exactly**, with no way to overrule them. Automation that
  cheats is worse than no automation, because nobody is watching the monster's turn that closely.
- **Players get a choice, set by the GM** under Text Generation: don't count at all, ask before allowing
  it, or refuse outright. Asking is the default. Say yes and the table sees it — every override is posted
  to the chat log — which is what keeps Haste and its like playable without anyone having to police it.
  The GM is only ever asked, never refused.
- If an effect grants an extra action, express it as an Active Effect on `flags.noodlr.extraAction`.
  `api.surveyEconomy()` shows what everyone has left.

## 0.4.37

- **Latecomers can join a fight in progress.** Creatures too far away to hear the shout that started the
  encounter no longer sit it out forever. They keep watching, and if the party comes into view they roll
  in late, bringing whoever they can shout to with them.
- **Being attacked puts you in the fight, seen or not.** A hostile shot at from across the room now joins
  the encounter even if it never spotted the archer, which is what should have happened the first time.

## 0.4.36

- **Darkness you carry with you.** A warlock with Devil's Sight who casts Darkness on themselves and
  walks through the fight is now handled: darkness emitted by a token is recognised alongside darkness
  placed on the map, and a creature standing inside its own cloud is found the same way as one standing
  behind somebody else's. The guard still has to pierce it, which is the whole point of the build.
- Fog and darkness are now also recognised when a module applies them as an effect on the creature
  rather than as a placed template — v0.4.35 only looked for them on the map.
- Wild shape and polymorph give a hiding creature +5, on the reasoning that most shapes a druid picks
  are unremarkable. Truesight sees through it.

## 0.4.35

- **Fog, darkness and illusions now work where you actually put them: in the way.** The previous release
  only noticed them as effects on the creature hiding, which is not how anyone plays — you drop the fog
  bank, the sphere of Darkness or the illusory hedge between yourself and the guard. Noodlr now checks
  what physically stands on the line between a watcher and its target, covering placed spell templates,
  scene regions, and lights configured as darkness. A watcher has to get past the screen before it has
  any chance at whoever is behind it.
- **Nondetection now blocks precisely what the spell says.** It strips only what a watcher was getting
  out of a Divination spell — True Seeing, See Invisibility, Detect Magic, Locate Creature, scrying — and
  leaves a creature's own senses alone, so a demon's innate truesight still works and Faerie Fire still
  outlines you. It conceals nothing on its own, which is the point: it is the layer you add underneath
  your Stealth roll to close the gap that stealth cannot.

## 0.4.34

- **Concealment beyond the Stealth skill.** Hiding is no longer only about a die roll. Invisibility (the
  spell, the potion, the ring, Dust of Disappearance, Mislead), Etherealness, magical Darkness, Fog
  Cloud, Umbral Shroud, Nature's Veil, One with Shadows, Mask of the Wild, the illusion spells, Silence,
  Pass Without Trace (+10, as it should be) and Nondetection are all recognised and all behave
  differently. An invisible bard who never rolled Stealth is now genuinely unnoticed.
- **And the countermeasures.** Truesight, See Invisibility, Glitterdust, Faerie Fire, Detect Magic,
  Locate Creature, Feral Senses, Witch Sight, Devil's Sight, blindsight and tremorsense each see through
  the right things and not the wrong ones — magical Darkness still defeats darkvision, Nondetection
  still blinds a diviner, and a monster with Keen Hearing and Smell gets its +5. Sense ranges are
  respected: blindsight 30 is not blindsight everywhere.
- These lists live in one file (`systems/dnd5e-concealment.ts`) as data, so a future game system is a new
  table rather than a rewrite. `api.surveyPerception()` now also reports what each watcher can see with.

## 0.4.33

- **Rogues work again.** A creature about to raise the alarm now checks its passive Perception against
  the Stealth of whoever it is looking at, instead of spotting anything a wall is not in front of. A
  player who rolled Stealth, or who has the Hiding condition ticked on their token, gets that contest;
  everyone else is spotted exactly as before. Invisibility and the Ethereal Plane are respected on the
  fallback path that most monsters take. Hiding ends when you attack, cast something with a verbal
  component, or the fight ends. If Stealthy or Perceptive is installed, their numbers are used instead
  of ours — neither is required, and nothing is patched either way.
- **New: `game.modules.get("noodlr").api.surveyPerception()`** prints who can see whom on the current
  scene, with distances, each creature's detection modes, passive Perception, and what each target is
  doing to stay unseen. Every suppressed engagement is also logged once, so a fight that does not start
  says why instead of looking broken.
- Turn the whole contest off with "Let a Stealth roll keep you unnoticed" in Text Generation if you would
  rather adjudicate hiding yourself.

## 0.4.32

- **A creature that spots you can only call for help so far.** Automatic engagement used to bring every
  hostile on the scene into the fight; now only those within earshot of the creature that actually
  noticed you join, so a scene built as four encounters stays four encounters. The distance is set by
  the new "How far a creature can call for help" field in Text Generation (default 30 ft, in the scene's
  own units, counted through walls because it is a shout — 0 means the spotter fights alone). Your party
  is not distance-limited: every player-owned token on the scene still rolls, so a scout who is spotted
  ahead of the marching order is not left fighting alone.

## 0.4.31

- **Fixed: monsters took a whole round before the players had rolled initiative.** Automatic engagement
  began the fight the instant the monsters had their numbers, which put a monster at the top of a
  provisional turn order and let automation play the round — in testing, a player was unconscious before
  ever rolling. The encounter and everyone's roll button now appear as before, but combat does not begin
  until every combatant has an initiative, and if nobody rolls within a minute the rest are rolled for
  and the fight starts with an announcement, so an absent player cannot freeze the table. Independently
  of how a fight starts, automation now refuses to play anyone's turn while a combatant is still
  unrolled — including a combat you began by hand.

## 0.4.30

- **Creatures take reactions on other people's turns.** Opportunity attacks when an enemy leaves their
  reach, and striking back when hurt off-turn. Built on Foundry's own hooks and the creature's own sheet,
  so it works with no other module installed — where Midi QoL is present the roll still routes through
  it, but nothing here needs it. The whole route of a move is examined rather than just where it ended,
  so circling out of reach and back again still provokes, while a teleport correctly provokes nothing.
  A creature clever enough to save its reaction for something better (tier 7 and up) sometimes will; a
  wolf snapping at fleeing prey does not deliberate. An enemy that took the Disengage action is not
  punished for it, the paralysed and the stunned do not swing, and each creature gets one reaction per
  round, tracked by Noodlr rather than read from anyone else's flags. If a table already runs Gambit's
  Premades with its own opportunity attacks, Noodlr stands aside rather than hitting the party twice.
- **Hostile creatures start the fight themselves.** Every six seconds Noodlr checks whether any hostile
  creature can actually see a player's token — running that creature's own detection modes, so darkness,
  darkvision, blindsight, tremorsense, invisibility and the walls between them all count, and none of it
  is judged from the GM's point of view. When one can, everyone on the scene joins the encounter, the
  monsters roll initiative and combat begins; your players still roll their own, because that is the one
  die roll they expect to make at the start of a fight. Creatures whose tokens have vision switched off,
  which is most NPCs in dnd5e, fall back to the senses their stat block claims rather than being
  permanently blind, and one with no way to perceive anything at all says so in the console instead of
  failing quietly. There is a one-minute lull after every fight so survivors who still have the party in
  sight cannot immediately start the next one, and the whole thing is a switch under Text Generation for
  GMs who prefer to time their own ambushes. Only ever active while Combat Automation is Full or Partial.

- **Creatures move the way their stat block says they do.** Only walk speed was being read, so a wyvern
  was handed its 20 ft walk instead of its 80 ft fly and then complained it was out of range, while
  anything with no land speed at all — most aquatic monsters — read as speed 0 and never took a step.
  Flying, swimming, burrowing and climbing speeds are now read, the fastest sensible one sets the
  movement budget, and Foundry is told which mode is in use so its own terrain and wall rules for that
  mode apply. Swimming and burrowing stay reserved for creatures that have no other way to travel,
  since Foundry models no terrain types and picking one speculatively would be inventing a rule.
- **Height is part of the distance now.** Reach is measured through the air rather than across the
  floor, a creature that can fly or climb will rise to meet something above it, and one that can do
  neither no longer walks hopefully toward a hovering wizard and wastes its turn.
- **Difficult terrain is honoured.** Movement was being spent as raw distance with terrain cost ignored,
  which quietly let creatures cross a bog at full speed. Foundry now enforces the budget in cost, which
  is the accounting the rules describe — and which correctly charges a flyer nothing for the bog.
- **Banter is half as frequent.** Same formula, twice the scale: each point is now worth 5% rather than
  10%, so a creature that used to jeer on 60% of its turns does so on 30%.

## 0.4.29

- **A slow walk is no longer mistaken for a hang.** Abandoning a move used to be on a flat eight-second
  timer, which was fine until movement speed became configurable: a creature crossing twelve squares at
  one square per second takes twelve seconds legitimately, and the timer would have cut the walk off
  mid-stride. Time spent visibly moving no longer counts against it, so only a genuinely stuck move —
  one paused by a region behaviour, say — gets abandoned.

## 0.4.28

- **Creatures walk instead of blinking.** A turn now waits for the token to finish sliding before the
  attack card and the spoken line land, so the movement is something the table watches rather than
  something that already happened. New setting under Text Generation: **Automated movement speed**, in
  squares per second, where 0 keeps Foundry's own pace and lower numbers make the walk easier to follow.
  Bear in mind a slower walk lengthens turns, so a long move may want a longer turn pace too.
- **`api.testMove()` output is copyable now.** It printed into a collapsible console group, which meant
  the findings could not be copied out — it now prints one JSON block and returns the same object.

## 0.4.27

Movement, third attempt — this time aimed at the part that was never saying anything.

- **The silence is gone.** v0.4.26 explained refusals in detail but explained nothing at all when the
  move was never attempted, and that turned out to be the actual case: candidate destinations were being
  discarded before Foundry was ever asked. Every rejection now says which square, and why.
- **A creature was blocking itself.** The occupied-square check compared the wrong kind of object, so a
  creature counted its own token as something standing in the way and quietly refused to take short steps.
- **Walls beneath a raised floor no longer stop a creature standing on it.** Noodlr's own line-of-sight
  test is flat, so a party fighting on top of a structure read as walled in by the rooms below them. That
  test is now advisory — Foundry decides whether a move is legal, as it should.
- **Elevation is carried explicitly.** A creature at a height stays at that height when it moves.
- **"Unconstrained Movement" now applies to automated creatures too.** Foundry only ever consults that GM
  toggle when you drag a token by hand, so Noodlr's moves were wall-constrained even with it switched on.
  It now behaves the way your own dragging does. Off by default, so tables that enforce walls still do.
- **New: `game.modules.get("noodlr").api.testMove()`.** Select a token, run it, and it moves one square in
  front of you and reports exactly what Foundry said — escalating through walls-enforced, walls-ignored,
  displace, and hooks-disabled — then puts the token back. Whichever attempt first succeeds names the
  cause. It also lists which of your other modules are known to interfere with movement.
- **New: `api.flattenElevation()` and `api.restoreElevation()`.** Set every token in the current scene to
  elevation 0 and put them back afterwards, for taking height out of the picture while testing.

## 0.4.26

- **Automated turn pace.** New setting under Text Generation (default 6 seconds): the minimum time an
  automated creature's turn occupies the table before initiative advances. A machine resolves a turn in
  under a second, which reads as a blur rather than a fight. Time the creature already spent acting counts
  toward it, so only the too-fast turns are held. Set it to 0 for the old behaviour.
- **Spoken lines no longer talk over each other.** Speech was already queued one at a time, but the queue
  measured each clip's length to know how long to wait — and silently treated an unreadable clip as
  instantaneous, releasing the next line immediately. It now falls back to estimating from the text.
- **Creatures should actually move now.** Movement was being requested and refused, and Noodlr believed
  the refusal was success — so a creature announced closing 23 feet and stood still. Movement is now
  verified against the token's stored position, retried at shorter distances when a destination is
  rejected, and abandoned safely if a region behaviour pauses it mid-move (which previously could hang the
  rest of the automated turns). When a move genuinely cannot happen you get a whisper saying so, and the
  console explains which cause it was: walls, a veto by another module, or a grappled or mounted creature
  whose position another module is holding in place.

## 0.4.25

Corrections from a census of a real world — 193 creatures, 1689 items, 2067 activities — which found
three things no amount of reading documentation would have.

- **Spellcasters can cast again.** A monster's spells usually live behind a feature holding the uses
  ("1/day each: fireball") that points at the spell in a compendium. Noodlr could not follow that pointer
  in time, so every caster read as having no spells at all and fell back to swinging or shouting. Spells
  are now loaded before the turn is planned.
- **A spell that appears twice is offered once.** Where a creature carries a spell both in its list and
  behind a limited-use feature, Noodlr now uses the feature — so a once-a-day spell stays once a day
  instead of being cast from the list every round.
- **No more spending a turn on the leftovers of an attack.** Roughly one activity in twenty on a sheet
  is the companion half of something else: the saving throw attached to a bite, the extra damage on a
  sneak attack. Those were being offered as full actions, so a creature could spend its turn on the save
  half of an attack it never made. Same for grapple-escape checks and other special-activation entries.

## 0.4.24

Automated creatures now actually do things, and they read their sheets the way the game system means
them to be read.

- **They move, and they act.** Until now Noodlr only announced what a creature intended and left the GM
  to perform it. Creatures now close the distance, back out of melee, slip into cover, run for the scene
  edge — and their attacks and spells are rolled through the game system's own use path, so Midi QoL,
  DAE and the rest of your automation resolve them exactly as if you had clicked the button. Noodlr
  still rolls nothing itself.
- **A creature that cannot reach you walks toward you.** A melee-only creature further away than one
  move had no option at all before, which is why a Dire Wolf spent every round bellowing for help.
- **Reaches and ranges are right.** A monster's bite reads as a 5 ft bite instead of a 0 ft one — the
  cause of most creatures standing around. Spell ranges, thrown weapons, metric scenes and
  see-the-description ranges are all handled properly now.
- **A reaction is no longer something a creature can spend its turn on.** Reactions, legendary actions
  and lair actions are recognized as off-turn and set aside (they get their own layer later); ten-minute
  rituals are excluded entirely.
- **Limited monster spellcasting works.** The common sheet shape — a feature with a few uses per day
  that casts a spell — is now understood, including which casting methods spend a spell slot and which
  are innate or at-will.
- **"Midi Attack" mystery solved.** That was Midi QoL's own label for the creature's real attack, not a
  phantom item. Actions are now named "Mace (Midi Attack)" so it is never confusing again. Activities
  that Midi marks as automation-only are correctly left alone.
- **Automation ends its own turns.** An automated creature now acts and then passes initiative, so a
  horde of skeletons resolves itself and stops dead on a player's turn. Creatures you kept for yourself
  are never advanced past. If two dozen turns pass without reaching a player — nobody left to fight, or
  an all-NPC brawl — Noodlr stops advancing and says so rather than cycling rounds unattended.
- **New GM tool.** `game.modules.get("noodlr").api.surveyActions({ saveToFile: true })` censuses every
  NPC sheet in your world and writes a summary file. If a creature behaves oddly after a system update,
  that plus `api.explainTurn()` is everything needed to report it.

## 0.4.23

A hotfix for the first play test of automated combat, in which every creature bellowed for help and
did nothing else.

- **Creatures can see their own attacks again.** On the 2024 rules (dnd5e v4 and later), everything a
  monster can do lives in a new place on its sheet, and Noodlr was still looking in the old one. Every
  creature therefore read as having no attacks at all, and shouting for the others was the only thing
  left it could do. Noodlr now reads both layouts, including spell slots, limited-use activities,
  recharge powers, and ammunition.
- **Spells that force a save are understood properly.** A fireball counts as an attack; a hold person
  counts as crowd control. They are now told apart by whether the spell does damage.
- **New GM diagnostic.** With a token selected during combat, run
  `game.modules.get("noodlr").api.explainTurn()` in the console to see exactly what Noodlr can read off
  that creature and how it scored every option it considered. This is the fastest way to report a
  creature behaving oddly.
- **One less console warning.** Noodlr no longer touches a deprecated Foundry name while checking
  line of sight.
- **Voice playback now reports failure.** If a broadcast line does not start, the console says so
  instead of leaving you to guess whether the audio failed or never arrived.

## 0.4.22

Monsters now think for themselves — locally, instantly, and without spending a cent on AI.

- **Combat no longer calls the AI at all.** Yesterday's AI-run turn made a model request for every
  beat of every creature's turn, which is slow at a table and ruinous in a fight with eight skeletons.
  It has been replaced by a planner that runs on your own machine in about a millisecond.
- **Creatures act according to how bright they are.** Each one is placed on a nine-rung ladder from
  its (INT + WIS) / 2, from insect to god-like. A low rung cannot conceive of most options *and*
  frequently fumbles the ones it has; a high rung sees the whole board and rarely errs. An owlbear
  mauls whatever is nearest; a veteran picks off the wounded; something clever goes for the caster.
- **It picks the appropriate move, not the best one.** Options are scored and then chosen with
  weighted randomness, so the same monster in the same spot will not do the same thing every session
  — while still behaving like itself. The roll is seeded, so a turn never changes if you re-run it.
- **Creatures with a ranged weapon try to use it as one.** From the fourth rung up, a creature shoots
  from outside your reach rather than strolling into it, and backs out of melee when someone closes.
- **They take cover and they hide, for real.** Noodlr checks your map's walls and works out an actual
  square the creature can reach where it cannot be seen — reporting how far and in which direction,
  so you can place the token. Cover is measured against the furthest player on the field, hiding
  against the nearest, which keeps it fast enough to run every turn without a pause. If there is
  genuinely nowhere to hide, it says nothing rather than promising cover that isn't there.
- **It reads the actual sheet, every turn.** An archer out of arrows will not fire; a creature with an
  empty potion slot will not drink one; a badly hurt creature that is bright enough to value its own
  life will try to leave.
- **Fights can now end without a body count.** A beaten creature may run, or throw down its weapon and
  surrender — and a creature that is lawful or simply not evil may spare a party that has been beaten
  and has held its fire for a full round. Surrender and mercy flip the token from hostile to neutral
  on the spot, and Noodlr tells you what each outcome is worth: a creature that flees leaves no loot
  and no experience, one that surrenders yields everything, and a party that accepts mercy earns
  nothing from the fight.
- **Experience is awarded for you, on D&D 5e.** When the last hostile stops fighting, Noodlr counts
  what is left on the field — the fallen and those who surrendered, valued by each creature's own XP
  figure or the standard table for its challenge rating — and splits it evenly among the characters in
  the fight. Anything that escaped is worth nothing: a party that drives enemies off, out of pity or
  to keep a faction's regard, chose not to have that fight. On other systems the tally is reported and
  the award left to you.
- **Mercy has teeth, and an undo.** A party that accepts mercy loses its carried coin, held weapons,
  and worn armour. Every item and coin is written down before it is taken, and the card that announces
  it carries a "Give back the forfeited gear" button that restores all of it exactly.
- **New setting — Combat automation** (Text Generation), Full by default: Noodlr plays every monster's
  turn as it comes up. Partial gives you an Act-as-NPC tool instead: select a token, press it, and
  Noodlr plays that creature for this fight only — press again to take it back mid-fight. Off hides
  the tool entirely. Player characters are never played, in any mode.
- **Monsters talk trash.** Automated creatures throw taunts at the character they are about to deal
  with, drawn from a library of several hundred fantasy jeers and Shakespearean insults that ships
  with the module. Lines are matched to their target: an elf gets elf jabs, a wizard gets wizard
  jabs, and a line written for a man is never thrown at a woman. Nothing is generated by an AI, so
  it costs nothing and arrives instantly.
- **How often a creature mouths off comes off its own stat block:** intelligence and charisma make it
  chattier, wisdom makes it hold its tongue, and a creature with no language never speaks at all. An
  adult red dragon jeers on nine turns in ten, a shrewd old hag on one, and a goblin only now and
  then — but every creature that can talk gets at least the occasional jab.
- **The taunt library is a plain text file you can edit.** `banter/banter.txt` inside the module,
  one line per taunt under `# Section` headings — add your table's favourites, delete anything that
  does not suit your game, or translate the lot. No build step, no restart beyond a reload.
- **New setting — NPC banter** (on by default) turns all of the above off.
- **This release announces, it does not act.** Each automated turn posts what the creature is doing
  and to whom; you still roll it and apply it. Letting Noodlr move tokens and use items is the next
  step, and it will ask before it does.

## 0.4.21

NPC turns stop being one blind swing. First of several passes — expect rough edges.

- **Creatures now know their own sheet.** An AI-run turn is given a dossier built live from the
  combatant: movement and alternate speeds, senses, defenses, mental scores, and every weapon, spell,
  feature, and consumable it carries, with remaining charges and ammunition counts. Previously the
  model was handed initiative and hit points and had to guess a statblock from the creature's name,
  which is why enemies invented abilities and forgot the ones they had.
- **A turn is now a turn, not a single action.** The creature narrates one beat, Foundry rolls the
  dice for real, the actual totals go back to it, and it decides what to do with the rest of its turn
  — up to four beats. Multiattack, a bonus action, or firing and then moving to cover all work now,
  and nothing describes an outcome before the die is rolled.
- Creatures remember what they did earlier in the same fight, and forget it when they die or the
  fight ends.
- **If you have used Noodlr before, press Reset on the "Combat NPC-turn system prompt"** in Text
  Generation. Your saved copy still tells creatures to take one action and yield.

Known limits this round: a turn can cost up to four requests per creature, so a large horde gets
expensive; there is no stop button once a turn starts; and nothing is spent or applied automatically
yet — arrows fired are narrated, not deducted. Execution comes next.

## 0.4.20

Your rules system is now stated, not guessed.

- **Pick your game system in Text Generation**, right under the main system prompt: choose from the
  systems Foundry supports, let Noodlr read it from your world, or type your own. It arrives set to
  D&D 5e (2024), so check it first if you play something else. Every chatbot —
  the GM co-pilot, the players' bot, the adjudicator behind skill checks, and AI-run NPC turns — is
  told which system is in play on every single request, and told not to deduce one from adventure
  titles or place names. Adventures get converted between systems all the time, so a model left to
  infer will sooner or later confidently apply the wrong game's rules. Foundry can name the active
  system but not the revision (its id is identical for D&D 5e 2014 and 2024), which is why the list
  spells the editions out.
- **Retract a bad memory** instead of deleting it. New button in the Memory browser: the record
  stays where you can read it, marked as a known error, and is never handed to a chatbot again.
  Useful when a mistaken ruling gets stored and starts reinforcing itself on every retrieval.
- **Deliberate material now outranks table chatter.** Everything Noodlr stores carries a weight:
  what you ingested or typed by hand ranks above what a bot chose to remember, which ranks above
  transcripts and swept-up chat log. Previously all of it competed on equal terms, so an offhand
  wrong line could beat the rulebook that contradicted it.

## 0.4.19

- **Memory service: pick how the browser reaches it.** A browser cannot open a Unix socket, so a
  service reached over one is only usable through the web server that already serves Foundry. Memory
  Configuration now offers "Behind the Foundry server" (give it the proxied path, e.g. `/memory`)
  alongside the old direct URL, shows the exact address it will call, and warns when the URL points
  at `127.0.0.1` — which means your own desktop, not the Foundry host.
- Test connection now reports into the window instead of a toast that vanishes, and explains
  unreachable results (socket vs TCP, wrong bind address, missing proxy location, mixed content).
- Text in Noodlr windows can be selected and copied again; a Foundry style change had started
  winning over ours.
- The "Test voice output" box arrives with a sample phrase in it, and refills itself if you empty
  it, instead of failing the test with nothing to say.

## 0.4.18

Settings reorganized, and prompts are no longer hidden from you.

- **Configuration is now five topic windows** instead of one endless page: Memory Configuration,
  Text Generation, Audio Generation, Image Generation, and Security. Nothing was removed — TTS,
  music, and transcription live under Audio; the four picture generators and video under Image; API
  keys under Security.
- **Every prompt field arrives filled in with Noodlr's own wording**, and what you see is exactly
  what gets sent. Previously an empty box quietly meant "use the built-in prompt", so the ~1,000-token
  Gamemaster prompt was neither visible nor editable. Each field now has its own **Reset** button, and
  clearing a field really does send nothing.
- **Two prompts became editable for the first time:** the players' chatbot prompt (the one that keeps
  it from handing out your secrets) and the roll adjudicator prompt. Image prompt-expansion
  instructions are editable too.
- **The assistant can be renamed.** Text Generation → "The GM assistant's name" (default
  Polly Histor). The new name appears in both chat panels and on the chat cards it posts.
- Author's note depth, context token budget, memory writes, and scene awareness moved out of
  Foundry's own settings list into Text Generation, next to the prompts they affect.
- Toolbar: the dead dragon button is gone, and each role now sees only its own chat button — GMs the
  co-pilot, players the table bot. Both still post their public answers to Foundry's chat log.
- A few fields whose shipped wording is still being written read `TBD_IGNORE_ME_FOR_NOW`. That is a
  placeholder, not a bug: it is stripped before anything is sent, so write over it or leave it alone.

Upgrading an existing world: any prompt field you had left empty is filled with its shipped default
once, on the first load. Fields you had actually written are untouched.

## 0.4.17

- Fixed duplicated work when more than one person is logged in with Gamemaster rights. Transcripts
  were posted, journaled, and written to memory once per GM client; generated speech could also
  collide over the same filename. One designated GM now does the work for the table.

## 0.4.16

- "Hide from players" is now one-shot: it clears itself after the prompt is accepted, so the next
  reply isn't hidden by accident.
- Retrying a hidden reply keeps it hidden. Previously Retry could re-run the prompt in full view of
  the players.

## 0.4.15

- Fixed broadcast speech being saved with a non-audio file extension, which made players' browsers
  refuse to play it ("Invalid URI").
- Hidden replies are badged **GM ONLY** in the panel.

## 0.4.14

- **Fixed the players' chatbot never answering.** The module was not requesting a socket namespace,
  so Foundry silently discarded every question players sent to the GM's client. Requires a world
  restart to take effect, not just a page reload.

## 0.4.13

- Hidden narration is never spoken to the table. Text was hidden correctly, but its audio was still
  broadcast — which spoiled surprises.
- Generated speech is queued instead of overlapping when several replies finish together.

## 0.4.12

- Scene awareness now includes the token roster, filtered by privilege: the GM sees hidden tokens and
  hit points, players see neither.
- Generated speech plays on every connected client, not only the machine that produced it.

## 0.4.11

- The GM's client acknowledges a relayed player question, and a standby GM takes over if the
  designated one doesn't pick it up — so a player learns the relay failed instead of waiting.
- Answers from the players' chatbot are spoken aloud.

## 0.4.10

- Every step of the player question round trip is now time-bound, so it can fail loudly instead of
  hanging forever.

## 0.4.9

- Added opt-in debug logging for both chatbots, and stopped silently swallowing rerank and relay
  failures (an OpenRouter rerank 404 now explains itself).

## 0.4.8

- **Scene awareness (Tipster):** each request quietly carries the live state of the active scene —
  name and size, in-world date and time, lighting, ambient sound, named regions. Read fresh from
  Foundry every time and never stored, so it cannot go stale.

## 0.4.6 – 0.4.7

- **A separate chatbot for players:** answers what the party already knows, and asks for a real
  Foundry roll before revealing anything hidden. Questions are relayed to the GM's client, so no
  API key or GM-only memory is ever exposed to a player's browser.
- Memory reorganized into purpose-scoped collections, with a searchable Memory browser on the
  toolbar and GM tools for editing what Noodlr remembers.
- Renamed Dungeon Master to Gamemaster throughout the interface.

## 0.4.0 – 0.4.5

- **RAG Lite:** a built-in memory backend that runs entirely in the browser, so long-term memory
  works with nothing to install. The standalone `noodlr-memory` service remains the other option.
- Retry / Reject controls on every AI output, with a 60-second window before it is committed to
  memory; outputs are shared with players by default, with a "Hide output" toggle for prep.
- Structured file import (JSON / YAML / CSV) into memory.
- Opt-in, confidence-gated web-search fallback for when memory comes up short.
- A raw memory-query inspector plus context-size statistics in Diagnostics.
- Context budget raised to 64,000 tokens, with a warning when it exceeds the model's own window.

## 0.3.0

- Four independent picture generators (scene art, portrait, token, battlemap), each with its own
  model, style prompt, and size.
- One shared OpenRouter key for every OpenRouter-backed feature.

## 0.2.x

- Configuration grouped by feature, with write-only API keys and live OpenRouter model lists filtered
  by what each feature can actually use.
- Music, video, and rerank support; per-creature-type voices; an inline TTS self-test that diagnoses
  CORS and mixed-content failures; a Diagnostics window.
- Generated scene art is broadcast to the table, saved to disk, and tracked so a subject keeps a
  consistent look.
- Memory access is GM-gated, and the memory service secret is stored per-browser so it is never
  replicated to players.

## 0.1.0

- First working module: streaming chat against OpenRouter or any OpenAI-compatible endpoint, the
  Noodlr Gamemaster prompt, real Foundry dice via `{{roll:...}}`, long-term memory, the prompt
  architecture (lorebook, author's note, post-history), TTS, image generation, push-to-log
  transcription, and the combat co-pilot.
