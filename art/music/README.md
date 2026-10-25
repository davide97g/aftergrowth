# Seeds on the Wind

The main theme of Aftergrowth. It's an original waltz in 6/8 and D major, about 62 bpm per
dotted quarter, and lasts 66 seconds. The game plays it live from `src/audio/theme.ts`, which
synthesises every note with Web Audio, and loops it softly outdoors. `seeds-on-the-wind.mp3` is the
same code rendered offline, kept for listening and sharing.

## Instruments

| Part | Sound |
|---|---|
| Melody | breathy wooden flute (sine with a little octave, late vibrato, a puff of air on each note) |
| Arpeggios | kalimba, six notes a bar |
| Harmony | warm pad (two detuned saws, low-passed), swelling over each bar |
| Bass | round triangle on beats 1 and 4 (root, then fifth) |
| Countermelody | bells, in the last statement of the tune |
| Rhythm | soft kick on the downbeat, shaker on every eighth (accents on 1 and 4), a light swing |

Everything goes through a short hall reverb.

## Form

| Bars | Section | Chords |
|---|---|---|
| 1–4 | Intro: kalimba and pad alone | Dmaj7 · Gmaj7 · Dmaj7 · Asus |
| 5–12 | A: the tune | D · Bm · G · A · D · Bm · Em7 · A7 |
| 13–20 | B: it lifts | G · A · F#m · Bm · G · A · Bm · **C** |
| 21–28 | A′: the tune with bells, and a new ending | D · Bm · G · A · D/F# · G · Asus · D |
| 29–32 | Outro | G · **Gm** · Dmaj7 · D |

Two chords borrowed from outside the key carry the story:
- **C in bar 20** (a flattened seventh) gives the bridge its witchy, old-folk turn.
- **G minor in bar 30** is the bittersweet moment before home: a quiet nod to the world these
  islands floated up from.

## The tune (A section, flute)

Each note is written as `note·length`, counted in eighth notes; each bar holds six.

```
| A4·3 F#4·1 G4·1 A4·1 | B4·2 A4·1 F#4·3 | G4·1 A4·1 B4·1 D5·3 | C#5·2 B4·1 A4·3 |
| A4·3 F#4·1 G4·1 A4·1 | D5·2 C#5·1 B4·3 | G4·1 A4·1 B4·1 E5·2 D5·1 | C#5·3 A4·3 |
```

## Re-rendering

Change the score in `src/audio/theme.ts`, then render it offline in a browser and encode it.
1. Run `scheduleTheme()` into an `OfflineAudioContext` and save the result as a WAV.
2. Encode it with
   `ffmpeg -i theme.wav -af afade=t=out:st=63.5:d=2.8 -b:a 192k seeds-on-the-wind.mp3`.
